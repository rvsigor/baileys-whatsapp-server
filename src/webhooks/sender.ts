import axios from 'axios';
import { config } from '../config/environment';
import pino from 'pino';

const logger = pino();

export async function sendWebhook(event: string, instanceId: string, data: any) {
  if (!config.webhookUrl) {
    logger.warn('Webhook URL not configured, skipping webhook');
    return;
  }

  try {
    await axios.post(config.webhookUrl, {
      event,
      instance: instanceId,
      data,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': config.webhookSecret
      },
      timeout: 10000
    });
    
    logger.info(`Webhook sent: ${event} for ${instanceId}`);
  } catch (error: any) {
    logger.error(`Webhook failed: ${error.message}`);
  }
}