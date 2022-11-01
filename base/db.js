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

let logSql = (connection, rows, sql, startTime, logExecuteTime) => {
    let insertIdLog = (rows && rows.insertId) ? `[insertId = ${rows.insertId}] ` : '';

    let info = `[${connection.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}]`;
    if(logExecuteTime){
        const executeTime = (new Date()).getTime() - startTime.getTime();
        info += `[execute time: ${executeTime}ms]`
    }
    info += `${insertIdLog} ${sql}`;
    console.log(info);
};

module.exports = (dbConfig, {log, noConvertDbCodes, dbCode, logExecuteTime}) => {
    let db = {
        pool: null
    };
    initMysqlPool(db, dbConfig);
    let reconnectionTime = 0;
    //获取数据连接，将回调转换为promise
    db.getConnection = function () {
        return new Promise(function (resolve, reject) {
            db.pool.getConnection(function (err, connection) {
                if (err) {
                    if(err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'PROTOCOL_SEQUENCE_TIMEOUT'){
                        console.log('mysql reconnect， reconnect time:', reconnectionTime++);
                        db.getConnection().then(resolve, reject);
                    }
                    reject(err);
                } else {
                    connection.connectionLogId = shortUuid().new().slice(0, 6);
                    reconnectionTime = 0;
                    resolve(connection);
                }
            });
        });
    };

    db.wrapTransaction = function (fn, nth, timeout) {
        const Message = '等待事务超时';
        return function () {
            let ctx = this;
            let params = Array.from(arguments);
            if (params[nth]) {
                return fn.apply(ctx, params);
            } else {
                return (co.wrap(function* (params) {
                    let conn = yield db.beginTransaction();
                    let result;
                    try {
                        params[nth] = conn;
                        result = yield Promise.race([
                            fn.apply(ctx, params),
                            new Promise((res) => {
                                setTimeout(() => {
                                    res(Message);
                                }, timeout || 50000);
                            })
                        ]);
                        if(result === Message){
                            throw new Error(result);
                        }
                        yield db.commitTransaction(conn);
                        conn.release();
                    } catch (err) {
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
                    if(log || process.SQL_LOG){
                        logSql(connection, rows, query.sql, startTime, logExecuteTime);
                    }
                    if (err) {
                        if(!log&&!process.SQL_LOG){
                            logSql(connection, rows, query.sql, startTime, logExecuteTime);
                        }
                        err.code = dbCode;
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            } else {
                db.getConnection().then(function (connection) {
                    query = connection.query(sql, sqlParam, function (err, rows) {
                        if(log || process.SQL_LOG){
                            logSql(connection, rows, query.sql, startTime, logExecuteTime);
                        }
                        connection.release();
                        if (err) {
                            if(!log&&!process.SQL_LOG){
                                logSql(connection, rows, query.sql, startTime, logExecuteTime);
                            }
                            connection.destroy();
                            err.code = dbCode;
                            reject(err);
                        } else {
                            resolve(rows);
                        }
                    });
                }).catch(function (err) {
                    reject(err);
                });
            }
        });
    };

    db.beginTransaction = function () {
        let p = new Promise(function (resolve, reject) {
            db.getConnection().then(function (conn) {
                if(log || process.SQL_LOG){
                    console.log(`[${conn.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}] beginTransaction`);
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
                    if(log || process.SQL_LOG){
                        console.log(`[${conn.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}] commitTransaction`);
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
                if(log || process.SQL_LOG){
                    console.log(`[${conn.connectionLogId}] [${moment().format('YYYY-MM-DD HH:mm:ss.mm.SSS')}] rollbackTransaction`);
                }
                resolve();
            });
        });
    };

    return db;
};

