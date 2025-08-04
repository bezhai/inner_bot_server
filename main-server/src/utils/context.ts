import { AsyncLocalStorage } from 'async_hooks';

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
    }
};
