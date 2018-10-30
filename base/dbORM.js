const dbOrigin = require('./db');
const dbUtilOrigin = require('./dbUtil');


let dbFunss = (config) => {
    let {dbConfig, log, options = {}} = config;
    let {noConvertDbCodes = [], dbCode = 733} = options;
    let exportsObj = {};
    let db = dbOrigin(dbConfig, {
        log: options.log || log,
        noConvertDbCodes,
        dbCode
    });
    let dbUtil = dbUtilOrigin(config, {dbCode});
    exportsObj.db = db;
    exportsObj.dbUtil = dbUtil;

    exportsObj.getList = async function (tableName, query, connection) {
        let { selectFields, sort, limit = 0, offset = 0 } = query;
        let params = [];

        let {sql, insertFieldNames, insertFieldNameMap} = dbUtil.createSelectSql(tableName, selectFields);

        query = dbUtil.convert2DbFieldName(tableName, query);
        let whereSql = dbUtil.createWhereQuery(query, tableName, insertFieldNameMap);
        if(whereSql.sql.length){ 
            sql += ' where ' + whereSql.sql;
            params = params.concat(whereSql.params);
        }

        // 排序
        if (sort === undefined
            || ((typeof sort === 'string') && sort.length <= 1)
            || (Array.isArray(sort)) && !sort.length
        ) {
            if(dbUtil.getFieldNames(tableName).includes('create_time')){
                sql += ' order by create_time desc ';
            }
        } else {
            sort = Array.isArray(sort) ? sort : [sort];
            let orderBySqls = sort.map(subSort => {
                let [field, mode] = subSort.split(':');
                field = dbUtil.toDbFieldNames(tableName, [field], insertFieldNames)[0];
                return dbUtil.getOrderBySql(field, mode, tableName, insertFieldNames);
            }).filter(sql => sql.length > 0);
            if(orderBySqls.length){
                sql += ' order by ' + orderBySqls.join(',');
            }
        }

        // 分页
        if (limit !== undefined && limit > 0) {
            sql += ' limit ?,?';
            params.push(offset, limit);
        }

        return await db.query(sql, params, connection).then(res => dbUtil.convert2RamFieldName(tableName, res));
    };

    exportsObj.getListByIds = async function (tableName, ids, connection) {
        if(!ids || !ids.length){
            return [];
        }
        return await exportsObj.getList(tableName, {
            inFields: {
                id: ids
            }
        }, connection);
    };

    exportsObj.getCount = async function (tableName, query, connection) {
        query = dbUtil.convert2DbFieldName(tableName, query);
        let whereSql = dbUtil.createWhereQuery(query, tableName);
        let sql = 'select count(*) as count from ' + tableName + ' ';
        let params = [];
        if(whereSql.sql.length){
            sql += ' where ' + whereSql.sql;
            params = params.concat(whereSql.params);
        }
        return await db.query(sql, params, connection).then(res => {
            return res[0].count;
        });
    };

    exportsObj.add = async function (tableName, data, connection) {
        // 添加数据, 不能包含 id 字段
        if (data.id) {
            Reflect.deleteProperty(data, 'id');
        }
        data = dbUtil.convert2DbFieldName(tableName, data);
        let insertSql = dbUtil.createInsertSql(tableName, data);
        return await db.query(insertSql.sql, insertSql.params, connection).then(res => res.insertId);
    };

    exportsObj.delete = async function (tableName, data, connection) {
        data = dbUtil.convert2DbFieldName(tableName, data);
        let whereSql = dbUtil.createWhereQuery(data, tableName);
        let sql = `delete from ${tableName} `;
        let params = [];
        if (whereSql.params.length || whereSql.sql.length) {
            sql += ' where ' + whereSql.sql;
            params = params.concat(whereSql.params);
        } else {
            return await Promise.reject({
                code: dbCode,
                message: '不能随意执行全部删除操作'
            });
        }
        return await db.query(sql, params, connection);
    };

    exportsObj.updateByIds = async function (tableName, data, ids, connection) {
        if(!ids || !ids.length){
            return await Promise.resolve();
        }
        let sql = `update ${tableName} set `;
        data = dbUtil.convert2DbFieldName(tableName, data);
        let params = [];
        let updateSql = dbUtil.createUpdateQuery(tableName, data);
        sql += updateSql.sql;
        params = params.concat(updateSql.params);
        sql += ' where id in (?)';
        params.push(ids);
        return await db.query(sql, params, connection);
    };

    exportsObj.update = async function (tableName, data, id, connection) {
        return await exportsObj.updateByIds(tableName, data, [id], connection);
    };

    exportsObj.updateByQuery = async function (tableName, data, query, connection) {
        let sql = `update ${tableName} set `;
        data = dbUtil.convert2DbFieldName(tableName, data);
        let params = [];
        let updateSql = dbUtil.createUpdateQuery(tableName, data);
        sql += updateSql.sql;
        params = params.concat(updateSql.params);
        query = dbUtil.convert2DbFieldName(tableName, query);
        let whereSql = dbUtil.createWhereQuery(query, tableName);
        if(whereSql.sql.length){
            sql += ' where ' + whereSql.sql;
            params = params.concat(whereSql.params);
        }else{
            return await Promise.reject(new Error('updateByQuery不能无条件update'));
        }
        return await db.query(sql, params, connection);
    };

    exportsObj.get = async function (tableName, id, connection) {
        return await db.query(`select * from ${tableName} where id = ?`, [id], connection)
            .then(res => dbUtil.convert2RamFieldName(tableName, res)[0]);
    };

    exportsObj.createBulk = async function (tableName, objs, connection) {
        if (!objs || !objs.length)
            return await Promise.resolve();
        objs = dbUtil.convert2DbFieldName(tableName, objs);
        let insertSql = dbUtil.createBulkInsertSql(tableName, objs);
        return await db.query(insertSql.sql, insertSql.params, connection);
    };

    exportsObj.updateBulk = async function (tableName, objs, connection) {
        if (!objs || !objs.length)
            return await Promise.resolve({});
        objs = dbUtil.convert2DbFieldName(tableName, objs);
        let insertSql = dbUtil.createBulkUpdateSql(tableName, objs);
        return await db.query(insertSql.sql, insertSql.params, connection);
    };

    exportsObj.deleteByIds = async function (tableName, ids, connection) {
        if (!ids || ids.length == 0)
            return await Promise.resolve();
        let sql = 'delete from ' + tableName + ' where id in (?) ';
        let params = [ids];
        return await db.query(sql, params, connection);
    };
    return exportsObj;
};

module.exports = (config) => {
    let dbFuns = dbFunss(config);
    let {options = {}} = config;
    let {dbCode = 733} = options;
    let result = function(tableName){
        let obj = {
            db: dbFuns.db,
            dbUtil: dbFuns.dbUtil
        };
        Object.keys(dbFuns).forEach(key => {
            if(key !== 'db' && key !== 'dbUtil'){
                obj[key] = (...rest) => dbFuns[key].apply(null, [tableName, ...rest]).catch(err => {
                    err.code = dbCode;
                    throw err;
                });
            }
        });
        return obj;
    };
    result.db = dbFuns.db;
    result.dbUtil = dbFuns.dbUtil;
    return result;
};

