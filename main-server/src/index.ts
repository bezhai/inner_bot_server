import dotenv from 'dotenv';
dotenv.config();

import './utils/logger';
import { botInitialization } from './services/initialize/main';
import { mongoInitPromise } from './dal/mongo/client';
import AppDataSource from './ormconfig';
import { getBotAppId } from './utils/bot/bot-var';
import Koa from 'koa';
import Router from '@koa/router';
import koaBody from 'koa-body';
import { initializeHttpMode, startLarkWebSocket } from './services/lark/events/service';

async function initializeServer() {
    console.log('Start initialization with bot', getBotAppId());

    // Initialize databases in parallel
    await Promise.all([mongoInitPromise(), AppDataSource.initialize()]);
    console.log('Database connections established!');

    await botInitialization();
    console.log('Bot initialized successfully!');
}

async function startHttpServer() {
    const server = new Koa();
    const router = new Router();
    const { eventRouter, cardActionRouter } = initializeHttpMode();

    server.use(koaBody());
    router.post('/webhook/event', eventRouter);
    router.post('/webhook/card', cardActionRouter);
    server.use(router.routes());

    server.listen(3000);
    console.log('HTTP server started on port 3000');
}

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
