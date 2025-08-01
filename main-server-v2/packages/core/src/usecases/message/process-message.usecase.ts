import { MessageEntity } from '../../domain/entities/message.entity';
import { ConversationEntity } from '../../domain/entities/conversation.entity';
import { UserEntity } from '../../domain/entities/user.entity';
import { RuleAction } from '../../domain/rules/rule.interface';
import { DomainEvent } from '../../domain/events/domain-event';

export interface ProcessMessageCommand {
  messageId: string;
  chatId: string;
  senderId: string;
  senderOpenId?: string;
  content: any; // Raw content from Lark
  messageType: string;
  createTime?: string;
  rootId?: string;
  parentMessageId?: string;
  mentions?: string[];
}

export interface ProcessMessageResult {
  success: boolean;
  message?: MessageEntity;
  actions: RuleAction[];
  events: DomainEvent[];
  error?: string;
}

export interface ProcessMessageUseCase {
  execute(command: ProcessMessageCommand): Promise<ProcessMessageResult>;
}