import { LarkChatCollection } from "../../dal/mongo/client";
import { LarkChatInfo } from "../../types/mongo";

export async function upsertChatInfo(chat_id: string, group_info: Partial<LarkChatInfo>) {
    return LarkChatCollection.updateOne({ chat_id }, group_info, { upsert: true });
}