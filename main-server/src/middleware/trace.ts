import { Context, Next } from 'koa';
import { trace } from '../utils/trace';

export const traceMiddleware = async (ctx: Context, next: Next) => {
    const traceId = ctx.request.headers['x-trace-id'] as string;
    trace.init(traceId);
    ctx.set('X-Trace-Id', trace.get()!);
    await next();
};
