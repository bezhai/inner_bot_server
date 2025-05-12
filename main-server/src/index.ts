import dotenv from 'dotenv';
dotenv.config();

// 初始化事件订阅
import './services/sub'; 

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
import { initEvents } from './events';

async function initializeServer() {
    console.log('Start initialization with bot', getBotAppId());

    // 初始化数据库
    await Promise.all([mongoInitPromise(), AppDataSource.initialize()]);
    console.log('Database connections established!');

    // 初始化事件系统
    initEvents();
    console.log('Event system initialized successfully!');

    // 初始化机器人
    await botInitialization();
    console.log('Bot initialized successfully!');
}

async function startHttpServer() {
    const server = new Koa();
    const router = new Router();
    const { eventRouter, cardActionRouter } = initializeHttpMode();

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

    server.listen(3000);
    console.log('HTTP server started on port 3000');
}

process.on('SIGINT', async function () {
    console.log('Gracefully shutting down...');

    // 关闭事件系统
    try {
        const { getEventSystem } = await import('./events');
        const eventSystem = getEventSystem();
        await eventSystem.close();
        console.log('Event system closed');
    } catch (error: any) {
        console.warn('Error while closing event system:', error);
    }

    // 关闭Redis连接
    try {
        const { close } = await import('./dal/redis');
        await close();
        console.log('Redis connections closed');
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
