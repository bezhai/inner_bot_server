import * as Lark from '@larksuiteoapi/node-sdk';
import { BotConfig } from '../../../dal/entities/bot-config';
import { EventDecoratorFactory } from './events/decorator-factory';
import { EventRegistry, registerEventHandlerInstance } from './events/event-registry';
import { larkEventHandlers } from './events/handlers';

/**
 * HTTP 路由器配置
 */
export interface HttpRouterConfig {
    botName: string;
    eventRouter: any;
    cardActionRouter: any;
}

/**
 * HTTP 路由管理器
 * 负责创建和管理 HTTP 模式下的事件路由
 */
export class HttpRouterManager {
    private static initialized = false;

    /**
     * 初始化事件处理器注册
     */
    private static initializeEventHandlers(): void {
        if (!this.initialized) {
            // 注册事件处理器实例
            registerEventHandlerInstance(larkEventHandlers);
            this.initialized = true;
            console.info('HTTP Router: Event handlers initialized');
        }
    }

    /**
     * 为指定机器人创建事件分发器
     */
    static createEventDispatcher(botConfig: BotConfig): Lark.EventDispatcher {
        // 确保事件处理器已初始化
        this.initializeEventHandlers();

        const decorator = EventDecoratorFactory.createEventDecorator('http');
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
     * 为指定机器人创建卡片动作处理器
     */
    static createCardActionHandler(botConfig: BotConfig): Lark.CardActionHandler {
        // 确保事件处理器已初始化
        this.initializeEventHandlers();

        const decorator = EventDecoratorFactory.createEventDecorator('http');
        const cardActionHandler = EventRegistry.getHandlerByEventType('card.action.trigger');

        if (!cardActionHandler) {
            throw new Error('Card action handler not found in registry');
        }

        return new Lark.CardActionHandler(
            {
                verificationToken: botConfig.verification_token,
                encryptKey: botConfig.encrypt_key,
            },
            decorator(cardActionHandler),
        );
    }

    /**
     * 为指定机器人创建完整的路由配置
     */
    static createRouterConfig(botConfig: BotConfig): HttpRouterConfig {
        const eventDispatcher = this.createEventDispatcher(botConfig);
        const cardActionHandler = this.createCardActionHandler(botConfig);

        return {
            botName: botConfig.bot_name,
            eventRouter: Lark.adaptKoaRouter(eventDispatcher, { autoChallenge: true }),
            cardActionRouter: Lark.adaptKoaRouter(cardActionHandler, { autoChallenge: true }),
        };
    }

    /**
     * 批量创建多个机器人的路由配置
     */
    static createMultipleRouterConfigs(botConfigs: BotConfig[]): HttpRouterConfig[] {
        return botConfigs.map((botConfig) => {
            const config = this.createRouterConfig(botConfig);
            console.info(
                `Initialized HTTP router for bot: ${botConfig.bot_name} (${botConfig.app_id})`,
            );
            return config;
        });
    }
}
