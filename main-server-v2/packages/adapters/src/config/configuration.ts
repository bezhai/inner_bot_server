export default () => ({
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'debug',
  },
  cors: {
    origins: process.env.CORS_ORIGINS || 'http://localhost:3000',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  mongo: {
    url: process.env.MONGO_URL,
  },
  lark: {
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
    verificationToken: process.env.LARK_VERIFICATION_TOKEN,
    encryptKey: process.env.LARK_ENCRYPT_KEY,
  },
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    apiKey: process.env.AI_SERVICE_API_KEY,
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  queue: {
    redis: {
      host: process.env.QUEUE_REDIS_HOST || 'localhost',
      port: parseInt(process.env.QUEUE_REDIS_PORT || '6379', 10),
    },
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  },
  monitoring: {
    metricsEnabled: process.env.METRICS_ENABLED === 'true',
    healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
  },
});