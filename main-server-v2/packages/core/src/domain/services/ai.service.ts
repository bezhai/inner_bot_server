import { MessageEntity } from '../entities/message.entity';
import { ConversationEntity } from '../entities/conversation.entity';

export interface ConversationContext {
  recentMessages?: MessageEntity[];
  userPreferences?: Record<string, any>;
  systemPrompt?: string;
}

export interface AIReplyRequest {
  message: MessageEntity;
  conversation: ConversationEntity;
  context: ConversationContext;
}

export interface AIReplyResponse {
  content: string;
  confidence?: number;
  modelUsed?: string;
  tokensUsed?: number;
  processingTime?: number;
}

export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  position: { start: number; end: number };
}

export interface MemeGenerationRequest {
  prompt: string;
  style?: string;
  template?: string;
}

export interface MemeGenerationResult {
  imageUrl: string;
  imageKey: string;
  template: string;
  caption?: string;
}

export interface AIService {
  generateReply(request: AIReplyRequest): Promise<AIReplyResponse>;
  
  extractEntities(text: string): Promise<ExtractedEntity[]>;
  
  generateMeme(request: MemeGenerationRequest): Promise<MemeGenerationResult>;
  
  summarizeConversation(messages: MessageEntity[]): Promise<string>;
  
  detectLanguage(text: string): Promise<{ language: string; confidence: number }>;
  
  moderateContent(text: string): Promise<{
    isSafe: boolean;
    categories?: string[];
    confidence: number;
  }>;
}