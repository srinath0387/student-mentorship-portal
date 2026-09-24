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

  if (!token) {
    if (
      (userRole === 'hod' || userRole === 'admin' || userRole === 'coordinator') &&
      userEmail
    ) {
      token = `demo_token_${userRole}_${encodeURIComponent(userEmail)}_${Date.now()}`;
      sessionStorage.setItem('advitiyans_jwt_token', token);
    } else {
      try {
        token = await getIdToken();
      } catch {
        /* ignore */
      }
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userEmail ? { 'X-Caller-Email': userEmail } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
      try {
        const text = await response.text();
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
      } else if (response.status === 413) {
        errMsg =
          'File size is too large (exceeds server limit). Please upload a file smaller than 4.5 MB.';
      } else if (response.status === 403) {
        errMsg = 'Permission denied. Please ensure you are logged in as Admin or HOD.';
      }
      throw new Error(errMsg);
    }

    return await response.json();
  } catch (err) {
    console.warn(`[API] Network call to ${endpoint} failed, utilizing local fallback state.`);
    throw err;
  }
}
