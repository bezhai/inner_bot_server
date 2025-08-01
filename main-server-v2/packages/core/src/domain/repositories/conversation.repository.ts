import { ConversationEntity, ChatType } from '../entities/conversation.entity';
import { ChatPermissionsConfig } from '../value-objects/chat-permissions.vo';

export interface ConversationRepository {
  save(conversation: ConversationEntity): Promise<void>;
  
  findByChatId(chatId: string): Promise<ConversationEntity | null>;
  
  findByIds(chatIds: string[]): Promise<ConversationEntity[]>;
  
  findByType(
    chatType: ChatType,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<ConversationEntity[]>;
  
  updatePermissions(
    chatId: string, 
    permissions: Partial<ChatPermissionsConfig>
  ): Promise<void>;
  
  updateChatInfo(
    chatId: string,
    updates: {
      name?: string;
      ownerOpenId?: string;
    }
  ): Promise<void>;
  
  addBot(
    chatId: string,
    botType: 'main' | 'dev'
  ): Promise<void>;
  
  removeBot(
    chatId: string,
    botType: 'main' | 'dev'
  ): Promise<void>;
  
  findWithRepeatEnabled(): Promise<ConversationEntity[]>;
  
  findCanaryChats(): Promise<ConversationEntity[]>;
  
  search(
    query: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<ConversationEntity[]>;
  
  count(filters?: {
    chatType?: ChatType;
    hasMainBot?: boolean;
    hasDevBot?: boolean;
  }): Promise<number>;
  
  deleteByChatId(chatId: string): Promise<void>;
}