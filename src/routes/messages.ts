import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { getClient } from '../whatsapp/client';

const router = express.Router();

// POST /messages/send
router.post(
  '/send',
  body('instanceId').isString().notEmpty(),
  body('to').isString().notEmpty(),
  body('message').isString().notEmpty(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { instanceId, to, message } = req.body;
    const client = getClient(instanceId);
    if (!client || !client.sock) {
      return res.status(400).json({ error: 'instance not connected' });
    }

    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      const result = await client.sock.sendMessage(jid, { text: message });
      return res.json({ ok: true, result });
    } catch (err: any) {
      console.error('Erro ao enviar mensagem:', err);
      return res.status(500).json({ error: err.message || 'send failed' });
    }
  }
);

export default router;