import { BaseDomainEvent } from './domain-event';

export class MessageReceivedEvent extends BaseDomainEvent {
  constructor(
    messageId: string,
    payload: {
      chatId: string;
      senderId: string;
      senderName?: string;
      messageType: string;
      isP2P: boolean;
      hasMentions: boolean;
      mentionedUsers?: string[];
    }
  ) {
    super(messageId, payload);
  }
}