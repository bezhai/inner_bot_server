import { MessageColletion } from "../../mongo/client";
import { LarkMessageMetaInfo } from "../../types/mongo";

export async function saveMessage(message: LarkMessageMetaInfo) {
    return MessageColletion.insertOne(message);
}

export async function getMessage(messageId: string) {
    return MessageColletion.findOne({ message_id: messageId });
}

export async function recallMessage(messageId: string) {
    return MessageColletion.updateOne({ message_id: messageId }, { is_delete: true });
}