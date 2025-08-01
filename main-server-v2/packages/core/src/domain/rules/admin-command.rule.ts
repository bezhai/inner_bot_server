import { BaseMessageRule, RuleContext, RuleResult } from './rule.interface';

export class AdminCommandRule extends BaseMessageRule {
  name = 'AdminCommandRule';
  priority = 200; // Higher priority than regular messages

  async canHandle(context: RuleContext): Promise<boolean> {
    const { message, sender } = context;
    
    // Must be mentioned
    if (!message.hasMention(context.botUserId)) {
      return false;
    }

    // Must be from admin
    if (!sender.canExecuteAdminCommands()) {
      return false;
    }

    // Must be a command (starts with / or !)
    if (!message.isCommand()) {
      return false;
    }

    // Must be text only
    if (!message.isTextOnly()) {
      return false;
    }

    return true;
  }

  async handle(context: RuleContext): Promise<RuleResult> {
    const { message } = context;
    
    const command = message.extractCommand();
    if (!command) {
      return this.createResult(false);
    }

    // Map commands to actions
    const commandActions: Record<string, string> = {
      'balance': 'SHOW_BALANCE',
      'stats': 'SHOW_STATS',
      'reload': 'RELOAD_CONFIG',
      'ban': 'BAN_USER',
      'unban': 'UNBAN_USER',
      'setperm': 'SET_PERMISSION',
      'grant': 'GRANT_ADMIN',
      'revoke': 'REVOKE_ADMIN',
    };

    const actionType = commandActions[command.command.toLowerCase()];
    if (!actionType) {
      // Unknown command
      const unknownAction = this.createAction('REPLY_MESSAGE', {
        messageId: message.id,
        content: `Unknown admin command: ${command.command}`,
      });
      return this.createResult(false, [unknownAction]);
    }

    // Create the admin action
    const adminAction = this.createAction(actionType, {
      messageId: message.id,
      chatId: message.chatId,
      command: command.command,
      args: command.args,
      executedBy: message.senderId,
    });

    // Admin commands don't continue to other rules
    return this.createResult(false, [adminAction]);
  }
}