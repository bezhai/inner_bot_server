import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { context } from '@middleware/context';

const http = axios.create({
    timeout: 30000, // 30秒超时
});

http.interceptors.request.use((config) => {
    const traceId = context.getTraceId();
    if (traceId) {
        config.headers['X-Trace-Id'] = traceId;
    }
    const appName = context.getBotName();
    if (appName) {
        config.headers['X-App-Name'] = appName;
    }
    return config;
});

/**
 * 带重试的请求函数
 */
export async function requestWithRetry<T>(
    requestFn: () => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number; retryOn?: (error: AxiosError) => boolean } = {}
): Promise<T> {
    const { maxRetries = 3, retryDelay = 1000, retryOn } = options;

    const shouldRetry = retryOn || ((error: AxiosError) => {
        // 默认对连接错误和 5xx 错误进行重试
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            return true;
        }
        const status = error.response?.status;
        return status !== undefined && status >= 500;
    });

    let lastError: AxiosError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error as AxiosError;

            if (attempt < maxRetries && shouldRetry(lastError)) {
                const delay = retryDelay * Math.pow(2, attempt); // 指数退避
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }

    throw lastError;
}

export default http;
