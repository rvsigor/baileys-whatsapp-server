import express from 'express';
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

// API key middleware
app.use((req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (String(key) !== config.apiKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// routes
app.use('/instance', instanceRoutes);
app.use('/messages', messagesRoutes);
app.use('/health', healthRoutes);

async function startServer(): Promise<void> {
  await connectMongo();
  await connectRedis();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

startServer().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});