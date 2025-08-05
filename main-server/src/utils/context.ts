import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

interface RequestContext {
    traceId: string;
    botName?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export const context = {
    getTraceId: () => {
        const store = asyncLocalStorage.getStore();
        return store?.traceId || '';
    },
    getBotName: () => {
        const store = asyncLocalStorage.getStore();
        return store?.botName || '';
    },
    getAll: () => {
        return asyncLocalStorage.getStore() || { traceId: '' };
    },
    set: (updates: Partial<RequestContext>) => {
        const current = asyncLocalStorage.getStore() || { traceId: '' };
        return { ...current, ...updates };
    },
    /**
     * 手动运行AsyncLocalStorage上下文，主要用于WebSocket模式
     * @param contextData 要设置的上下文数据
     * @param callback 要在上下文中执行的回调函数
     */
    run: async <T>(contextData: RequestContext, callback: () => Promise<T>): Promise<T> => {
        return asyncLocalStorage.run(contextData, callback);
    },
    /**
     * 创建带有traceId和botName的上下文数据
     * @param botName 机器人名称
     * @param traceId 追踪ID，如果不提供则自动生成
     */
    createContext: (botName?: string, traceId?: string): RequestContext => {
        return {
            traceId: traceId || uuidv4(),
            botName,
        };
    }
};
