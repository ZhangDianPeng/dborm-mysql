/**
 * Created by zhangdianpeng on 2017/8/8.
 */

module.exports = function (message, code, value){
    this.message = message;
    this.code = code || 500;
    this.value = value || '';
    Error.captureStackTrace(this);
};