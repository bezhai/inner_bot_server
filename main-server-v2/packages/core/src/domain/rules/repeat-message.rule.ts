import { BaseMessageRule, RuleContext, RuleResult } from './rule.interface';

export class RepeatMessageRule extends BaseMessageRule {
  name = 'RepeatMessageRule';
  priority = 100; // High priority for repeat messages

  async canHandle(context: RuleContext): Promise<boolean> {
    const { message, conversation } = context;
    
    // Only handle group messages
    if (!conversation.isGroup()) {
      return false;
    }

    // Don't repeat if bot is mentioned
    if (message.hasMention(context.botUserId)) {
      return false;
    }

    // Check if repeat is enabled for this conversation
    if (!conversation.isRepeatEnabled()) {
      return false;
    }

    // Only repeat text-only messages
    if (!message.isTextOnly()) {
      return false;
    }

    return true;
  }

  async handle(context: RuleContext): Promise<RuleResult> {
    const { message } = context;
    
    // Create action to check for repeat
    const checkRepeatAction = this.createAction('CHECK_REPEAT', {
      messageId: message.id,
      chatId: message.chatId,
      content: message.clearText(),
    });

    // Continue processing other rules
    return this.createResult(true, [checkRepeatAction]);
  }
}