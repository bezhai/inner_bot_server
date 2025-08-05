import dotenv from 'dotenv';
dotenv.config();

// 初始化事件订阅

import './utils/logger';
import { botInitialization } from './services/initialize/main';
import { mongoInitPromise } from './dal/mongo/client';
import AppDataSource from './ormconfig';
import { multiBotManager } from './utils/bot/multi-bot-manager';
import Koa from 'koa';
import Router from '@koa/router';
import koaBody from 'koa-body';
import { traceMiddleware } from './middleware/trace';
import { botContextMiddleware } from './middleware/bot-context';
import promptRoutes from './handlers/prompts';
import cors from '@koa/cors';
import { initializeMultiBotHttpMode, startMultiBotWebSocket } from 'services/lark/events/service';
import { initializeLarkClients } from './services/integrations/lark-client';

async function initializeServer() {
    // 初始化数据库
    await Promise.all([mongoInitPromise(), AppDataSource.initialize()]);
    console.info('Database connections established!');

    // 初始化多机器人管理器
    await multiBotManager.initialize();
    console.info('Multi-bot manager initialized!');

    // 初始化 Lark 客户端池
    await initializeLarkClients();
    console.info('Lark client pool initialized!');

    // 初始化机器人
    await botInitialization();
    console.info('Bot initialized successfully!');

    // 显示当前加载的机器人配置
    const allBots = multiBotManager.getAllBotConfigs();
    console.info(`Loaded ${allBots.length} bot configurations:`);
    allBots.forEach((bot) => {
        console.info(`  - ${bot.bot_name} (${bot.app_id}) [${bot.init_type}]`);
    });
}

async function startHttpServer() {
    const server = new Koa();
    const router = new Router();

    // 混合内容处理中间件（包含CORS配置）
    server.use(cors());
    server.use(traceMiddleware); // 先注入 traceId
    server.use(botContextMiddleware); // 再注入 botName
    server.use(koaBody());

    // 初始化多机器人HTTP路由
    const botRouters = initializeMultiBotHttpMode();

    // 为每个机器人创建独立的路由前缀
    for (const botRouter of botRouters) {
        // 机器人专用路由：/webhook/{bot_name}/event 和 /webhook/{bot_name}/card
        router.post(`/webhook/${botRouter.botName}/event`, botRouter.eventRouter);
        router.post(`/webhook/${botRouter.botName}/card`, botRouter.cardActionRouter);

        console.info(`Bot ${botRouter.botName} routes registered: /webhook/${botRouter.botName}/*`);
    }

    // 健康检查端点
    router.get('/api/health', (ctx) => {
        try {
            const allBots = multiBotManager.getAllBotConfigs();
            ctx.body = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'main-server',
                bots: allBots.map((bot) => ({
                    name: bot.bot_name,
                    app_id: bot.app_id,
                    init_type: bot.init_type,
                    is_active: bot.is_active,
                })),
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
    console.info('Available routes:');
    console.info('  - /api/health (health check)');
    console.info('  - /webhook/event (legacy default bot)');
    console.info('  - /webhook/card (legacy default bot)');
    botRouters.forEach((botRouter) => {
        console.info(`  - /webhook/${botRouter.botName}/event`);
        console.info(`  - /webhook/${botRouter.botName}/card`);
    });
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

        // 启动多机器人WebSocket模式
        startMultiBotWebSocket();

        // 启动多机器人HTTP模式
        await startHttpServer();
    } catch (error) {
        console.error('Error during initialization:', error);
        process.exit(1);
    }
})();
