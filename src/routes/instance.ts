import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { startWhatsAppInstance, getClient, removeClient } from '../whatsapp/client';
import { InstanceModel } from '../database/mongo';
import { getQR } from '../redis/cache'; // Já existe no seu código


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
      const qr = await getQR(instanceId); // Buscar do Redis
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
    
    let logoutError = null;
    
    try {
      const client = getClient(instanceId);
      if (client?.sock) {
        try {
          await client.sock.logout();
          console.log(`[disconnect] Logout successful for ${instanceId}`);
        } catch (err) {
          console.log(`[disconnect] Logout error for ${instanceId}:`, err);
          logoutError = err;
          // ✅ NÃO LANÇA O ERRO - continua para remover do Map
        }
      }
    } catch (error) {
      console.error(`[disconnect] getClient error for ${instanceId}:`, error);
    }
    
    // ✅ SEMPRE remove do Map, independente de erros acima
    try {
      removeClient(instanceId);
      console.log(`[disconnect] Client removed from Map: ${instanceId}`);
    } catch (error) {
      console.error(`[disconnect] removeClient error:`, error);
    }
    
    // ✅ SEMPRE atualiza status no banco
    try {
      await InstanceModel.updateOne(
        { instanceId }, 
        { status: 'disconnected' }
      );
    } catch (error) {
      console.error(`[disconnect] DB update error:`, error);
    }
    
    // ✅ SEMPRE retorna sucesso (200), mesmo se logout falhou
    return res.json({ 
      ok: true, 
      message: 'disconnected',
      logoutError: logoutError instanceof Error ? logoutError.message : String(logoutError)
    });
  }
);

// POST /instance/force-delete
router.post('/force-delete', async (req: Request, res: Response) => {
  const { instanceId } = req.body;
  
  // Validação manual
  if (!instanceId || typeof instanceId !== 'string') {
    return res.status(400).json({ error: 'instanceId is required' });
  }
  
  console.log(`[force-delete] Forcefully deleting instance: ${instanceId}`);
  
  try {
    removeClient(instanceId);
    console.log(`[force-delete] Client removed from Map: ${instanceId}`);
  } catch (error) {
    console.error(`[force-delete] removeClient error:`, error);
  }
  
  try {
    await InstanceModel.updateOne(
      { instanceId }, 
      { status: 'disconnected' }
    );
  } catch (error) {
    console.error(`[force-delete] DB update error:`, error);
  }
  
  return res.json({ 
    ok: true, 
    message: 'Instance forcefully deleted' 
  });
});

export default router;