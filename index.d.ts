// Type definitions for [~THE LIBRARY NAME~] [~OPTIONAL VERSION NUMBER~]
// Project: [~dborm-mysql~]
// Definitions by: [~zhangxiang~] <[~A URL FOR YOU~]>

/*~ This is the module template file for function modules.
 *~ You should rename it to index.d.ts and place it in a folder with the same name as the module.
 *~ For example, if you were writing a file for "super-greeter", this
 *~ file should be 'super-greeter/index.d.ts'
 */

/*~ Note that ES6 modules cannot directly export callable functions.
 *~ This file should be imported using the CommonJS-style:
 *~   import x = require('someLibrary');
 *~
 *~ Refer to the documentation to understand common
 *~ workarounds for this limitation of ES6 modules.
 */

/*~ If this module is a UMD module that exposes a global variable 'myFuncLib' when
 *~ loaded outside a module loader environment, declare that global here.
 *~ Otherwise, delete this declaration.
 */
// export as namespace myFuncLib;

/*~ This declaration specifies that the function
 *~ is the exported object from the file
 */
import mysql = require('mysql');

export = dbORM;

/*~ This example shows how to have multiple overloads for your function */
// declare function dbORM(name: string): MyFunction.NamedReturnType;
// declare function dbORM(length: number): MyFunction.LengthReturnType;
interface dbConfig {
    connectionLimit: number;
    database: string;
    host: string;
    port: number;
    user: string;
    password: string;
    multipleStatements: boolean;
}

interface db2ramFieldMap {}

interface textDbFieldsMap {}

interface options {
    log: boolean;
    dbCode: number;
    noConvertDbCodes: Array<number>,
    logExecuteTime?: boolean,
}


interface dbORMParams {
    dbConfig: dbConfig,
    db2ramFieldMap: db2ramFieldMap,
    textDbFieldsMap: textDbFieldsMap,
    options: options
}

/**
 *
 * @param params
 */
declare function dbORM(params: dbORMParams): dbORM.ORMTableInstanceConstructor

/*~ If you want to expose types from your module as well, you can
 *~ place them in this block. Often you will want to describe the
 *~ shape of the return type of the function; that type should
 *~ be declared in here, as this example shows.
 */
declare namespace dbORM {
    interface ORM_DB {
        pool: mysql.Pool,
        getConnection(): Promise<mysql.Connection>,
        wrapTransaction(fn: Function, nth: number, timeout?: number): (...args: any[]) => Promise<any>,
        query(sql: string, params: Array<any>, connection?: mysql.Connection): Promise<any>,
        beginTransaction(): Promise<mysql.Connection>,
        commitTransaction(conn: mysql.Connection): Promise<any>,
        rollbackTransaction(conn: mysql.Connection): Promise<any>
    }

    interface ORM_DBUtil {
        getFieldNames(tableName: string, extra?: boolean): Array<string>,
        parseKeyword(keyword: string): string,
        createKeywordSql(tableName: string, keywordRes: string|object): { params: Array<string>, sql: string },
        getWhereFields(tableName: string, field: string, insertFieldNameMap?: object): string,
        getRam2dbFieldMaps(db2ramFieldMaps: object): object,
        getTextRamFields(textDbFields: object): object,
        /**
         * 将data中key为数据库的字段名称转换为内存的字段名称
         */
        convert2RamFieldName(tableName: string, data: object|Array<any>): any,
        /**
         * 将data中key为内存中的字段名称转换为数据库中的名称
         */
        convert2DbFieldName(tableName: string, data: object|Array<any>): any,
        /**
         * 将fieldNames转换为数据库对应的名字, insertFieldNames表示有些自定义的字段不需要转换
         */
        toDbFieldNames(tableName: string, fieldNames: Array<any>, insertFieldNames?: Array<any>): string,
        /**
         * 创建一次插入一条数据的sql相关信息
         */
        createInsertSql(tableName: string, obj: any): { params: Array<Array<any>>, sql: string },
        /**
         * 创建一次性插入多条数据的sql相关信息
         */
        createBulkInsertSql(tableName: string, obj: Array<any>): { params: Array<Array<any>>, sql: string },
        /**
         * 从给定的fieldNames中选择where字段，其中kwFieldName表示关键字查询对应的字段
         */
        createWhereQuery(obj: any, tableName: string, insertFieldNameMap?: any): { params: Array<any>, sql: string },
        /**
         * 从给定的fieldNames中查找要更新的字段，创建更新sql语句
         */
        createUpdateQuery(tableName: string, obj: any): { params: Array<any>, sql: string },
        createBulkUpdateSql(tableName: string, objs: Array<any>): { params: Array<any>, sql: string },
        /**
         * mode = 1或者mode = 2 按照中文升降排序，mode = 3 或者 mode = 4按照英文升降排序
         */
        getOrderBySql(field: string, mode: number, tableName: string, insertFieldNames?: Array<any>): string,
        createSelectSql(tableName: string, selectFields?: Array<string>): { sql: string, insertFieldNames: Array<any>, insertFieldNameMap: any },
        convertSort(sort: string, strFields: Array<any>): string
    }

    export interface ORMTableInstanceConstructor {
        db: ORM_DB;
        dbUtil: ORM_DBUtil;
        (tableName: string): {
            db: ORM_DB,
            dbUtil: ORM_DBUtil,
            // 这里原生 mysql 是 any 类型，但是由于我们 orm 框架的实现，我可以理解为返回数组
            getList(query: any, connection?: mysql.Connection): Promise<Array<any>>,
            findOne(query: any, connection?: mysql.Connection): Promise<any>,
            getMapByField(query: any, connection?: mysql.Connection): Promise<Map<string, Array<any>>>,
            getGroupByField(query: any, connection?: mysql.Connection): Promise<Map<string, any>>,
            getListByIds(ids: Array<number>, connection?: mysql.Connection): Promise<Array<any>>,
            getCount(query: any, connection?: mysql.Connection): Promise<number>,
            pageQuery(query: any, connection?: mysql.Connection): Promise<{ list: Array<any>, count: number }>,
            add(data: any, connection?: mysql.Connection): Promise<number>,
            delete(data: any, connection?: mysql.Connection): Promise<any>,
            updateByIds(data: any, ids?: Array<number>, connection?: mysql.Connection): Promise<any>,
            update(data: any, id: number | string, connection?: mysql.Connection): Promise<any>,
            updateByQuery(data: any, query: any, connection?: mysql.Connection): Promise<any>,
            get(id: number | string, connection?: mysql.Connection): Promise<any>,
            createBulk(objs?: Array<any>, connection?: mysql.Connection): Promise<any>,
            updateBulk(objs?: Array<any>, connection?: mysql.Connection): Promise<any>,
            deleteByIds(ids?: Array<number>, connection?: mysql.Connection): Promise<any>,
            [key: string]: any
        };
    }

    /*~ If the module also has properties, declare them here. For example,
     *~ this declaration says that this code is legal:
     *~   import f = require('myFuncLibrary');
     *~   console.log(f.defaultName);
     */
    // export const defaultName: string;
    // export let defaultLength: number;
}
