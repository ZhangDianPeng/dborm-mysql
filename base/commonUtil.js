/**
 * Created by zhangdianpeng on 2017/8/8.
 */
let commonUtil = {};
let _ = require('lodash');

commonUtil.exchangeKV = function (obj) {
    let keys = Object.keys(obj);
    let values = [];
    for (let key of keys) {
        values.push(obj[key]);
    }
    return _.zipObject(values, keys);
};

module.exports = commonUtil;