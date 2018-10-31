## DbORM

- DbOrm is a NodeJs ORM for mysql.
- All function return a promise.
- Every table should has a primary key named id.

#### Start

##### init

```javascript

let dbConfig = {
    "connectionLimit": 100,
    "database": "bigviz",
    "host": "10.11.11.11",
    "user": "bigviz",
    "password": "123456",
    "multipleStatements": true
};

let db2ramFieldMap = {
     "bigviz_user": {
         "id": "id",
         "subline": "subline",
         "department": "department",
         "nick": "nick",
         "email": "email",
         "last_project": "lastProject",
         "details": "details"
     }
};

let textDbFieldsMap = {
    "bigviz_user": ['details']
}

let dbORM = require('dborm-mysql')({
    dbConfig,      // Database configuration information
    db2ramFieldMap, // defined the table structure map from Ram to Database
    textDbFieldsMap,  // if these is a field in mysql table need to JSON.parse or JSON.stringify, you need to add it.
    options: {
        log: true,  // when need to print the logs of sql, it is true, default false.
        dbCode: 733, // when these is a Error, defined the code of Error， default 733.
        noConvertDbCodes: [734, 735] // if the code of Error in noConvertDbCodes, it will not convert it to dbCode. default []
    }
});

```

#### Main Function

Init one tableDao for getting the Orm functions.

```javascript
let userDao = dbORM('bigviz_user');
```


##### add

Insert one row to table.

```javascript
userDao.add({
    nick: 'zhangsan',
    email: 'hzzhangsan@163.com',
    details: {
        a: 1,
        b: 2
    }
});

```

##### get

Get one row from table by id.

```javascript
userDao.get(1);

```

##### getList

Get rows from table by query. The query may includes keyword, sort, offset, limit, selectFields, inFields and the fields of table.

- keyword: defined mysql "like" info.
- offset/limit: defined mysql "limit" info.
- selectFields: defined mysql "select" info.
- sort: defined mysql "order by" info.

```javascript
// get userList where department is qa;
userDao.getList({
    deparment: 'qa'
});

// get userList where department is qa and from offset=0, limit number is 20.
userDao.getList({
    department: 'qa',
    offset: 0,
    limit: 20
});

// get userList where department in ['qa', 'developer']
userDao.getList({
    inFields: {
        department: ['qa', 'developer']
    }
});

// get userList where department like "%qa%" and subline is 1
userDao.getList({
    keyword: 'department:qa',
    subline: 1
});

// get userList where department in ['qa', 'developer'] and order by id desc, department asc
userDao.getList({
    keyword: "department:qa",
    inFields: {
        department: ['qa', 'developer']
    },
    sort: ['id:2', 'department:1']   // 1 is asc, 2 is desc
});

// get useList with selected fields where department in ['qa', 'developer']
userDao.getList({
    selectFields: ['qa', 'developer'],
    inFields: {
        department: ['qa', 'developer']
    }
});

// get useList with "as field" where userNick like "%zhang%" and department like "%qa%"
userDao.getList({
    selectFields: ['qa', 'developer', 'nick as userNick'],
    keyword: {
        userNike: 'zhang',
        department: 'qa'
    }
});

```

##### update

Update one row from table by id.

```javascript
userDao.update({
    department: 'qa',
    info: {
        a: 1
    }
}, 1);

```

##### updateByIds

Update rows from table by ids.

```javascript
userDao.updateByIds({
    department: 'qa',
    info: {
        a: 1
    }
}, [1, 2]);

```

##### updateByQuery

Update rows from table by query. The query may includes keyword, inFields and the fields of table.

```javascript
userDao.updateByQuery({
    department: 'qa',
    info: {
        a: 1
    }
}, {
    inFields: {
        id: [1, 2]
    }
});

```

##### getCount

Get the count of rows from table by query. The query may includes keyword, inFields and the fields of table.

```javascript
// get count of userList from table where department in ['qa', 'developer']
userDao.getCount({
    inFields: {
        department: ['qa', 'developer']
    }
});

```

##### delete

Delete the rows from table by query. The query may includes keyword, inFields and the fields of table.

```javascript
// delete userList from table where department in ['qa', 'developer']
userDao.delete({
    inFields: {
        department: ['qa', 'developer']
    }
});

```

##### deleteByIds

Delete the rows from table by table ids.

```javascript
// delete userList from table where id in [1,2]
userDao.deleteByIds([1, 2]);

```

##### createBulk

Batch insert rows to table.

```javascript
userDao.createBulk([
    {nick: 'zhangsan', email: 'hzzhangsan@163.com'},
    {nick: 'lisi', email: 'hzlisi@163.com'}
])

```

#### db

Get the db for original Query and Transaction processing.

```javascript
let db = dbORM.db;
```

##### db.query(sql, params)

```javascript
db.query('select * from bigviz_user where id = ?', [3]);
```

##### db.wrapTransaction(fn, nth)

Wrap fn for Transaction processing. The nth is the position of 'conn' in fn parameter list.

If these is a Error in fn, it will rollback all sql querying with conn. 

```javascript
db.wrapTransaction(async function(addUsers, deleteUserIds, conn){
    await userDao.createBulk(addUsers, conn);
    await userDao.deleteByIds(deleteUserIds, conn);
    await db.query('select * from bigviz_user where id = ?', [3]);
}, 2);
```



