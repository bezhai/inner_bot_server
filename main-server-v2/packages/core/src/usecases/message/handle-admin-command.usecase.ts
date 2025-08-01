export interface HandleAdminCommandCommand {
  messageId: string;
  chatId: string;
  command: string;
  args: string[];
  executedBy: string;
}

export interface HandleAdminCommandResult {
  success: boolean;
  response?: string;
  data?: any;
  error?: string;
}

export interface HandleAdminCommandUseCase {
  execute(command: HandleAdminCommandCommand): Promise<HandleAdminCommandResult>;
}