import { Repository } from 'typeorm';
import AppDataSource from '../../ormconfig';
import { BotConfig } from '../entities/bot-config';

export class BotConfigRepository {
    private repository: Repository<BotConfig>;

    constructor() {
        this.repository = AppDataSource.getRepository(BotConfig);
    }

    // 获取所有启用的机器人配置
    async getAllActiveBots(): Promise<BotConfig[]> {
        return this.repository.find({
            where: { is_active: true },
            order: { is_default: 'DESC', bot_name: 'ASC' }
        });
    }

    // 根据机器人名称获取配置
    async getBotByName(botName: string): Promise<BotConfig | null> {
        return this.repository.findOne({
            where: { bot_name: botName, is_active: true }
        });
    }

    // 获取默认机器人配置
    async getDefaultBot(): Promise<BotConfig | null> {
        return this.repository.findOne({
            where: { is_default: true, is_active: true }
        });
    }

    // 根据app_id获取机器人配置
    async getBotByAppId(appId: string): Promise<BotConfig | null> {
        return this.repository.findOne({
            where: { app_id: appId, is_active: true }
        });
    }

    // 获取指定初始化类型的机器人
    async getBotsByInitType(initType: 'http' | 'websocket'): Promise<BotConfig[]> {
        return this.repository.find({
            where: { init_type: initType, is_active: true },
            order: { is_default: 'DESC', bot_name: 'ASC' }
        });
    }

    // 创建或更新机器人配置
    async upsertBot(botConfig: Partial<BotConfig>): Promise<BotConfig> {
        return this.repository.save(botConfig);
    }
}

export const botConfigRepository = new BotConfigRepository();