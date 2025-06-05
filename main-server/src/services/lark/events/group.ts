import { LarkGroupMember, LarkUser } from 'dal/entities';
import { LarkUserOpenId } from 'dal/entities/lark-user-open-id';
import {
    GroupMemberRepository,
    UserRepository,
    LarkUserOpenIdRepository,
    GroupChatInfoRepository,
    UserGroupBindingRepository,
} from 'dal/repositories/repositories';
import { LarkGroupChangeInfo, LarkGroupMemberChangeInfo } from 'types/lark';
import { getBotAppId } from 'utils/bot/bot-var';
import { searchLarkChatInfo, searchLarkChatMember, addChatMember } from '@lark-basic/group';

export async function handleChatMemberAdd(data: LarkGroupMemberChangeInfo) {
    const updateUsers: LarkGroupMember[] =
        data.users?.map((user) => {
            return {
                union_id: user.user_id?.union_id!,
                chat_id: data.chat_id!,
                is_leave: false,
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
    console.log('users', users);
    console.log('updateUsers', updateUsers);

    await Promise.all([
        GroupMemberRepository.save(updateUsers),
        UserRepository.save(users),
        LarkUserOpenIdRepository.save(openIds),
        GroupChatInfoRepository.increment({ chat_id: data.chat_id! }, 'user_count', 1),
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

    console.log('removeUsers', updateUsers);

    await Promise.all([
        GroupMemberRepository.save(updateUsers),
        GroupChatInfoRepository.increment({ chat_id: data.chat_id! }, 'user_count', -1),
    ]);

    // 检查是否有绑定关系，如果有则重新拉入群
    for (const user of data.users || []) {
        const binding = await UserGroupBindingRepository.findByUserAndChat(
            user.user_id?.union_id!,
            data.chat_id!,
        );
        if (binding && binding.isActive) {
            // 重新拉入群
            await Promise.all([
                addChatMember(data.chat_id!, user.user_id?.open_id!),
                GroupChatInfoRepository.increment({ chat_id: data.chat_id! }, 'user_count', 1),
            ]);
        }
    }
}

export async function handleChatRobotAdd(data: LarkGroupMemberChangeInfo) {
    console.info(`upsert chat ${data.chat_id}`);
    const { groupInfo, members } = await searchLarkChatInfo(data.chat_id!);
    await Promise.all([
        GroupMemberRepository.save(members),
        GroupChatInfoRepository.save(groupInfo),
    ]);
    const { users, members: newMembers, openIdUsers } = await searchLarkChatMember(data.chat_id!);
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

export async function handleGroupChange(data: LarkGroupChangeInfo) {
    console.info(`upsert chat ${data.chat_id}`);
    const { groupInfo } = await searchLarkChatInfo(data.chat_id!);
    await GroupChatInfoRepository.save(groupInfo);
}
