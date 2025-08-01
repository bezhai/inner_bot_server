import { BaseDomainEvent } from './domain-event';

export class ConversationClosedEvent extends BaseDomainEvent {
  constructor(
    chatId: string,
    payload: {
      closedBy: string;
      closedAt: Date;
      reason?: string;
    }
  ) {
    super(chatId, payload);
  }
}