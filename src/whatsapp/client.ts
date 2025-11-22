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
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false,
    browser: ['Ubuntu', 'baileys-whatsapp-server', '22.04.4'],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async (key) => {
      return { conversation: '' };
    },
    // ✅ Garantir que as credenciais são salvas automaticamente
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  // ✅ Salvar credenciais após cada mudança
  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin } = update;
    
    console.log('[client] connection.update:', { connection, hasQr: !!qr, isNewLogin });

    // ✅ NOVO: Salvar credenciais imediatamente após login bem-sucedido
    if (isNewLogin && connection !== 'close') {
      console.log('[client] New login detected - ensuring credentials are saved');
      try {
        // Forçar salvamento das credenciais
        await sock.authState.saveCreds();
        console.log('[client] Credentials saved successfully after new login');
        
        // Atualizar status no MongoDB para 'authenticated'
        await InstanceModel.findOneAndUpdate(
          { instanceId },
          { 
            $set: { 
              status: 'authenticated',
              updatedAt: new Date() 
            } 
          }
        );
      } catch (err) {
        console.error('[client] Error saving credentials after login:', err);
      }
    }

    // Salvar QR no Redis quando disponível
    if (qr) {
      console.log('[client] QR code generated');
      await cacheQR(instanceId, qr);
      
      // Atualizar status para 'qr_ready'
      await InstanceModel.findOneAndUpdate(
        { instanceId },
        { 
          $set: { 
            status: 'qr_ready',
            updatedAt: new Date() 
          } 
        }
      );
    }

    if (connection === 'open') {
      console.log('[client] WhatsApp connected');
      
      // Salvar número do telefone
      const phoneNumber = sock.user?.id.split(':')[0];
      if (phoneNumber) {
        await InstanceModel.findOneAndUpdate(
          { instanceId },
          { 
            $set: { 
              phoneNumber,
              status: 'open',
              updatedAt: new Date() 
            } 
          }
        );
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== 401; // Não reconectar em erro de autenticação
      
      console.log('[client] Connection closed', { 
        statusCode, 
        shouldReconnect,
        reason: lastDisconnect?.error 
      });

      // ✅ Se for erro 515 após novo login, não remover credenciais
      if (statusCode === 515 && isNewLogin !== false) {
        console.log('[client] Error 515 after login - keeping credentials for reconnection');
        await InstanceModel.findOneAndUpdate(
          { instanceId },
          { 
            $set: { 
              status: 'reconnecting',
              updatedAt: new Date() 
            } 
          }
        );
        // Não remover do Map, permitir reconexão automática
        return;
      }

      if (shouldReconnect) {
        console.log('[client] Will attempt reconnect');
        await InstanceModel.findOneAndUpdate(
          { instanceId },
          { 
            $set: { 
              status: 'reconnecting',
              updatedAt: new Date() 
            } 
          }
        );
        // Permitir que o Baileys reconecte automaticamente
      } else {
        console.log('[client] Removing client - auth failure');
        clientsMap.delete(instanceId);
        await InstanceModel.findOneAndUpdate(
          { instanceId },
          { 
            $set: { 
              status: 'disconnected',
              updatedAt: new Date() 
            } 
          }
        );
      }
    }

    // Enviar webhook para todas as atualizações
    await sendWebhook(instanceId, 'connection.update', update);
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