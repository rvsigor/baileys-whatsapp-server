import { WAMessage } from '@whiskeysockets/baileys';
import { sendWebhook } from '../webhooks/sender';
import pino from 'pino';

const logger = pino();

export async function handleIncomingMessage(
  instanceId: string, 
  message: WAMessage,
  sock: any
) {
  try {
    // Ignore messages from self or without key
    if (message.key.fromMe || !message.key.remoteJid) return;

    const from = message.key.remoteJid;
    const messageContent = message.message;

    if (!messageContent) return;

    let text = '';
    let mediaUrl = '';
    let mediaType = '';

    // Extract text
    if (messageContent.conversation) {
      text = messageContent.conversation;
    } else if (messageContent.extendedTextMessage?.text) {
      text = messageContent.extendedTextMessage.text;
    }

    // Extract media
    if (messageContent.imageMessage) {
      mediaType = 'image';
      // Note: To download media, use sock.downloadMediaMessage(message)
    } else if (messageContent.videoMessage) {
      mediaType = 'video';
    } else if (messageContent.audioMessage) {
      mediaType = 'audio';
    } else if (messageContent.documentMessage) {
      mediaType = 'document';
    }

    // Send to webhook
    await sendWebhook('messages.upsert', instanceId, {
      from: from.split('@')[0], // Remove @s.whatsapp.net
      text,
      mediaType,
      timestamp: message.messageTimestamp,
      messageId: message.key.id,
      pushName: message.pushName || ''
    });

    logger.info(`Message received in ${instanceId} from ${from}`);
  } catch (error: any) {
    logger.error('Error handling message:', error.message);
  }
}