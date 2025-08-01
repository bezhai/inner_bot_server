import { MessageEntity } from '../entities/message.entity';
import { ConversationEntity } from '../entities/conversation.entity';
import { UserEntity } from '../entities/user.entity';
import { DomainEvent } from '../events/domain-event';

export interface RuleContext {
  message: MessageEntity;
  conversation: ConversationEntity;
  sender: UserEntity;
  botUserId: string;
  adminUserIds: string[];
}

export interface RuleAction {
  type: string;
  payload: Record<string, any>;
}

export interface RuleResult {
  shouldContinue: boolean;
  actions: RuleAction[];
  events: DomainEvent[];
}

export interface MessageRule {
  name: string;
  priority: number;
  canHandle(context: RuleContext): Promise<boolean>;
  handle(context: RuleContext): Promise<RuleResult>;
}

export abstract class BaseMessageRule implements MessageRule {
  abstract name: string;
  abstract priority: number;

  abstract canHandle(context: RuleContext): Promise<boolean>;
  abstract handle(context: RuleContext): Promise<RuleResult>;

  protected createResult(
    shouldContinue: boolean = false,
    actions: RuleAction[] = [],
    events: DomainEvent[] = []
  ): RuleResult {
    return { shouldContinue, actions, events };
  }

  protected createAction(type: string, payload: Record<string, any>): RuleAction {
    return { type, payload };
  }
}