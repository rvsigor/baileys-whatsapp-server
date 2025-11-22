import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers,
  WAVersion
} from '@whiskeysockets/baileys';
import path from 'path';
import pino from 'pino';
import { cacheQR, cacheConnectionStatus } from '../redis/cache';
import { InstanceModel } from '../database/mongo';
import { sendWebhook } from "../webhooks/sender";

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface WhatsAppClient {
  instanceId: string;
  sock: ReturnType<typeof makeWASocket> | null;
}

const clients = new Map<string, WhatsAppClient>();

export async function startWhatsAppInstance(instanceId: string): Promise<WhatsAppClient> {
  if (clients.has(instanceId)) {
    logger.info({ instanceId }, 'Instância já iniciada');
    return clients.get(instanceId)!;
  }

  const authDir = path.join(process.cwd(), 'data', 'auth', instanceId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 2304, 10] }));
  const waVersion: WAVersion = Array.isArray(version)
    ? (version as [number, number, number])
    : version;

  const sock = makeWASocket({
    version: waVersion,
    auth: state,
    browser: Browsers.ubuntu('baileys-whatsapp-server'),
    logger
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    console.log('[client] connection.update:', JSON.stringify(update));

    const { connection, lastDisconnect, qr } = update;

    // 1. Salvar QR no Redis quando gerado
    if (qr) {
      console.log('[client] QR code generated, saving to Redis');
      await cacheQR(instanceId, qr);
      
      // Atualizar status para "qr_ready"
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'qr_ready' },
        { upsert: true }
      );
      await cacheConnectionStatus(instanceId, 'qr_ready');
    }

    // 2. Atualizar status quando conexão muda
    if (connection === 'open') {
      console.log('[client] Connection opened successfully');
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'open' },
        { upsert: true }
      );
      await cacheConnectionStatus(instanceId, 'open');
    } else if (connection === 'close') {
      console.log('[client] Connection closed');
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== 401;
      
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'disconnected' },
        { upsert: true }
      );
      await cacheConnectionStatus(instanceId, 'disconnected');
      
      if (shouldReconnect) {
        console.log('[client] Will attempt reconnect');
        // Lógica de reconexão
      }
    }

    // 3. Enviar webhook (já existente)
    await sendWebhook({
      event: 'connection.update',
      instance: instanceId,
      data: {
        connection,
        lastDisconnect: lastDisconnect ? {
          error: lastDisconnect.error?.message,
          statusCode: (lastDisconnect.error as any)?.output?.statusCode
        } : undefined,
        qr
      },
      timestamp: new Date().toISOString()
    });
  });

  import('./messageHandler').then(module => {
    module.attachMessageHandlers(sock,instanceId);
  });

  const client = { instanceId, sock };
  clients.set(instanceId, client);
  return client;
}

export function getClient(instanceId: string): WhatsAppClient | null {
  return clients.get(instanceId) ?? null;
}

export function removeClient(instanceId: string): void {
  const client = clients.get(instanceId);
  if (client?.sock) {
    client.sock.end(undefined);
  }
  clients.delete(instanceId);
  logger.info({ instanceId }, 'Cliente removido');
}