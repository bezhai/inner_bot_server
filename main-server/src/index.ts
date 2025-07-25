import dotenv from 'dotenv';
dotenv.config();

// 初始化事件订阅

import './utils/logger';
import { botInitialization } from './services/initialize/main';
import { mongoInitPromise } from './dal/mongo/client';
import AppDataSource from './ormconfig';
import { getBotAppId } from './utils/bot/bot-var';
import Koa from 'koa';
import Router from '@koa/router';
import koaBody from 'koa-body';
import { initializeHttpMode, startLarkWebSocket } from './services/lark/events/service';
import { traceMiddleware } from './middleware/trace';
import promptRoutes from './handlers/prompts';
import cors from '@koa/cors';

async function initializeServer() {
    console.info('Start initialization with bot', getBotAppId());

    // 初始化数据库
    await Promise.all([mongoInitPromise(), AppDataSource.initialize()]);
    console.info('Database connections established!');

    // 初始化机器人
    await botInitialization();
    console.info('Bot initialized successfully!');
}

async function startHttpServer() {
    const server = new Koa();
    const router = new Router();
    const { eventRouter, cardActionRouter } = initializeHttpMode();

    // 混合内容处理中间件（包含CORS配置）
    server.use(cors());
    server.use(traceMiddleware);
    server.use(koaBody());

    // Lark Webhook 路由
    router.post('/webhook/event', eventRouter);
    router.post('/webhook/card', cardActionRouter);

    // 健康检查端点
    router.get('/api/health', (ctx) => {
        try {
            // 可在此添加其他健康检查逻辑，比如检查数据库连接状态
            ctx.body = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'main-server',
            };
            ctx.status = 200;
        } catch (error) {
            ctx.body = {
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
            ctx.status = 500;
        }
    });

    server.use(router.routes());
    server.use(promptRoutes.routes());

    server.listen(3000);
    console.info('HTTP server started on port 3000');
}

process.on('SIGINT', async function () {
    console.info('Gracefully shutting down...');

    // 关闭Redis连接
    try {
        const { close } = await import('./dal/redis');
        await close();
        console.info('Redis connections closed');
    } catch (error: any) {
        console.warn('Error while closing Redis connections:', error);
    }

    process.exit(0);
});

(async () => {
    try {
        await initializeServer();

        if (process.env.USE_WEBSOCKET === 'true') {
            startLarkWebSocket();
        } else {
            await startHttpServer();
        }
    } catch (error) {
        console.error('Error during initialization:', error);
        process.exit(1);
    }
})();
