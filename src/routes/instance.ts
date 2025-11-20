import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { startWhatsAppInstance, getClient } from '../whatsapp/client';
import { InstanceModel } from '../database/mongo';

const router = express.Router();

/**
 * POST /instance/start
 * body: { instanceId: string }
 */
router.post(
  '/start',
  body('instanceId').isString().trim().notEmpty(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { instanceId } = req.body;
    try {
      await startWhatsAppInstance(instanceId);
      await InstanceModel.updateOne(
        { instanceId },
        { status: 'starting' },
        { upsert: true }
      );
      return res.json({ ok: true, instanceId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'failed to start instance' });
    }
  }
);

router.get(
  '/status/:instanceId',
  async (req: Request, res: Response) => {
    const { instanceId } = req.params;
    const client = getClient(instanceId);
    const inst = await InstanceModel.findOne({ instanceId }).lean();
    return res.json({ instanceId, connected: !!client?.sock, meta: inst });
  }
);

export default router;