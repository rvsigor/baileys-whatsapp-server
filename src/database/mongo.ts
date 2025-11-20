import mongoose from 'mongoose';
import { config } from '../config/environment';
import pino from 'pino';

const logger = pino({ level: config.logLevel });

export async function connectMongo(): Promise<void> {
  if (!config.mongoUri) {
    logger.error('MONGODB_URI não está definida');
    throw new Error('MONGODB_URI não está definida');
  }

  try {
    await mongoose.connect(config.mongoUri, {
      // se quiser, você pode passar opções extras aqui
      // exemplo: useNewUrlParser, useUnifiedTopology — mas com Mongoose recente não é necessário
    });
    logger.info('✅ MongoDB conectado com sucesso');
  } catch (error: any) {
    logger.error('❌ Erro ao conectar no MongoDB:', error);
    throw error;
  }
}

// Modelo de instância (session)
import { Schema, model, Document } from 'mongoose';

export interface InstanceDoc extends Document {
  instanceId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeen?: Date;
}

const InstanceSchema = new Schema<InstanceDoc>({
  instanceId: { type: String, required: true, unique: true },
  status: { type: String, default: 'disconnected' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastSeen: { type: Date }
});

export const InstanceModel = model<InstanceDoc>('Instance', InstanceSchema);