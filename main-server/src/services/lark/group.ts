import { getChatInfo, getChatList } from "../../dal/larkClient";
import { LarkGroupChatInfo } from "../../types/mongo";

// 从飞书获取所有群聊列表
export async function searchAllLarkGroup() {
    const chatIdList: string[] = [];

    let pageToken: string | undefined = undefined;

    while (true) {

        const res = await getChatList(pageToken);

        pageToken = res?.page_token;

        if (res?.items) {
            chatIdList.push(...res.items.map(item => item.chat_id!));
        }

        if (!res?.has_more) {
            break;
        }
    }

    return chatIdList;
}

export async function searchLarkChatInfo(chat_id: string): Promise<LarkGroupChatInfo> {
    const chatInfo = await getChatInfo(chat_id);

    if (!chatInfo) {
        throw new Error(`chat_id ${chat_id} not found`);
    }

    return {
        chat_mode: chatInfo.chat_mode as 'topic' | 'group',
        name: chatInfo.name!,
        avatar: chatInfo.avatar!,
        description: chatInfo.description!,
        user_manager_id_list: chatInfo.user_manager_id_list!,
        chat_tag: chatInfo.chat_tag!,
        group_message_type: chatInfo.group_message_type as 'chat' | 'thread' | undefined,
        chat_status: chatInfo.chat_status!,
        download_has_permission_setting: chatInfo.restricted_mode_setting?.download_has_permission_setting as 'all_members' | 'not_anyone' | undefined,
        user_count: chatInfo.user_count ? Number(chatInfo.user_count) : 0,
        chat_id,
        has_main_bot: chatInfo.bot_manager_id_list?.includes(process.env.MAIN_BOT_APP_ID!) ?? false,
        has_dev_bot: chatInfo.bot_manager_id_list?.includes(process.env.DEV_BOT_APP_ID!) ?? false,
    }
}