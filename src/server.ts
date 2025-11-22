import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from './config/environment';
import { connectMongo } from './database/mongo';
import { connectRedis } from './redis/cache';
import instanceRoutes from './routes/instance';
import messagesRoutes from './routes/messages';
import healthRoutes from './routes/health';
import pino from 'pino';

const logger = pino({ level: config.logLevel });
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax
});
app.use(limiter);

// Autenticação simples via API Key
app.use((req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (String(key) !== config.apiKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[request] ${req.method} ${req.path}`);
  console.log(`[request] Body:`, JSON.stringify(req.body));
  console.log(`[request] Headers:`, JSON.stringify(req.headers));
  next();
});

app.use('/instance', instanceRoutes);
app.use('/messages', messagesRoutes);
app.use('/health', healthRoutes);

async function startServer(): Promise<void> {
  try {
    await connectMongo();
    await connectRedis();
    app.listen(config.port, () => {
      logger.info(`Servidor rodando na porta ${config.port}`);
    });
  } catch (error: any) {
    logger.error('Erro na inicialização:', error);
    process.exit(1);
  }
}

startServer();