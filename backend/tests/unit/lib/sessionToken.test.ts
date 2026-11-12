/**
 * tests/unit/lib/sessionToken.test.ts
 * Server-signed session tokens must be unforgeable and expire.
 */

import { signSessionToken, verifySessionToken, SESSION_TOKEN_PREFIX } from '../../../src/lib/sessionToken';

describe('sessionToken', () => {
  beforeAll(() => {
    process.env.SESSION_SIGNING_SECRET = 'unit-test-secret';
  });

  it('round-trips role, email and reg', () => {
    const token = signSessionToken({ role: 'Principal', email: ' Principal@RGMCET.edu.in ', reg: '23091a3251' })!;
    expect(token.startsWith(SESSION_TOKEN_PREFIX)).toBe(true);
    const claims = verifySessionToken(token)!;
    expect(claims.role).toBe('principal');
    expect(claims.email).toBe('principal@rgmcet.edu.in');
    expect(claims.reg).toBe('23091A3251');
  });

  it('rejects a token whose payload was edited (privilege escalation attempt)', () => {
    const token = signSessionToken({ role: 'student', email: 's@rgmcet.edu.in' })!;
    const [, body, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), role: 'admin' })).toString('base64url');
    expect(verifySessionToken(`${SESSION_TOKEN_PREFIX}${forgedBody}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSessionToken({ role: 'admin', email: 'a@rgmcet.edu.in' })!;
    process.env.SESSION_SIGNING_SECRET = 'another-secret';
    expect(verifySessionToken(token)).toBeNull();
    process.env.SESSION_SIGNING_SECRET = 'unit-test-secret';
  });

  it('rejects expired tokens', () => {
    const realNow = Date.now;
    const token = signSessionToken({ role: 'admin', email: 'a@rgmcet.edu.in' })!;
    Date.now = () => realNow() + 8 * 24 * 60 * 60 * 1000;
    try {
      expect(verifySessionToken(token)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('rejects legacy client-built demo tokens and garbage', () => {
    expect(verifySessionToken('demo_token_admin_admin%40rgmcet.edu.in_123')).toBeNull();
    expect(verifySessionToken('sess.')).toBeNull();
    expect(verifySessionToken('sess.abc')).toBeNull();
    expect(verifySessionToken('')).toBeNull();
  });
});
