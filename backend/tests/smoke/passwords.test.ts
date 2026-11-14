/**
 * tests/smoke/passwords.test.ts — staff password changes: only the new password works,
 * older sessions are signed out, the current password is required, defaults are refused.
 */
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'passwords-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

type Route = [RegExp | string, any[] | ((sql: string, params: any[]) => any[])];
function routeDb(routes: Route[]) {
  const calls: { sql: string; params: any[] }[] = [];
  db.query.mockReset();
  db.query.mockImplementation(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    for (const [m, rows] of routes) {
      if (typeof m === 'string' ? sql.includes(m) : m.test(sql)) {
        const r = typeof rows === 'function' ? rows(sql, params) : rows;
        return { rows: r, rowCount: r.length };
      }
    }
    return { rows: [], rowCount: 0 };
  });
  return calls;
}
const bearer = (role: string, email: string) => `Bearer ${signSessionToken({ role, email })}`;
const tokenAt = (role: string, email: string, iat: number) => {
  // a token issued at a chosen time (to simulate a session from before a password change)
  const crypto = require('crypto');
  const body = Buffer.from(JSON.stringify({ role, email, iat })).toString('base64url');
  return `Bearer sess.${body}.${crypto.createHmac('sha256', 'passwords-test-secret').update(body).digest('base64url')}`;
};
let HASH_OLD = '';
beforeAll(async () => { HASH_OLD = await bcrypt.hash('Principal2025', 4); });
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

describe('Self-service password change (PUT /auth/my-password)', () => {
  const PRIN = 'principal@rgmcet.edu.in';
  const acct = () => [['FROM super_admin_credentials WHERE LOWER(email)', []], ['FROM admin_accounts WHERE LOWER(email)', [{ email: PRIN, password: HASH_OLD }]]] as Route[];

  it('refuses a wrong current password', async () => {
    routeDb(acct());
    const res = await request(app).put('/auth/my-password').set('Authorization', bearer('principal', PRIN))
      .send({ current_password: 'nope', new_password: 'NewPass2026' });
    expect(res.status).toBe(401);
  });

  it('refuses weak, default and unchanged passwords', async () => {
    routeDb(acct());
    const weak = await request(app).put('/auth/my-password').set('Authorization', bearer('principal', PRIN)).send({ current_password: 'Principal2025', new_password: 'short1' });
    expect(weak.status).toBe(400);
    const dflt = await request(app).put('/auth/my-password').set('Authorization', bearer('principal', PRIN)).send({ current_password: 'Principal2025', new_password: 'principal@2026' });
    expect(dflt.body.error).toMatch(/default password/);
    const same = await request(app).put('/auth/my-password').set('Authorization', bearer('principal', PRIN)).send({ current_password: 'Principal2025', new_password: 'Principal2025' });
    expect(same.body.error).toMatch(/different/);
  });

  it('saves a bcrypt hash, stamps the change time and returns a fresh session', async () => {
    const calls = routeDb(acct());
    const res = await request(app).put('/auth/my-password').set('Authorization', bearer('principal', PRIN))
      .send({ current_password: 'Principal2025', new_password: 'Campus#2026x' });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^sess\./);
    const upd = calls.find(c => c.sql.startsWith('UPDATE admin_accounts SET password = $1, password_changed_at'))!;
    expect(upd.params[0]).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('Campus#2026x', upd.params[0])).toBe(true);
    expect(await bcrypt.compare('Principal2025', upd.params[0])).toBe(false);
  });
});

describe('Old sessions stop working after a password change', () => {
  const now = Math.floor(Date.now() / 1000);
  const changedAt = new Date((now - 60) * 1000).toISOString(); // changed a minute ago
  const rows: Route[] = [['SELECT password_changed_at FROM', [{ password_changed_at: changedAt }]]];

  it('principal / director / management / program chair: a session from before the change is rejected', async () => {
    routeDb(rows);
    expect((await request(app).get('/notify/config').set('Authorization', tokenAt('principal', 'principal@rgmcet.edu.in', now - 3600))).status).toBe(401);
    routeDb(rows);
    expect((await request(app).get('/clubs/meta').set('Authorization', tokenAt('principal', 'principal@rgmcet.edu.in', now))).status).toBe(200);
  });

  it('HOD: an old session is rejected, the new one works', async () => {
    const hod: Route[] = [['SELECT department FROM hod_credentials', [{ department: 'CSE (Data Science)' }]], ...rows];
    routeDb(hod);
    expect((await request(app).get('/clubs/meta').set('Authorization', tokenAt('hod', 'hcseds@rgmcet.edu.in', now - 3600))).status).toBe(401);
    routeDb(hod);
    expect((await request(app).get('/clubs/meta').set('Authorization', tokenAt('hod', 'hcseds@rgmcet.edu.in', now))).status).toBe(200);
  });

  it('a missing column never locks anyone out', async () => {
    db.query.mockReset();
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('password_changed_at')) throw new Error('column "password_changed_at" does not exist');
      return { rows: [], rowCount: 0 };
    });
    expect((await request(app).get('/clubs/meta').set('Authorization', bearer('principal', 'principal@rgmcet.edu.in'))).status).toBe(200);
  });
});

describe('HOD logins', () => {
  it('only the saved password works — no fallback to another store', async () => {
    routeDb([['FROM hod_credentials WHERE LOWER(email) = $1', [{ email: 'hcseds@rgmcet.edu.in', password: HASH_OLD, department: 'CSE (Data Science)' }]]]);
    const res = await request(app).post('/auth/admin-login').send({ email: 'hcseds@rgmcet.edu.in', password: 'hod@2026' });
    expect(res.status).toBe(401);
  });

  it('after a HOD changes their login email, the old email + default password cannot log in', async () => {
    routeDb([['SELECT 1 FROM hod_credentials WHERE LOWER(department)', [{ '?column?': 1 }]]]);
    const res = await request(app).post('/auth/admin-login').send({ email: 'hcseds@rgmcet.edu.in', password: 'hod@2026' });
    expect(res.status).toBe(401);
  });

  it('changing HOD credentials needs the current password and stays in the HOD\'s own department', async () => {
    const hodRow: Route = ['SELECT department FROM hod_credentials WHERE LOWER(email)', [{ department: 'CSE (Data Science)' }]];
    routeDb([hodRow, ['SELECT email, password FROM hod_credentials WHERE LOWER(department)', [{ email: 'hcseds@rgmcet.edu.in', password: HASH_OLD }]]]);
    const noCur = await request(app).put('/auth/hod-credentials').set('Authorization', bearer('hod', 'hcseds@rgmcet.edu.in')).send({ new_password: 'Strong2026pw', department: 'ECE' });
    expect(noCur.status).toBe(401);
    const calls = routeDb([hodRow, ['SELECT email, password FROM hod_credentials WHERE LOWER(department)', [{ email: 'hcseds@rgmcet.edu.in', password: HASH_OLD }]], ['UPDATE hod_credentials SET email', [{}]]]);
    const ok = await request(app).put('/auth/hod-credentials').set('Authorization', bearer('hod', 'hcseds@rgmcet.edu.in'))
      .send({ current_password: 'Principal2025', new_password: 'Strong2026pw', department: 'ECE' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toMatch(/^sess\./);
    const upd = calls.find(c => c.sql.startsWith('UPDATE hod_credentials SET email'))!;
    expect(upd.sql).toContain('password_changed_at');
    expect(upd.params[2]).toBe('CSE (Data Science)'); // ECE in the body is ignored for a HOD
  });
});

describe('Startup setup never resets changed passwords', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/db/index.ts'), 'utf8');
  it('admin / oversight seed keeps existing passwords', () => {
    expect(src).not.toMatch(/admin_accounts[\s\S]{0,4000}ON CONFLICT \(email\) DO UPDATE SET department = EXCLUDED\.department, password = EXCLUDED\.password/);
  });
  it('HOD seed only creates missing departments and no longer deletes row 1', () => {
    expect(src).not.toContain('DELETE FROM hod_credentials WHERE id = 1');
    expect(src).not.toMatch(/INSERT INTO hod_credentials[^`]*ON CONFLICT \(email\) DO UPDATE/);
  });
});
