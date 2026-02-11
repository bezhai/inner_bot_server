import { Message } from 'core/models/message';
import { MessageContentUtils } from 'core/models/message-content';
import { sseChat } from './chat';
import { CardLifecycleManager } from '@lark/basic/card-lifecycle-manager';
import { getBotUnionId } from '@core/services/bot/bot-var';
import dayjs from 'dayjs';
import { getStrategyFactory, ReplyStrategyContext, CardReplyStrategy, MultiMessageReplyStrategy } from './strategies';

export async function makeCardReply(message: Message): Promise<void> {
    // 构建策略上下文
    const context: ReplyStrategyContext = {
        messageId: message.messageId,
        chatId: message.chatId,
        userId: message.senderInfo?.union_id,
        isP2P: message.isP2P(),
        rootId: message.rootId,
    };

    // 使用策略工厂创建策略
    const strategy = await getStrategyFactory().create(context);
    const callbacks = strategy.getCallbacks();

    // 构建保存消息的回调
    const onSaveMessage = async (content: string) => {
        // 根据策略类型获取消息ID和创建时间
        let messageId: string | undefined;
        let createTime: number;

        if (strategy instanceof CardReplyStrategy) {
            messageId = strategy.getMessageId();
            createTime = strategy.getCreateTime();
        } else if (strategy instanceof MultiMessageReplyStrategy) {
            messageId = strategy.getMessageId();
            createTime = strategy.getCreateTime();
        } else {
            // 默认情况
            messageId = message.messageId;
            createTime = dayjs().valueOf();
        }

        if (!messageId) {
            return undefined;
        }

        return {
            user_id: getBotUnionId(),
            user_name: '赤尾',
            content: MessageContentUtils.wrapMarkdownAsV2(content),
            is_mention_bot: false,
            role: 'assistant',
            message_id: messageId,
            message_type: 'post',
            chat_id: message.chatId,
            chat_type: message.isP2P() ? 'p2p' : 'group',
            create_time: String(dayjs(createTime).valueOf()),
            root_message_id: message.rootId,
            reply_message_id: message.messageId,
        } as const;
    };

    await sseChat({
        req: {
            message_id: message.messageId,
            is_canary: message.basicChatInfo?.permission_config?.is_canary,
        },
        ...callbacks,
        onSaveMessage,
    });
}

export async function reCreateCard(
    messageId: string,
    parentMessageId: string,
    chatId: string,
    rootId: string,
    isP2P: boolean,
): Promise<void> {
    // reCreateCard 仍然使用卡片模式，因为它是重试现有卡片
    const cardManager = await CardLifecycleManager.loadFromMessage(messageId);

    if (!cardManager) {
        return;
    }

    cardManager.appendCardContext({
        parent_message_id: parentMessageId,
        chat_id: chatId,
        root_id: rootId,
        is_p2p: isP2P,
    });

    const onSaveMessage = async (content: string) => {
        if (!cardManager.getMessageId()) {
            return undefined;
        }
        return {
            user_id: getBotUnionId(),
            user_name: '赤尾',
            content: MessageContentUtils.wrapMarkdownAsV2(content),
            is_mention_bot: false,
            role: 'assistant',
            message_id: cardManager.getMessageId()!,
            message_type: 'post',
            chat_id: chatId,
            chat_type: isP2P ? 'p2p' : 'group',
            create_time: String(dayjs(cardManager.getCreateTime()).valueOf()),
            root_message_id: rootId,
            reply_message_id: parentMessageId,
        } as const;
    };

    await sseChat({
        req: {
            message_id: parentMessageId,
        },
        ...cardManager.createAdvancedCallbacks(parentMessageId),
        onStartReply: async () => {}, // 重试不需要重新创建卡片
        onSaveMessage,
    });
}
