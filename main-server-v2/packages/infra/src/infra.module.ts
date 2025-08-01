import { Module, Global } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { 
  UserRepository, 
  MessageRepository, 
  ConversationRepository,
  RateLimiterService,
} from '@main-server-v2/core';
import { UserRepositoryImpl } from './database/repositories/user.repository.impl';
import { MessageRepositoryImpl } from './database/repositories/message.repository.impl';
import { ConversationRepositoryImpl } from './database/repositories/conversation.repository.impl';
import { RedisService } from './cache/redis.service';
import { RateLimiterServiceImpl } from './cache/rate-limiter.service.impl';
import { MessageQueueService } from './queue/message-queue.service';

@Global()
@Module({
  providers: [
    // Database
    {
      provide: PrismaClient,
      useFactory: () => {
        const prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' 
            ? ['query', 'info', 'warn', 'error']
            : ['error'],
        });
        return prisma;
      },
    },
    
    // Repositories
    {
      provide: UserRepository,
      useClass: UserRepositoryImpl,
    },
    {
      provide: MessageRepository,
      useClass: MessageRepositoryImpl,
    },
    {
      provide: ConversationRepository,
      useClass: ConversationRepositoryImpl,
    },
    
    // Cache & Rate Limiting
    RedisService,
    {
      provide: RateLimiterService,
      useClass: RateLimiterServiceImpl,
    },
    
    // Queue
    MessageQueueService,
  ],
  exports: [
    PrismaClient,
    UserRepository,
    MessageRepository,
    ConversationRepository,
    RateLimiterService,
    RedisService,
    MessageQueueService,
  ],
})
export class InfraModule {}