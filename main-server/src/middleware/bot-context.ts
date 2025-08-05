import { Context, Next } from 'koa';
import { asyncLocalStorage, context } from '../utils/context';
import { multiBotManager } from '../utils/bot/multi-bot-manager';

export const botContextMiddleware = async (ctx: Context, next: Next) => {
    let botName: string | undefined;
    
    // 1. 从路径中提取 bot_name: /webhook/{bot_name}/event 或 /webhook/{bot_name}/card
    const pathMatch = ctx.path.match(/^\/webhook\/([^\/]+)\/(event|card)$/);
    if (pathMatch) {
        botName = pathMatch[1];
        console.info(`Extracted bot_name from path: ${botName}`);
    }
    
    // 4. 验证机器人配置是否存在
    if (botName) {
        const botConfig = multiBotManager.getBotConfig(botName);
        if (!botConfig) {
            console.warn(`Bot configuration not found for: ${botName}`);
        }
    }
    
    // 5. 将 botName 注入到现有的 AsyncLocalStorage 上下文中
    const newStore = context.set({ botName });
    
    await asyncLocalStorage.run(newStore, next);
};