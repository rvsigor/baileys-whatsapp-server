import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/environment';

export async function sendWebhook(payload: any): Promise<void> {
  if (!config.webhookUrl) {
    console.log('WEBHOOK_URL não configurada, pulando envio');
    return;
  }

  try {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    // Adicionar assinatura HMAC se webhookSecret estiver configurado
    if (config.webhookSecret) {
      const signature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');
      
      headers['X-Webhook-Signature'] = signature;
    }

    console.log('Enviando webhook para:', config.webhookUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    await axios.post(config.webhookUrl, payload, {
      headers,
      timeout: 5000
    });

    console.log('Webhook enviado com sucesso');
  } catch (err: any) {
    console.error('Erro ao enviar webhook:', err.message);
  }
}
