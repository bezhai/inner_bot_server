import { In } from "typeorm";
import { LarkGroupMember, LarkUser } from "../../dal/entities";
import {
  GroupChatInfoRepository,
  GroupMemberRepository,
  LarkUserOpenIdRepository,
  UserRepository,
} from "../../dal/repositories/repositories";
import { LarkGroupMemberChangeInfo } from "../../types/lark";
import { searchLarkChatInfo, searchLarkChatMember } from "../larkBasic/group";
import { LarkUserOpenId } from "../../dal/entities/LarkUserOpenId";
import { getBotAppId } from "../../utils/bot-var";

export async function handleChatMemberAdd(data: LarkGroupMemberChangeInfo) {
  const updateUsers: LarkGroupMember[] =
    data.users?.map((user) => {
      return {
        union_id: user.user_id?.union_id!,
        chat_id: data.chat_id!,
      };
    }) || [];
  const users: LarkUser[] =
    data.users?.map((user) => {
      return {
        union_id: user.user_id?.union_id!,
        name: user.name!,
      };
    }) || [];
  const openIds: LarkUserOpenId[] =
    data.users?.map((user) => {
      return {
        appId: getBotAppId(),
        openId: user.user_id?.open_id!,
        unionId: user.user_id?.union_id!,
        name: user.name!,
      };
    }) || [];
  console.log("users", users);
  console.log("updateUsers", updateUsers);

  await Promise.all([
    GroupMemberRepository.save(updateUsers),
    UserRepository.save(users),
    LarkUserOpenIdRepository.save(openIds),
  ]);
}

export async function handleChatMemberRemove(data: LarkGroupMemberChangeInfo) {
  const updateUsers: LarkGroupMember[] =
    data.users?.map((user) => {
      return {
        union_id: user.user_id?.union_id!,
        chat_id: data.chat_id!,
        is_leave: true,
      };
    }) || [];

  console.log("removeUsers", updateUsers);

  await GroupMemberRepository.save(updateUsers);
}

export async function handleChatRobotAdd(data: LarkGroupMemberChangeInfo) {
  console.info(`upsert chat ${data.chat_id}`);
  const { groupInfo, members } = await searchLarkChatInfo(data.chat_id!);
  await Promise.all([
    GroupMemberRepository.save(members),
    GroupChatInfoRepository.save(groupInfo),
  ]);
  const { users, members: newMembers, openIdUsers } = await searchLarkChatMember(
    data.chat_id!
  );
  await Promise.all([
    GroupMemberRepository.save(newMembers),
    UserRepository.save(users),
    LarkUserOpenIdRepository.save(openIdUsers),
  ]);
}

export async function handleChatRobotRemove(data: LarkGroupMemberChangeInfo) {
  await GroupChatInfoRepository.update(data.chat_id!, {
    is_leave: true,
  });
}
