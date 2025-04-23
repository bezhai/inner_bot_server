import axios from 'axios';
import { trace } from './trace';

const http = axios.create();

http.interceptors.request.use((config) => {
    const traceId = trace.get();
    if (traceId) {
        config.headers['X-Trace-Id'] = traceId;
    }
    return config;
});

export default http;
