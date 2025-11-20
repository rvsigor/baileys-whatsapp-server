import { WASocket, proto } from '@whiskeysockets/baileys';
import axios from 'axios';
import { config } from '../config/environment';

export async function attachMessageHandlers(sock: WASocket): Promise<void> {
  sock.ev.on('messages.upsert', async (m: any) => {
    try {
      const messages = m.messages || [];
      for (const msg of messages) {
        if (!msg.message) continue;

        const from = msg.key.remoteJid;
        const pushName = msg.pushName || msg.pushname || null;
        const body = extractBody(msg.message);

        const payload = {
          from,
          body,
          pushName,
          id: msg.key.id,
          timestamp: msg.messageTimestamp || msg.key.timestamp || Date.now()
        };

        if (config.webhookUrl) {
          await axios.post(config.webhookUrl, payload).catch(err => {
            console.error('Webhook send error:', err);
          });
        } else {
          console.log('Incoming message:', payload);
        }
      }
    } catch (err) {
      console.error('Message handler error:', err);
    }
  });
}

function extractBody(message: any): string {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return JSON.stringify(message).slice(0, 500);
}