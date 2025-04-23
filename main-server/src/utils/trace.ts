import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

const asyncLocalStorage = new AsyncLocalStorage<{ traceId: string }>();

export const trace = {
    init: (traceId?: string) => {
        const id = traceId || uuidv4();
        return asyncLocalStorage.run({ traceId: id }, () => id);
    },

    get: () => {
        const store = asyncLocalStorage.getStore();
        return store?.traceId;
    },
};
