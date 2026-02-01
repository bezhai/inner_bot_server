import { getRedisClient, RedisClient } from '@inner/shared';

// 使用共享的 Redis 客户端
const redisClient: RedisClient = getRedisClient();

export default redisClient;
