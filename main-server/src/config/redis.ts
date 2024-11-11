import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_IP || 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
});

redis.on('connect', () => {
  console.log(`Connected to Redis`);
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

export default redis;