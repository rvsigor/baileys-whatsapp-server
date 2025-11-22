import { WASocket } from '@whiskeysockets/baileys';
import axios from 'axios';
import { config } from '../config/environment';
import { sendWebhook } from "../webhooks/sender";

export async function attachMessageHandlers(sock: WASocket, instanceName: string): Promise<void> {
  sock.ev.on('messages.upsert', async (m: any) => {
    try {
      const messages = m.messages ?? [];
      for (const msg of messages) {
        if (!msg.message) continue;

        const from = msg.key.remoteJid;
        const pushName = msg.pushName ?? msg.pushname ?? null;
        const body = getMessageBody(msg.message);

        // Usar sendWebhook em vez de axios.post direto
        await sendWebhook({
          event: 'messages.upsert',
          instance: instanceName,
          data: {
            from,
            body,
            pushName,
            id: msg.key.id,
            timestamp: msg.messageTimestamp ?? msg.key.timestamp ?? Date.now(),
            // Opcional: incluir mensagem completa se necessário
            // fullMessage: msg
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Erro no messageHandler:', err);
    }
  });
}

function getMessageBody(message: any): string {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return JSON.stringify(message).slice(0, 500);
}