import { createClient } from 'redis';
import { config } from '../config/environment';
import pino from 'pino';

const logger = pino();

let redisClient: ReturnType<typeof createClient> | null = null;

// Conexão Redis
export async function connectRedis() {
  if (!config.redisUrl) {
    logger.warn('⚠️ Redis URL not configured, skipping Redis connection');
    return;
  }

  try {
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on('error', (err: Error) => logger.error('Redis error:', err));
    await redisClient.connect();
    logger.info('✅ Redis connected');
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    redisClient = null;
  }
}

// QR Code
export async function cacheQR(instanceId: string, qr: string, ttl: number = 60) {
  if (!redisClient) return;
  await redisClient.set(`qr:${instanceId}`, qr, { EX: ttl });
}

export async function getQR(instanceId: string): Promise<string | null> {
  if (!redisClient) return null;
  return await redisClient.get(`qr:${instanceId}`);
}

// Status da conexão
export async function cacheConnectionStatus(instanceId: string, status: string) {
  if (!redisClient) return;
  await redisClient.set(`status:${instanceId}`, status, { EX: 300 });
}

export async function getConnectionStatus(instanceId: string): Promise<string | null> {
  if (!redisClient) return null;
  return await redisClient.get(`status:${instanceId}`);
}