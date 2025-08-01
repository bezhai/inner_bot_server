import {
  GenerateAIReplyUseCase,
  GenerateAIReplyCommand,
  GenerateAIReplyResult,
} from '../generate-ai-reply.usecase';
import { AIService } from '../../../domain/services/ai.service';
import { MessageRepository } from '../../../domain/repositories/message.repository';
import { ConversationRepository } from '../../../domain/repositories/conversation.repository';
import { UserRepository } from '../../../domain/repositories/user.repository';
import { MessageEntity } from '../../../domain/entities/message.entity';
import { MessageContent } from '../../../domain/value-objects/message-content.vo';
import { MessageMetadata } from '../../../domain/value-objects/message-metadata.vo';

export class GenerateAIReplyUseCaseImpl implements GenerateAIReplyUseCase {
  constructor(
    private readonly aiService: AIService,
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(command: GenerateAIReplyCommand): Promise<GenerateAIReplyResult> {
    try {
      // 1. Fetch the original message
      const originalMessage = await this.messageRepository.findById(command.messageId);
      if (!originalMessage) {
        return {
          success: false,
          error: 'Original message not found',
        };
      }

      // 2. Fetch conversation for context
      const conversation = await this.conversationRepository.findByChatId(command.chatId);
      if (!conversation) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      // 3. Get recent messages for context
      const recentMessages = await this.messageRepository.findByConversation(
        command.chatId,
        { limit: 10, before: new Date() }
      );

      // 4. Build AI request
      const aiRequest = {
        message: originalMessage,
        conversation,
        context: {
          recentMessages,
          systemPrompt: this.buildSystemPrompt(command, conversation.isP2P()),
        },
      };

      // 5. Generate AI reply
      const aiResponse = await this.aiService.generateReply(aiRequest);

      // 6. Validate response
      if (!aiResponse.content || aiResponse.content.trim().length === 0) {
        return {
          success: false,
          error: 'AI generated empty response',
        };
      }

      // 7. Check content moderation
      const moderationResult = await this.aiService.moderateContent(aiResponse.content);
      if (!moderationResult.isSafe) {
        console.warn('AI response failed moderation:', moderationResult);
        return {
          success: false,
          error: 'Generated content failed safety check',
        };
      }

      return {
        success: true,
        replyContent: aiResponse.content,
        modelUsed: aiResponse.modelUsed,
        tokensUsed: aiResponse.tokensUsed,
      };
    } catch (error) {
      console.error('Error generating AI reply:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate AI reply',
      };
    }
  }

  private buildSystemPrompt(command: GenerateAIReplyCommand, isP2P: boolean): string {
    const basePrompt = `You are a helpful AI assistant in a ${
      isP2P ? 'private' : 'group'
    } chat. The user's name is ${command.senderName}.`;

    const restrictions = [];
    
    if (!command.canAccessRestrictedModels) {
      restrictions.push('Use only standard language models');
    }
    
    if (!command.canAccessRestrictedPrompts) {
      restrictions.push('Avoid sensitive or controversial topics');
    }

    if (command.isCanary) {
      restrictions.push('You are in canary mode - be extra careful with responses');
    }

    const restrictionText = restrictions.length > 0 
      ? `\n\nRestrictions: ${restrictions.join(', ')}.`
      : '';

    return `${basePrompt}${restrictionText}`;
  }
}