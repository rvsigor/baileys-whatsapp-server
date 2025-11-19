import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/environment';
import { connectMongo } from './database/mongo';
import { connectRedis } from './redis/cache';
import instanceRoutes from './routes/instance';
import messagesRoutes from './routes/messages';
import healthRoutes from './routes/health';
import pino from 'pino';

const logger = pino({ level: config.nodeEnv === 'production' ? 'info' : 'debug' });

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API Key validation middleware
const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  
  if (req.path === '/health') {
    return next();
  }
  
  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }
  
  next();
};

app.use(validateApiKey);

// Routes
app.use('/health', healthRoutes);
app.use('/api/instance', instanceRoutes);
app.use('/api/messages', messagesRoutes);

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ success: false, error: err.message });
});

// Initialize connections and start server
async function start() {
  try {
    await connectMongo();
    await connectRedis();
    
    app.listen(config.port, () => {
      logger.info(`🚀 Baileys WhatsApp Server running on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();