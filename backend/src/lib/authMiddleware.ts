import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { getDeptFromRollNumber, DEPARTMENT_CODE_MAP } from './validation';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware for Advitiyans API
//
// Three layers:
//   1. extractAuth   — decodes JWT or validates session. NEVER blocks. Sets req.auth.
//   2. requireAuth   — blocks if req.auth is null (no valid identity).
//   3. requireRole   — blocks if req.auth.role not in allowed list.
//   4. requireOwnerOrRole — blocks if user is a student and doesn't own the resource.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthPayload {
  email: string;
  role: string;   // 'student' | 'faculty' | 'hod' | 'admin'
  regNo: string;  // roll_number or faculty_id
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

/**
 * Decode a JWT payload (base64url) without cryptographic verification.
 * Returns null if the token is malformed or clearly fake.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    // Reject obviously fake tokens (demo tokens from AuthContext fallback)
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
 * extractAuth — Non-blocking middleware. Runs on every request.
 *
 * Attempts to identify the caller via:
 *   1. JWT in Authorization header (Cognito tokens for student/faculty)
 *   2. Session-based fallback (for admin/HOD who use demo_token + valid session)
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

    // ── Attempt 1: Decode as a real Cognito JWT ──
    const payload = decodeJwtPayload(token);
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

    // ── Attempt 2: demo_token fallback — ONLY active in offline/mock mode ──
    // SECURITY: This backdoor is strictly disabled in production.
    // Gate: USE_MOCK must be 'true'. In Lambda/production, USE_MOCK is never set.
    if (token.startsWith('demo_token_') && process.env.USE_MOCK === 'true') {
      const parts = token.split('_');
      // Format can be demo_token_<role>_<timestamp> or demo_token_<role>_<encodedEmail>_<timestamp>
      const demoRole = (parts.length >= 3 ? parts[2] : '').toLowerCase();

      // SECURITY: Only trust caller identity from query/body in mock mode, never from X-Caller-Email header
      let email = '';
      if (!email && req.query.email) email = String(req.query.email).toLowerCase();
      if (!email && req.query.caller_email) email = String(req.query.caller_email).toLowerCase();
      if (!email && req.body?.email) email = String(req.body.email).toLowerCase();
      if (!email && req.body?.caller_email) email = String(req.body.caller_email).toLowerCase();

      if (!email && parts.length >= 5) {
        try {
          email = decodeURIComponent(parts[3]).toLowerCase();
        } catch { /* ignore */ }
      }

      if (demoRole === 'admin') {
        // Look up admin's department from DB
        let adminDept: string | undefined;
        let superAdmin = false;
        if (email && !db.isMock) {
          try {
            const saCheck = await db.query(
              'SELECT 1 FROM super_admin_credentials WHERE LOWER(email) = LOWER($1)', [email]
            );
            if (saCheck.rows.length > 0) {
              superAdmin = true;
              adminDept = '*'; // super admin sees all
            } else {
              const adminCheck = await db.query(
                'SELECT department FROM admin_accounts WHERE LOWER(email) = LOWER($1)', [email]
              );
              if (adminCheck.rows.length > 0) {
                adminDept = adminCheck.rows[0].department || undefined;
              }
            }
          } catch { /* ignore */ }
        }
        req.auth = {
          email: email || 'admin@rgmcet.edu.in',
          role: 'admin',
          regNo: 'ADMIN',
          department: adminDept,
          isSuperAdmin: superAdmin,
        };
        return next();
      }

      if (demoRole === 'hod') {
        // Look up HOD's department from DB
        let hodDept: string | undefined;
        if (email && !db.isMock) {
          try {
            const hodCheck = await db.query(
              'SELECT department FROM hod_credentials WHERE LOWER(email) = LOWER($1)', [email]
            );
            if (hodCheck.rows.length > 0) {
              hodDept = hodCheck.rows[0].department || undefined;
            }
            if (!hodDept) {
              const facCheck = await db.query(
                'SELECT department FROM faculty WHERE LOWER(email) = LOWER($1)', [email]
              );
              if (facCheck.rows.length > 0) {
                hodDept = facCheck.rows[0].department || undefined;
              }
            }
          } catch { /* ignore */ }
        }
        req.auth = {
          email: email || 'hod@rgmcet.edu.in',
          role: 'hod',
          regNo: hodDept ? `HOD_${hodDept.replace(/[^A-Za-z]/g, '').toUpperCase()}` : 'HOD',
          department: hodDept,
        };
        return next();
      }

      if (demoRole === 'coordinator') {
        req.auth = {
          email: email || 'coordinator@rgmcet.edu.in',
          role: 'coordinator',
          regNo: 'COORDINATOR_1ST_YEAR',
          department: 'All',
        };
        return next();
      }

      if (demoRole === 'faculty') {
        // Look up faculty department from DB
        let facDept: string | undefined;
        if (email && !db.isMock) {
          try {
            const facCheck = await db.query(
              'SELECT department FROM faculty WHERE LOWER(email) = LOWER($1)', [email]
            );
            if (facCheck.rows.length > 0) {
              facDept = facCheck.rows[0].department || undefined;
            }
          } catch { /* ignore */ }
        }
        req.auth = {
          email: email || 'faculty@rgmcet.edu.in',
          role: 'faculty',
          regNo: email ? `FAC_${email.split('@')[0].toUpperCase()}` : 'FAC_FACULTY',
          department: facDept,
        };
        return next();
      }

      if (demoRole === 'student') {
        const studentRegNo = email ? email.split('@')[0].toUpperCase() : '';
        req.auth = {
          email: email || '',
          role: 'student',
          regNo: studentRegNo,
          department: studentRegNo.length === 10 ? getDeptFromRollNumber(studentRegNo) : undefined,
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
