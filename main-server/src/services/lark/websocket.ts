import * as Lark from '@larksuiteoapi/node-sdk';
import { BotConfig } from '../../dal/entities/bot-config';
import { EventDecoratorFactory } from './events/decorator-factory';
import { EventRegistry, registerEventHandlerInstance } from './events/event-registry';
import { larkEventHandlers } from './events/handlers';

/**
 * WebSocket 客户端管理器
 * 负责创建和管理 WebSocket 模式下的事件处理
 */
export class WebSocketManager {
    private static initialized = false;

    /**
     * 初始化事件处理器注册
     */
    private static initializeEventHandlers(): void {
        if (!this.initialized) {
            // 注册事件处理器实例
            registerEventHandlerInstance(larkEventHandlers);
            this.initialized = true;
            console.info('WebSocket Manager: Event handlers initialized');
        }
    }

    /**
     * 为指定机器人创建 WebSocket 事件分发器
     */
    static createEventDispatcher(botConfig: BotConfig): Lark.EventDispatcher {
        // 确保事件处理器已初始化
        this.initializeEventHandlers();

        const decorator = EventDecoratorFactory.createEventDecorator(
            'websocket',
            botConfig.bot_name,
        );
        const eventHandlers: Record<string, any> = {};

        // 从注册表获取所有事件类型和处理器
        const eventTypeMap = EventRegistry.getEventTypeMap();
        eventTypeMap.forEach((handlerName, eventType) => {
            if (eventType !== 'card.action.trigger') {
                // 卡片事件单独处理
                const handler = EventRegistry.getHandler(handlerName);
                if (handler) {
                    eventHandlers[eventType] = decorator(handler);
                }
            }
        });

        return new Lark.EventDispatcher({
            verificationToken: botConfig.verification_token,
            encryptKey: botConfig.encrypt_key,
        }).register(eventHandlers);
    }

    /**
     * 为指定机器人创建 WebSocket 客户端
     */
    static createWebSocketClient(botConfig: BotConfig): Lark.WSClient {
        return new Lark.WSClient({
            appId: botConfig.app_id,
            appSecret: botConfig.app_secret,
            loggerLevel: Lark.LoggerLevel.info,
        });
    }

    /**
     * 启动指定机器人的 WebSocket 连接
     */
    static startWebSocketForBot(botConfig: BotConfig): void {
        // 确保事件处理器已初始化
        this.initializeEventHandlers();

        const eventDispatcher = this.createEventDispatcher(botConfig);
        const wsClient = this.createWebSocketClient(botConfig);

        // 注册卡片动作处理器
        const decorator = EventDecoratorFactory.createEventDecorator(
            'websocket',
            botConfig.bot_name,
        );
        const cardActionHandler = EventRegistry.getHandlerByEventType('card.action.trigger');

        if (cardActionHandler) {
            eventDispatcher.handles.set('card.action.trigger', decorator(cardActionHandler));
        } else {
            console.warn('Card action handler not found in registry');
        }

        wsClient.start({ eventDispatcher });
        console.info(
            `Started WebSocket for bot: ${botConfig.bot_name} (${botConfig.app_id}) with context injection`,
        );
    }

    /**
     * 批量启动多个机器人的 WebSocket 连接
     */
    static startMultipleWebSockets(botConfigs: BotConfig[]): void {
        botConfigs.forEach((botConfig) => {
            this.startWebSocketForBot(botConfig);
        });
    }
}
