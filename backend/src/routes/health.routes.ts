/**
 * routes/health.routes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3: Health check and system utility routes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { logger } from '../lib/logger';

const router = Router();

/**
 * GET /health
 * Liveness + readiness check. Returns DB status.
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbStatus = await db.healthCheck();
    res.json({
      status: 'ok',
      service: 'advitiyans-api',
      timestamp: new Date().toISOString(),
      db: dbStatus,
    });
  } catch (err: any) {
    logger.warn('Health check DB failure', err);
    res.status(503).json({
      status: 'degraded',
      service: 'advitiyans-api',
      timestamp: new Date().toISOString(),
      db: { status: 'error', message: err.message },
    });
  }
});

/**
 * GET /departments
 * Returns the list of valid departments.
 * Public endpoint (no auth required).
 */
router.get('/departments', (_req: Request, res: Response) => {
  res.json([
    'CSE', 'CSE (AIML)', 'CSE (DS)', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'MBA', 'MCA',
  ]);
});

export default router;
