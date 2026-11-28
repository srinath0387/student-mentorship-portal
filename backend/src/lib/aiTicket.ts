import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// AI tickets — short-lived permission to ask the AI-drafting function for one draft.
//
// The API (inside the VPC, with the database) checks who is signed in and how many drafts they made
// today, then issues a ticket. The AI function (outside the VPC, no database) only checks the ticket.
//
// Format: aitk.<base64url(JSON payload)>.<base64url(HMAC)>, keyed with a key derived from
// SESSION_SIGNING_SECRET, so a ticket can never pass as a session token (other prefix, other key).
// ─────────────────────────────────────────────────────────────────────────────

export const AI_TICKET_PREFIX = 'aitk.';
export const AI_TICKET_SECONDS = 10 * 60;
export const AI_KINDS = ['exec_plan', 'profile'] as const;
export type AiKind = typeof AI_KINDS[number];

export interface AiTicketClaims {
  email: string;
  role: string;
  kind: AiKind;
  ref: string;   // what the draft is for (allotment id, or the faculty email for a profile)
  exp: number;   // seconds since epoch
}

function key(): string {
  const secret = process.env.SESSION_SIGNING_SECRET || process.env.ADMIN_SECRET || '';
  const base = secret || (process.env.NODE_ENV === 'test' || process.env.USE_MOCK === 'true' ? 'test-only-session-secret' : '');
  return base ? crypto.createHmac('sha256', base).update('advitiyans-ai-ticket-v1').digest('hex') : '';
}
const sign = (data: string, k: string) => crypto.createHmac('sha256', k).update(data).digest('base64url');

export function signAiTicket(c: Omit<AiTicketClaims, 'exp'>, now = Date.now()): string | undefined {
  const k = key();
  if (!k) return undefined;
  const body = Buffer.from(JSON.stringify({ ...c, exp: Math.floor(now / 1000) + AI_TICKET_SECONDS })).toString('base64url');
  return `${AI_TICKET_PREFIX}${body}.${sign(body, k)}`;
}

export function verifyAiTicket(token: string, now = Date.now()): AiTicketClaims | null {
  if (!token || !token.startsWith(AI_TICKET_PREFIX)) return null;
  const k = key();
  if (!k) return null;
  const rest = token.slice(AI_TICKET_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return null;
  const body = rest.slice(0, dot);
  const expected = Buffer.from(sign(body, k));
  const given = Buffer.from(rest.slice(dot + 1));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AiTicketClaims;
    if (!c || typeof c.exp !== 'number' || !(AI_KINDS as readonly string[]).includes(c.kind) || !c.email) return null;
    if (Math.floor(now / 1000) > c.exp) return null;
    return c;
  } catch {
    return null;
  }
}
