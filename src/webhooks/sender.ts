import axios from 'axios';
import { config } from '../config/environment';

export async function sendWebhook(payload: any): Promise<void> {
  if (!config.webhookUrl) return;
  try {
    await axios.post(config.webhookUrl, payload, {
      timeout: 5000
      // Se tiver webhookSecret, você pode assinar o payload e adicionar header aqui
    });
  } catch (err: any) {
    console.error('Erro ao enviar webhook:', err);
  }
}