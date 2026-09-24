/**
 * routes/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3 — Central router registry.
 * Imports all domain routers and mounts them at their base paths.
 *
 * This is the ONLY file api.ts needs to import to get all routes.
 * Add new domain routers here — no changes to api.ts needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';

// Domain routers
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import studentRouter from './student.routes';
import facultyRouter from './faculty.routes';
import attendanceRouter from './attendance.routes';
import reportsRouter from './reports.routes';
import proxyRouter from './proxy.routes';
import adminRouter from './admin.routes';
import coordinatorRouter from './coordinator.routes';

const rootRouter = Router();

// ─── Mount domain routers ─────────────────────────────────────────────────────
//
// Convention: each router owns its full URL prefix.
// e.g. authRouter handles /auth/*, studentRouter handles /students/* etc.
//
rootRouter.use('/', healthRouter);
rootRouter.use('/auth', authRouter);
rootRouter.use('/students', studentRouter);
rootRouter.use('/faculty', facultyRouter);
rootRouter.use('/attendance', attendanceRouter);
rootRouter.use('/reports', reportsRouter);
rootRouter.use('/proxy', proxyRouter);
rootRouter.use('/admin', adminRouter);
rootRouter.use('/', coordinatorRouter);   // coordinator owns /departments, /class-incharge, etc.

export default rootRouter;
