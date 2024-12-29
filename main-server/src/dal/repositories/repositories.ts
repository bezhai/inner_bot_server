import AppDataSource from "../../ormconfig";
import { LarkBaseChatInfo, LarkGroupChatInfo, LarkGroupMember, LarkUser } from "../entities";
import { LarkUserOpenId } from "../entities/LarkUserOpenId";

export const UserRepository = AppDataSource.getRepository(LarkUser);
export const BaseChatInfoRepository = AppDataSource.getRepository(LarkBaseChatInfo);
export const GroupChatInfoRepository = AppDataSource.getRepository(LarkGroupChatInfo);
export const GroupMemberRepository = AppDataSource.getRepository(LarkGroupMember);
export const LarkUserOpenIdRepository = AppDataSource.getRepository(LarkUserOpenId);