import { AsyncLocalStorage } from 'async_hooks';

export const asyncLocalStorage = new AsyncLocalStorage<{ traceId: string }>();

export const trace = {
    get: () => {
        const store = asyncLocalStorage.getStore();
        return store?.traceId || '';
    },
};
