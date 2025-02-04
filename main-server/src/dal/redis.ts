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

export async function incr(key: string): Promise<number> {
  return redis.incr(key);
}

export async function set(key: string, value: string) {
  return redis.set(key, value);
}

export async function setWithExpire(key: string, value: string, seconds: number) {
  return redis.set(key, value, 'EX', seconds);
}

export async function get(key: string): Promise<string | null> {
  return redis.get(key);
}
