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
import { setTimeout } from "timers/promises";

export async function upsertAllChatInfo() {
  const chatList = await searchAllLarkGroup();
  const groupInfoList: LarkGroupChatInfo[] = [];
  const membersList: LarkGroupMember[] = [];

  for (const chatId of chatList) {
    console.info(`upsert chat ${chatId}`);
    const { groupInfo, members } = await searchLarkChatInfo(
      chatId
    );
    groupInfoList.push(groupInfo);
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
        GroupMemberRepository.save(members),
        UserRepository.save(users),
      ]); // 这里每个群更新一次, 防止数据量过大
      await setTimeout(100);
    }
  }
  await Promise.all([
    GroupChatInfoRepository.save(groupInfoList),
    GroupMemberRepository.save(membersList),
  ]);
}
