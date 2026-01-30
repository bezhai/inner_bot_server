import { createHttpClient, requestWithRetry, HeaderProvider, HttpClientOptions, RetryOptions } from '@inner/shared';
import { context } from '@middleware/context';

// Re-export types from shared
export { HeaderProvider, HttpClientOptions, RetryOptions, requestWithRetry } from '@inner/shared';

// Create HTTP client with context-aware headers
const http = createHttpClient({
    timeout: 30000,
    headerProvider: () => {
        const headers: Record<string, string> = {};
        const traceId = context.getTraceId();
        if (traceId) {
            headers['X-Trace-Id'] = traceId;
        }
        const appName = context.getBotName();
        if (appName) {
            headers['X-App-Name'] = appName;
        }
        return headers;
    },
});

export default http;
