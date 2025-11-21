import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { startWhatsAppInstance, getClient } from '../whatsapp/client';
import { InstanceModel } from '../database/mongo';

const router = express.Router();

// POST /instance/start
router.post(
  '/start',
  body('instanceId').isString().trim().notEmpty(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { instanceId } = req.body;
    try {
      await startWhatsAppInstance(instanceId);
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'starting' },
        { upsert: true }
      );
      return res.json({ ok: true, instanceId });
    } catch (error: any) {
      console.error('Erro ao iniciar instância:', error);
      return res.status(500).json({ error: 'failed to start instance' });
    }
  }
);

// GET /instance/status/:instanceId
router.get(
  '/status/:instanceId',
  async (req: Request, res: Response) => {
    const { instanceId } = req.params;
    const client = getClient(instanceId);
    const inst = await InstanceModel.findOne({ instanceId }).lean();
    return res.json({ instanceId, connected: !!client?.sock, meta: inst });
  }
);

// GET /instance/qr/:instanceId
router.get(
  '/qr/:instanceId',
  async (req: Request, res: Response) => {
    const { instanceId } = req.params;
    try {
      const qr = await getQRFromRedis(instanceId); // Buscar do Redis
      if (!qr) {
        return res.status(404).json({ error: 'QR not found. Start instance first.' });
      }
      return res.json({ instanceId, qr });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
);

// POST /instance/disconnect
router.post(
  '/disconnect',
  body('instanceId').isString().trim().notEmpty(),
  async (req: Request, res: Response) => {
    const { instanceId } = req.body;
    try {
      const client = getClient(instanceId);
      if (client?.sock) {
        await client.sock.logout();
      }
      removeClient(instanceId); // Função para remover do Map
      await InstanceModel.updateOne({ instanceId }, { status: 'disconnected' });
      return res.json({ ok: true, message: 'disconnected' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
);

export default router;