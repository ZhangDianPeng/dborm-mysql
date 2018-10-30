/**
 * Created by hzzhangdianpeng on 2016/12/2.
 */

let mysql = require('mysql');
const co = require('co');

function initMysqlPool(db, dbConfig) {
    db.pool = mysql.createPool(dbConfig);
}

module.exports = (dbConfig, {log, noConvertDbCodes, dbCode}) => {
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
                    reconnectionTime = 0;
                    resolve(connection);
                }
            });
        });
    };

    db.wrapTransaction = function (fn, nth) {
        const Message = '等待事务超时';
        return function () {
            let params = Array.from(arguments);
            if (params[nth]) {
                return fn.apply(null, params);
            } else {
                return (co.wrap(function* (params) {
                    let conn = yield db.beginTransaction();
                    let result;
                    try {
                        params[nth] = conn;
                        result = yield Promise.race([
                            fn.apply(null, params),
                            new Promise((res) => {
                                setTimeout(() => {
                                    res(Message);
                                }, 50000);
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
            if (connection) {
                query = connection.query(sql, sqlParam, function (err, rows) {
                    if(log){
                        console.log(query.sql);
                    }
                    if (err) {
                        if(!log){
                            console.log(query.sql);
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
                        if(log){
                            console.log(query.sql);
                        }
                        connection.release();
                        if (err) {
                            if(!log){
                                console.log(query.sql);
                            }
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
                    // conn.release();
                    resolve('success');
                }
            });
        });
    };

    db.rollbackTransaction = function (conn) {
        return new Promise(function (resolve, reject) {
            conn.rollback(function (err, suc) {
                resolve();
            });
        });
    };

    return db;
};

