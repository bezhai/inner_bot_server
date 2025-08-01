export interface GenerateAIReplyCommand {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  messageContent: string;
  conversationType: string;
  canAccessRestrictedModels: boolean;
  canAccessRestrictedPrompts: boolean;
  isCanary: boolean;
}

export interface GenerateAIReplyResult {
  success: boolean;
  replyContent?: string;
  modelUsed?: string;
  tokensUsed?: number;
  error?: string;
}

export interface GenerateAIReplyUseCase {
  execute(command: GenerateAIReplyCommand): Promise<GenerateAIReplyResult>;
}