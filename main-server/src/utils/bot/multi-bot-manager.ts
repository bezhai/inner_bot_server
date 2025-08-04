import { BotConfig } from '../../dal/entities/bot-config';
import { botConfigRepository } from '../../dal/repositories/bot-config-repository';

export class MultiBotManager {
    private static instance: MultiBotManager;
    private botConfigs: Map<string, BotConfig> = new Map();
    private defaultBot: BotConfig | null = null;
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

        const allBots = await botConfigRepository.getAllActiveBots();
        this.botConfigs.clear();
        
        for (const bot of allBots) {
            this.botConfigs.set(bot.bot_name, bot);
            if (bot.is_default) {
                this.defaultBot = bot;
            }
        }

        this.initialized = true;
        console.info(`Loaded ${allBots.length} bot configurations`);
    }

    // 根据机器人名称获取配置
    getBotConfig(botName: string): BotConfig | null {
        return this.botConfigs.get(botName) || null;
    }

    // 获取默认机器人配置
    getDefaultBotConfig(): BotConfig | null {
        return this.defaultBot;
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

    // 添加或更新机器人配置
    async addOrUpdateBot(botConfig: BotConfig): Promise<void> {
        this.botConfigs.set(botConfig.bot_name, botConfig);
        if (botConfig.is_default) {
            this.defaultBot = botConfig;
        }
    }

    // 移除机器人配置
    removeBot(botName: string): void {
        const bot = this.botConfigs.get(botName);
        if (bot && bot.is_default) {
            this.defaultBot = null;
        }
        this.botConfigs.delete(botName);
    }
}

export const multiBotManager = MultiBotManager.getInstance();