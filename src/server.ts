import express, { Request, Response, NextFunction } from 'express';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  WASocket,
  BaileysEventMap,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

// Store active sessions
const sessions = new Map<string, { socket: WASocket; qr: string | null; status: string; phone: string | null }>();

// Logger
const logger = pino({ level: 'info' });

// API Key middleware
const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ 
      success: false,
      error: 'Unauthorized - Invalid API Key' 
    });
  }
  
  next();
};

app.use(validateApiKey);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString() 
  });
});

// Initialize WhatsApp session
app.post('/api/init', async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.body;
    
    if (!instanceName) {
      return res.status(400).json({ 
        success: false,
        error: 'instanceName is required' 
      });
    }

    logger.info(`[${instanceName}] Initializing session`);

    // Check if session already exists
    if (sessions.has(instanceName)) {
      const existing = sessions.get(instanceName)!;
      
      if (existing.status === 'ready') {
        return res.json({
          success: true,
          status: 'ready',
          phone: existing.phone,
          message: 'Session already connected'
        });
      }
      
      if (existing.qr) {
        return res.json({
          success: true,
          status: 'qr_ready',
          qrCode: existing.qr,
          message: 'QR code available'
        });
      }
    }

    // Create new session
    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${instanceName}`);
    
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
    });

    let qrCodeData: string | null = null;
    let sessionStatus = 'connecting';
    let phoneNumber: string | null = null;

    // QR Code handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeData = await qrcode.toDataURL(qr);
          sessionStatus = 'qr_ready';
          
          const session = sessions.get(instanceName);
          if (session) {
            session.qr = qrCodeData;
            session.status = sessionStatus;
          }
          
          logger.info(`[${instanceName}] QR code generated`);
        } catch (error) {
          logger.error(`[${instanceName}] Error generating QR code:`, error);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.info(`[${instanceName}] Connection closed. Reconnect: ${shouldReconnect}`);
        
        if (!shouldReconnect) {
          sessions.delete(instanceName);
          sessionStatus = 'disconnected';
        }
      } else if (connection === 'open') {
        sessionStatus = 'ready';
        phoneNumber = sock.user?.id.split(':')[0] || null;
        qrCodeData = null;
        
        const session = sessions.get(instanceName);
        if (session) {
          session.status = sessionStatus;
          session.phone = phoneNumber;
          session.qr = null;
        }
        
        logger.info(`[${instanceName}] Connected successfully. Phone: ${phoneNumber}`);
      }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Store session
    sessions.set(instanceName, {
      socket: sock,
      qr: qrCodeData,
      status: sessionStatus,
      phone: phoneNumber
    });

    // Wait a bit for QR code generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    const session = sessions.get(instanceName)!;
    
    res.json({
      success: true,
      status: session.status,
      qrCode: session.qr,
      phone: session.phone,
      message: session.qr ? 'QR code generated' : 'Connecting...'
    });

  } catch (error: any) {
    logger.error('Init error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to initialize session' 
    });
  }
});

// Check session status
app.get('/api/status/:instanceName', (req: Request, res: Response) => {
  try {
    const { instanceName } = req.params;
    
    const session = sessions.get(instanceName);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        status: 'disconnected',
        message: 'Instance not found'
      });
    }

    res.json({
      success: true,
      status: session.status,
      phone: session.phone,
      qrCode: session.qr,
      message: `Session status: ${session.status}`
    });

  } catch (error: any) {
    logger.error('Status check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to check status' 
    });
  }
});

// Send message
app.post('/api/send-message', async (req: Request, res: Response) => {
  try {
    const { instanceName, phoneNumber, message, mediaUrl, mediaType } = req.body;

    if (!instanceName || !phoneNumber || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'instanceName, phoneNumber and message are required' 
      });
    }

    const session = sessions.get(instanceName);
    
    if (!session || session.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: 'Session not connected'
      });
    }

    const formattedNumber = phoneNumber.includes('@s.whatsapp.net') 
      ? phoneNumber 
      : `${phoneNumber}@s.whatsapp.net`;

    let sentMessage;

    if (mediaUrl) {
      // Send media message
      if (mediaType === 'image') {
        sentMessage = await session.socket.sendMessage(formattedNumber, {
          image: { url: mediaUrl },
          caption: message
        });
      } else if (mediaType === 'video') {
        sentMessage = await session.socket.sendMessage(formattedNumber, {
          video: { url: mediaUrl },
          caption: message
        });
      } else {
        sentMessage = await session.socket.sendMessage(formattedNumber, {
          document: { url: mediaUrl },
          mimetype: 'application/pdf',
          fileName: 'document.pdf'
        });
      }
    } else {
      // Send text message
      sentMessage = await session.socket.sendMessage(formattedNumber, {
        text: message
      });
    }

    logger.info(`[${instanceName}] Message sent to ${phoneNumber}`);

    res.json({
      success: true,
      messageId: sentMessage?.key?.id,
      message: 'Message sent successfully'
    });

  } catch (error: any) {
    logger.error('Send message error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to send message' 
    });
  }
});

// Disconnect session
app.post('/api/disconnect/:instanceName', async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.params;
    
    const session = sessions.get(instanceName);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Instance not found'
      });
    }

    await session.socket.logout();
    sessions.delete(instanceName);
    
    logger.info(`[${instanceName}] Session disconnected`);

    res.json({
      success: true,
      status: 'disconnected',
      message: 'Session disconnected successfully'
    });

  } catch (error: any) {
    logger.error('Disconnect error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to disconnect session' 
    });
  }
});

app.listen(PORT, () => {
  logger.info(`Your Baileys WhatsApp Server running on port ${PORT}`);
});