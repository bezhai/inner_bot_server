import { Message } from 'core/models/message';
import { sseChat } from './chat';
import { CardLifecycleManager } from '@lark/basic/card-lifecycle-manager';
import { getBotUnionId } from '@core/services/bot/bot-var';
import dayjs from 'dayjs';

export async function makeCardReply(message: Message): Promise<void> {
    const cardManager = CardLifecycleManager.init();

    cardManager.appendCardContext({
        parent_message_id: message.messageId, // 这里的parent_message_id后面用来换重新请求的msgId, 卡片是bot发的, 所以这里叫parent_message_id
        chat_id: message.chatId,
        root_id: message.rootId,
        is_p2p: message.isP2P(),
        union_id: message.senderInfo?.union_id,
    });

    const onSaveMessage = async (content: string) => {
        if (!cardManager.getMessageId()) {
            return undefined;
        }
        return {
            user_id: getBotUnionId(),
            user_name: '赤尾',
            content,
            is_mention_bot: false,
            role: 'assistant',
            message_id: cardManager.getMessageId()!,
            chat_id: message.chatId,
            chat_type: message.isP2P() ? 'p2p' : 'group',
            create_time: String(dayjs(cardManager.getCreateTime()).valueOf()),
            root_message_id: message.rootId,
            reply_message_id: message.messageId, // 机器人回复消息就是用户消息的id
        } as const;
    };

    await sseChat({
        req: {
            message_id: message.messageId,
            is_canary: message.basicChatInfo?.permission_config?.is_canary,
        },
        ...cardManager.createAdvancedCallbacks(message.messageId),
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
            content,
            is_mention_bot: false,
            role: 'assistant',
            message_id: cardManager.getMessageId()!,
            chat_id: chatId,
            chat_type: isP2P ? 'p2p' : 'group',
            create_time: String(dayjs(cardManager.getCreateTime()).valueOf()),
            root_message_id: rootId,
            reply_message_id: parentMessageId, // 机器人回复消息就是用户消息的id
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
