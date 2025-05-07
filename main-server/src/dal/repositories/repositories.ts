import AppDataSource from '../../ormconfig';
import {
    LarkBaseChatInfo,
    LarkGroupChatInfo,
    LarkGroupMember,
    LarkUser,
    LarkCardContext,
    AIModel,
    AIPrompt,
    ChatModelMapping,
    ChatPromptMapping,
    ModelProvider,
} from '../entities';
import { LarkUserOpenId } from '../entities/lark-user-open-id';
import { UserChatMapping } from '../entities/user-chat-mapping';
import { UserGroupBindingRepository as CustomUserGroupBindingRepository } from './user-group-binding-repository';

export const UserRepository = AppDataSource.getRepository(LarkUser);
export const BaseChatInfoRepository = AppDataSource.getRepository(LarkBaseChatInfo);
export const GroupChatInfoRepository = AppDataSource.getRepository(LarkGroupChatInfo);
export const GroupMemberRepository = AppDataSource.getRepository(LarkGroupMember);
export const LarkUserOpenIdRepository = AppDataSource.getRepository(LarkUserOpenId);
export const CardContextRepository = AppDataSource.getRepository(LarkCardContext);
export const UserChatMappingRepository = AppDataSource.getRepository(UserChatMapping);
export const UserGroupBindingRepository = new CustomUserGroupBindingRepository(AppDataSource);

// AI相关仓库
export const AIModelRepository = AppDataSource.getRepository(AIModel);
export const AIPromptRepository = AppDataSource.getRepository(AIPrompt);
export const ChatModelMappingRepository = AppDataSource.getRepository(ChatModelMapping);
export const ChatPromptMappingRepository = AppDataSource.getRepository(ChatPromptMapping);
export const ModelProviderRepository = AppDataSource.getRepository(ModelProvider);
