/**
 * Created by hzzhangdianpeng on 2016/12/3.
 */
const util = require('util');
const Err = require('./err');
const commonUtil = require('./commonUtil');
const _ = require('lodash');

module.exports = (config, {dbCode = 733, ignoreDataError = false}) => {
    let {db2ramFieldMap : db2ramFieldMaps, textDbFieldsMap: textDbFields} = config;

    let dbUtil = {};

    let tableNames = Object.keys(textDbFields);

    dbUtil.getFieldNames = function(tableName, extra = false){
        let fieldNames = Object.keys(db2ramFieldMaps[tableName]);
        if(extra){
            fieldNames.push('keyword', 'inFields', 'customQuery');
        }
        return fieldNames;
    };

    dbUtil.parseKeyword = function(keyword){
        if(typeof keyword == 'string'){
            keyword = keyword.replace(/\\/g, '\\\\');
            keyword = keyword.replace(/[_|%]/g, a => `\\${a}`);
         }
         return keyword;
    };

    dbUtil.createKeywordSql = function(tableName, keywordRes){
        let params = [], orSqls = [];
        if(typeof keywordRes == 'string'){
            let [field, ...keyword] = keywordRes.split(':');
            keyword = keyword.join(':');
            orSqls.push(tableName + '.' + field + ' like ?');
            if (keyword) {
                keyword = dbUtil.parseKeyword(keyword);
            }
            params.push('%' + keyword + '%');
        }else{
            Object.keys(keywordRes).map(field => {
                let subKeyword = keywordRes[field];
                if (subKeyword) {
                    orSqls.push(tableName + '.' + field + ' like ?');
                    subKeyword = dbUtil.parseKeyword(subKeyword);
                    params.push('%' + subKeyword + '%');
                }
            });
        }
        return {
            params,
            sql: `(${orSqls.join(' or ')})`
        };

    };
    dbUtil.getWhereFields = function(tableName, field, insertFieldNameMap){
        if(insertFieldNameMap[field]){
            return '(' + insertFieldNameMap[field] + ')';
        }else{
            return tableName + '.' + field;
        }
    };

    dbUtil.getRam2dbFieldMaps = function (db2ramFieldMaps) {
        let newObj = {};
        for (let tableName in db2ramFieldMaps) {
            if (db2ramFieldMaps.hasOwnProperty(tableName)) {
                newObj[tableName] = commonUtil.exchangeKV(db2ramFieldMaps[tableName]);
            }
        }
        return newObj;
    };

    dbUtil.getTextRamFields = function (textDbFields) {
        let newObj = {};
        for (let tableName in textDbFields) {
            if (textDbFields.hasOwnProperty(tableName)) {
                newObj[tableName] = textDbFields[tableName].map(field => db2ramFieldMaps[tableName][field]);
            }
        }
        return newObj;
    };

    let ram2dbFieldMaps = dbUtil.getRam2dbFieldMaps(db2ramFieldMaps);
    let textRamFields = dbUtil.getTextRamFields(textDbFields);

    function judgeTable(tableName) {
        if (!tableNames.concat('pageTable').includes(tableName)) {
            throw new Error(`tableName<${tableName}> is not ok`);
        }
    }

    //将data中key为数据库的字段名称转换为内存的字段名称
    dbUtil.convert2RamFieldName = function (tableName, data) {
        judgeTable(tableName);
        let fieldMap = db2ramFieldMaps[tableName];
        let textFields = textDbFields[tableName];
        if (!fieldMap || !data || typeof (data) !== 'object') {
            return data;
        }
        let isArr = true;
        if (!util.isArray(data)) {
            isArr = false;
            data = [data];
        }
        data.forEach(function (dataRow) {
            for (let field in dataRow) {
                if (textFields.indexOf(field) != -1 && util.isString(dataRow[field])) {
                    try{
                        dataRow[field] = JSON.parse(dataRow[field]);
                    }catch(err){
                        let errMsg = `data error in mysql, tableName:${tableName}, dataRow:${JSON.stringify(dataRow)}, field:${field}`;
                        if(ignoreDataError){
                            dataRow[field] = {reason: errMsg};
                        }else{
                            throw new Error(errMsg);
                        }
                    }
                }
                if (fieldMap.hasOwnProperty(field)) {
                    dataRow[fieldMap[field]] = dataRow[field];
                    if (field !== fieldMap[field]) {
                        delete dataRow[field];
                    }
                }
            }
        });
        return isArr ? data : data[0];
    };

    //将data中key为内存中的字段名称转换为数据库中的名称
    dbUtil.convert2DbFieldName = function (tableName, data) {
        judgeTable(tableName);
        let fieldMap = ram2dbFieldMaps[tableName];
        let textFields = textRamFields[tableName];
        if (!fieldMap || !data || typeof (data) !== 'object') {
            return data;
        }
        let isArr = true;
        if (!util.isArray(data)) {
            isArr = false;
            data = [data];
        }
        let newData;
        newData = data.map(function (dataRow) {
            let newObj = {};
            for (let field in dataRow) {
                if (textFields.indexOf(field) != -1 && util.isObject(dataRow[field]))
                    newObj[field] = JSON.stringify(dataRow[field]);
                else {
                    newObj[field] = dataRow[field];
                }
                if (fieldMap.hasOwnProperty(field)) {
                    newObj[fieldMap[field]] = newObj[field];
                    if (field !== fieldMap[field]) {
                        delete newObj[field];
                    }
                }
            }
            return newObj;
        });
        return isArr ? newData : newData[0];
    };

    //将fieldNames转换为数据库对应的名字, insertFieldNames表示有些自定义的字段不需要转换
    dbUtil.toDbFieldNames = function (tableName, fieldNames, insertFieldNames = []) {
        judgeTable(tableName);
        let fieldMap = ram2dbFieldMaps[tableName];
        return fieldNames.map(fieldName => {
            if (insertFieldNames.includes(fieldName)){
                return fieldName;
            }else if (!util.isNullOrUndefined(fieldMap[fieldName])){
                return fieldMap[fieldName]
            }else {
                throw new Error(`<${tableName}>中不存在该字段<${fieldName}>`);
            }
        });
    };

    //创建一次插入一条数据的sql相关信息
    dbUtil.createInsertSql = function (tableName, obj) {
        judgeTable(tableName);

        let fieldNames = dbUtil.getFieldNames(tableName);
        let addFieldNames = fieldNames.filter(fieldName => !util.isUndefined(obj[fieldName]));
        if(!addFieldNames.length){
            throw new Err('insert fieldNames is empty', dbCode);
        }

        if (!obj.create_time && fieldNames.includes('create_time')){
            obj.create_time = new Date();
            addFieldNames.push('create_time');
        }
        if (!obj.modify_time && fieldNames.includes('modify_time')){
            obj.modify_time = new Date();
            addFieldNames.push('modify_time');
        }

        let sql = `INSERT INTO ${tableName} (${addFieldNames.join(',')}) VALUES(?)`;
        let params = addFieldNames.map(fieldName => obj[fieldName]);
        return {
            params: [params],
            sql: sql
        };
    };

    //创建一次性插入多条数据的sql相关信息
    dbUtil.createBulkInsertSql = function (tableName, objs) {
        judgeTable(tableName);
        let fieldNames = dbUtil.getFieldNames(tableName);

        //以第一行数据作判断
        let addFieldNames = fieldNames.filter(fieldName => !util.isUndefined(objs[0][fieldName]));

        if(!addFieldNames.length){
            throw new Err('insert fieldNames is empty', dbCode);
        }

        let date = new Date();
        objs.forEach(obj => {
            if (!obj.create_time && fieldNames.includes('create_time')){
                obj.create_time = date;
                if(!addFieldNames.includes('create_time')){
                    addFieldNames.push('create_time');
                }
            }
            if (!obj.modify_time && fieldNames.includes('modify_time')){
                obj.modify_time = date;
                if(!addFieldNames.includes('modify_time')){
                    addFieldNames.push('modify_time');
                }
            }
        });


        let sql = 'INSERT INTO ' + tableName + '(' + addFieldNames.join(',') + ')' + ' VALUES ?';
        let params = objs.map(obj => addFieldNames.map(fieldName => obj[fieldName]));
        return {
            params: [params],
            sql: sql
        };
    };

    //从给定的fieldNames中选择where字段，其中kwFieldName表示关键字查询对应的字段
    dbUtil.createWhereQuery = function (obj, tableName, insertFieldNameMap = {}) {
        judgeTable(tableName);

        let params = [], whereArr = [];
        if (!obj) {
            return {
                params,
                sql: '',
            };
        }

        let insertFieldNames = Object.keys(insertFieldNameMap);
        let fieldNames = dbUtil.getFieldNames(tableName, true).concat(insertFieldNames);

        for (let fieldName of fieldNames) {
            if (util.isNullOrUndefined(obj[fieldName])) continue;
            if (fieldName == 'keyword') {
                if(!obj[fieldName]){
                    continue;
                }
                let keywordRes = obj[fieldName];
                if(typeof keywordRes == 'string'){
                    let [field, ...keyword] = keywordRes.split(':');
                    keyword = keyword.join(':');
                    field = dbUtil.toDbFieldNames(tableName, [field], insertFieldNames)[0];
                    let realField = dbUtil.getWhereFields(tableName, field, insertFieldNameMap);
                    whereArr.push({ sql: realField + ' like ?', fieldName });
                    if (keyword) {
                        keyword = dbUtil.parseKeyword(keyword);
                    }
                    params.push({ value: '%' + keyword + '%', fieldName });
                }else{
                    let orSqls = [];
                    Object.keys(keywordRes).map(field => {
                        let subKeyword = keywordRes[field];
                        if (subKeyword) {
                            field = dbUtil.toDbFieldNames(tableName, [field], insertFieldNames)[0];
                            let realField = dbUtil.getWhereFields(tableName, field, insertFieldNameMap);
                            orSqls.push(realField + ' like ?');
                            subKeyword = dbUtil.parseKeyword(subKeyword);
                            params.push({ value: '%' + subKeyword + '%', fieldName });
                        }
                    });
                    whereArr.push({ sql: '(' + orSqls.join(' or ') + ')', fieldName });
                }
            } else if(fieldName == 'inFields'){
                let inFields = obj[fieldName];
                inFields = dbUtil.convert2DbFieldName(tableName, inFields);
                let inSqls = [];
                Object.keys(inFields).forEach(key => {
                    let value = inFields[key] || [];
                    value = [... new Set(value)];
                    if (value.length) {
                        let realField = dbUtil.getWhereFields(tableName, key, insertFieldNameMap);
                        inSqls.push(` ${realField} in (?) `);
                        params.push({ value, fieldName });
                    }else{
                        inSqls.push('0=1');
                    }
                });
                if(inSqls.length){
                    whereArr.push({ sql: '(' + inSqls.join(' and ') + ')', fieldName });
                }
            } else if(fieldName === 'customQuery'){
                let customQuery = obj[fieldName];
                if(customQuery.length){
                    whereArr.push({ sql: '(' + customQuery + ')', fieldName });
                }
            }else {
                params.push({ value: obj[fieldName], fieldName });
                //对于role，projectId=-1属于所有项目
                if (tableName == 'role' && fieldName == 'project_id') {
                    whereArr.push({ sql: '(role.project_id = ? or role.project_id = -1)', fieldName });
                } else {
                    let realField = dbUtil.getWhereFields(tableName, fieldName, insertFieldNameMap);
                    whereArr.push({ sql: realField + '=?', fieldName });
                }
            }
        }

        // 根据传入 query 的字段顺序排序
        const keys = Object.keys(obj);
        params = params.sort((a,b) => keys.indexOf(a.fieldName) - keys.indexOf(b.fieldName)).map(i => i.value);
        whereArr = whereArr.sort((a,b) => keys.indexOf(a.fieldName) - keys.indexOf(b.fieldName)).map(i => i.sql);

        return {
            params: params,
            sql: whereArr.join(' and ')
        };
    };

    //从给定的fieldNames中查找要更新的字段，创建更新sql语句
    dbUtil.createUpdateQuery = function (tableName, obj) {
        let params = [], updateArr = [];

        let fieldNames = dbUtil.getFieldNames(tableName).filter(name => name != 'id');


        if (obj) {
            if (!obj.noUpdateTime && !obj.modify_time  && fieldNames.includes('modify_time')){
                obj.modify_time = new Date();
            }
            let nullFields = dbUtil.toDbFieldNames(tableName, obj['nullFields'] || []);
            fieldNames.forEach((fieldName) => {
                let value = obj[fieldName];
                if (nullFields.includes(fieldName) || !util.isNullOrUndefined(value)) {
                    params.push(value);
                    updateArr.push(fieldName + '=?');
                }
            });
        }
        if (!params.length) {
            throw new Error('update params can not be empty');
        }
        return {
            params: params,
            sql: updateArr.join(' , ')
        };
    };

    dbUtil.createBulkUpdateSql = function (tableName, objs) {
        judgeTable(tableName);

        let fieldNames = dbUtil.getFieldNames(tableName);

        if (!util.isArray(objs)) {
            throw new Error('bulkUpdate.objs need Array');
        }
        if(!objs.length){
            return {
                sql: 'select 1',
                params: []
            }
        }
        let hasId = objs.every(obj => !util.isNullOrUndefined(obj.id));
        if (!hasId) {
            throw new Error(tableName + ' bulkUpdate need id');
        }
        objs.forEach(obj => {
            if (!obj.modify_time && fieldNames.includes('modify_time'))
                obj.modify_time = new Date();
        });
        fieldNames = fieldNames.filter(fieldName => !util.isUndefined(objs[0][fieldName]));
        let sql = 'INSERT INTO ' + tableName + '(' + fieldNames.join(',') + ')' + ' VALUES ?';
        let params = objs.map(obj => fieldNames.map(fieldName => obj[fieldName]));
        let updateField = [];
        fieldNames.forEach(function (field) {
            if (field != 'id')
                updateField.push(field + '=VALUES(' + field + ')');
        });

        sql = sql + ' ON DUPLICATE KEY UPDATE ' + updateField.join(',');
        return {
            params: [params],
            sql: sql
        }
    };

    //mode = 1或者mode = 2 按照中文升降排序，mode = 3 或者 mode = 4按照英文升降排序
    dbUtil.getOrderBySql = function (field, mode, tableName, insertFieldNames = []) {
        if (tableName) {
            judgeTable(tableName);
            if(!insertFieldNames.includes(field)){
                field = tableName + '.' + field;
            }
        }
        let sql;
        if (mode === '1' || mode === '2') {
            sql = ' convert( ' + field + ' using gbk) ';
        } else if (mode === '3' || mode === '4') {
            sql = ' ' + field + ' ';
        } else if (mode === '0') {
            sql = '';
        } else {
            throw new Error(`<${field}> order-by mode is not ok, mode need in [0,1,2,3,4]`);
        }
        if (mode === '2' || mode === '4') sql += ' desc ';
        return sql;
    };

    dbUtil.createSelectSql = function (tableName, selectFields = ['*']) {
        !Array.isArray(selectFields) && (selectFields = [selectFields]);

        let insertFieldNames = [], toSelectFields = [], insertFieldNameMap = {};
        selectFields.forEach(field => {
            if(field.includes(' ') && (field.includes(' as ') || field.includes(' AS '))){
                let insertFieldName = _.last(field.split(' '));
                insertFieldNames.push(insertFieldName);
                insertFieldNameMap[insertFieldName] = field.split(field.includes(' as ') ? 'as' : 'AS')[0];
                toSelectFields.push(field);
            }else {
                if(field !== '*'){
                    field = dbUtil.toDbFieldNames(tableName, [field])[0];
                }
                toSelectFields.push(tableName + '.' + field);
            }
        });

        return {
            sql: `select ${toSelectFields.join(',')} from ${tableName}`,
            insertFieldNames,
            insertFieldNameMap
        };
    };

    dbUtil.convertSort = function (sort, strFields) {
        if(sort){
            let [field, mode] = sort.split(':');
            let isStr = strFields && strFields.includes(field);
            let realMode;
            if (mode === '1' || mode === 'asc') {
                realMode = isStr ? '1' : '3';
            } else if (mode === '2' || mode === 'desc') {
                realMode = isStr ? '2' : '4';
            }else{
                realMode = mode;
            }
            if (!realMode) throw new Error('sort attr error');
            return [field, realMode].join(':');
        }
    };

    return dbUtil;
};



