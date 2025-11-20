import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  mongoUri: process.env.MONGODB_URI || '',   // variável ajustada
  redisUrl: process.env.REDIS_URL || '',
  apiKey: process.env.API_KEY || '',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS
    ? Number(process.env.RATE_LIMIT_WINDOW_MS)
    : 60000,
  rateLimitMax: process.env.RATE_LIMIT_MAX
    ? Number(process.env.RATE_LIMIT_MAX)
    : 60,
  logLevel: process.env.LOG_LEVEL || 'info'
};