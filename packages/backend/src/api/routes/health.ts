import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/status', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    features: {
      notifications: process.env.FEATURE_NOTIFICATIONS_ENABLED === 'true',
      agent: process.env.FEATURE_AGENT_ENABLED === 'true',
    },
  });
});

export default router;
