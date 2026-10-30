/**
 * Created by hzzhangdianpeng on 2016/12/2.
 */

let mysql = require('mysql2');
const co = require('co');
let shortUuid = require('short-uuid');
let moment = require('moment');
const tracer = require('./timeoutTracer');

function initMysqlPool(db, dbConfig) {
    dbConfig.enableKeepAlive = true;
     // Keep-Alive 探针间隔默认10s
    dbConfig.keepAliveInitialDelay = 10000;
    // 空闲连接淘汰：在 MySQL 服务端 wait_timeout 到期前主动关闭空闲连接，
    // 避免从池中取出已被服务端关闭的失效连接。仅在外部未显式配置时给默认值。
    // 注意：mysql2 仅在 maxIdle < connectionLimit 时才启动空闲淘汰定时器（见 mysql2 base/pool.js），
    // 因此默认 maxIdle 必须严格小于 connectionLimit，否则 idleTimeout 不生效
    const connectionLimit = dbConfig.connectionLimit || 10;
    if (dbConfig.maxIdle === undefined) {
        // 取连接上限的一半：既确保 maxIdle < connectionLimit 以启用 mysql2 的空闲清理，
        // 也保留部分连接供后续请求复用，避免低频请求频繁新建连接。
        // 下限取 0 而非 1：仅当 connectionLimit=1 时结果为 0，此时 mysql2 会销毁全部空闲连接
        // （用完即弃），这是单连接配置下杜绝失效连接的唯一可行方式；若下限为 1 则 maxIdle=connectionLimit，
        // 淘汰器不会启动，idleTimeout 失效
        dbConfig.maxIdle = Math.max(0, Math.floor(connectionLimit / 2));
    }
    if (dbConfig.idleTimeout === undefined) {
        dbConfig.idleTimeout = 60000; // 空闲超过 60s 的连接主动关闭并移出连接池
    }
    db.pool = mysql.createPool(dbConfig);
}

let logSql = (connection, rows, sql, startTime, logExecuteTime, logger) => {
    let insertIdLog = (rows && rows.insertId) ? `[insertId = ${rows.insertId}] ` : '';

    let info = `[${connection.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}]`;
    if(logExecuteTime){
        const executeTime = (new Date()).getTime() - startTime.getTime();
        info += `[execute time: ${executeTime}ms]`;
    }
    info += `${insertIdLog} ${sql}`;
    logger(info);
};

// 去掉报错信息行，只保留当前函数调用栈
let getCurrentStack = (currentStack) => {
    // new Error().stack的格式是：Error: 错误信息\n    at 函数名 (文件路径:行号:列号)... 去掉第一行即可获取当前函数的调用栈
    return currentStack.split('\n').slice(1).join('\n');
};

// 判断是否为致命的连接级错误：连接已被服务端关闭 / 网络中断，此类连接不可再复用，必须销毁而非归还连接池
let isFatalConnError = (err) => {
    if (!err) return false;
    if (err.fatal) return true;
    const fatalCodes = ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ETIMEDOUT'];
    return fatalCodes.includes(err.code);
};

module.exports = (dbConfig, {log, noConvertDbCodes, dbCode, logExecuteTime, logger}) => {
    let db = {
        pool: null
    };
    initMysqlPool(db, dbConfig);
    let reconnectionTime = 0;
    //获取数据连接，将回调转换为promise
    db.getConnection = function (options = {}) {
        return new Promise(function (resolve, reject) {
            db.pool.getConnection(function (err, connection) {
                if (err) {
                    if(err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'PROTOCOL_SEQUENCE_TIMEOUT'){
                        logger('mysql reconnect， reconnect time:', reconnectionTime++);
                        db.getConnection().then(resolve, reject);
                    } else {
                        reject(err);   
                    }
                } else {
                    connection.connectionLogId = options.transId || shortUuid().new().slice(0, 6);
                    reconnectionTime = 0;
                    connection.logSql = options.transId || options.logSql || log || process.SQL_LOG;
                    resolve(connection);
                }
            });
        });
    };

    db.wrapTransaction = function (fn, nth, timeout, options = {}) {
        const Message = options && options.errorMessage || '等待事务超时';
        return function () {
            let ctx = this;
            let params = Array.from(arguments);
            if (params[nth]) {
                return fn.apply(ctx, params);
            } else {
                return (co.wrap(function* (params) {
                    let newOptions = Object.assign({}, options);
                    if (options.transId && typeof options.transId === 'function'){
                        newOptions.transId = options.transId(params);
                    }
                    if (options.logSql && typeof options.logSql === 'function'){
                        newOptions.logSql = options.logSql(params);
                    }

                    let conn = yield db.beginTransaction(newOptions);
                    let result;
                    let timer;
                    let store = tracer.begin();
                    try {
                        params[nth] = conn;
                        result = yield Promise.race([
                            tracer.runIn(store, () => fn.apply(ctx, params)),
                            new Promise((res) => {
                                timer = setTimeout(() => {
                                    res(Message);
                                }, timeout || 50000);
                            })
                        ]);
                        if(timer) clearTimeout(timer);
                        if(result === Message){
                            let err = new Error(Message);
                            let bizStack = tracer.getTimeoutStack(store);
                            if(bizStack) err.stack = err.stack + '\n' + bizStack;
                            throw err;
                        }
                        yield db.commitTransaction(conn);
                        conn.release();
                    } catch (err) {
                        if(timer) clearTimeout(timer);
                        yield db.rollbackTransaction(conn);
                        conn.release();
                        conn.destroy();
                        if(!noConvertDbCodes.includes(err.code)){
                            err.code = dbCode;
                        }
                        throw err;
                    } finally {
                        tracer.end(store);
                    }
                    return result;
                }))(params);
            }
        };
    };

    db.query = function (sql, sqlParam, connection) {
        let currentStack = new Error().stack;
        let query;
        return new Promise(function (resolve, reject) {
            if(process.MYSQL_READ_ONLY  && !sql.toLowerCase().trimLeft().startsWith('select')){
                return reject({
                    code: 739,
                    message: '当前系统正在维护中，不能使用编辑功能'
                });
            }

            const startTime = new Date();

            if (connection) {
                query = connection.query(sql, sqlParam, function (err, rows) {
                    // mysql2 在连接已失效时回调可能同步触发，此时 query 尚未完成赋值，
                    // 用入参 sql 兜底，避免 query.sql 读取 undefined 报错而掩盖真实错误
                    const executedSql = (query && query.sql) || sql;
                    if(connection.logSql){
                        logSql(connection, rows, executedSql, startTime, logExecuteTime, logger);
                    }
                    if (err) {
                        if (!connection.logSql){
                            logSql(connection, rows, executedSql, startTime, logExecuteTime, logger);
                        }
                        err.code = dbCode;
                        err.stack = err.stack + getCurrentStack(currentStack);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            } else {
                db.getConnection().then(function (connection) {
                    query = connection.query(sql, sqlParam, function (err, rows) {
                        // 同上：连接失效时回调可能同步触发，用入参 sql 兜底
                        const executedSql = (query && query.sql) || sql;
                        if(connection.logSql){
                            logSql(connection, rows, executedSql, startTime, logExecuteTime, logger);
                        }
                        if (err) {
                            if (!connection.logSql){
                                logSql(connection, rows, executedSql, startTime, logExecuteTime, logger);
                            }
                            // 致命连接错误（服务端关闭连接等）：连接不可复用，销毁而非归还连接池，
                            // 避免坏连接被后续请求取出导致错误持续扩散
                            if (isFatalConnError(err)) {
                                connection.destroy();
                            } else {
                                connection.release();
                            }
                            err.code = dbCode;
                            err.stack = err.stack + getCurrentStack(currentStack);
                            reject(err);
                        } else {
                            connection.release();
                            resolve(rows);
                        }
                    });
                }).catch(function (err) {
                    err.stack = err.stack + getCurrentStack(currentStack);
                    reject(err);
                });
            }
        });
    };

    db.beginTransaction = function (options) {
        let p = new Promise(function (resolve, reject) {
            db.getConnection(options).then(function (conn) {
                if(conn.logSql){
                    logger(`[${conn.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}] beginTransaction`);
                }
                conn.beginTransaction(function (err) {
                    if (err) {
                        conn.rollback(function () {
                            conn.release();
                            reject(err);
                        });
                    } else {
                        resolve(conn);
                    }
                });
            }).catch(function (err) {
                reject(err);
            });
        });
        return p;
    };
    db.commitTransaction = function (conn) {
        return new Promise(function (resolve, reject) {
            conn.commit(function (err) {
                if (err) {
                    reject(err);
                } else {
                    if(conn.logSql){
                        logger(`[${conn.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}] commitTransaction`);
                    }
                    // conn.release();
                    resolve('success');
                }
            });
        });
    };

    db.rollbackTransaction = function (conn) {
        return new Promise(function (resolve, reject) {
            conn.rollback(function (err, suc) {
                if(conn.logSql){
                    logger(`[${conn.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}] rollbackTransaction`);
                }
                resolve();
            });
        });
    };

    return db;
};
