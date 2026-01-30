import { BotConfig } from '@entities/bot-config';
import { HttpRouterManager, HttpRouterConfig } from './router';
import { WebSocketManager } from './websocket';

/**
 * 启动策略接口
 */
export interface StartupStrategy {
    initialize(botConfigs: BotConfig[]): Promise<any> | any;
}

/**
 * HTTP 启动策略
 */
export class HttpStartupStrategy implements StartupStrategy {
    initialize(botConfigs: BotConfig[]): HttpRouterConfig[] {
        return HttpRouterManager.createMultipleRouterConfigs(botConfigs);
    }
}

/**
 * WebSocket 启动策略
 */
export class WebSocketStartupStrategy implements StartupStrategy {
    initialize(botConfigs: BotConfig[]): void {
        WebSocketManager.startMultipleWebSockets(botConfigs);
    }
}

/**
 * 启动策略管理器
 * 使用策略模式管理不同初始化类型的启动逻辑
 */
export class StartupStrategyManager {
    private static strategies: Map<string, StartupStrategy> = new Map([
        ['http', new HttpStartupStrategy()],
        ['websocket', new WebSocketStartupStrategy()],
    ]);

    /**
     * 注册新的启动策略
     */
    static registerStrategy(initType: string, strategy: StartupStrategy): void {
        this.strategies.set(initType, strategy);
    }

    /**
     * 获取指定类型的启动策略
     */
    static getStrategy(initType: string): StartupStrategy | undefined {
        return this.strategies.get(initType);
    }

    /**
     * 执行指定类型的启动策略
     */
    static async executeStrategy(initType: string, botConfigs: BotConfig[]): Promise<any> {
        const strategy = this.getStrategy(initType);
        if (!strategy) {
            throw new Error(`Unknown startup strategy: ${initType}`);
        }
        return await strategy.initialize(botConfigs);
    }

    /**
     * 批量执行多种启动策略
     */
    static async executeMultipleStrategies(
        strategiesConfig: Array<{ initType: string; botConfigs: BotConfig[] }>,
    ): Promise<Map<string, any>> {
        const results = new Map<string, any>();

        for (const { initType, botConfigs } of strategiesConfig) {
            try {
                const result = await this.executeStrategy(initType, botConfigs);
                results.set(initType, result);
                console.info(
                    `Successfully initialized ${initType} strategy for ${botConfigs.length} bots`,
                );
            } catch (error) {
                console.error(`Failed to initialize ${initType} strategy:`, error);
                throw error;
            }
        }

        return results;
    }

    /**
     * 获取所有可用的启动策略类型
     */
    static getAvailableStrategies(): string[] {
        return Array.from(this.strategies.keys());
    }
}
