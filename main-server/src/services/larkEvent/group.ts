import { In } from "typeorm";
import { LarkGroupMember, LarkUser } from "../../dal/entities";
import { GroupChatInfoRepository, GroupMemberRepository, UserRepository } from "../../dal/repositories/repositories";
import { LarkGroupMemberChangeInfo } from "../../types/lark";
import { searchLarkChatInfo, searchLarkChatMember } from "../larkBasic/group";

export async function handleChatMemberAdd(data: LarkGroupMemberChangeInfo) {
    const updateUsers: LarkGroupMember[] = data.users?.map(user => {
        return {
            union_id: user.user_id?.union_id!,
            chat_id: data.chat_id!,
        }
    }) || [];
    const users: LarkUser[] = data.users?.map(user => {
        return {
            union_id: user.user_id?.union_id!,
            name: user.name!,
        }
    }) || [];
    console.log("users", users);
    console.log("updateUsers", updateUsers);

    await GroupMemberRepository.save(updateUsers);
    await UserRepository.save(users);
}

export async function handleChatMemberRemove(data: LarkGroupMemberChangeInfo) {
    const updateUsers: LarkGroupMember[] = data.users?.map(user => {
        return {
            union_id: user.user_id?.union_id!,
            chat_id: data.chat_id!,
            is_leave: true,
        }
    }) || [];
    
    console.log("remveUsers", updateUsers);

    await GroupMemberRepository.save(updateUsers);
}

export async function handleChatRobotAdd(data: LarkGroupMemberChangeInfo) {
    console.info(`upsert chat ${data.chat_id}`);
    const { groupInfo, members } = await searchLarkChatInfo(
        data.chat_id!
    );
    await Promise.all([
        GroupMemberRepository.save(members),
        GroupChatInfoRepository.save(groupInfo),
    ]);
    const { users, members: newMembers  } = await searchLarkChatMember(data.chat_id!);
    await Promise.all([
        GroupMemberRepository.save(newMembers),
        UserRepository.save(users),
      ]); 
}

export async function handleChatRobotRemove(data: LarkGroupMemberChangeInfo) {
    await GroupChatInfoRepository.update(data.chat_id!, {
        is_leave: true,
    });
}