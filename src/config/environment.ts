import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  apiKey: process.env.API_KEY || '',
  mongoUri: process.env.MONGODB_URI || '',
  redisUrl: process.env.REDIS_URL || '',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Validações
const required = ['apiKey', 'mongoUri', 'webhookUrl'];
const missing = required.filter(key => !config[key as keyof typeof config]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}