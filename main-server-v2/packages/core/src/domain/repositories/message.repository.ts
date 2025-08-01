import { MessageEntity } from '../entities/message.entity';

export interface MessageRepository {
  save(message: MessageEntity): Promise<void>;
  
  findById(messageId: string): Promise<MessageEntity | null>;
  
  findByConversation(
    chatId: string, 
    options?: {
      limit?: number;
      before?: Date;
      after?: Date;
    }
  ): Promise<MessageEntity[]>;
  
  findDuplicates(
    content: string, 
    chatId: string,
    timeWindow?: number // in seconds
  ): Promise<MessageEntity[]>;
  
  findByThreadId(threadId: string): Promise<MessageEntity[]>;
  
  markAsProcessed(messageId: string): Promise<void>;
  
  countByChat(
    chatId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<number>;
  
  deleteById(messageId: string): Promise<void>;
  
  deleteByChat(chatId: string): Promise<number>;
}