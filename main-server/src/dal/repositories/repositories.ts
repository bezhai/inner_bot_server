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
} from '../entities';
import { LarkUserOpenId } from '../entities/LarkUserOpenId';
import { UserChatMapping } from '../entities/UserChatMapping';

export const UserRepository = AppDataSource.getRepository(LarkUser);
export const BaseChatInfoRepository = AppDataSource.getRepository(LarkBaseChatInfo);
export const GroupChatInfoRepository = AppDataSource.getRepository(LarkGroupChatInfo);
export const GroupMemberRepository = AppDataSource.getRepository(LarkGroupMember);
export const LarkUserOpenIdRepository = AppDataSource.getRepository(LarkUserOpenId);
export const CardContextRepository = AppDataSource.getRepository(LarkCardContext);
export const UserChatMappingRepository = AppDataSource.getRepository(UserChatMapping);

// AI相关仓库
export const AIModelRepository = AppDataSource.getRepository(AIModel);
export const AIPromptRepository = AppDataSource.getRepository(AIPrompt);
export const ChatModelMappingRepository = AppDataSource.getRepository(ChatModelMapping);
export const ChatPromptMappingRepository = AppDataSource.getRepository(ChatPromptMapping);
