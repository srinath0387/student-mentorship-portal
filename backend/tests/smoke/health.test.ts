/**
 * tests/smoke/health.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smoke test: Verifies the health check endpoint responds correctly.
 * This is the canary — if this fails, the server won't start at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import request from 'supertest';
import app from '../../src/handlers/api';
import { db } from '../../src/db';

// Mock db so no real DB connection is attempted
jest.mock('../../src/db');

describe('GET /health', () => {
  beforeEach(() => {
    (db.healthCheck as jest.Mock).mockResolvedValue({ status: 'ok', latency_ms: 2 });
  });

  it('should return 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'advitiyans-api',
    });
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return JSON content-type', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
