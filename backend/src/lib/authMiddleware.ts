import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { db } from '../db';
import { getDeptFromRollNumber, DEPARTMENT_CODE_MAP } from './validation';
import { verifySessionToken, SESSION_TOKEN_PREFIX } from './sessionToken';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware for Advitiyans API
//
// Three layers:
//   1. extractAuth   — cryptographically verifies Cognito JWT or checks session. Sets req.auth.
//   2. requireAuth   — blocks if req.auth is null (no valid identity).
//   3. requireRole   — blocks if req.auth.role not in allowed list.
//   4. requireOwnerOrRole — blocks if user is a student and doesn't own the resource.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthPayload {
  email: string;
  role: string;   // 'student' | 'faculty' | 'hod' | 'admin'
  regNo: string;  // roll_number or faculty_id
  name?: string;
  department?: string;  // department name for scoped access
  isSuperAdmin?: boolean;  // true for the 3 super admin emails
}

// Extend Express Request to carry auth info
declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload | null;
    }
  }
}

const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID || 'ap-south-1_sYp8CvKjn';
const clientId = process.env.COGNITO_CLIENT_ID || process.env.CLIENT_ID || '6ufn4tstvrk6718ujcsjun6lpe';

// Lazy-initialized verifier for cryptographic signature check
let cognitoIdVerifier: any = null;

function getCognitoVerifier() {
  if (!cognitoIdVerifier && userPoolId && userPoolId.includes('_')) {
    try {
      cognitoIdVerifier = CognitoJwtVerifier.create({
        userPoolId: userPoolId,
        tokenUse: 'id',
        clientId: clientId || null,
      });
    } catch (e: any) {
      console.warn('[Cognito Verifier Init Warning]:', e.message);
    }
  }
  return cognitoIdVerifier;
}

/**
 * Decode a JWT payload (base64url) without cryptographic verification.
 * Used ONLY as fallback in offline/mock test environments.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    if (token.startsWith('demo_token_')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Cryptographically verify a Cognito JWT against AWS Cognito JWKS.
 * Returns verified claims or null if invalid/expired.
 */
async function verifyJwt(token: string): Promise<Record<string, any> | null> {
  if (!token || token.startsWith('demo_token_') || token.startsWith(SESSION_TOKEN_PREFIX)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const verifier = getCognitoVerifier();
  if (verifier) {
    try {
      const verified = await verifier.verify(token);
      return verified as Record<string, any>;
    } catch (verifyErr: any) {
      console.warn('[JWT Cryptographic Verification Warning]:', verifyErr.message);
      // If cryptographic verification failed due to signature mismatch or expiry, reject immediately
      return null;
    }
  }

  // Fallback for mock/test environments
  if (process.env.USE_MOCK === 'true' || process.env.NODE_ENV === 'test') {
    return decodeJwtPayload(token);
  }

  return null;
}

/**
 * True when the account's password was changed after this session token was issued —
 * every session from before a password change stops working (other devices are signed out).
 * Tables: super_admin_credentials / admin_accounts / hod_credentials (column password_changed_at).
 * Any lookup error is treated as "not changed" so a missing column can never lock everyone out.
 */
const PASSWORD_TABLES = ['super_admin_credentials', 'admin_accounts', 'hod_credentials'] as const;
export async function passwordChangedSince(table: typeof PASSWORD_TABLES[number], email: string, iat: number): Promise<boolean> {
  if (db.isMock || !PASSWORD_TABLES.includes(table) || !email || !iat) return false;
  try {
    const r = await db.query(`SELECT password_changed_at FROM ${table} WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]);
    const changed = r.rows[0]?.password_changed_at;
    return !!changed && new Date(changed).getTime() > (iat + 1) * 1000;
  } catch {
    return false;
  }
}

/**
 * extractAuth — Non-blocking middleware. Runs on every request.
 *
 * Attempts to identify the caller via:
 *   1. Cryptographically verified Cognito JWT in Authorization header
 *   2. Session-based fallback (for offline dev / mock mode)
 *
 * Sets req.auth = { email, role, regNo } or req.auth = null.
 * NEVER returns 401 — downstream guards decide access.
 */
export async function extractAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.auth = null;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    // SECURITY: X-Caller-Email header is intentionally NOT trusted.
    // Caller identity is derived exclusively from the validated JWT token payload.
    // This prevents privilege escalation via header injection.

    const token = authHeader.slice(7);

    // ── Attempt 1: Cryptographically verify Cognito JWT ──
    const payload = await verifyJwt(token);
    if (payload && payload.email) {
      const email = (payload.email || '').toLowerCase().trim();
      const derivedRegNo = (payload['custom:reg_no'] || (email.includes('@') ? email.split('@')[0] : '')).toUpperCase();
      let role = (payload['custom:role'] || '').toLowerCase();
      let department: string | undefined;
      let facName: string | undefined;

      // DB lookup to resolve actual role, department, and name
      if (email && !db.isMock) {
        try {
          // 1. Check users table
          const userCheck = await db.query(
            'SELECT role, name, department FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]
          );
          if (userCheck.rows.length > 0) {
            const u = userCheck.rows[0];
            if (!role || role === 'student') role = (u.role || role || '').toLowerCase();
            facName = u.name || undefined;
            department = u.department || undefined;
          }

          // 2. Check faculty table
          const facCheck = await db.query(
            'SELECT department, name FROM faculty WHERE LOWER(email) = $1 LIMIT 1', [email]
          );
          if (facCheck.rows.length > 0) {
            if (!role || role === 'student') role = 'faculty';
            department = department || facCheck.rows[0].department || undefined;
            facName = facName || facCheck.rows[0].name || undefined;
          }

          // 3. Check subject_allotments table (if faculty is allotted subjects)
          if (!role || role === 'student') {
            const allotCheck = await db.query(
              'SELECT faculty_name, department FROM subject_allotments WHERE LOWER(faculty_email) = $1 LIMIT 1', [email]
            );
            if (allotCheck.rows.length > 0) {
              role = 'faculty';
              department = department || allotCheck.rows[0].department || undefined;
              facName = facName || allotCheck.rows[0].faculty_name || undefined;
            }
          }

          // 4. Check hod_credentials
          if (!department || role === 'hod') {
            const hodCheck = await db.query(
              'SELECT department FROM hod_credentials WHERE LOWER(email) = $1 LIMIT 1', [email]
            );
            if (hodCheck.rows.length > 0) {
              role = role || 'hod';
              department = department || hodCheck.rows[0].department || undefined;
            }
          }
        } catch { /* degrade gracefully */ }
      }

      if (!role) role = 'student';

      if (role === 'student' && derivedRegNo.length === 10 && !department) {
        department = getDeptFromRollNumber(derivedRegNo);
      }

      req.auth = {
        email,
        role,
        regNo: derivedRegNo,
        department,
        ...(facName ? { name: facName } : {}),
      } as any;
      return next();
    }

    // ── Attempt 2: Server-signed session tokens ──
    // Issued by the backend only after a successful credential check (admin, HOD, coordinator,
    // oversight roles, parent, DB-password students). Role and email come exclusively from the
    // HMAC-verified token — never from headers, query strings, or request bodies.
    const session = verifySessionToken(token);
    if (session) {
      const demoRole = session.role;
      const email = session.email;

      if (demoRole === 'parent' && email && session.reg) {
        req.auth = {
          email,
          role: 'parent',
          regNo: session.reg,
          department: getDeptFromRollNumber(session.reg) || undefined,
        };
        return next();
      }

      if (demoRole === 'admin' && email) {
        let adminDept: string | undefined;
        let superAdmin = false;
        let verified = false;

        if (!db.isMock) {
          try {
            const saCheck = await db.query(
              'SELECT 1 FROM super_admin_credentials WHERE LOWER(email) = LOWER($1)', [email]
            );
            if (saCheck.rows.length > 0) {
              superAdmin = true;
              adminDept = '*'; // super admin sees all
              verified = true;
            } else {
              const adminCheck = await db.query(
                'SELECT department FROM admin_accounts WHERE LOWER(email) = LOWER($1)', [email]
              );
              if (adminCheck.rows.length > 0) {
                adminDept = adminCheck.rows[0].department || undefined;
                verified = true;
              }
            }
          } catch { /* ignore */ }
        } else {
          verified = true;
          superAdmin = true;
        }

        if (verified && await passwordChangedSince(superAdmin ? 'super_admin_credentials' : 'admin_accounts', email, session.iat)) {
          return next(); // signed in before the last password change → must sign in again
        }
        if (verified) {
          req.auth = {
            email: email,
            role: 'admin',
            regNo: 'ADMIN',
            department: adminDept,
            isSuperAdmin: superAdmin,
          };
          return next();
        }
      }

      if (demoRole === 'hod' && email) {
        let hodDept: string | undefined;
        let verified = false;

        if (!db.isMock) {
          try {
            const hodCheck = await db.query(
              'SELECT department FROM hod_credentials WHERE LOWER(email) = LOWER($1)', [email]
            );
            if (hodCheck.rows.length > 0) {
              hodDept = hodCheck.rows[0].department || undefined;
              verified = true;
            }
            if (!hodDept) {
              const facCheck = await db.query(
                'SELECT department FROM faculty WHERE LOWER(email) = LOWER($1)', [email]
              );
              if (facCheck.rows.length > 0) {
                hodDept = facCheck.rows[0].department || undefined;
                verified = true;
              }
            }
          } catch { /* ignore */ }
        } else {
          verified = true;
        }

        if (verified && await passwordChangedSince('hod_credentials', email, session.iat)) {
          return next(); // signed in before the last password change → must sign in again
        }
        if (verified) {
          req.auth = {
            email: email,
            role: 'hod',
            regNo: hodDept ? `HOD_${hodDept.replace(/[^A-Za-z]/g, '').toUpperCase()}` : 'HOD',
            department: hodDept,
          };
          return next();
        }
      }

      if (demoRole === 'coordinator' && email) {
        if (await passwordChangedSince('admin_accounts', email, session.iat)) return next();
        req.auth = {
          email: email,
          role: 'coordinator',
          regNo: 'COORDINATOR_1ST_YEAR',
          department: 'All',
        };
        return next();
      }

      if (['director', 'principal', 'management', 'program_chair'].includes(demoRole) && email) {
        if (await passwordChangedSince('admin_accounts', email, session.iat)) return next();
        req.auth = {
          email: email,
          role: demoRole,
          regNo: demoRole.toUpperCase(),
          department: demoRole === 'program_chair' ? 'CSE_ALLIED' : '*',
        };
        return next();
      }

      if (demoRole === 'faculty') {
        let facDept = 'CSE (Data Science)';
        let facName = 'Faculty Member';
        if (!db.isMock && email) {
          try {
            const fCheck = await db.query('SELECT department, name FROM faculty WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
            if (fCheck.rows.length > 0) {
              if (fCheck.rows[0].department) facDept = fCheck.rows[0].department;
              if (fCheck.rows[0].name) facName = fCheck.rows[0].name;
            }
          } catch { /* ignore */ }
        }
        req.auth = {
          email: email || 'faculty@rgmcet.edu.in',
          role: 'faculty',
          regNo: email ? `FAC_${email.split('@')[0].toUpperCase()}` : 'FAC_FACULTY',
          department: facDept,
          name: facName,
        };
        return next();
      }

      if (demoRole === 'student') {
        let studentRegNo = email ? email.split('@')[0].toUpperCase() : '';
        let stuDept: string | undefined;
        let stuName = 'Student';
        if (!db.isMock && email) {
          try {
            const sCheck = await db.query('SELECT roll_number, department, name FROM students WHERE LOWER(email) = LOWER($1) OR UPPER(roll_number) = UPPER($2) LIMIT 1', [email, studentRegNo]);
            if (sCheck.rows.length > 0) {
              if (sCheck.rows[0].roll_number) studentRegNo = sCheck.rows[0].roll_number;
              if (sCheck.rows[0].department) stuDept = sCheck.rows[0].department;
              if (sCheck.rows[0].name) stuName = sCheck.rows[0].name;
            }
          } catch { /* ignore */ }
        }
        if (!stuDept && studentRegNo.length === 10) {
          stuDept = getDeptFromRollNumber(studentRegNo);
        }
        req.auth = {
          email: email || '',
          role: 'student',
          regNo: studentRegNo,
          department: stuDept || 'CSE (Data Science)',
          name: stuName,
        };
        return next();
      }
    }
  } catch {
    // Any error during auth extraction — proceed unauthenticated
  }

  next();
}

/**
 * requireAuth — Blocks requests with no authenticated identity.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  next();
}

/**
 * requireRole — Blocks requests unless the user has one of the specified roles.
 * Must be used AFTER extractAuth.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.auth.role}.`,
      });
      return;
    }
    next();
  };
}

/**
 * requireOwnerOrRole — For student-scoped routes like /students/:id/academics.
 *
 * - If user is student: checks that req.params[paramName] matches req.auth.regNo
 * - If user has an elevated role (faculty, hod, admin): always allows (GAP-05 fix)
 */
export function requireOwnerOrRole(paramName: string, ...elevatedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // Elevated roles always have access (faculty viewing mentee, admin managing students)
    if (elevatedRoles.includes(req.auth.role)) {
      return next();
    }

    // Students must own the resource
    const resourceId = req.params[paramName]?.toUpperCase();
    const emailPrefix = req.auth.email?.includes('@') ? req.auth.email.split('@')[0].toUpperCase() : '';
    if (req.auth.role === 'student' && (resourceId === req.auth.regNo || resourceId === emailPrefix)) {
      return next();
    }

    res.status(403).json({
      error: 'Access denied. You can only modify your own data.',
    });
  };
}
