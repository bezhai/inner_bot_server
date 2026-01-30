import type { Context, Next } from 'koa';
import logger from '@logger/index';

/**
 * 统一错误处理
 * - 捕获下游中间件和路由抛出的异常
 * - 区分可预期的业务错误（AppError）与未知错误
 * - 输出统一的 JSON 响应
 */
export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public isOperational = true,
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
    try {
        await next();
    } catch (err: unknown) {
        const error = err as Error;

        // AppError：业务可预期错误
        if (error instanceof AppError) {
            ctx.status = error.statusCode;
            ctx.body = {
                error: error.message,
                code: error.statusCode,
            };
            logger.warn('Operational error', { message: error.message });
            return;
        }

        // 未知错误：避免泄露内部实现细节
        ctx.status = 500;
        ctx.body = {
            error: 'Internal server error',
            code: 500,
        };
        logger.error('Unexpected error', {
            name: error?.name,
            message: error?.message,
            stack: error instanceof Error ? error.stack : undefined,
        });
    }
}
