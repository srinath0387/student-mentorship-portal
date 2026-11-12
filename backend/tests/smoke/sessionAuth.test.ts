/**
 * tests/smoke/sessionAuth.test.ts
 * End-to-end checks that the API only trusts server-signed sessions:
 *  - client-built "demo_token_<role>_<email>" strings no longer grant access
 *  - signed tokens from the login endpoints do
 *  - previously unguarded data endpoints now require authentication
 */

import request from 'supertest';

// The shared DB mock (tests/__mocks__/db.ts, wired via moduleNameMapper) returns empty rows by default.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');

process.env.SESSION_SIGNING_SECRET = 'smoke-test-secret';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

describe('Session authentication', () => {
  it('rejects a forged client-side demo token for an oversight role', async () => {
    const res = await request(app)
      .get('/reports/placement-summary')
      .set('Authorization', 'Bearer demo_token_principal_principal%40rgmcet.edu.in_1700000000000');
    expect(res.status).toBe(401);
  });

  it('ignores X-Caller-Email when choosing identity', async () => {
    const res = await request(app)
      .get('/notifications/debug')
      .set('Authorization', 'Bearer demo_token_admin_x_1')
      .set('X-Caller-Email', 'admin@rgmcet.edu.in');
    expect(res.status).toBe(401);
  });

  it('accepts a server-signed oversight session', async () => {
    const token = signSessionToken({ role: 'principal', email: 'principal@rgmcet.edu.in' });
    const res = await request(app)
      .get('/reports/placement-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it.each([
    '/reports/placement-summary',
    '/reports/hod-analytics',
    '/reports/department/CSE',
    '/faculty/FAC001/mentees',
    '/faculty/mentees/by-email/someone%40rgmcet.edu.in',
    '/notifications/debug',
    '/student/mentor',
  ])('requires authentication for GET %s', async (path) => {
    const res = await request(app).get(path);
    expect([401, 403]).toContain(res.status);
  });

  it('admin-login attaches a signed token to successful logins only', async () => {
    const bad = await request(app).post('/auth/admin-login').send({ email: 'nobody@rgmcet.edu.in', password: 'x' });
    expect(bad.body.token).toBeUndefined();
  });

  it('parent-login verifies the password server-side and issues a working parent session', async () => {
    const wrong = await request(app).post('/auth/parent-login').send({ email: '23091a3251@rgmcet.edu.in', password: 'guess' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.token).toBeUndefined();

    db.query.mockResolvedValueOnce({ rows: [{ roll_number: '23091A3251', name: 'Test Student', department: 'CSE (Data Science)' }], rowCount: 1 });
    const ok = await request(app).post('/auth/parent-login').send({ email: 'parent_23091a3251@rgmcet.edu.in', password: '23091a3251' });
    expect(ok.status).toBe(200);
    expect(ok.body.valid).toBe(true);
    expect(typeof ok.body.token).toBe('string');

    // The parent session is accepted by authenticated routes (no 401/403)
    const mentor = await request(app).get('/student/mentor').set('Authorization', `Bearer ${ok.body.token}`);
    expect([401, 403]).not.toContain(mentor.status);
  });
});
