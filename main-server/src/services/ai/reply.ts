import { Message } from 'models/message';
import { sseChat } from './chat';
import { CardManager } from '@lark-basic/card-manager';
import { getBotUnionId } from '@/utils/bot/bot-var';

export async function makeCardReply(message: Message): Promise<void> {
    const cardManager = CardManager.init();

    const chatMessage = {
        user_id: message.sender,
        user_name: message.senderInfo?.name ?? '',
        content: message.toMarkdown(),
        is_mention_bot: true, // 这里暂时用true，后续需要根据消息内容判断
        role: 'user',
        message_id: message.messageId,
        chat_id: message.chatId,
        chat_type: message.isP2P() ? 'p2p' : 'group',
        create_time: message.createTime ?? '',
        root_message_id: message.rootId,
        reply_message_id: message.parentMessageId,
    } as const;

    const onSaveMessage = async (content: string) => {
        if (!cardManager.getMessageId()) {
            return undefined;
        }
        return {
            user_id: getBotUnionId(),
            user_name: '赤尾小助手',
            content,
            is_mention_bot: false,
            role: 'assistant',
            message_id: cardManager.getMessageId()!,
            chat_id: message.chatId,
            chat_type: message.isP2P() ? 'p2p' : 'group',
            create_time: cardManager.getCreateTime(),
            root_message_id: message.rootId,
            reply_message_id: message.messageId, // 机器人回复消息就是用户消息的id
        } as const;
    };

    await sseChat({
        req: {
            message: chatMessage,
            message_id: message.messageId,
            is_replay: false,
        },
        ...cardManager.createAdvancedCallbacks(message.messageId),
        onSaveMessage,
    });
}
