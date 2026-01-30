import { Context, Next } from 'koa';

/**
 * Bearer鉴权中间件，用于验证INNER_HTTP_SECRET
 */
export const bearerAuthMiddleware = async (ctx: Context, next: Next) => {
    const authHeader = ctx.request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ctx.status = 401;
        ctx.body = {
            success: false,
            message: 'Missing or invalid Authorization header',
        };
        return;
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (token !== process.env.INNER_HTTP_SECRET) {
        ctx.status = 401;
        ctx.body = {
            success: false,
            message: 'Invalid authentication token',
        };
        return;
    }
    
    await next();
};