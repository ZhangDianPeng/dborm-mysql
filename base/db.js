/**
 * Created by hzzhangdianpeng on 2016/12/2.
 */

let mysql = require('mysql');
const co = require('co');
let shortUuid = require('short-uuid');
let moment = require('moment');

function initMysqlPool(db, dbConfig) {
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
                    if(err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'PROTOCOL_SEQUENCE_TIMEOUT'){
                        logger('mysql reconnect， reconnect time:', reconnectionTime++);
                        db.getConnection().then(resolve, reject);
                    }
                    reject(err);
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
                    try {
                        params[nth] = conn;
                        result = yield Promise.race([
                            fn.apply(ctx, params),
                            new Promise((res) => {
                                timer = setTimeout(() => {
                                    res(Message);
                                }, timeout || 50000);
                            })
                        ]);
                        if(timer) clearTimeout(timer);
                        if(result === Message){
                            throw new Error(result);
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
                reject({
                    code: 739,
                    message: '当前系统正在维护中，不能使用编辑功能'
                });
            }

            const startTime = new Date();

            if (connection) {
                query = connection.query(sql, sqlParam, function (err, rows) {
                    if(connection.logSql){
                        logSql(connection, rows, query.sql, startTime, logExecuteTime, logger);
                    }
                    if (err) {
                        if (!connection.logSql){
                            logSql(connection, rows, query.sql, startTime, logExecuteTime, logger);
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
                        if(connection.logSql){
                            logSql(connection, rows, query.sql, startTime, logExecuteTime, logger);
                        }
                        connection.release();
                        if (err) {
                            if (!connection.logSql){
                                logSql(connection, rows, query.sql, startTime, logExecuteTime, logger);
                            }
                            connection.destroy();
                            err.code = dbCode;
                            reject(err);
                        } else {
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