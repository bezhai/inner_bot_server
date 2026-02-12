import type { Middleware } from 'koa';
import jwt from 'jsonwebtoken';

const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/config']);

export const jwtAuth: Middleware = async (ctx, next) => {
  if (!ctx.path.startsWith('/api')) {
    return next();
  }
  if (PUBLIC_PATHS.has(ctx.path)) {
    return next();
  }

  const authHeader = ctx.get('authorization') || ctx.get('Authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    ctx.status = 401;
    ctx.body = { message: 'Unauthorized' };
    return;
  }

  try {
    const secret = process.env.DASHBOARD_JWT_SECRET || '';
    const payload = jwt.verify(token, secret);
    ctx.state.user = payload;
  } catch (err) {
    ctx.status = 401;
    ctx.body = { message: 'Unauthorized' };
    return;
  }

  await next();
};
