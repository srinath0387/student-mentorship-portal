/**
 * lib/apiClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 5 extraction — shared HTTP client infrastructure.
 *
 * Extracted from lib/api.ts so it can be imported by domain API slices
 * without circular dependency issues.
 *
 * Consumers: all domain API slice files (authApi, studentApi, etc.)
 * DO NOT import this file directly in components — use api.ts instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getIdToken } from './cognitoAuth';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://caam6j4dbh.execute-api.ap-south-1.amazonaws.com/prod';

// ── Request limiter ─────────────────────────────────────────────────────────
// The AWS account allows only a few concurrent Lambda executions. A dashboard that fires
// 15+ requests at once gets some of them throttled (API Gateway answers 500 "Internal server
// error" without running the function). Keep at most MAX_IN_FLIGHT requests per tab and
// queue the rest — they still complete in well under a second each.
const MAX_IN_FLIGHT = 6;
let inFlight = 0;
const waiting: (() => void)[] = [];
async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) { inFlight++; return; }
  await new Promise<void>(resolve => waiting.push(resolve));
  inFlight++;
}
function releaseSlot(): void {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const RETRY_DELAYS_MS = [250, 600, 1200];

/** API Gateway's own error (function never ran) — Lambda throttled, safe to retry for any method. */
function isGatewayThrottle(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status !== 500) return false;
  try { const p = JSON.parse(body); return p && p.message === 'Internal server error' && !('error' in p); }
  catch { return false; }
}

/** Fetch with the limiter and quick retries for throttling (and, for GETs, transient 502/503/504). */
async function fetchWithRetry(url: string, init: RequestInit): Promise<{ response: Response; body: string }> {
  const method = (init.method || 'GET').toUpperCase();
  for (let attempt = 0; ; attempt++) {
    await acquireSlot();
    let response: Response;
    let body = '';
    try {
      response = await fetch(url, init);
      body = await response.text();
    } finally {
      releaseSlot();
    }
    const transient = isGatewayThrottle(response.status, body) ||
      (method === 'GET' && [502, 503, 504].includes(response.status));
    if (!transient || attempt >= RETRY_DELAYS_MS.length) return { response, body };
    await sleep(RETRY_DELAYS_MS[attempt] + Math.random() * 150);
  }
}

/**
 * Authenticated fetch wrapper.
 *
 * Token resolution priority:
 *  1. sessionStorage JWT (tab-isolated — set on login)
 *  2. Cognito session (real JWT for students logged in via Cognito)
 *
 * Never falls through to Cognito if sessionStorage has a token, preventing
 * admin/HOD sessions from being overridden by a stale student Cognito token.
 */
export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  // ── Token resolution ───────────────────────────────────────────────────────
  const sessionToken = sessionStorage.getItem('advitiyans_jwt_token');
  let token: string | null = sessionToken;

  let userEmail = '';
  let userRole = '';
  try {
    const savedUser = sessionStorage.getItem('advitiyans_auth_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      userEmail = parsed.email || '';
      userRole = parsed.role || '';
    }
  } catch {
    /* ignore */
  }

  // Session tokens for admin/HOD/oversight/parent roles are issued by the server at login.
  // Only Cognito users can recover a missing token (via the Cognito session).
  if (!token && !['hod', 'admin', 'coordinator', 'director', 'principal', 'management', 'program_chair', 'parent'].includes(userRole)) {
    try {
      token = await getIdToken();
    } catch {
      /* ignore */
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const { response, body: responseText } = await fetchWithRetry(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
      try {
        const text = responseText;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            errMsg = parsed.message || parsed.error || errMsg;
          } catch {
            errMsg = text.length > 200 ? text.substring(0, 200) + '...' : text;
          }
        }
      } catch {
        /* ignore text parse error */
      }

      if (response.status === 401) {
        const isAuthEndpoint = endpoint.startsWith('/auth/');
        if (!isAuthEndpoint) {
          if (
            typeof window !== 'undefined' &&
            !window.location.hash.includes('login') &&
            !window.location.hash.includes('landing') &&
            window.location.hash !== '#/' &&
            window.location.hash !== ''
          ) {
            sessionStorage.removeItem('advitiyans_jwt_token');
            window.dispatchEvent(new CustomEvent('auth:session_expired'));
          }
          errMsg = 'Your session has expired. Please log in again.';
        }
      } else if (response.status === 413) {
        errMsg =
          'File size is too large (exceeds server limit). Please upload a file smaller than 4.5 MB.';
      } else if (response.status === 403) {
        errMsg = 'Permission denied. Please ensure you are logged in as Admin or HOD.';
      }
      throw new Error(errMsg);
    }

    return responseText ? JSON.parse(responseText) : null;
  } catch (err) {
    console.warn(`[API] Network call to ${endpoint} failed, utilizing local fallback state.`);
    throw err;
  }
}
