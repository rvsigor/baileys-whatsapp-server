import mongoose from 'mongoose';
import { config } from '../config/environment';

export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.mongoUri, {
    dbName: 'baileys'
  });
  console.log('✅ MongoDB connected');
}

// Exemplo de modelo
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