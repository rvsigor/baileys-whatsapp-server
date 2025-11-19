import { Router } from 'express';
import { sendMessage } from '../whatsapp/client';

const router = Router();

router.post('/send', async (req, res) => {
  try {
    const { instanceId, to, message, media } = req.body;
    
    if (!instanceId || !to || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'instanceId, to, and message are required' 
      });
    }

    await sendMessage(instanceId, to, message, media);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;