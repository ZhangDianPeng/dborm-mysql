/**
 * 事务超时卡点追踪：用 async_hooks 记录事务上下文内 pending 异步资源的创建堆栈，
 * 超时时定位到卡住的业务代码位置。懒启用 + 引用计数，无事务运行时零开销。
 */
const { AsyncLocalStorage, createHook } = require('async_hooks');

const als = new AsyncLocalStorage();
// asyncId -> store，供 promiseResolve/destroy 在任意上下文回查所属 store
const storeOf = new Map();
let activeCount = 0;

const hook = createHook({
    init(asyncId, type, triggerAsyncId, resource) {
        const store = als.getStore();
        if (!store || store.closed) return; // 非事务资源，或事务已结束（超时后游离的异步链路），零处理
        // 捕获创建堆栈；new Error().stack 首行为 "Error"，后续为调用帧
        store.pending.set(asyncId, { stack: new Error().stack, type });
        storeOf.set(asyncId, store);
    },
    promiseResolve(asyncId) {
        const store = storeOf.get(asyncId);
        if (store) {
            store.pending.delete(asyncId);
            storeOf.delete(asyncId);
        }
    },
    destroy(asyncId) {
        const store = storeOf.get(asyncId);
        if (store) {
            store.pending.delete(asyncId);
            storeOf.delete(asyncId);
        }
    }
});

// 判断某帧是否属于业务代码（排除框架内部 / node 内建 / node_modules）
function isBizFrame(line) {
    if (!line.includes('(') && !line.includes('at ')) return false;
    if (line.includes('base/db.js') || line.includes('base\\db.js')) return false;
    if (line.includes('timeoutTracer.js')) return false;
    if (line.includes('node_modules')) return false;
    if (line.includes('node:')) return false; // node internal
    return line.includes('at '); // 需为真实调用帧
}

function begin() {
    if (activeCount === 0) hook.enable();
    activeCount++;
    return { pending: new Map(), closed: false };
}

function runIn(store, fn) {
    return als.run(store, fn);
}

/**
 * 从 pending 集合挑选卡点最深的资源：业务帧最多者（调用栈最贴近实际阻塞的内层函数），
 * 帧数相同时取较晚创建（asyncId 较大）者。只保留业务帧（剔除 tracer/db/node 内部帧），
 * 拼为堆栈字符串；无业务帧返回 ''。
 */
function getTimeoutStack(store) {
    let bestId = -1;
    let bestCount = 0;
    let bestFrames = null;
    for (const [asyncId, info] of store.pending) {
        const bizFrames = info.stack.split('\n').filter(isBizFrame);
        if (bizFrames.length === 0) continue;
        if (bizFrames.length > bestCount ||
            (bizFrames.length === bestCount && asyncId > bestId)) {
            bestCount = bizFrames.length;
            bestId = asyncId;
            bestFrames = bizFrames;
        }
    }
    return bestFrames ? bestFrames.join('\n') : '';
}

function end(store) {
    // 标记 store 已关闭：超时后仍在运行的游离异步链路（setInterval/重试回调等）
    // 会携带本 store 的 ALS 上下文，closed 标记让 init 跳过它们，避免写回已结束的 store 造成泄漏
    store.closed = true;
    // 清理本 store 残留的 asyncId 映射，防止泄漏
    for (const asyncId of store.pending.keys()) {
        storeOf.delete(asyncId);
    }
    store.pending.clear();
    activeCount--;
    if (activeCount <= 0) {
        activeCount = 0;
        hook.disable();
    }
}

module.exports = {
    begin,
    runIn,
    getTimeoutStack,
    end,
    _activeCount: () => activeCount
};
