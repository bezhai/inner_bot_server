import { Message } from '../../models/message';
import { sseChat } from './chat';
import { CardManager } from '../lark/basic/card-manager';

export async function makeCardReply(message: Message): Promise<void> {
    const cardManager = CardManager.init();

    await sseChat({
        req: {
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
        },
        ...cardManager.createAdvancedCallbacks(message.messageId),
    });
}
