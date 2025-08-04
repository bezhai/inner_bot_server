import axios from 'axios';
import { context } from './context';

const http = axios.create();

http.interceptors.request.use((config) => {
    const traceId = context.getTraceId();
    if (traceId) {
        config.headers['X-Trace-Id'] = traceId;
    }
    return config;
});

export default http;
