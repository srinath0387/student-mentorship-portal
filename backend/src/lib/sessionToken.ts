import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Server-signed session tokens for non-Cognito logins
// (admin, HOD, coordinator, oversight roles, parent, DB-password students).
//
// Format:  sess.<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
//
// The browser can no longer mint its own identity: only a token whose
// signature verifies against SESSION_SIGNING_SECRET is accepted.
// ─────────────────────────────────────────────────────────────────────────────

export const SESSION_TOKEN_PREFIX = 'sess.';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionClaims {
  role: string;
  email: string;
  reg?: string;   // optional registration number (e.g. a parent's ward roll number)
  iat: number;    // issued-at, seconds since epoch
}

function getSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET || process.env.ADMIN_SECRET || '';
  if (secret) return secret;
  if (process.env.NODE_ENV === 'test' || process.env.USE_MOCK === 'true') return 'test-only-session-secret';
  return '';
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Issue a signed session token. Returns undefined if no signing secret is configured,
 * in which case callers must treat the login as failed.
 */
export function signSessionToken(claims: { role: string; email: string; reg?: string }): string | undefined {
  const secret = getSecret();
  if (!secret) {
    console.error('[Session] SESSION_SIGNING_SECRET is not configured — cannot issue session token');
    return undefined;
  }
  const payload: SessionClaims = {
    role: String(claims.role || '').toLowerCase(),
    email: String(claims.email || '').toLowerCase().trim(),
    ...(claims.reg ? { reg: String(claims.reg).toUpperCase() } : {}),
    iat: Math.floor(Date.now() / 1000),
  };
  const body = b64url(JSON.stringify(payload));
  return `${SESSION_TOKEN_PREFIX}${body}.${sign(body, secret)}`;
}

/**
 * Verify a session token's signature and age. Returns its claims, or null if the
 * token is malformed, forged, or expired.
 */
export function verifySessionToken(token: string): SessionClaims | null {
  if (!token || !token.startsWith(SESSION_TOKEN_PREFIX)) return null;
  const secret = getSecret();
  if (!secret) return null;

  const rest = token.slice(SESSION_TOKEN_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return null;
  const body = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
    if (!claims || typeof claims.role !== 'string' || typeof claims.iat !== 'number') return null;
    const age = Math.floor(Date.now() / 1000) - claims.iat;
    if (age < -300 || age > MAX_AGE_SECONDS) return null;
    return claims;
  } catch {
    return null;
  }
}
