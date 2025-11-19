// server.js
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY || 'your-secure-api-key';

// Store active sessions
const sessions = new Map();

// Middleware to validate API key
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(validateApiKey);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

// Initialize WhatsApp connection
app.post('/api/init', async (req, res) => {
  try {
    const { organizationId } = req.body;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    console.log(`[Init] Starting session for: ${organizationId}`);

    const { state, saveCreds } = await useMultiFileAuthState(`./auth/${organizationId}`);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    let qrCode = null;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCode = await QRCode.toDataURL(qr);
        console.log(`[${organizationId}] QR Code generated`);
      }

      if (connection === 'open') {
        console.log(`[${organizationId}] Connected successfully`);
        sessions.set(organizationId, {
          sock,
          status: 'ready',
          phoneNumber: sock.user?.id?.split(':')[0]
        });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[${organizationId}] Connection closed. Reconnect:`, shouldReconnect);
        
        sessions.delete(organizationId);
        
        if (shouldReconnect) {
          // Auto reconnect
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sessions.set(organizationId, {
      sock,
      status: 'connecting',
      qrCode
    });

    // Wait a bit for QR code
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const session = sessions.get(organizationId);
    
    res.json({
      success: true,
      qrCode: session?.qrCode || qrCode,
      status: session?.status || 'connecting'
    });

  } catch (error) {
    console.error('[Init] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check status
app.get('/api/status/:instanceName', (req, res) => {
  const { instanceName } = req.params;
  const session = sessions.get(instanceName);

  if (!session) {
    return res.status(404).json({
      success: false,
      status: 'disconnected',
      message: 'Session not found'
    });
  }

  res.json({
    success: true,
    status: session.status,
    phoneNumber: session.phoneNumber
  });
});

// Send message
app.post('/api/send-message', async (req, res) => {
  try {
    const { organizationId, phoneNumber, message, mediaUrl, mediaType } = req.body;

    const session = sessions.get(organizationId);
    if (!session || session.status !== 'ready') {
      return res.status(400).json({ error: 'Session not ready' });
    }

    const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
    
    let result;
    if (mediaUrl) {
      // Send media message
      result = await session.sock.sendMessage(jid, {
        [mediaType]: { url: mediaUrl },
        caption: message
      });
    } else {
      // Send text message
      result = await session.sock.sendMessage(jid, { text: message });
    }

    res.json({
      success: true,
      messageId: result.key.id
    });

  } catch (error) {
    console.error('[SendMessage] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect
app.post('/api/disconnect/:instanceName', async (req, res) => {
  const { instanceName } = req.params;
  const session = sessions.get(instanceName);

  if (session) {
    await session.sock.logout();
    sessions.delete(instanceName);
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Baileys server running on port ${PORT}`);
});