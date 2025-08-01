import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { 
  AIService, 
  AIReplyRequest, 
  AIReplyResponse,
  ExtractedEntity,
  MemeGenerationRequest,
  MemeGenerationResult,
  MessageEntity,
} from '@main-server-v2/core';
import { Retry, WithCircuitBreaker } from '@main-server-v2/shared';

@Injectable()
export class AIServiceAdapter implements AIService {
  private readonly logger = new Logger(AIServiceAdapter.name);
  private readonly aiServiceUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('ai.serviceUrl')!;
    this.apiKey = this.configService.get<string>('ai.apiKey')!;
  }

  @WithCircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    halfOpenRequests: 2,
  })
  @Retry({
    maxAttempts: 3,
    backoffMs: 1000,
    exponential: true,
    retryIf: (error) => error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT',
  })
  async generateReply(request: AIReplyRequest): Promise<AIReplyResponse> {
    try {
      const startTime = Date.now();
      
      // Prepare request for Python AI service
      const aiRequest = {
        message: request.message.toMarkdown(),
        chat_id: request.conversation.getChatId(),
        user_id: request.message.senderId,
        user_name: request.message.senderName,
        chat_type: request.conversation.getChatType(),
        context: {
          recent_messages: request.context.recentMessages?.map(msg => ({
            content: msg.toMarkdown(),
            sender_id: msg.senderId,
            timestamp: msg.createTime,
          })),
          system_prompt: request.context.systemPrompt,
          user_preferences: request.context.userPreferences,
        },
        permissions: {
          can_access_restricted_models: request.conversation.canAccessRestrictedModels(),
          can_access_restricted_prompts: request.conversation.canAccessRestrictedPrompts(),
          is_canary: request.conversation.isCanary(),
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/api/chat`, aiRequest, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        })
      );

      const processingTime = Date.now() - startTime;

      return {
        content: response.data.reply || response.data.content,
        confidence: response.data.confidence,
        modelUsed: response.data.model_used || response.data.model,
        tokensUsed: response.data.tokens_used || response.data.usage?.total_tokens,
        processingTime,
      };
    } catch (error) {
      this.logger.error('Failed to generate AI reply', error);
      throw new Error('AI service unavailable');
    }
  }

  async extractEntities(text: string): Promise<ExtractedEntity[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/api/extract_entities`, 
          { text },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      return response.data.entities.map((entity: any) => ({
        type: entity.type,
        value: entity.value,
        confidence: entity.confidence || 1.0,
        position: entity.position || { start: 0, end: text.length },
      }));
    } catch (error) {
      this.logger.error('Failed to extract entities', error);
      return [];
    }
  }

  async generateMeme(request: MemeGenerationRequest): Promise<MemeGenerationResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/api/generate_meme`,
          {
            prompt: request.prompt,
            style: request.style,
            template: request.template,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 second timeout for image generation
          }
        )
      );

      return {
        imageUrl: response.data.image_url,
        imageKey: response.data.image_key,
        template: response.data.template || 'default',
        caption: response.data.caption,
      };
    } catch (error) {
      this.logger.error('Failed to generate meme', error);
      throw new Error('Meme generation failed');
    }
  }

  async summarizeConversation(messages: MessageEntity[]): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/api/summarize`,
          {
            messages: messages.map(msg => ({
              content: msg.toMarkdown(),
              sender_id: msg.senderId,
              timestamp: msg.createTime,
            })),
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      return response.data.summary;
    } catch (error) {
      this.logger.error('Failed to summarize conversation', error);
      throw new Error('Summarization failed');
    }
  }

  async detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/api/detect_language`,
          { text },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      return {
        language: response.data.language || 'unknown',
        confidence: response.data.confidence || 0,
      };
    } catch (error) {
      this.logger.error('Failed to detect language', error);
      return { language: 'unknown', confidence: 0 };
    }
  }

  async moderateContent(text: string): Promise<{
    isSafe: boolean;
    categories?: string[];
    confidence: number;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/api/moderate`,
          { text },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      return {
        isSafe: response.data.is_safe !== false,
        categories: response.data.flagged_categories || [],
        confidence: response.data.confidence || 1.0,
      };
    } catch (error) {
      this.logger.error('Failed to moderate content', error);
      // Default to safe if moderation fails
      return { isSafe: true, confidence: 0.5 };
    }
  }
}