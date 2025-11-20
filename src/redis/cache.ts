import { createClient, RedisClientType } from 'redis';
import { config } from '../config/environment';
import pino from 'pino';

const logger = pino({ level: config.logLevel });

let redisClient: RedisClientType | null = null;

export async function connectRedis(): Promise<void> {
  if (!config.redisUrl) {
    logger.warn('⚠️ Redis URL não configurada, pulando conexão com Redis');
    return;
  }

  try {
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on('error', (err: Error) => logger.error('Erro no Redis:', err));
    await redisClient.connect();
    logger.info('✅ Redis conectado');
  } catch (error: any) {
    logger.error('❌ Falha ao conectar no Redis:', error);
    redisClient = null;
  }
}

export async function cacheQR(instanceId: string, qr: string, ttl: number = 60): Promise<void> {
  if (!redisClient) return;
  await redisClient.set(`qr:${instanceId}`, qr, { EX: ttl });
  await redisClient.publish('qr_channel', JSON.stringify({ instanceId }));
}

export async function getQR(instanceId: string): Promise<string | null> {
  if (!redisClient) return null;
  return await redisClient.get(`qr:${instanceId}`);
}

export async function cacheConnectionStatus(instanceId: string, status: string): Promise<void> {
  if (!redisClient) return;
  await redisClient.set(`status:${instanceId}`, status, { EX: 300 });
}

export async function getConnectionStatus(instanceId: string): Promise<string | null> {
  if (!redisClient) return null;
  return await redisClient.get(`status:${instanceId}`);
}