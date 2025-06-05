import { getMessageCollection } from 'dal/mongo/client';
import { LarkMessageMetaInfo } from 'types/mongo';

export async function saveMessage(message: LarkMessageMetaInfo) {
    return getMessageCollection().insertOne(message);
}

export async function getMessage(messageId: string) {
    return getMessageCollection().findOne({ message_id: messageId });
}

export async function recallMessage(messageId: string) {
    return getMessageCollection().updateOne({ message_id: messageId }, { is_delete: true });
}

export async function updateRobotMessageText(messageId: string, text: string) {
    return getMessageCollection().updateOne({ message_id: messageId }, { robot_text: text });
}

export async function getMessagesByChatId(chatId: string, page: number = 1, pageSize: number = 10) {
    return getMessageCollection().find(
        { chat_id: chatId },
        { sort: { create_time: -1 }, skip: (page - 1) * pageSize, limit: pageSize },
    );
}

export async function searchMessageByRootId(
    rootId: string,
    messageType = ['text', 'post', 'image'],
    limit = 7,
) {
    return getMessageCollection().find(
        {
            root_id: rootId,
            $or: [{ message_type: { $in: messageType } }, { is_from_robot: true }],
            is_delete: false,
        },
        { sort: { create_time: -1 }, limit },
    );
}
