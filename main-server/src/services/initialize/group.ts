import { MessageCollection } from "../../dal/mongo/client";
import { searchAllLarkGroup, searchLarkChatInfo } from "../lark/group";

export async function upsertAllChatInfo() {

    const chatList = await searchAllLarkGroup();
    for (const chatId of chatList) {
        console.info(`upsert chat ${chatId}`);
        const chatInfo = await searchLarkChatInfo(chatId);
        await MessageCollection.updateOne({ chat_id: chatId }, chatInfo, { upsert: true });
    }
}