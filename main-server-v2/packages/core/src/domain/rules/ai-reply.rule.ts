import { BaseMessageRule, RuleContext, RuleResult } from './rule.interface';
import { UserMentionedEvent } from '../events/user-mentioned.event';

export class AIReplyRule extends BaseMessageRule {
  name = 'AIReplyRule';
  priority = 50; // Lower priority, handles general mentions

  async canHandle(context: RuleContext): Promise<boolean> {
    const { message } = context;
    
    // Must be mentioned or P2P
    if (!message.shouldTriggerReply(context.botUserId)) {
      return false;
    }

    // Must be text only (for now)
    if (!message.isTextOnly()) {
      return false;
    }

    return true;
  }

  async handle(context: RuleContext): Promise<RuleResult> {
    const { message, conversation, sender } = context;
    
    // Create AI reply action
    const aiReplyAction = this.createAction('GENERATE_AI_REPLY', {
      messageId: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      senderName: sender.getName(),
      messageContent: message.toMarkdown(),
      conversationType: conversation.getChatType(),
      canAccessRestrictedModels: conversation.canAccessRestrictedModels(),
      canAccessRestrictedPrompts: conversation.canAccessRestrictedPrompts(),
      isCanary: conversation.isCanary(),
    });

    // Create user mentioned event if in group
    const events = [];
    if (conversation.isGroup() && message.hasMention(context.botUserId)) {
      events.push(new UserMentionedEvent(message.id, {
        chatId: message.chatId,
        senderId: message.senderId,
        mentionedUserId: context.botUserId,
        messageContent: message.text(),
        isGroupChat: true,
      }));
    }

    // AI reply is terminal - don't continue to other rules
    return this.createResult(false, [aiReplyAction], events);
  }
}