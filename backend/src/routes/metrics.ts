import { Router } from 'express';
import { metricsHandler } from '../middleware/apm';

const router = Router();

router.get('/metrics', metricsHandler);

export default router;
