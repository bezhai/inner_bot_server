import { Context, Next } from 'koa';

/**
 * 混合内容处理中间件
 * 允许HTTPS网站访问HTTP API，解决浏览器的混合内容限制
 */
export async function mixedContentMiddleware(ctx: Context, next: Next) {
    // 设置CORS相关头部，允许跨域访问
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
    ctx.set('Access-Control-Max-Age', '86400'); // 预检请求缓存24小时

    // 设置安全头部，允许混合内容
    ctx.set('Content-Security-Policy', 'upgrade-insecure-requests');
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 处理OPTIONS预检请求
    if (ctx.method === 'OPTIONS') {
        ctx.status = 200;
        ctx.body = '';
        return;
    }

    await next();
}
