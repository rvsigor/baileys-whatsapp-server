import express, { Request, Response } from 'express';
const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

export default router;