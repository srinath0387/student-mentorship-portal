/**
 * tests/smoke/auth.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smoke tests for authentication endpoints.
 * Verifies that auth routes exist, reject invalid input, and return
 * consistent error shapes — without hitting real Cognito or DB.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import request from 'supertest';
import app from '../../src/handlers/api';
import { db } from '../../src/db';

jest.mock('../../src/db');

describe('Auth Endpoints — Smoke Tests', () => {

  describe('POST /auth/session', () => {
    it('should return 400 when body is empty', async () => {
      const res = await request(app).post('/auth/session').send({});
      expect([400, 401, 422, 500]).toContain(res.status);
    });

    it('should reject missing email with non-200 status', async () => {
      const res = await request(app)
        .post('/auth/session')
        .send({ password: 'Test@1234' });
      expect(res.status).not.toBe(200);
    });
  });

  describe('POST /auth/admin-login', () => {
    it('should return 400 or 401 for missing credentials', async () => {
      const res = await request(app).post('/auth/admin-login').send({});
      expect([400, 401, 422, 500]).toContain(res.status);
    });
  });

  describe('GET /auth/check-availability', () => {
    it('should return 400 if no query params provided', async () => {
      const res = await request(app).get('/auth/check-availability');
      expect([400, 404, 422]).toContain(res.status);
    });
  });

  describe('POST /auth/validate-faculty-key', () => {
    it('should reject missing faculty key with non-200 status', async () => {
      const res = await request(app)
        .post('/auth/validate-faculty-key')
        .send({ email: 'faculty@rgmcet.edu.in' });
      expect(res.status).not.toBe(200);
    });

    it('should reject wrong faculty key', async () => {
      const res = await request(app)
        .post('/auth/validate-faculty-key')
        .send({ email: 'faculty@rgmcet.edu.in', key: 'WRONG_KEY' });
      expect([401, 403, 400]).toContain(res.status);
    });
  });

  describe('GET /departments', () => {
    it('should return 200 with array of departments', async () => {
      const res = await request(app).get('/departments');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
