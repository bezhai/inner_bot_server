import 'koa';

interface BodyRequest {
  body?: unknown;
}

declare module 'koa' {
  interface Request extends BodyRequest {}
}
