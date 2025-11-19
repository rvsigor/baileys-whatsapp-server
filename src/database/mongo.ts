import mongoose from 'mongoose';
import { config } from '../config/environment';
import pino from 'pino';

const logger = pino();

// Schema para sessões do Baileys
const SessionSchema = new mongoose.Schema({
  instanceId: { type: String, required: true, unique: true },
  authState: { type: Object, required: true },
  lastSeen: { type: Date, default: Date.now },
  phoneNumber: String,
  status: { type: String, enum: ['connecting', 'ready', 'disconnected'], default: 'connecting' },
}, { timestamps: true });

export const SessionModel = mongoose.model('Session', SessionSchema);

export async function connectMongo() {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('✅ MongoDB connected');
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

export async function saveSession(instanceId: string, authState: any, phoneNumber?: string) {
  await SessionModel.findOneAndUpdate(
    { instanceId },
    { 
      authState, 
      phoneNumber,
      lastSeen: new Date(),
      status: 'ready'
    },
    { upsert: true }
  );
}

export async function getSession(instanceId: string) {
  return await SessionModel.findOne({ instanceId });
}

export async function deleteSession(instanceId: string) {
  await SessionModel.deleteOne({ instanceId });
}