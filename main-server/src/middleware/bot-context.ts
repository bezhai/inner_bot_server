import { Context, Next } from 'koa';
import { asyncLocalStorage, context } from './context';
import { multiBotManager } from '../utils/bot/multi-bot-manager';

export const botContextMiddleware = async (ctx: Context, next: Next) => {
    let botName: string | undefined;

    // 1. 优先从 X-App-Name header 获取 bot_name (用于内部API调用)
    const appNameHeader = ctx.request.headers['x-app-name'] as string;
    if (appNameHeader) {
        botName = appNameHeader;
        console.info(`Extracted bot_name from X-App-Name header: ${botName}`);
    } else {
        // 2. 从路径中提取 bot_name: /webhook/{bot_name}/event 或 /webhook/{bot_name}/card
        const pathMatch = ctx.path.match(/^\/webhook\/([^\/]+)\/(event|card)$/);
        if (pathMatch) {
            botName = pathMatch[1];
            console.info(`Extracted bot_name from path: ${botName}`);
        }
    }

    // 3. 验证机器人配置是否存在
    if (botName) {
        const botConfig = multiBotManager.getBotConfig(botName);
        if (!botConfig) {
            console.warn(`Bot configuration not found for: ${botName}`);
        }
    }

    // 4. 将 botName 注入到现有的 AsyncLocalStorage 上下文中
    const newStore = context.set({ botName });

    await asyncLocalStorage.run(newStore, next);
};
