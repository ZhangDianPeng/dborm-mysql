/**
 * Created by zhangdianpeng on 2017/8/8.
 */

const co = require('co');

let db2ramFieldMap = require('./config/db2ramFieldMap.json');
let textDbFieldsMap = require('./config/textDbFields.json');
let dbConfig = {
    "connectionLimit": 10,
    "database": "dev_netease",
    "host": "dev.youdata.com",
    "user": "sup_bigviz",
    "port": 3360,
    "password": "123456",
    "multipleStatements": true
};

let dbORM = require('./base/dbORM')({
    log: true,
    dbConfig,
    db2ramFieldMap,
    textDbFieldsMap,
    options: {
        dbCode: 734,
        noConvertDbCodes: [735]
    }
});

const TableName = 'sample';
let sampleDao = dbORM(TableName);
let {dbUtil, db} = sampleDao;


//istanbul cover node_modules/mocha/bin/_mocha src/app/server/test/dao
let should = require('chai').should();
let expect = require('chai').expect;

let id0, id1;

let sample = {
    projectId: 1,
    name: 'sampleTest',
    json: {
        a: 1,
        b: 2
    }
};

let wrapAdd = co.wrap(function*(){
    let dbWrapFun = function(sample, conn) {
        return sampleDao.add(sample, conn).then(insertId => {throw {insertId, code: 736}});
    };

    for(let i = 0; i < 10; i++){
        let newSample = {
            projectId: 1,
            name: i
        };
        try{
            yield db.wrapTransaction(dbWrapFun, 1)(newSample);
        }catch(err){
            console.log('err:', err);
        }
    }
    return 'ok';
});

describe('sampleDao', function(){


    //add接口
    describe('db.wrapTranscation', function(){
        it('事务处理', function (){
            return wrapAdd().then(res => {
                res.should.to.be.a('string');
            });
        });
    });

    //add接口
    describe('add', function(){
        it('插入单条数据，返回插入的id', function (){
            return sampleDao.add(sample).then(insertId => {
                insertId.should.to.be.a('number');
                insertId.should.to.be.least(0);
                id0 = insertId;
                console.log('id0:', id0);
            })
        });
        it('插入数据为空，抛出500异常', function (){
            return sampleDao.add({}).catch(err => {
                console.log('500.empty.message:', err);
                err.code.should.to.equal(734);
            })
        });
        it('插入带id的数据', function (){
            return sampleDao.add({id: 1, projectId: 2}).then(insertId => {
                insertId.should.to.be.a('number');
                insertId.should.to.be.least(0);
            })
        });
    });

    //createBulk接口
    describe('批量插入数据，返回的插入id只有一个', function(){
        it('return a object', function (){
            return sampleDao.createBulk([sample, sample]).then(res => {
                id1 = res.insertId;
                console.log('id1:', id1);
                res.should.to.be.a('object');
            })
        });
        it('有某些数据为空时，抛出异常500', function (){
            return sampleDao.createBulk([{}, sample, {}]).catch(err => {
                console.log('message:', err.message);
                err.code.should.to.equal(734);
            })
        });
    });

    //get接口
    describe('get', function(){
        it('如果指定id不存在，返回undefined', function (){
            return sampleDao.get(100000).then(res => {
                expect(res).to.be.an('undefined');
            })
        });
        it('返回指定id的sample', function (){
            return sampleDao.get(id0).then(res => {
                res.should.to.be.an('object');
            })
        });
    });

    //getList接口
    describe('getList', function(){
        let query = {
            selectFields: 'projectId',
            projectId: 1,
            keyword: {
                name: 's\amp_l%e'
            }
        };
        it('return dashboards', function (){
            return sampleDao.getList(Object.assign({}, {inFields: {
                id: [id0, id1]
            }})).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });
        let queryWithSortAsc = Object.assign({}, query, {
            inFields: {
               id: [],
            },
            sort: "name:1"
        });
        it('按照指定字段升序', function (){
            return sampleDao.getList(queryWithSortAsc).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });
        let queryWithSortDec = Object.assign({}, query, {
            sort: "name:2"
        });
        it('按照指定字段降序', function (){
            return sampleDao.getList(queryWithSortDec).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });

        let queryWithSortArray = Object.assign({}, query, {
            sort: ["name:2", "id:1", "projectId:2"]
        });
        it('queryWithSortArrayTest', function (){
            return sampleDao.getList(queryWithSortArray).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });

        let queryWithPage = Object.assign({}, query, {
            sort: "name:2",
            offset: 1,
            limit: 20
        });
        it('分页测试', function (){
            return sampleDao.getList(queryWithPage).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });

        let queryWithCustomQuery = Object.assign({}, query, {
            customQuery: 'id & 1 = 1'
        });

        it('customQueryTest', function (){
            return sampleDao.getList(queryWithCustomQuery).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });
        
        let queryWithCustomQueryOnly = Object.assign({}, {
            customQuery: 'id & 1 = 1'
        });

        it('customQueryTestOnly', function (){
            return sampleDao.getList(queryWithCustomQueryOnly).then(res => {
                res.should.to.be.instanceOf(Array);
            })
        });

        let selectFieldsWithAs = Object.assign({}, {
            selectFields: ['name as myName'],
        });

        it('selectFieldsWithAsTest', function (){
            return sampleDao.getList(selectFieldsWithAs).then(res => {
                res.should.to.be.instanceOf(Array);
            })
        });

        let selectFieldsWithAsAndSort = Object.assign({}, {
            selectFields: ['name as myName'],
            sort: 'myName:1'
        });

        it('selectFieldsWithAsAndSortTest', function (){
            return sampleDao.getList(selectFieldsWithAsAndSort).then(res => {
                res.should.to.be.instanceOf(Array);
            })
        });

        let selectFieldsWithAsAndKeywordAndSort = Object.assign({}, {
            selectFields: ['*', 'name as myName'],
            sort: 'myName:1',
            keyword: 'myName:hello'
        });

        it('selectFieldsWithAsAndSortTest', function (){
            return sampleDao.getList(selectFieldsWithAsAndKeywordAndSort).then(res => {
                res.should.to.be.instanceOf(Array);
            })
        });

        let selectFieldsWithAsAndKeywordAndSortAndInfieldsAndQuery = Object.assign({}, {
            selectFields: ['*', 'SUBSTRING(name, INSTR(name,",") +1, +2) AS myName'],
            sort: 'myName:1',
            keyword: 'myName:hello',
            inFields: {
                myName: ['a', 'b']
            },
            customQuery: 'id & 1 = 1',
            myName: 'c'
        });

        it('selectFieldsWithAsAndKeywordAndSortAndInfieldsAndQueryTest', function (){
            return sampleDao.getList(selectFieldsWithAsAndKeywordAndSortAndInfieldsAndQuery).then(res => {
                res.should.to.be.instanceOf(Array);
            })
        });
    });

    //getListByIds接口
    describe('getListByIds', function(){
        it('return dashboards', function (){
            return sampleDao.getListByIds([id0, id1]).then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });
        it('如果ids为空的情况', function (){
            return sampleDao.getListByIds().then(res =>{
                res.should.to.be.instanceOf(Array);
            })
        });
    });

    describe('getCount', function(){
        let query = {
            projectId: 1,
            keyword: {
                name: 'sample'
            }
        };
        it('return count', function(){
            return sampleDao.getCount(Object.assign({}, {inFields: {
                id: [id0, id1]
            }})).then(res => {
                console.log('count:', res);
                res.should.to.be.a('number');
                res.should.to.be.least(0);
            })
        });
        it('return all count if query is {}', function(){
            return sampleDao.getCount({}).then(res => {
                console.log('count:', res);
                res.should.to.be.a('number');
                res.should.to.be.least(0);
            })
        });
    });

    //update接口
    describe('update', function(){
        it('更新数据', function (){
            let sample = {
                projectId: 2,
                json: {
                    a: 1,
                    b: 2,
                    c: 3
                }
            };
            return sampleDao.update(sample, id0).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
    });

    //updateByIds接口
    describe('updateByIds', function(){
        it('更新数据', function (){
            let sample = {
                projectId: 2,
                json: {
                    a: 1,
                    b: 2,
                    c: 3
                }
            };
            return sampleDao.updateByIds(sample, [id0, id1]).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
    });

    //updateByIds接口
    describe('updateByQuery', function(){
        it('更新数据', function (){
            let sample = {
                projectId: 2,
                json: {
                    a: 1,
                    b: 2,
                    c: 3
                }
            };
            return sampleDao.updateByQuery(sample, {projectId: 2, inFields: {id: [id0, id1]}}).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
        it('不能无条件更新数据', function (){
            let sample = {
                projectId: 2,
                json: {
                    a: 1,
                    b: 2,
                    c: 3
                }
            };
            return sampleDao.updateByQuery(sample, {}).catch(err => {
                console.log('message:', err.message);
                err.message.should.to.equal('updateByQuery不能无条件update');
            })
        });
    });


    describe('updateBulk',function(){
        it('使用updateBulk更新数据', function (){
            let sample = {
                projectId: 2,
                id:id0,
                json: {
                    a: 1,
                    b: 2,
                    c: 3
                }
            };
            let sample1 = {
                projectId: 2,
                id:id1,
                json: {
                    a: 1,
                    b: 2,
                    c: 3
                }
            };
            return sampleDao.updateBulk([sample,sample1]).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
        it('使用updateBulk更新空数据', function (){
            return sampleDao.updateBulk([]).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
    });


    //delete接口
    describe('delete', function(){
        it('删除数据', function (){
            return sampleDao.delete({inFields: {id: [id0]}}).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
        it('不能无条件的删除所有内容', function (){
            return sampleDao.delete().catch(err =>{
                err.code.should.to.equal(734);
            })
        });
    });
    //deleteByIds接口
    describe('deleteByIds', function(){
        it('根据id列表删除数据', function (){
            return sampleDao.deleteByIds([id0, id1]).then(res =>{
                res.should.to.be.instanceOf(Object);
            })
        });
        it('如果ids为空，则返回undefined', function (){
            return sampleDao.deleteByIds([]).then(res =>{
                expect(res).to.be.an('undefined');
            })
        });
    });

});





// userDao.get('id');
