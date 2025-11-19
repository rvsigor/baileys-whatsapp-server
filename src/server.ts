// server.ts
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, WASocket } from '@whiskeysockets/baileys';
import express, { Request, Response, NextFunction } from 'express';
import QRCode from 'qrcode';
import pino from 'pino';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

interface Session {
  socket: WASocket;
  state: any;
}

const sessions = new Map<string, Session>();
const qrCodes = new Map<string, string>();

// Middleware de autenticação
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Inicializar conexão
app.post('/api/init', async (req: Request, res: Response) => {
  const { instanceName } = req.body;
  
  if (!instanceName) {
    return res.status(400).json({ error: 'instanceName is required' });
  }

  try {
    if (sessions.has(instanceName)) {
      const session = sessions.get(instanceName);
      if (session?.socket) {
        return res.json({ 
          success: true, 
          message: 'Instance already exists',
          qr: qrCodes.get(instanceName)
        });
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(`./auth/${instanceName}`);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger: pino({ level: 'silent' }),
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        QRCode.toDataURL(qr, (err, url) => {
          if (!err) {
            qrCodes.set(instanceName, url);
            console.log(`QR Code generated for ${instanceName}`);
          }
        });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed for ${instanceName}, reconnect:`, shouldReconnect);
        
        if (shouldReconnect) {
          setTimeout(() => {
            if (sessions.has(instanceName)) {
              sessions.delete(instanceName);
            }
          }, 5000);
        } else {
          sessions.delete(instanceName);
          qrCodes.delete(instanceName);
        }
      } else if (connection === 'open') {
        console.log(`Connected successfully for ${instanceName}`);
        qrCodes.delete(instanceName);
      }
    });

    sessions.set(instanceName, { socket, state });

    setTimeout(() => {
      const qr = qrCodes.get(instanceName);
      res.json({ 
        success: true, 
        qr: qr || null,
        message: qr ? 'QR code generated' : 'Waiting for QR code...'
      });
    }, 2000);

  } catch (error) {
    console.error('Init error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize';
    res.status(500).json({ error: errorMessage });
  }
});

// Verificar status
app.get('/api/status/:instanceName', async (req: Request, res: Response) => {
  const { instanceName } = req.params;

  if (!sessions.has(instanceName)) {
    return res.status(404).json({ 
      success: false,
      status: 'disconnected',
      message: 'Instance not found'
    });
  }

  const session = sessions.get(instanceName);
  const qr = qrCodes.get(instanceName);

  res.json({ 
    success: true,
    status: session?.socket ? 'connected' : 'disconnected',
    qr: qr || null
  });
});

// Enviar mensagem
app.post('/api/send-message', async (req: Request, res: Response) => {
  const { instanceName, to, message, mediaUrl } = req.body;

  if (!instanceName || !to || !message) {
    return res.status(400).json({ error: 'instanceName, to, and message are required' });
  }

  const session = sessions.get(instanceName);
  if (!session || !session.socket) {
    return res.status(404).json({ error: 'Instance not connected' });
  }

  try {
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    
    await session.socket.sendMessage(jid, { text: message });

    res.json({ 
      success: true, 
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Send message error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    res.status(500).json({ error: errorMessage });
  }
});

// Desconectar
app.post('/api/disconnect/:instanceName', async (req: Request, res: Response) => {
  const { instanceName } = req.params;

  const session = sessions.get(instanceName);
  if (session && session.socket) {
    await session.socket.logout();
    sessions.delete(instanceName);
    qrCodes.delete(instanceName);
  }

  res.json({ success: true, message: 'Disconnected successfully' });
});

app.listen(PORT, () => {
  console.log(`Baileys server running on port ${PORT}`);
});