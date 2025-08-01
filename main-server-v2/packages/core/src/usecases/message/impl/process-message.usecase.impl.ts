import { 
  ProcessMessageUseCase, 
  ProcessMessageCommand, 
  ProcessMessageResult 
} from '../process-message.usecase';
import { MessageRepository } from '../../../domain/repositories/message.repository';
import { UserRepository } from '../../../domain/repositories/user.repository';
import { ConversationRepository } from '../../../domain/repositories/conversation.repository';
import { MessageRuleEngine } from '../../../domain/services/message-rule-engine';
import { MessageEntity } from '../../../domain/entities/message.entity';
import { MessageContent, ContentType } from '../../../domain/value-objects/message-content.vo';
import { MessageMetadata } from '../../../domain/value-objects/message-metadata.vo';
import { MessageReceivedEvent } from '../../../domain/events/message-received.event';
import { RateLimiterService } from '../../../domain/services/rate-limiter.service';

export class ProcessMessageUseCaseImpl implements ProcessMessageUseCase {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly ruleEngine: MessageRuleEngine,
    private readonly rateLimiter: RateLimiterService,
    private readonly botUserId: string,
  ) {}

  async execute(command: ProcessMessageCommand): Promise<ProcessMessageResult> {
    try {
      // 1. Check rate limit
      const rateLimitKey = `message:${command.senderId}`;
      const rateLimitResult = await this.rateLimiter.checkLimit(rateLimitKey);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          actions: [],
          events: [],
          error: 'Rate limit exceeded',
        };
      }

      // 2. Parse and create message entity
      const message = await this.createMessageEntity(command);
      
      // 3. Fetch sender information
      const sender = await this.userRepository.findByUnionId(command.senderId);
      if (!sender) {
        // Create new user if not exists
        await this.userRepository.save({
          unionId: command.senderId,
          name: 'Unknown User',
          openIds: command.senderOpenId ? [command.senderOpenId] : [],
          isAdmin: false,
        } as any);
      }

      // 4. Fetch conversation information
      const conversation = await this.conversationRepository.findByChatId(command.chatId);
      if (!conversation) {
        return {
          success: false,
          actions: [],
          events: [],
          error: 'Conversation not found',
        };
      }

      // 5. Check if conversation allows processing
      if (!conversation.shouldProcessMessage(message)) {
        return {
          success: true, // Not an error, just skip processing
          message,
          actions: [],
          events: [],
        };
      }

      // 6. Get admin user IDs for rule context
      const adminUsers = await this.userRepository.findAdmins();
      const adminUserIds = adminUsers.map(u => u.id);

      // 7. Execute rule engine
      const ruleResult = await this.ruleEngine.execute({
        message,
        conversation,
        sender: sender!,
        botUserId: this.botUserId,
        adminUserIds,
      });

      // 8. Save message to repository
      await this.messageRepository.save(message);

      // 9. Add message received event
      message.addDomainEvent(new MessageReceivedEvent(message.id, {
        chatId: message.chatId,
        senderId: message.senderId,
        senderName: message.senderName,
        messageType: command.messageType,
        isP2P: conversation.isP2P(),
        hasMentions: message.isMentioned(),
        mentionedUsers: message.getMentionedUsers(),
      }));

      // 10. Collect all domain events
      const allEvents = [
        ...message.getDomainEvents(),
        ...ruleResult.events,
      ];

      return {
        success: true,
        message,
        actions: ruleResult.actions,
        events: allEvents,
      };
    } catch (error) {
      console.error('Error processing message:', error);
      return {
        success: false,
        actions: [],
        events: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async createMessageEntity(command: ProcessMessageCommand): Promise<MessageEntity> {
    // Parse content based on message type
    const content = this.parseMessageContent(command.content, command.messageType);
    
    // Create metadata
    const metadata = new MessageMetadata({
      messageId: command.messageId,
      chatId: command.chatId,
      senderId: command.senderId,
      senderOpenId: command.senderOpenId,
      chatType: this.getChatType(command.chatId),
      createTime: command.createTime,
      rootId: command.rootId,
      parentMessageId: command.parentMessageId,
    });

    return new MessageEntity(metadata, content);
  }

  private parseMessageContent(content: string, messageType: string): MessageContent {
    try {
      const parsedContent = JSON.parse(content);
      
      switch (messageType) {
        case 'text':
          return new MessageContent({
            items: [{ type: ContentType.Text, value: parsedContent.text }],
            mentions: parsedContent.mentions || [],
          });
        
        case 'image':
          return new MessageContent({
            items: [{ type: ContentType.Image, value: parsedContent.image_key }],
          });
        
        case 'sticker':
          return new MessageContent({
            items: [{ type: ContentType.Sticker, value: parsedContent.file_key }],
          });
        
        default:
          // For unknown types, try to extract text
          return new MessageContent({
            items: [{ type: ContentType.Text, value: JSON.stringify(parsedContent) }],
          });
      }
    } catch {
      // If parsing fails, treat as plain text
      return new MessageContent({
        items: [{ type: ContentType.Text, value: content }],
      });
    }
  }

  private getChatType(chatId: string): string {
    // Determine chat type based on chat ID prefix
    if (chatId.startsWith('oc_')) {
      return 'group';
    } else if (chatId.startsWith('p2p_')) {
      return 'p2p';
    }
    return 'unknown';
  }
}