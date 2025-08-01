import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigModule } from '@nestjs/config';
import { 
  MessageRepository, 
  UserRepository, 
  ConversationRepository,
  RateLimiterService,
} from '@main-server-v2/core';

describe('Webhook Controller (e2e)', () => {
  let app: INestApplication;
  let messageRepository: MessageRepository;
  let userRepository: UserRepository;
  let conversationRepository: ConversationRepository;
  let rateLimiterService: RateLimiterService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.setGlobalPrefix('api');
    
    await app.init();

    // Get repositories for test setup and verification
    messageRepository = app.get(MessageRepository);
    userRepository = app.get(UserRepository);
    conversationRepository = app.get(ConversationRepository);
    rateLimiterService = app.get(RateLimiterService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset rate limiter for each test
    await rateLimiterService.reset('*');
  });

  describe('/api/webhook/lark/event (POST)', () => {
    it('should handle URL verification', () => {
      return request(app.getHttpServer())
        .post('/api/webhook/lark/event')
        .send({
          type: 'url_verification',
          challenge: 'test-challenge-123',
        })
        .expect(200)
        .expect({
          challenge: 'test-challenge-123',
        });
    });

    it('should process a text message event', async () => {
      const messageEvent = {
        schema: '2.0',
        header: {
          event_id: 'test-event-123',
          event_type: 'im.message.receive_v1',
          app_id: 'test-app-id',
          tenant_key: 'test-tenant',
          create_time: '1234567890',
          token: 'test-token',
        },
        event: {
          sender: {
            sender_id: {
              union_id: 'test-union-id',
              user_id: 'test-user-id',
              open_id: 'test-open-id',
            },
            sender_type: 'user',
            tenant_key: 'test-tenant',
          },
          message: {
            message_id: 'test-message-id',
            root_id: '',
            parent_id: '',
            create_time: '1234567890',
            chat_id: 'oc_test-chat-id',
            chat_type: 'group',
            message_type: 'text',
            content: '{"text":"Hello bot!"}',
            mentions: [],
          },
        },
      };

      const response = await request(app.getHttpServer())
        .post('/api/webhook/lark/event')
        .send(messageEvent)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        messageId: 'test-message-id',
        processed: true,
      });

      // Verify message was saved
      const savedMessage = await messageRepository.findById('test-message-id');
      expect(savedMessage).toBeDefined();
      expect(savedMessage?.getMetadata().messageId).toBe('test-message-id');
    });

    it('should handle message with mentions', async () => {
      const messageEvent = {
        schema: '2.0',
        header: {
          event_id: 'test-event-456',
          event_type: 'im.message.receive_v1',
          app_id: 'test-app-id',
          tenant_key: 'test-tenant',
          create_time: '1234567890',
          token: 'test-token',
        },
        event: {
          sender: {
            sender_id: {
              union_id: 'test-union-id',
              user_id: 'test-user-id',
              open_id: 'test-open-id',
            },
            sender_type: 'user',
            tenant_key: 'test-tenant',
          },
          message: {
            message_id: 'test-message-id-2',
            root_id: '',
            parent_id: '',
            create_time: '1234567890',
            chat_id: 'oc_test-chat-id',
            chat_type: 'group',
            message_type: 'text',
            content: '{"text":"@bot Hello!"}',
            mentions: [
              {
                key: '@_user_1',
                id: {
                  union_id: 'bot-union-id',
                  user_id: 'bot-user-id',
                  open_id: 'bot-open-id',
                },
                name: 'Bot',
                tenant_key: 'test-tenant',
              },
            ],
          },
        },
      };

      const response = await request(app.getHttpServer())
        .post('/api/webhook/lark/event')
        .send(messageEvent)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.processed).toBe(true);
    });

    it('should reject invalid event data', async () => {
      const invalidEvent = {
        // Missing required fields
        header: {
          event_type: 'im.message.receive_v1',
        },
      };

      await request(app.getHttpServer())
        .post('/api/webhook/lark/event')
        .send(invalidEvent)
        .expect(400);
    });

    it('should handle rate limiting', async () => {
      // Configure rate limiter for testing
      const testChatId = 'oc_rate-limit-test';
      
      // Send multiple messages to trigger rate limit
      const messagePromises = [];
      for (let i = 0; i < 15; i++) {
        const messageEvent = {
          schema: '2.0',
          header: {
            event_id: `test-event-rate-${i}`,
            event_type: 'im.message.receive_v1',
            app_id: 'test-app-id',
            tenant_key: 'test-tenant',
            create_time: '1234567890',
            token: 'test-token',
          },
          event: {
            sender: {
              sender_id: {
                union_id: 'test-union-id',
                user_id: 'test-user-id',
                open_id: 'test-open-id',
              },
              sender_type: 'user',
              tenant_key: 'test-tenant',
            },
            message: {
              message_id: `test-message-rate-${i}`,
              root_id: '',
              parent_id: '',
              create_time: '1234567890',
              chat_id: testChatId,
              chat_type: 'group',
              message_type: 'text',
              content: `{"text":"Message ${i}"}`,
              mentions: [],
            },
          },
        };

        messagePromises.push(
          request(app.getHttpServer())
            .post('/api/webhook/lark/event')
            .send(messageEvent)
        );
      }

      const responses = await Promise.all(messagePromises);
      
      // First 10 should succeed
      for (let i = 0; i < 10; i++) {
        expect(responses[i].status).toBe(200);
      }
      
      // Remaining should be rate limited
      for (let i = 10; i < 15; i++) {
        expect(responses[i].status).toBe(429);
      }
    });
  });
});