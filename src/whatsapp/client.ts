import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessage
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { saveSession, getSession, deleteSession } from '../database/mongo';
import { cacheQR, cacheConnectionStatus } from '../redis/cache';
import { sendWebhook } from '../webhooks/sender';
import { handleIncomingMessage } from './messageHandler';

const logger = pino({ level: 'info' });

const activeSockets = new Map<string, ReturnType<typeof makeWASocket>>();

export async function initializeInstance(instanceId: string) {
  try {
    // Check if already connected
    if (activeSockets.has(instanceId)) {
      logger.info(`Instance ${instanceId} already active`);
      return { success: true, message: 'Instance already connected' };
    }

    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${instanceId}`);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
    });

    activeSockets.set(instanceId, sock);

    // QR Code handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrBase64 = await QRCode.toDataURL(qr);
        await cacheQR(instanceId, qrBase64);
        await sendWebhook('qr.ready', instanceId, { qr: qrBase64 });
        logger.info(`QR code generated for ${instanceId}`);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          logger.info(`Reconnecting ${instanceId}...`);
          setTimeout(() => initializeInstance(instanceId), 3000);
        } else {
          logger.info(`Instance ${instanceId} logged out`);
          activeSockets.delete(instanceId);
          await deleteSession(instanceId);
          await sendWebhook('connection.update', instanceId, { state: 'disconnected' });
        }
      }

      if (connection === 'open') {
        logger.info(`Instance ${instanceId} connected!`);
        const phoneNumber = sock.user?.id.split(':')[0];
        await saveSession(instanceId, state, phoneNumber);
        await cacheConnectionStatus(instanceId, 'ready');
        await sendWebhook('connection.update', instanceId, { 
          state: 'ready', 
          phoneNumber 
        });
      }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const message of messages) {
          await handleIncomingMessage(instanceId, message, sock);
        }
      }
    });

    return { success: true, message: 'Instance initialized' };
  } catch (error: any) {
    logger.error(`Error initializing instance ${instanceId}:`, error);
    throw error;
  }
}

export async function getInstanceStatus(instanceId: string) {
  const sock = activeSockets.get(instanceId);
  
  if (!sock || !sock.user) {
    return { 
      connected: false, 
      status: 'disconnected' 
    };
  }

  return {
    connected: true,
    status: 'ready',
    phoneNumber: sock.user.id.split(':')[0],
    name: sock.user.name
  };
}

export async function sendMessage(
  instanceId: string, 
  to: string, 
  message: string, 
  media?: { url: string; type: 'image' | 'video' | 'audio' | 'document' }
) {
  const sock = activeSockets.get(instanceId);
  
  if (!sock) {
    throw new Error('Instance not connected');
  }

  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

  if (media) {
    const { url, type } = media;
    const messageContent: any = {
      caption: message
    };

    if (type === 'image') messageContent.image = { url };
    else if (type === 'video') messageContent.video = { url };
    else if (type === 'audio') messageContent.audio = { url };
    else if (type === 'document') messageContent.document = { url };

    await sock.sendMessage(jid, messageContent);
  } else {
    await sock.sendMessage(jid, { text: message });
  }

  logger.info(`Message sent from ${instanceId} to ${to}`);
  return { success: true };
}

export async function disconnectInstance(instanceId: string) {
  const sock = activeSockets.get(instanceId);
  
  if (sock) {
    await sock.logout();
    activeSockets.delete(instanceId);
  }

  await deleteSession(instanceId);
  await sendWebhook('connection.update', instanceId, { state: 'disconnected' });
  
  return { success: true };
}