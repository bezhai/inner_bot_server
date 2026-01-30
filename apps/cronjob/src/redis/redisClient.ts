import Redis from 'ioredis';


const redisClient = new Redis({
  host: process.env.REDIS_HOST!,
  port: 6379,
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

export default redisClient;