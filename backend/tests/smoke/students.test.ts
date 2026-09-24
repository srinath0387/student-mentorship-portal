/**
 * tests/smoke/students.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smoke tests for the /students endpoints.
 * Verifies that routes are registered and that protected routes correctly
 * reject unauthenticated requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import request from 'supertest';
import app from '../../src/handlers/api';
import { db } from '../../src/db';

jest.mock('../../src/db');

// Helper: return a fake JWT-style auth header for tests
function bearerToken(role = 'student', email = 'test@rgmcet.edu.in') {
  // We don't use real JWT here — tests check auth rejection, not valid token scenarios
  return `Bearer fake-token-${role}-${email}`;
}

describe('Students Endpoints — Smoke Tests', () => {

  describe('GET /students (protected)', () => {
    it('should return 401 when no Authorization header provided', async () => {
      const res = await request(app).get('/students');
      expect([401, 403]).toContain(res.status);
    });

    it('should return 401 with malformed token', async () => {
      const res = await request(app)
        .get('/students')
        .set('Authorization', bearerToken());
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /students/:id (protected)', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/students/22B81A0566');
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /students/by-email/:email', () => {
    it('should be accessible (may return 404 for unknown email)', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app).get('/students/by-email/nobody@rgmcet.edu.in');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /students (protected)', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).post('/students').send({ name: 'Test Student' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /students/:id/coding-profiles (protected)', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/students/22B81A0566/coding-profiles');
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /students/:id/placement-profile (protected)', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/students/22B81A0566/placement-profile');
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /students/:id/employability-score (protected)', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/students/22B81A0566/employability-score');
      expect([401, 403]).toContain(res.status);
    });
  });
});
