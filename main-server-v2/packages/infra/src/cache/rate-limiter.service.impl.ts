import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  RateLimiterService, 
  RateLimiterConfig, 
  RateLimitResult 
} from '@main-server-v2/core';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimiterServiceImpl implements RateLimiterService {
  private readonly defaultConfig: RateLimiterConfig;

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.defaultConfig = {
      maxRequests: this.configService.get<number>('rateLimit.maxRequests', 100),
      windowMs: this.configService.get<number>('rateLimit.windowMs', 60000),
      keyPrefix: 'rate_limit:',
    };
  }

  async checkLimit(key: string, config?: RateLimiterConfig): Promise<RateLimitResult> {
    const cfg = { ...this.defaultConfig, ...config };
    const redisKey = `${cfg.keyPrefix}${key}`;
    const windowSeconds = Math.ceil(cfg.windowMs / 1000);

    // Use Redis multi for atomic operations
    const multi = this.redis.getClient().multi();
    
    // Increment counter
    multi.incr(redisKey);
    
    // Set expiry on first request
    multi.expire(redisKey, windowSeconds);
    
    // Get TTL
    multi.ttl(redisKey);
    
    const results = await multi.exec();
    
    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const count = results[0][1] as number;
    const ttl = results[2][1] as number;
    
    // Calculate reset time
    const resetAt = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : cfg.windowMs));
    
    const allowed = count <= cfg.maxRequests;
    const remaining = Math.max(0, cfg.maxRequests - count);

    // If limit exceeded, optionally decrement to not count this request
    if (!allowed) {
      await this.redis.decr(redisKey);
    }

    return {
      allowed,
      remaining,
      resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    const redisKey = `${this.defaultConfig.keyPrefix}${key}`;
    await this.redis.del(redisKey);
  }

  async getUsage(key: string): Promise<{ count: number; resetAt: Date }> {
    const redisKey = `${this.defaultConfig.keyPrefix}${key}`;
    
    const [countStr, ttl] = await Promise.all([
      this.redis.get(redisKey),
      this.redis.ttl(redisKey),
    ]);

    const count = countStr ? parseInt(countStr, 10) : 0;
    const resetAt = ttl > 0 
      ? new Date(Date.now() + ttl * 1000)
      : new Date(Date.now() + this.defaultConfig.windowMs);

    return { count, resetAt };
  }

  async batchCheck(
    keys: string[],
    config?: RateLimiterConfig
  ): Promise<Map<string, RateLimitResult>> {
    const results = new Map<string, RateLimitResult>();
    
    // Use pipeline for better performance
    const pipeline = this.redis.getClient().pipeline();
    const cfg = { ...this.defaultConfig, ...config };
    const windowSeconds = Math.ceil(cfg.windowMs / 1000);

    // Add commands for each key
    for (const key of keys) {
      const redisKey = `${cfg.keyPrefix}${key}`;
      pipeline.get(redisKey);
      pipeline.ttl(redisKey);
    }

    const pipelineResults = await pipeline.exec();
    
    if (!pipelineResults) {
      throw new Error('Redis pipeline failed');
    }

    // Process results
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const countResult = pipelineResults[i * 2];
      const ttlResult = pipelineResults[i * 2 + 1];

      const count = countResult[1] ? parseInt(countResult[1] as string, 10) : 0;
      const ttl = ttlResult[1] as number;

      const allowed = count < cfg.maxRequests;
      const remaining = Math.max(0, cfg.maxRequests - count);
      const resetAt = ttl > 0
        ? new Date(Date.now() + ttl * 1000)
        : new Date(Date.now() + cfg.windowMs);

      results.set(key, { allowed, remaining, resetAt });

      // Increment counter if allowed
      if (allowed) {
        const redisKey = `${cfg.keyPrefix}${key}`;
        await this.redis.incr(redisKey);
        if (count === 0) {
          await this.redis.expire(redisKey, windowSeconds);
        }
      }
    }

    return results;
  }
}