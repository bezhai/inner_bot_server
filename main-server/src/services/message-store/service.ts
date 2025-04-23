import dayjs from 'dayjs';
import { LarkReceiveMessage } from '../../types/lark';
import { LarkRobotMessageMetaInfo, LarkUserMessageMetaInfo } from '../../types/mongo';
import { saveMessage } from './basic';
import { Message } from '../../models/message';

export async function saveLarkMessage(params: LarkReceiveMessage) {
    const mongoMessage: LarkUserMessageMetaInfo = {
        message_id: params.message.message_id,
        root_id: params.message.root_id ?? params.message.message_id,
        parent_id: params.message.parent_id,
        thread_id: params.message.thread_id,
        chat_id: params.message.chat_id,
        chat_type: params.message.chat_type,
        message_content: params.message.content,
        create_time: dayjs(Number(params.message.create_time)).toDate(),
        is_delete: false,
        is_from_robot: false,
        mentions: params.message.mentions || [],
        message_type: params.message.message_type,
        sender: params.sender.sender_id?.union_id!,
        update_time: dayjs(Number(params.message.create_time)).toDate(),
    };

    await saveMessage(mongoMessage);
}

export async function saveRobotMessage(message: Message, messageId: string, cardId: string) {
    const mongoMessage: LarkRobotMessageMetaInfo = {
        message_id: messageId,
        root_id: message.rootId,
        parent_id: message.messageId,
        thread_id: message.threadId,
        chat_id: message.chatId,
        chat_type: message.chatType,
        create_time: dayjs().toDate(),
        is_delete: false,
        is_from_robot: true,
        message_type: 'interactive',
        update_time: dayjs().toDate(),
        card_id: cardId,
    };

    await saveMessage(mongoMessage);
}
