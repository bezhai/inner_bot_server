import { ProcessMessageUseCaseImpl } from '../impl/process-message.usecase.impl';
import { ProcessMessageCommand } from '../process-message.usecase';
import { MessageRepository } from '../../../domain/repositories/message.repository';
import { UserRepository } from '../../../domain/repositories/user.repository';
import { ConversationRepository } from '../../../domain/repositories/conversation.repository';
import { MessageRuleEngine } from '../../../domain/services/message-rule-engine';
import { RateLimiterService } from '../../../domain/services/rate-limiter.service';
import { MessageEntity } from '../../../domain/entities/message.entity';
import { UserEntity } from '../../../domain/entities/user.entity';
import { ConversationEntity, ChatType } from '../../../domain/entities/conversation.entity';
import { ChatPermissions } from '../../../domain/value-objects/chat-permissions.vo';

describe('ProcessMessageUseCase', () => {
  let useCase: ProcessMessageUseCaseImpl;
  let messageRepository: jest.Mocked<MessageRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let ruleEngine: jest.Mocked<MessageRuleEngine>;
  let rateLimiter: jest.Mocked<RateLimiterService>;
  
  const botUserId = 'bot_123';

  beforeEach(() => {
    // Create mocks
    messageRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByConversation: jest.fn(),
      findDuplicates: jest.fn(),
      findByThreadId: jest.fn(),
      markAsProcessed: jest.fn(),
      countByChat: jest.fn(),
      deleteById: jest.fn(),
      deleteByChat: jest.fn(),
    };

    userRepository = {
      save: jest.fn(),
      findByUnionId: jest.fn(),
      findByOpenId: jest.fn(),
      findByIds: jest.fn(),
      batchGetUserNames: jest.fn(),
      updateAdminStatus: jest.fn(),
      updateUserInfo: jest.fn(),
      addOpenId: jest.fn(),
      removeOpenId: jest.fn(),
      findAdmins: jest.fn(),
      search: jest.fn(),
      count: jest.fn(),
      deleteByUnionId: jest.fn(),
    };

    conversationRepository = {
      save: jest.fn(),
      findByChatId: jest.fn(),
      findByIds: jest.fn(),
      findByType: jest.fn(),
      updatePermissions: jest.fn(),
      updateChatInfo: jest.fn(),
      addBot: jest.fn(),
      removeBot: jest.fn(),
      findWithRepeatEnabled: jest.fn(),
      findCanaryChats: jest.fn(),
      search: jest.fn(),
      count: jest.fn(),
      deleteByChatId: jest.fn(),
    };

    ruleEngine = {
      execute: jest.fn(),
      addRule: jest.fn(),
      removeRule: jest.fn(),
      getRules: jest.fn(),
    } as any;

    rateLimiter = {
      checkLimit: jest.fn(),
      reset: jest.fn(),
      getUsage: jest.fn(),
      batchCheck: jest.fn(),
    };

    useCase = new ProcessMessageUseCaseImpl(
      messageRepository,
      userRepository,
      conversationRepository,
      ruleEngine,
      rateLimiter,
      botUserId,
    );
  });

  describe('when receiving a text message with mention', () => {
    it('should process message and trigger AI reply', async () => {
      // Arrange
      const command: ProcessMessageCommand = {
        messageId: 'msg_123',
        chatId: 'oc_group123',
        senderId: 'user_123',
        senderOpenId: 'ou_user123',
        content: JSON.stringify({ text: '@bot hello', mentions: [botUserId] }),
        messageType: 'text',
        createTime: '1234567890',
        mentions: [botUserId],
      };

      const mockUser = new UserEntity({
        unionId: 'user_123',
        name: 'Test User',
        openIds: ['ou_user123'],
      });

      const mockConversation = new ConversationEntity({
        chatId: 'oc_group123',
        chatType: ChatType.Group,
        permissions: ChatPermissions.default(),
      });

      const mockRuleResult = {
        shouldContinue: false,
        actions: [{ type: 'GENERATE_AI_REPLY', payload: { messageId: 'msg_123' } }],
        events: [],
      };

      rateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(),
      });
      userRepository.findByUnionId.mockResolvedValue(mockUser);
      conversationRepository.findByChatId.mockResolvedValue(mockConversation);
      userRepository.findAdmins.mockResolvedValue([]);
      ruleEngine.execute.mockResolvedValue(mockRuleResult);
      messageRepository.save.mockResolvedValue();

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('GENERATE_AI_REPLY');
      expect(messageRepository.save).toHaveBeenCalled();
      expect(ruleEngine.execute).toHaveBeenCalled();
    });
  });

  describe('when rate limit is exceeded', () => {
    it('should return error without processing', async () => {
      // Arrange
      const command: ProcessMessageCommand = {
        messageId: 'msg_123',
        chatId: 'oc_group123',
        senderId: 'user_123',
        content: JSON.stringify({ text: 'hello' }),
        messageType: 'text',
      };

      rateLimiter.checkLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      });

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
      expect(messageRepository.save).not.toHaveBeenCalled();
      expect(ruleEngine.execute).not.toHaveBeenCalled();
    });
  });

  describe('when user does not exist', () => {
    it('should create new user and continue processing', async () => {
      // Arrange
      const command: ProcessMessageCommand = {
        messageId: 'msg_123',
        chatId: 'oc_group123',
        senderId: 'new_user_123',
        senderOpenId: 'ou_newuser123',
        content: JSON.stringify({ text: 'hello' }),
        messageType: 'text',
      };

      const mockConversation = new ConversationEntity({
        chatId: 'oc_group123',
        chatType: ChatType.Group,
        permissions: ChatPermissions.default(),
      });

      rateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(),
      });
      userRepository.findByUnionId.mockResolvedValue(null);
      conversationRepository.findByChatId.mockResolvedValue(mockConversation);
      userRepository.findAdmins.mockResolvedValue([]);
      ruleEngine.execute.mockResolvedValue({
        shouldContinue: false,
        actions: [],
        events: [],
      });

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.success).toBe(true);
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          unionId: 'new_user_123',
          name: 'Unknown User',
          openIds: ['ou_newuser123'],
          isAdmin: false,
        })
      );
    });
  });

  describe('when conversation does not exist', () => {
    it('should return error', async () => {
      // Arrange
      const command: ProcessMessageCommand = {
        messageId: 'msg_123',
        chatId: 'oc_unknown',
        senderId: 'user_123',
        content: JSON.stringify({ text: 'hello' }),
        messageType: 'text',
      };

      rateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(),
      });
      userRepository.findByUnionId.mockResolvedValue(new UserEntity({
        unionId: 'user_123',
        name: 'Test User',
      }));
      conversationRepository.findByChatId.mockResolvedValue(null);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Conversation not found');
      expect(messageRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('when conversation does not allow message processing', () => {
    it('should skip processing without error', async () => {
      // Arrange
      const command: ProcessMessageCommand = {
        messageId: 'msg_123',
        chatId: 'oc_group123',
        senderId: 'user_123',
        content: JSON.stringify({ text: 'hello' }),
        messageType: 'text',
      };

      const mockUser = new UserEntity({
        unionId: 'user_123',
        name: 'Test User',
      });

      const mockConversation = new ConversationEntity({
        chatId: 'oc_group123',
        chatType: ChatType.Group,
        permissions: new ChatPermissions({ allowSendMessage: false }),
      });

      rateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(),
      });
      userRepository.findByUnionId.mockResolvedValue(mockUser);
      conversationRepository.findByChatId.mockResolvedValue(mockConversation);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
      expect(result.events).toHaveLength(0);
      expect(ruleEngine.execute).not.toHaveBeenCalled();
    });
  });

  describe('when processing image message', () => {
    it('should parse image content correctly', async () => {
      // Arrange
      const command: ProcessMessageCommand = {
        messageId: 'msg_123',
        chatId: 'oc_group123',
        senderId: 'user_123',
        content: JSON.stringify({ image_key: 'img_abc123' }),
        messageType: 'image',
      };

      const mockUser = new UserEntity({
        unionId: 'user_123',
        name: 'Test User',
      });

      const mockConversation = new ConversationEntity({
        chatId: 'oc_group123',
        chatType: ChatType.Group,
        permissions: ChatPermissions.default(),
      });

      rateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(),
      });
      userRepository.findByUnionId.mockResolvedValue(mockUser);
      conversationRepository.findByChatId.mockResolvedValue(mockConversation);
      userRepository.findAdmins.mockResolvedValue([]);
      ruleEngine.execute.mockResolvedValue({
        shouldContinue: false,
        actions: [],
        events: [],
      });

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message!.imageKeys()).toContain('img_abc123');
    });
  });
});