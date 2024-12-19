import AppDataSource from "../../ormconfig";
import { LarkBaseChatInfo, LarkGroupChatInfo, LarkGroupMember, LarkUser } from "../entities";

export const UserRepository = AppDataSource.getRepository(LarkUser);
export const BaseChatInfoRepository = AppDataSource.getRepository(LarkBaseChatInfo);
export const GroupChatInfoRepository = AppDataSource.getRepository(LarkGroupChatInfo);
export const GroupMemberRepository = AppDataSource.getRepository(LarkGroupMember);