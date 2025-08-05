import * as Lark from '@larksuiteoapi/node-sdk';
import { handleMessageReceive } from './receive';
import { handleMessageRecalled } from './recalled';
import {
    handleChatMemberAdd,
    handleChatMemberRemove,
    handleChatRobotAdd,
    handleChatRobotRemove,
    handleGroupChange,
} from './group';
import { handleCardAction } from './card';
import { handleReaction } from './reaction';
import { handlerEnterChat } from './enter';
import { BotConfig } from '../../../dal/entities/bot-config';
import { multiBotManager } from '../../../utils/bot/multi-bot-manager';

// Helper function to create void decorators for async handlers
function createVoidDecorator<T>(asyncFn: (params: T) => Promise<void>): (params: T) => void {
    return function (params: T): void {
        console.info('receive event_type: ' + (params as { event_type: string })['event_type']);
        
        asyncFn(params).catch((err) => {
            console.error('Error in async operation:', err);
        });
    };
}

// Create event dispatcher for a specific bot
function createEventDispatcher(botConfig: BotConfig) {
    return new Lark.EventDispatcher({
        verificationToken: botConfig.verification_token,
        encryptKey: botConfig.encrypt_key,
    }).register({
        'im.message.receive_v1': createVoidDecorator(handleMessageReceive),
        'im.message.recalled_v1': createVoidDecorator(handleMessageRecalled),
        'im.chat.member.user.added_v1': createVoidDecorator(handleChatMemberAdd),
        'im.chat.member.user.deleted_v1': createVoidDecorator(handleChatMemberRemove),
        'im.chat.member.user.withdrawn_v1': createVoidDecorator(handleChatMemberRemove),
        'im.chat.member.bot.added_v1': createVoidDecorator(handleChatRobotAdd),
        'im.chat.member.bot.deleted_v1': createVoidDecorator(handleChatRobotRemove),
        'im.message.reaction.created_v1': createVoidDecorator(handleReaction),
        'im.message.reaction.deleted_v1': createVoidDecorator(handleReaction),
        'im.chat.access_event.bot_p2p_chat_entered_v1': createVoidDecorator(handlerEnterChat),
        'im.chat.updated_v1': createVoidDecorator(handleGroupChange),
    });
}

// Create card action handler for a specific bot
function createCardActionHandler(botConfig: BotConfig) {
    return new Lark.CardActionHandler(
        {
            verificationToken: botConfig.verification_token,
            encryptKey: botConfig.encrypt_key,
        },
        createVoidDecorator(handleCardAction),
    );
}

// Initialize HTTP mode for multiple bots
export function initializeMultiBotHttpMode() {
    const httpBots = multiBotManager.getBotsByInitType('http');
    const routers: Array<{ botName: string; eventRouter: any; cardActionRouter: any }> = [];

    for (const botConfig of httpBots) {
        const eventDispatcher = createEventDispatcher(botConfig);
        const cardActionHandler = createCardActionHandler(botConfig);

        routers.push({
            botName: botConfig.bot_name,
            eventRouter: Lark.adaptKoaRouter(eventDispatcher, { autoChallenge: true }),
            cardActionRouter: Lark.adaptKoaRouter(cardActionHandler, { autoChallenge: true }),
        });

        console.info(`Initialized HTTP router for bot: ${botConfig.bot_name} (${botConfig.app_id})`);
    }

    return routers;
}

// Start WebSocket for multiple bots
export function startMultiBotWebSocket() {
    const websocketBots = multiBotManager.getBotsByInitType('websocket');

    for (const botConfig of websocketBots) {
        const eventDispatcher = createEventDispatcher(botConfig);
        const wsClient = new Lark.WSClient({
            appId: botConfig.app_id,
            appSecret: botConfig.app_secret,
            loggerLevel: Lark.LoggerLevel.info,
        });

        // Register card action handler for WebSocket mode
        eventDispatcher.handles.set('card.action.trigger', createVoidDecorator(handleCardAction));

        wsClient.start({ eventDispatcher });
        console.info(`Started WebSocket for bot: ${botConfig.bot_name} (${botConfig.app_id})`);
    }
}
