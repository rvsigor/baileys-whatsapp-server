import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  AuthenticationState
} from '@whiskeysockets/baileys';
import path from 'path';
import pino from 'pino';
import { cacheQR, cacheConnectionStatus } from '../redis/cache';
import { InstanceModel } from '../database/mongo';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface WhatsAppClient {
  instanceId: string;
  sock: ReturnType<typeof makeWASocket> | null;
}

const clients: Map<string, WhatsAppClient> = new Map();

export async function startWhatsAppInstance(instanceId: string): Promise<WhatsAppClient> {
  if (clients.has(instanceId)) {
    logger.info({ instanceId }, 'Instance already started');
    return clients.get(instanceId)!;
  }

  const authDir = path.join(process.cwd(), 'data', 'auth', instanceId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 2304, 10] }));

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('baileys-whatsapp-server'),
    logger
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update as any;
    logger.info({ update }, 'connection.update');

    if (qr) {
      await cacheQR(instanceId, qr);
    }
    if (connection === 'open') {
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'connected', lastSeen: new Date() },
        { upsert: true }
      );
      await cacheConnectionStatus(instanceId, 'connected');
    } else if (connection === 'close') {
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'disconnected', lastSeen: new Date() },
        { upsert: true }
      );
      await cacheConnectionStatus(instanceId, 'disconnected');
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      logger.warn({ reason }, 'connection closed');
      // logic to reconnect if needed...
    }
  });

  // Attach message handlers (imported from messageHandler)
  import('../whatsapp/messageHandler').then(module => {
    module.attachMessageHandlers(sock);
  });

  const client: WhatsAppClient = { instanceId, sock };
  clients.set(instanceId, client);

  return client;
}

export function getClient(instanceId: string): WhatsAppClient | null {
  return clients.get(instanceId) || null;
}