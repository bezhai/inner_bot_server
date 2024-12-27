import {
  LarkGroupChatInfo,
  LarkGroupMember,
  LarkUser,
} from "../../dal/entities";
import {
  getChatInfo,
  getChatList,
  searchAllMembers,
} from "../../dal/lark-client";

// 从飞书获取所有群聊列表
export async function searchAllLarkGroup() {
  const chatIdList: string[] = [];

  let pageToken: string | undefined = undefined;

  while (true) {
    const res = await getChatList(pageToken);

    pageToken = res?.page_token;

    if (res?.items) {
      chatIdList.push(
        ...res.items
          .filter((item) => item.chat_status == "normal")
          .map((item) => item.chat_id!)
      );
    }

    if (!res?.has_more) {
      break;
    }
  }

  return chatIdList;
}

export async function searchLarkChatInfo(chat_id: string) {
  const chatInfo = await getChatInfo(chat_id);

  if (!chatInfo) {
    throw new Error(`chat_id ${chat_id} not found`);
  }

  const groupInfo: LarkGroupChatInfo = {
    name: chatInfo.name!,
    avatar: chatInfo.avatar!,
    description: chatInfo.description!,
    user_manager_id_list: chatInfo.user_manager_id_list!,
    chat_tag: chatInfo.chat_tag!,
    group_message_type: chatInfo.group_message_type as
      | "chat"
      | "thread"
      | undefined,
    chat_status: chatInfo.chat_status!,
    download_has_permission_setting: chatInfo.restricted_mode_setting
      ?.download_has_permission_setting as
      | "all_members"
      | "not_anyone"
      | undefined,
    user_count: chatInfo.user_count ? Number(chatInfo.user_count) : 0,
    chat_id,
    baseChatInfo: {
      chat_id,
      chat_mode: chatInfo.chat_mode as "topic" | "group",
      has_main_bot: process.env.IS_DEV === "true" ? undefined : true,
      has_dev_bot: process.env.IS_DEV === "true" ? true : undefined,
    },
    is_leave: false,
  };

  const members: LarkGroupMember[] = [
    {
      chat_id,
      union_id: chatInfo.owner_id!,
      is_owner: true,
    },
  ];

  members.push(
    ...chatInfo.user_manager_id_list!.map((union_id) => ({
      chat_id,
      union_id,
      is_manager: true,
    }))
  );

  return {
    groupInfo,
    members,
  };
}

export async function searchLarkChatMember(chat_id: string) {
  const members: LarkGroupMember[] = [];
  const users: LarkUser[] = [];
  let pageToken: string | undefined = undefined;

  while (true) {
    const res = await searchAllMembers(chat_id, pageToken);
    pageToken = res?.page_token;
    if (res?.items) {
      members.push(
        ...res.items.map((item) => ({
          chat_id,
          union_id: item.member_id!,
        }))
      );
      users.push(
        ...res.items.map((item) => ({
          union_id: item.member_id!,
          user_id: item.member_id!,
          name: item.name!,
        }))
      );
    }
    if (!res?.has_more) {
      break;
    }
  }

  return {
    members,
    users,
  };
}
