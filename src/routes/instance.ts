import { Router } from 'express';
import { 
  initializeInstance, 
  getInstanceStatus, 
  disconnectInstance 
} from '../whatsapp/client';
import { getQR } from '../redis/cache';

const router = Router();

// Initialize/Start instance
router.post('/start', async (req, res) => {
  try {
    const { instanceId } = req.body;
    
    if (!instanceId) {
      return res.status(400).json({ success: false, error: 'instanceId required' });
    }

    const result = await initializeInstance(instanceId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get QR code
router.get('/qr/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const qr = await getQR(instanceId);
    
    if (!qr) {
      return res.status(404).json({ success: false, error: 'QR not available' });
    }

    res.json({ success: true, qr });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get instance status
router.get('/status/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const status = await getInstanceStatus(instanceId);
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect instance
router.post('/disconnect', async (req, res) => {
  try {
    const { instanceId } = req.body;
    
    if (!instanceId) {
      return res.status(400).json({ success: false, error: 'instanceId required' });
    }

    await disconnectInstance(instanceId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;