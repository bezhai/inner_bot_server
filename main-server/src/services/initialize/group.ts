import { In } from "typeorm";
import {
  LarkGroupChatInfo,
  LarkBaseChatInfo,
  LarkGroupMember,
  LarkUser,
} from "../../dal/entities";
import {
  BaseChatInfoRepository,
  GroupChatInfoRepository,
  GroupMemberRepository,
  UserRepository,
} from "../../dal/repositories/repositories";
import {
  searchAllLarkGroup,
  searchLarkChatInfo,
  searchLarkChatMember,
} from "../lark/group";
import { searchAllMembers } from "../../dal/larkClient";

export async function upsertAllChatInfo() {
  const chatList = await searchAllLarkGroup();
  const groupInfoList: LarkGroupChatInfo[] = [];
  const baseChatInfoList: LarkBaseChatInfo[] = [];
  const membersList: LarkGroupMember[] = [];
  const userList: LarkUser[] = [];

  for (const chatId of chatList) {
    console.info(`upsert chat ${chatId}`);
    const { groupInfo, baseChatInfo, members } = await searchLarkChatInfo(
      chatId
    );
    groupInfoList.push(groupInfo);
    baseChatInfoList.push(baseChatInfo);
    membersList.push(...members);
    const userNumber = await GroupMemberRepository.count({
      where: {
        chat_id: chatId,
        is_leave: In([false, null]),
      },
    });
    if (userNumber < groupInfo.user_count) {
      console.info(`chat ${chatId} user number not match, need update`);
      const { users, members } = await searchLarkChatMember(chatId);
      await Promise.all([
        GroupMemberRepository.upsert(members, ["chat_id", "union_id"]),
        UserRepository.upsert(users, ["union_id"]),
      ]); // 这里每个群更新一次, 防止数据量过大
    }
  }
  await Promise.all([
    GroupChatInfoRepository.upsert(groupInfoList, ["chat_id"]),
    BaseChatInfoRepository.upsert(baseChatInfoList, ["chat_id"]),
    UserRepository.upsert(membersList, ["chat_id", "union_id"]),
  ]);
}
