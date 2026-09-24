/**
 * routes/auth.routes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3: Auth route stubs — routes registered here in Phase 4.
 * During Phase 3, api.ts still holds the actual handlers and registers them
 * on app directly. This router is mounted but not yet used for auth routes.
 *
 * Phase 4 will migrate each handler here one by one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';

const router = Router();

// Auth handlers are still in api.ts (migrated to this router in Phase 4)
// Routes:
//   POST /auth/admin-login
//   POST /auth/hod-login
//   POST /auth/session
//   POST /auth/validate-faculty-key
//   GET  /auth/check-availability
//   POST /auth/logout

export default router;
