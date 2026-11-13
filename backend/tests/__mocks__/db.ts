/**
 * tests/__mocks__/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Jest manual mock for the database module.
 * Intercepts all db.query() calls so unit/integration tests NEVER
 * touch a real PostgreSQL instance.
 *
 * Usage in tests:
 *   import { db } from '../db';
 *   (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const db = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'ok', latency_ms: 1 }),
  // Runs the callback with a client whose queries go through db.query (so routeDb mocks apply)
  transaction: jest.fn(async (cb: (client: any) => Promise<any>) => cb({ query: (...args: any[]) => (db.query as any)(...args) })),
  getClient: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
};
