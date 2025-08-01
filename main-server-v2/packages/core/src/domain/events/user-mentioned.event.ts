import { BaseDomainEvent } from './domain-event';

export class UserMentionedEvent extends BaseDomainEvent {
  constructor(
    messageId: string,
    payload: {
      chatId: string;
      senderId: string;
      mentionedUserId: string;
      messageContent: string;
      isGroupChat: boolean;
    }
  ) {
    super(messageId, payload);
  }
}