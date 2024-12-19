import { LarkGroupMember, LarkUser } from "../../dal/entities";
import { GroupMemberRepository, UserRepository } from "../../dal/repositories/repositories";
import { LarkGroupMemberChangeInfo } from "../../types/lark";

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
            user_id: user.user_id?.user_id!,
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