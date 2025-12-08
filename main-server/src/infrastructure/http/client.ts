import axios from 'axios';
import { context } from '@middleware/context';

const http = axios.create();

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

export default http;
