import { BotConfig } from '../../dal/entities/bot-config';
import { botConfigRepository } from '../../dal/repositories/bot-config-repository';

export class MultiBotManager {
    private static instance: MultiBotManager;
    private botConfigs: Map<string, BotConfig> = new Map();
    private initialized = false;

    private constructor() {}

    static getInstance(): MultiBotManager {
        if (!MultiBotManager.instance) {
            MultiBotManager.instance = new MultiBotManager();
        }
        return MultiBotManager.instance;
    }

    // 初始化加载所有机器人配置
    async initialize(): Promise<void> {
        if (this.initialized) return;

        const allBots = await botConfigRepository.getAllActiveBots(process.env.IS_DEV === 'true');
        this.botConfigs.clear();
        
        for (const bot of allBots) {
            this.botConfigs.set(bot.bot_name, bot);
        }

        this.initialized = true;
        console.info(`Loaded ${allBots.length} bot configurations`);
    }

    // 根据机器人名称获取配置
    getBotConfig(botName: string): BotConfig | null {
        return this.botConfigs.get(botName) || null;
    }

    // 根据app_id获取机器人配置
    getBotConfigByAppId(appId: string): BotConfig | null {
        for (const bot of this.botConfigs.values()) {
            if (bot.app_id === appId) {
                return bot;
            }
        }
        return null;
    }

    // 获取所有机器人配置
    getAllBotConfigs(): BotConfig[] {
        return Array.from(this.botConfigs.values());
    }

    // 获取指定初始化类型的机器人
    getBotsByInitType(initType: 'http' | 'websocket'): BotConfig[] {
        return Array.from(this.botConfigs.values()).filter(bot => bot.init_type === initType);
    }

    // 重新加载配置
    async reload(): Promise<void> {
        this.initialized = false;
        await this.initialize();
    }
}

export const multiBotManager = MultiBotManager.getInstance();