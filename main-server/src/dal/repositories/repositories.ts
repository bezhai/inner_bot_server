import AppDataSource from 'ormconfig';
import {
    LarkBaseChatInfo,
    LarkGroupChatInfo,
    LarkGroupMember,
    LarkUser,
    LarkCardContext,
    LarkUserOpenId,
    UserChatMapping,
    ResponseFeedback,
} from '@entities';
import { UserGroupBindingRepository as CustomUserGroupBindingRepository } from './user-group-binding-repository';

export const UserRepository = AppDataSource.getRepository(LarkUser);
export const BaseChatInfoRepository = AppDataSource.getRepository(LarkBaseChatInfo);
export const GroupChatInfoRepository = AppDataSource.getRepository(LarkGroupChatInfo);
export const GroupMemberRepository = AppDataSource.getRepository(LarkGroupMember);
export const LarkUserOpenIdRepository = AppDataSource.getRepository(LarkUserOpenId);
export const CardContextRepository = AppDataSource.getRepository(LarkCardContext);
export const UserChatMappingRepository = AppDataSource.getRepository(UserChatMapping);
export const UserGroupBindingRepository = new CustomUserGroupBindingRepository(AppDataSource);
export const ResponseFeedbackRepository = AppDataSource.getRepository(ResponseFeedback);
