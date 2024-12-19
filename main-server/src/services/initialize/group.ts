import { LarkChatCollection, LarkGroupMemberCollection } from "../../dal/mongo/client";
import { searchAllLarkGroup, searchLarkChatInfo } from "../lark/group";

export async function upsertAllChatInfo() {

    const chatList = await searchAllLarkGroup();
    for (const chatId of chatList) {
        console.info(`upsert chat ${chatId}`);
        const {groupInfo, members} = await searchLarkChatInfo(chatId);
        Promise.all([
            LarkChatCollection.updateOne({ chat_id: chatId }, groupInfo, { upsert: true }),
            // LarkGroupMemberCollection.updateMany({ chat_id: chatId }, members, { upsert: true })
        ])
    }
}