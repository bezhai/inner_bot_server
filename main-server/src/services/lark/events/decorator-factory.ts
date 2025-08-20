import { insertEvent } from 'dal/mongo/client';
import { BotConfig } from '../../../dal/entities/bot-config';
import { context } from '../../../middleware/context';

/**
 * 事件处理装饰器工厂
 * 统一处理 HTTP 和 WebSocket 模式的事件装饰器逻辑
 */
export class EventDecoratorFactory {
    /**
     * 创建通用的事件装饰器
     * @param initType 初始化类型：'http' 或 'websocket'
     * @param botName 机器人名称（WebSocket模式需要）
     */
    static createEventDecorator(
        initType: 'http' | 'websocket',
        botName?: string,
    ): (asyncFn: (params: any) => Promise<void>) => (params: any) => void {
        if (initType === 'websocket') {
            if (!botName) {
                throw new Error('WebSocket mode requires botName');
            }
            return this.createWebSocketDecorator(botName);
        } else {
            return this.createHttpDecorator();
        }
    }

    /**
     * 创建 HTTP 模式的装饰器
     */
    private static createHttpDecorator(): (
        asyncFn: (params: any) => Promise<void>,
    ) => (params: any) => void {
        return function (asyncFn: (params: any) => Promise<void>): (params: any) => void {
            return function (params: any): void {
                console.info(
                    'receive event_type: ' + (params as { event_type: string })['event_type'],
                );

                insertEvent(params).catch((err) => {
                    console.error('Error in insert event:', err);
                });

                asyncFn(params).catch((err) => {
                    console.error('Error in async operation:', err);
                });
            };
        };
    }

    /**
     * 创建 WebSocket 模式的装饰器（带上下文注入）
     */
    private static createWebSocketDecorator(
        botName: string,
    ): (asyncFn: (params: any) => Promise<void>) => (params: any) => void {
        return function (asyncFn: (params: any) => Promise<void>): (params: any) => void {
            return function (params: any): void {
                console.info(
                    `[${botName}] receive event_type: ${(params as { event_type: string })['event_type']}`,
                );

                // 启动事件记录，不等待完成
                insertEvent(params).catch((err) => {
                    console.error(`[${botName}] Error in insert event:`, err);
                });

                // 创建包含botName和traceId的上下文
                const contextData = context.createContext(botName);

                // 在AsyncLocalStorage上下文中执行处理函数，不等待完成
                context.run(contextData, async () => {
                    asyncFn(params).catch((err) => {
                        console.error(`[${botName}] Error in async operation:`, err);
                    });
                });
            };
        };
    }
}

/**
 * 通用上下文装饰器
 * 可用于替换现有的 HTTP 中间件和 WebSocket 装饰器
 */
export function withContext<T extends any[]>(
    botConfig: BotConfig,
    handler: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
    return async (...args: T): Promise<void> => {
        // 创建包含botName和traceId的上下文
        const contextData = context.createContext(botConfig.bot_name);

        // 在AsyncLocalStorage上下文中执行处理函数
        await context.run(contextData, async () => {
            try {
                await handler(...args);
            } catch (error) {
                console.error(`Error in handler for bot ${botConfig.bot_name}:`, error);
                throw error;
            }
        });
    };
}
