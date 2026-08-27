import express, { Request, Response } from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import { db } from '../db';
import { calculateEmployabilityScore } from '../services/employability';
import { runCodingProfileCronSync, fetchLeetCodeStatsDirect, fetchGitHubStatsDirect } from '../services/cronSync';
import { cachedFetch } from '../services/platformCache';
import { deleteCognitoUsers, deleteAllCognitoUsers, updateCognitoUserPassword } from '../services/cognitoService';
import {
  studentProfileSchema,
  academicSchema,
  codingProfileSchema,
  techSkillSchema,
  certificationSchema,
  softSkillSchema,
  achievementSchema,
  placementProfileSchema,
  REGISTRATION_NUMBER_REGEX,
  RGMCET_EMAIL_REGEX,
  DEPARTMENT_CODE_MAP,
  getDeptFromRollNumber,
  isLateralEntry,
} from '../lib/validation';
import { extractAuth, requireAuth, requireRole, requireOwnerOrRole } from '../lib/authMiddleware';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global auth extraction — runs on every request, NEVER blocks.
// Sets req.auth = { email, role, regNo } or null.
app.use(extractAuth);

import path from 'path';
import fs from 'fs';

const publicDir = path.join(__dirname, '../public');

// Serve frontend static assets from public/ folder if bundled
if (fs.existsSync(publicDir)) {
  app.use('/assets', express.static(path.join(publicDir, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(publicDir, { maxAge: '1d' }));
}

// ============================================================================
// Health Check
// ============================================================================
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealth = await db.healthCheck();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'advitiyans-api',
    database: dbHealth,
  });
});

// ONE-TIME: Clean up coding_profiles handles stored as full URLs
// Protected by ADMIN_SECRET header OR a fixed one-time token.
app.post('/admin/cleanup-handles', async (req: Request, res: Response) => {
  const secret = String(req.headers['x-admin-secret'] || '');
  const adminSecret = process.env.ADMIN_SECRET || 'advitiyans-cleanup-2026';
  if (secret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    // Preview before cleanup
    const preview = await db.query(
      `SELECT student_id, platform, handle FROM coding_profiles WHERE handle LIKE 'http%' ORDER BY platform`,
      []
    );

    if (!db.isMock) {
      await db.query(`
        UPDATE coding_profiles
        SET handle = TRIM(TRAILING '/' FROM
          REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(handle,
            'https?://(www\\.)?geeksforgeeks\\.org/profile/', '', 'gi'),
            'https?://(www\\.)?geeksforgeeks\\.org/user/', '', 'gi'),
            'https?://auth\\.geeksforgeeks\\.org/user/', '', 'gi'))
        WHERE LOWER(platform) = 'geeksforgeeks' AND handle LIKE 'http%'
      `, []);

      await db.query(`
        UPDATE coding_profiles
        SET handle = TRIM(TRAILING '/' FROM REGEXP_REPLACE(handle, 'https?://(www\\.)?github\\.com/', '', 'gi'))
        WHERE LOWER(platform) = 'github' AND handle LIKE 'http%'
      `, []);

      await db.query(`
        UPDATE coding_profiles
        SET handle = TRIM(TRAILING '/' FROM REGEXP_REPLACE(handle, 'https?://(www\\.)?leetcode\\.com/', '', 'gi'))
        WHERE LOWER(platform) = 'leetcode' AND handle LIKE 'http%'
      `, []);

      await db.query(`
        UPDATE coding_profiles
        SET handle = TRIM(TRAILING '/' FROM REGEXP_REPLACE(handle, 'https?://(www\\.)?codeforces\\.com/profile/', '', 'gi'))
        WHERE LOWER(platform) = 'codeforces' AND handle LIKE 'http%'
      `, []);

      await db.query(`
        UPDATE coding_profiles
        SET handle = TRIM(TRAILING '/' FROM REGEXP_REPLACE(handle, 'https?://(www\\.)?codechef\\.com/users/', '', 'gi'))
        WHERE LOWER(platform) = 'codechef' AND handle LIKE 'http%'
      `, []);

      await db.query(`
        UPDATE coding_profiles
        SET handle = TRIM(TRAILING '/' FROM REGEXP_REPLACE(REGEXP_REPLACE(handle,
          'https?://(www\\.)?hackerrank\\.com/profile/', '', 'gi'),
          'https?://(www\\.)?hackerrank\\.com/', '', 'gi'))
        WHERE LOWER(platform) = 'hackerrank' AND handle LIKE 'http%'
      `, []);

      // Catch-all: delete any remaining records where the handle is still a full URL
      // (these are wrong-platform entries, e.g., a GitHub URL stored under LeetCode)
      await db.query(`
        DELETE FROM coding_profiles
        WHERE handle LIKE 'http%'
      `, []);
    }

    // Verify: remaining URL handles
    const remaining = await db.query(
      `SELECT student_id, platform, handle FROM coding_profiles WHERE handle LIKE 'http%'`,
      []
    );

    res.json({
      message: 'Handle cleanup complete',
      fixedCount: preview.rows.length,
      fixed: preview.rows,
      remainingUrlHandles: remaining.rows.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Database Initialization Endpoint
// Protected: requires X-Admin-Secret header matching ADMIN_SECRET env var
app.get('/db-init', async (req: Request, res: Response) => {
  const adminSecret = process.env.ADMIN_SECRET || '';
  if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: missing or invalid X-Admin-Secret header' });
  }
  try {
    const schemaPath = path.resolve(__dirname, '../schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sqlContent = fs.readFileSync(schemaPath, 'utf8');
      await db.query(sqlContent);

      // Delete dummy seed student records if present
      await db.query(`
        DELETE FROM students 
        WHERE email IN ('vikram@rgmcet.edu.in', 'sneha@rgmcet.edu.in', 'rahul@rgmcet.edu.in', 'ananya@rgmcet.edu.in', 'jayanth@rgmcet.edu.in')
        OR roll_number IN ('23091A3253', '23091A3254', '23091A3255');

        DELETE FROM students a USING students b
        WHERE a.ctid < b.ctid AND LOWER(a.roll_number) = LOWER(b.roll_number);

        ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS easy_count INT DEFAULT 0;
        ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS medium_count INT DEFAULT 0;
        ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS hard_count INT DEFAULT 0;
        ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS contest_rating INT DEFAULT 0;
      `).catch(() => {/* ignore */});

      // Ensure every real student has a coding profile record (default 0 solved unless set)
      await db.query(`
        INSERT INTO coding_profiles (student_id, platform, handle, streak, score_rating, easy_count, medium_count, hard_count, contest_rating)
        SELECT roll_number, 'LeetCode', LOWER(SPLIT_PART(email, '@', 1)), 0, 0, 0, 0, 0, 0 FROM students
        ON CONFLICT (student_id, platform) DO NOTHING;

        INSERT INTO coding_profiles (student_id, platform, handle, streak, repositories_count)
        SELECT roll_number, 'GitHub', LOWER(SPLIT_PART(email, '@', 1)), 0, 0 FROM students
        ON CONFLICT (student_id, platform) DO NOTHING;
      `).catch(() => {/* ignore */});

      // Migration: add user_sessions table for single-session enforcement
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          email VARCHAR(100) PRIMARY KEY,
          session_token VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
        );
      `).catch(() => {/* ignore if already exists */});

      return res.json({ status: 'ok', message: 'Database cleaned: Dummy users removed, real student profiles synced, user_sessions table ensured.' });

    }
    res.status(404).json({ error: 'schema.sql file not found in asset' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// DB Migrate — Run incremental migrations without needing schema.sql
// Protected: requires X-Admin-Secret header matching ADMIN_SECRET env var
// Runs all ALTER/CREATE IF NOT EXISTS statements that are safe to re-run.
// ============================================================================
app.get('/db-migrate', async (req: Request, res: Response) => {
  const adminSecret = process.env.ADMIN_SECRET || '';
  if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: missing or invalid X-Admin-Secret header' });
  }
  if (db.isMock) {
    return res.json({ status: 'ok', message: 'Mock mode — migrations skipped' });
  }
  try {
    const results: string[] = [];

    // Migration 1: user_sessions table for single-session enforcement
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        email VARCHAR(100) PRIMARY KEY,
        session_token VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
      );
    `);
    results.push('user_sessions table ensured');

    // Migration 2: hod_credentials table for DB-persisted HOD credential override
    await db.query(`
      CREATE TABLE IF NOT EXISTS hod_credentials (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    results.push('hod_credentials table ensured');

    // Migration 3: Performance Indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_students_dept_year ON students (department, year);
      CREATE INDEX IF NOT EXISTS idx_academics_student_sem ON academics (student_id, semester);
      CREATE INDEX IF NOT EXISTS idx_coding_profiles_student_platform ON coding_profiles (student_id, platform);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_email_token ON user_sessions (email, session_token);
    `).catch(() => {});
    results.push('performance indexes ensured');

    // Migration 4: Rehash any plain-text student passwords to bcrypt
    // Detects un-hashed entries (bcrypt hashes always start with '$2b$') and upgrades them.
    // Safe to re-run: already-hashed passwords are skipped.
    try {
      const plainPasswords = await db.query(
        `SELECT roll_number, password FROM student_passwords WHERE password NOT LIKE '$2b$%'`
      );
      let rehashed = 0;
      for (const row of plainPasswords.rows) {
        const hash = await bcrypt.hash(String(row.password), BCRYPT_ROUNDS);
        await db.query(
          `UPDATE student_passwords SET password = $1, updated_at = NOW() WHERE roll_number = $2`,
          [hash, row.roll_number]
        );
        rehashed++;
      }
      results.push(`student_passwords: rehashed ${rehashed} plain-text password(s) to bcrypt`);
    } catch {
      results.push('student_passwords: bcrypt rehash skipped (table may not exist yet)');
    }

    return res.json({ status: 'ok', migrations: results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

function sendIndexHtml(res: Response) {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(html);
  }
  return res.json({
    service: 'Advitiyans API Backend Server',
    status: 'running',
    healthCheck: '/health',
    message: 'Advitiyans Placement Readiness Platform',
  });
}

// Root & Web UI SPA Fallback Route (Serves frontend index.html over HTTPS)
app.get('/', (_req: Request, res: Response) => {
  return sendIndexHtml(res);
});

// ============================================================================
// Auth: Admin & HOD Login — Server-Side Credential Validation
// Passwords are stored in Lambda env vars (not in frontend code).
// Frontend calls this instead of checking credentials locally.
// ============================================================================
app.post('/auth/admin-login', async (req: Request, res: Response) => {
  try {
    const { email, password, department } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const emailLower = email.toLowerCase();

    // ── Priority 1A: Tier-1 Gmail super-admins (highest authority) ───────────
    // jayakrushna1622@gmail.com, dineshkumarpathipati@gmail.com, jayanthkumarnaidu777@gmail.com
    const TIER1_GMAIL_SUPER_ADMINS = [
      'jayakrushna1622@gmail.com',
      'dineshkumarpathipati@gmail.com',
      'jayanthkumarnaidu777@gmail.com',
    ];
    if (!db.isMock && TIER1_GMAIL_SUPER_ADMINS.includes(emailLower)) {
      try {
        const saResult = await db.query(
          'SELECT email, password FROM super_admin_credentials WHERE LOWER(email) = $1',
          [emailLower]
        );
        if (saResult.rows.length > 0) {
          if (saResult.rows[0].password === password) {
            return res.json({ valid: true, role: 'admin', isSuperAdmin: true, department: '*', email: saResult.rows[0].email });
          }
          await new Promise(resolve => setTimeout(resolve, 600));
          return res.status(401).json({ valid: false, error: 'Invalid email or password.' });
        }
      } catch {
        // Table may not exist on first cold-start; fall through
      }
    }

    // ── Priority 1B: Super admin credentials (DB) — admin@rgmcet.edu.in + others ──
    if (!db.isMock) {
      try {
        const saResult = await db.query(
          'SELECT email, password FROM super_admin_credentials WHERE LOWER(email) = $1',
          [emailLower]
        );
        if (saResult.rows.length > 0) {
          if (saResult.rows[0].password === password) {
            return res.json({ valid: true, role: 'admin', isSuperAdmin: true, department: '*', email: saResult.rows[0].email });
          }
          await new Promise(resolve => setTimeout(resolve, 600));
          return res.status(401).json({ valid: false, error: 'Invalid email or password.' });
        }
      } catch {
        // Table may not exist on first cold-start; fall through
      }

      // ── Priority 2: Regular admin accounts (DB) ───────────────────────────
      try {
        const adminResult = await db.query(
          'SELECT email, name, password, department FROM admin_accounts WHERE LOWER(email) = $1',
          [emailLower]
        );
        if (adminResult.rows.length > 0) {
          const adminRow = adminResult.rows[0];
          if (adminRow.password === password) {
            const isCoordinator = emailLower === 'coordinator@rgmcet.edu.in' || adminRow.department === 'Coordinator';
            const assignedDept = adminRow.department || department || (isCoordinator ? 'All' : 'CSE (Data Science)');
            return res.json({
              valid: true,
              role: isCoordinator ? 'coordinator' : 'admin',
              isSuperAdmin: false,
              department: assignedDept,
              email: adminRow.email,
            });
          }
          await new Promise(resolve => setTimeout(resolve, 600));
          return res.status(401).json({ valid: false, error: 'Invalid email or password.' });
        }
      } catch {
        // Table may not exist on first cold-start; fall through
      }
    }

    // ── Priority 3: HOD credentials (DB) ───────────────────────────────────
    if (!db.isMock) {
      try {
        let hodDbResult = await db.query('SELECT email, password, department FROM hod_credentials WHERE LOWER(email) = $1', [emailLower]);
        if (hodDbResult.rows.length === 0 && department) {
          hodDbResult = await db.query('SELECT email, password, department FROM hod_credentials WHERE LOWER(department) = LOWER($1)', [department]);
        }
        if (hodDbResult.rows.length === 0) {
          hodDbResult = await db.query('SELECT email, password, department FROM hod_credentials LIMIT 1');
        }
        if (hodDbResult.rows.length > 0) {
          const hodRow = hodDbResult.rows[0];
          if ((emailLower === hodRow.email.toLowerCase() || (department && hodRow.department && department.toLowerCase() === hodRow.department.toLowerCase())) && password === hodRow.password) {
            const assignedDept = hodRow.department || department || 'CSE (Data Science)';
            return res.json({ valid: true, role: 'hod', department: assignedDept, email: hodRow.email });
          }
        }
      } catch {
        // Fall through
      }
    }

    // ── Priority 4: Legacy env-var admin/HOD ─────────────────────────────────
    const adminEmail = process.env.ADMIN_MASTER_EMAIL?.toLowerCase();
    const adminPass  = process.env.ADMIN_MASTER_PASS;
    const hodEmail   = process.env.HOD_MASTER_EMAIL?.toLowerCase();
    const hodPass    = process.env.HOD_MASTER_PASS;

    const failWithDelay = async (msg: string) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return res.status(401).json({ valid: false, error: msg });
    };

    if (adminEmail && emailLower === adminEmail) {
      if (adminPass && password === adminPass) {
        return res.json({ valid: true, role: 'admin', isSuperAdmin: true, department: '*', email: adminEmail });
      }
      return failWithDelay('Invalid email or password.');
    }

    if (hodEmail && emailLower === hodEmail) {
      if (hodPass && password === hodPass) {
        return res.json({ valid: true, role: 'hod', department: department || 'CSE (Data Science)', email: hodEmail });
      }
      return failWithDelay('Invalid email or password.');
    }

    if (db.isMock) {
      const matchAdmin = emailLower.match(/^admin([a-z]+)@rgmcet\.edu\.in$/);
      if (matchAdmin) {
        const deptPrefix = matchAdmin[1];
        const deptMap: Record<string, string> = {
          civil: 'Civil',
          eee: 'EEE',
          mech: 'Mechanical',
          ece: 'ECE',
          cse: 'CSE',
          ds: 'CSE (Data Science)',
          aiml: 'CSE (AI & ML)',
          bs: 'CSE (BS)',
          cys: 'CSE (Cyber Security)',
        };
        const resolvedDept = deptMap[deptPrefix];
        if (resolvedDept && password === 'admin@2026') {
          return res.json({ valid: true, role: 'admin', isSuperAdmin: false, department: resolvedDept, email: emailLower });
        }
      }

      const matchHod = emailLower.match(/^hod([a-z]+)@rgmcet\.edu\.in$/);
      if (matchHod) {
        const deptPrefix = matchHod[1];
        const deptMap: Record<string, string> = {
          civil: 'Civil',
          eee: 'EEE',
          mech: 'Mechanical',
          ece: 'ECE',
          cse: 'CSE',
          ds: 'CSE (Data Science)',
          cseds: 'CSE (Data Science)',
          aiml: 'CSE (AI & ML)',
          bs: 'CSE (BS)',
          cys: 'CSE (Cyber Security)',
        };
        const resolvedDept = deptMap[deptPrefix];
        const expectedPass = deptPrefix === 'cseds' ? 'cseds@2026' : 'hod@2026';
        if (resolvedDept && password === expectedPass) {
          return res.json({ valid: true, role: 'hod', department: resolvedDept, email: emailLower });
        }
      }
    }

    return failWithDelay('Invalid email or password.');
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /departments — Returns list of all departments
app.get('/departments', async (_req: Request, res: Response) => {
  try {
    if (db.isMock) {
      const depts = Object.entries(DEPARTMENT_CODE_MAP).map(([code, name]: [string, string]) => ({
        code,
        name,
        short_name: name.split(' ')[0],
      }));
      return res.json(depts);
    }
    const result = await db.query('SELECT code, name, short_name FROM departments ORDER BY code ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Super Admin: Manage Regular Admins
// All endpoints validate the caller is a super admin before proceeding.
// ============================================================================

/** Helper — verify caller_email is a valid super admin */
async function isSuperAdminCaller(callerEmail: string): Promise<boolean> {
  if (!callerEmail || db.isMock) return false;
  try {
    const r = await db.query(
      'SELECT 1 FROM super_admin_credentials WHERE LOWER(email) = LOWER($1)',
      [callerEmail]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

// Tier 1A = the 3 Gmail super-admins — only they can manage Tier 1B accounts
const TIER1A_EMAILS_LOWER = [
  'jayakrushna1622@gmail.com',
  'dineshkumarpathipati@gmail.com',
  'jayanthkumarnaidu777@gmail.com',
];

/** Helper — verify caller_email is a Tier 1A Gmail super-admin */
function isTier1ACaller(callerEmail: string): boolean {
  return TIER1A_EMAILS_LOWER.includes(callerEmail.toLowerCase());
}

// GET /super-admin/tier1b — list all Tier 1B super-admin accounts (Tier 1A only)
app.get('/super-admin/tier1b', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const callerEmail = String(req.query.caller_email || '');
    if (!isTier1ACaller(callerEmail)) {
      return res.status(403).json({ error: 'Tier 1A super-admin access required' });
    }
    const result = await db.query(
      'SELECT email, password, updated_at FROM super_admin_credentials ORDER BY email ASC'
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /super-admin/tier1b — add a new Tier 1B super-admin (Tier 1A only)
app.post('/super-admin/tier1b', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { caller_email, email, password } = req.body;
    if (!isTier1ACaller(caller_email)) {
      return res.status(403).json({ error: 'Tier 1A super-admin access required' });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    // Prevent adding a Tier 1A address as Tier 1B (they are already hardcoded Tier 1A)
    if (TIER1A_EMAILS_LOWER.includes(email.toLowerCase())) {
      return res.status(400).json({ error: 'This email already has Tier 1A super-admin privileges' });
    }
    await db.query(
      `INSERT INTO super_admin_credentials (email, password, updated_at)
       VALUES (LOWER($1), $2, NOW())
       ON CONFLICT (email) DO UPDATE SET password = $2, updated_at = NOW()`,
      [email, password]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /super-admin/tier1b/:email — remove a Tier 1B super-admin (Tier 1A only)
app.delete('/super-admin/tier1b/:email', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { caller_email } = req.body;
    if (!isTier1ACaller(caller_email)) {
      return res.status(403).json({ error: 'Tier 1A super-admin access required' });
    }
    const targetEmail = req.params.email.toLowerCase();
    // Cannot delete Tier 1A accounts
    if (TIER1A_EMAILS_LOWER.includes(targetEmail)) {
      return res.status(400).json({ error: 'Tier 1A super-admin accounts cannot be deleted' });
    }
    await db.query('DELETE FROM super_admin_credentials WHERE LOWER(email) = $1', [targetEmail]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const SUPER_ADMIN_EMAILS_LOWER = [
  'admin@rgmcet.edu.in',
  'jayakrushna1622@gmail.com',
  'dineshkumarpathipati@gmail.com',
  'jayanthkumarnaidu777@gmail.com',
];

// GET /super-admin/admins — list all regular admins (email, name, password, department, created_at)
app.get('/super-admin/admins', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const callerEmail = String(req.query.caller_email || '');
    if (!await isSuperAdminCaller(callerEmail)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const result = await db.query(
      'SELECT email, name, password, department, created_by, created_at FROM admin_accounts ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /super-admin/admins — create a regular admin
app.post('/super-admin/admins', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { caller_email, name, email, password, department } = req.body;
    if (!await isSuperAdminCaller(caller_email)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    if (SUPER_ADMIN_EMAILS_LOWER.includes(email.toLowerCase())) {
      return res.status(400).json({ error: 'Cannot create a regular admin account for a super admin email' });
    }
    const dept = department || 'CSE (Data Science)';
    await db.query(
      `INSERT INTO admin_accounts (email, name, password, department, created_by, created_at, updated_at)
       VALUES (LOWER($1), $2, $3, $4, LOWER($5), NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET name = $2, password = $3, department = $4, updated_at = NOW()`,
      [email, name, password, dept, caller_email]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /super-admin/admins/:email — delete a regular admin
app.delete('/super-admin/admins/:email', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { caller_email } = req.body;
    if (!await isSuperAdminCaller(caller_email)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const targetEmail = req.params.email.toLowerCase();
    // Prevent deletion of any super admin email
    if (SUPER_ADMIN_EMAILS_LOWER.includes(targetEmail)) {
      return res.status(400).json({ error: 'Super admin accounts cannot be deleted' });
    }
    await db.query('DELETE FROM admin_accounts WHERE LOWER(email) = $1', [targetEmail]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /super-admin/admins/:email/password — change a regular admin's password
app.put('/super-admin/admins/:email/password', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { caller_email, password } = req.body;
    if (!await isSuperAdminCaller(caller_email)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const targetEmail = req.params.email.toLowerCase();
    if (SUPER_ADMIN_EMAILS_LOWER.includes(targetEmail)) {
      return res.status(400).json({ error: 'Use /super-admin/my-password to change a super admin password' });
    }
    await db.query(
      'UPDATE admin_accounts SET password = $1, updated_at = NOW() WHERE LOWER(email) = $2',
      [password, targetEmail]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /super-admin/my-password — super admin changes ONLY their own password
app.put('/super-admin/my-password', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { my_email, new_password } = req.body;
    if (!await isSuperAdminCaller(my_email)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    if (!new_password || String(new_password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    // Updates ONLY the row for my_email — cannot target another super admin
    await db.query(
      'UPDATE super_admin_credentials SET password = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)',
      [new_password, my_email]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Auth: HOD Credential Management
// GET  /auth/hod-credentials       — Admin reads current HOD email & last updated time
// PUT  /auth/hod-credentials       — HOD updates own email/password (requires current password)
// POST /auth/hod-credentials/admin-reset — Admin resets HOD credentials (no current password needed)
// ============================================================================

// GET /auth/hod-credentials — returns HOD credentials (department scoped)
app.get('/auth/hod-credentials', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const targetDept = (req.query.department as string) || req.auth?.department || 'CSE (Data Science)';
    const hodEmailEnv = process.env.HOD_MASTER_EMAIL || null;

    if (db.isMock) {
      return res.json({ email: hodEmailEnv || 'hodcseds@rgmcet.edu.in', password: '••••••', department: targetDept, source: 'env', updated_at: null });
    }

    const result = await db.query(
      'SELECT email, department, updated_at FROM hod_credentials WHERE LOWER(department) = LOWER($1) LIMIT 1',
      [targetDept]
    ).catch(() => ({ rows: [] }));

    if (result.rows.length > 0) {
      return res.json({ email: result.rows[0].email, password: '••••••', department: result.rows[0].department, source: 'database', updated_at: result.rows[0].updated_at });
    }

    // Fallback: search any HOD row
    const fallback = await db.query('SELECT email, department, updated_at FROM hod_credentials LIMIT 1').catch(() => ({ rows: [] }));
    if (fallback.rows.length > 0) {
      return res.json({ email: fallback.rows[0].email, password: '••••••', department: fallback.rows[0].department || targetDept, source: 'database', updated_at: fallback.rows[0].updated_at });
    }

    return res.json({ email: hodEmailEnv, password: hodEmailEnv ? '••••••' : null, department: targetDept, source: 'env', updated_at: null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /auth/hod-credentials — HOD/Admin updates HOD email/password for department
app.put('/auth/hod-credentials', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const { new_email, new_password, department } = req.body;
    if (!new_email && !new_password) {
      return res.status(400).json({ error: 'Provide at least new_email or new_password to update' });
    }

    const targetDept = department || req.auth?.department || 'CSE (Data Science)';
    const hodEmailEnv = process.env.HOD_MASTER_EMAIL?.toLowerCase() || null;
    const hodPassEnv  = process.env.HOD_MASTER_PASS || null;

    if (db.isMock) {
      return res.json({ success: true, message: 'HOD credentials updated.', email: new_email || hodEmailEnv || '', department: targetDept });
    }

    const existing = await db.query(
      'SELECT email, password FROM hod_credentials WHERE LOWER(department) = LOWER($1) LIMIT 1',
      [targetDept]
    ).catch(() => ({ rows: [] }));

    const currentEmail    = existing.rows[0]?.email    || hodEmailEnv || `hod.${targetDept.toLowerCase().replace(/[^a-z]/g, '')}@rgmcet.edu.in`;
    const currentPassword = existing.rows[0]?.password || hodPassEnv || 'hod@2026';

    const updatedEmail    = new_email    || currentEmail;
    const updatedPassword = new_password || currentPassword;

    await db.query(`
      INSERT INTO hod_credentials (email, password, department, updated_at)
      VALUES (LOWER($1), $2, $3, NOW())
      ON CONFLICT (LOWER(department)) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, updated_at = NOW()
    `, [updatedEmail, updatedPassword, targetDept]);

    return res.json({ success: true, message: `HOD credentials updated successfully for ${targetDept}.`, email: updatedEmail, department: targetDept });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /auth/hod-credentials/admin-reset — Admin resets HOD credentials (no verification needed)
app.post('/auth/hod-credentials/admin-reset', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { new_email, new_password } = req.body;
    if (!new_email && !new_password) {
      return res.status(400).json({ error: 'Provide at least new_email or new_password' });
    }

    const hodEmailEnv = process.env.HOD_MASTER_EMAIL || null;
    const hodPassEnv  = process.env.HOD_MASTER_PASS  || null;

    if (db.isMock) {
      return res.json({ success: true, message: 'Mock mode: HOD credentials reset.', email: new_email || hodEmailEnv || '' });
    }

    const existing = await db.query('SELECT email, password FROM hod_credentials WHERE id = 1').catch(() => ({ rows: [] }));
    const currentEmail    = existing.rows[0]?.email    || hodEmailEnv || '';
    const currentPassword = existing.rows[0]?.password || hodPassEnv || '';

    const updatedEmail    = new_email    || currentEmail;
    const updatedPassword = new_password || currentPassword;

    await db.query(`
      INSERT INTO hod_credentials (id, email, password, updated_at)
      VALUES (1, $1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, updated_at = NOW()
    `, [updatedEmail, updatedPassword]);

    return res.json({ success: true, message: 'HOD credentials reset by admin.', email: updatedEmail });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Semester Unlock Settings — HOD/Admin controls which semesters students can fill
// ============================================================================

// Mock state for semester unlock (used when DB is unavailable)
const mockSemesterUnlock: Record<string, number> = {
  '1st Year': 0, '2nd Year': 2, '3rd Year': 4, '4th Year': 6,
};

// GET /settings/semester-unlock
app.get('/settings/semester-unlock', async (_req: Request, res: Response) => {
  try {
    if (db.isMock) {
      return res.json(Object.entries(mockSemesterUnlock).map(([year_label, max_semester]) => ({ year_label, max_semester })));
    }
    const result = await db.query(
      `SELECT year_label, max_semester FROM semester_unlock_settings ORDER BY CASE year_label
        WHEN '1st Year' THEN 1 WHEN '2nd Year' THEN 2 WHEN '3rd Year' THEN 3 ELSE 4 END`
    );
    // If table is empty (fresh DB), return defaults
    if (result.rows.length === 0) {
      return res.json([
        { year_label: '1st Year', max_semester: 0 },
        { year_label: '2nd Year', max_semester: 2 },
        { year_label: '3rd Year', max_semester: 4 },
        { year_label: '4th Year', max_semester: 6 },
      ]);
    }
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Per-year minimum semester floors — HOD cannot unlock fewer than these
const YEAR_MIN_SEMESTER: Record<string, number> = {
  '1st Year': 0,
  '2nd Year': 2,
  '3rd Year': 4,
  '4th Year': 6,
};

// Per-year maximum semester ceilings — HOD cannot unlock more than these
const YEAR_MAX_SEMESTER: Record<string, number> = {
  '1st Year': 2,
  '2nd Year': 4,
  '3rd Year': 6,
  '4th Year': 8,
};

// PUT /settings/semester-unlock — HOD/Admin locks or unlocks semesters for a year batch
// When decreasing max_semester, cascade-deletes all academics rows above the new max
// for every student in that year batch (including CGPA recalculation trigger).
app.put('/settings/semester-unlock', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const { year_label, max_semester } = req.body;
    if (!year_label || max_semester === undefined || max_semester === null) {
      return res.status(400).json({ error: 'year_label and max_semester are required' });
    }
    const newMax = Number(max_semester);
    if (isNaN(newMax) || newMax < 0 || newMax > 8) {
      return res.status(400).json({ error: 'max_semester must be between 0 and 8' });
    }

    // Enforce per-year minimum floor
    const minFloor = YEAR_MIN_SEMESTER[year_label] ?? 0;
    if (newMax < minFloor) {
      return res.status(400).json({
        error: `Cannot set max_semester below ${minFloor} for ${year_label}.`,
      });
    }

    // Enforce per-year maximum ceiling
    const maxCeil = YEAR_MAX_SEMESTER[year_label] ?? 8;
    if (newMax > maxCeil) {
      return res.status(400).json({
        error: `Cannot set max_semester above ${maxCeil} for ${year_label}.`,
      });
    }

    if (db.isMock) {
      const oldMax = mockSemesterUnlock[year_label] ?? 0;
      mockSemesterUnlock[year_label] = newMax;
      // In mock mode: also filter out academics above newMax
      let deletedCount = 0;
      if (newMax < oldMax) {
        for (const [rollNo, recs] of db.mockStore.academics.entries()) {
          const before = recs.length;
          const filtered = recs.filter((r: any) => Number(r.semester) <= newMax);
          if (filtered.length !== before) {
            db.mockStore.academics.set(rollNo, filtered);
            deletedCount += before - filtered.length;
          }
        }
      }
      return res.json({ year_label, max_semester: newMax, deleted_count: deletedCount, updated_at: new Date().toISOString() });
    }

    // Get the current max before updating so we know if we're decreasing
    const currentRes = await db.query(
      `SELECT max_semester FROM semester_unlock_settings WHERE year_label = $1`,
      [year_label]
    );
    const oldMax = currentRes.rows.length > 0 ? Number(currentRes.rows[0].max_semester) : newMax;

    // Upsert the new max
    const result = await db.query(
      `INSERT INTO semester_unlock_settings (year_label, max_semester, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (year_label) DO UPDATE SET max_semester = $2, updated_at = NOW()
       RETURNING *`,
      [year_label, newMax]
    );

    let deletedCount = 0;

    // Cascade-delete academics above new max for all students in this year batch
    if (newMax < oldMax) {
      const deleteRes = await db.query(
        `DELETE FROM academics
         WHERE semester > $1
           AND student_id IN (
             SELECT roll_number FROM students WHERE year = $2
           )`,
        [newMax, year_label]
      );
      deletedCount = deleteRes.rowCount ?? 0;
    }

    res.json({ ...result.rows[0], deleted_count: deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Admin: Student Password Management
// ============================================================================

// GET /admin/student-passwords — admin views students who have passwords set (passwords are REDACTED)
app.get('/admin/student-passwords', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    if (db.isMock) {
      return res.json([]);
    }
    const result = await db.query(`
      SELECT s.roll_number, s.name, s.email, s.year, s.section,
             CASE WHEN sp.password IS NOT NULL THEN '••••••' ELSE '' END as password,
             sp.updated_at as pwd_updated_at
      FROM students s
      LEFT JOIN student_passwords sp ON s.roll_number = sp.roll_number
      ORDER BY s.roll_number
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /students/:id/password — admin sets a student's password (stored as bcrypt hash & synced to Cognito)
app.put('/students/:id/password', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const rollNo = req.params.id.toUpperCase();
    const { password } = req.body;
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    if (db.isMock) {
      return res.json({ success: true, roll_number: rollNo });
    }
    // 1. Hash password and save to student_passwords table
    const hashedPassword = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    await db.query(
      `INSERT INTO student_passwords (roll_number, password, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (roll_number) DO UPDATE SET password = $2, updated_at = NOW()`,
      [rollNo, hashedPassword]
    );

    // 2. Also sync new password directly to AWS Cognito User Pool so student can log in seamlessly
    const stuResult = await db.query('SELECT email FROM students WHERE UPPER(roll_number) = $1', [rollNo]);
    const studentEmail = stuResult.rows[0]?.email || `${rollNo.toLowerCase()}@rgmcet.edu.in`;
    await updateCognitoUserPassword(studentEmail, String(password)).catch(() => {});

    res.json({ success: true, roll_number: rollNo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/verify-student-password — Verifies a student's password against DB if Cognito credentials differ
app.post('/auth/verify-student-password', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ valid: false, error: 'Email and password required' });
    const cleanEmail = String(email).toLowerCase().trim();
    const rollNo = cleanEmail.includes('@') ? cleanEmail.split('@')[0].toUpperCase() : cleanEmail.toUpperCase();

    if (db.isMock) {
      return res.json({ valid: true, student: { roll_number: rollNo, name: 'Student', department: 'CSE (Data Science)' } });
    }

    const pwdResult = await db.query(
      `SELECT sp.password, s.name, s.roll_number, s.department 
       FROM student_passwords sp 
       JOIN students s ON UPPER(s.roll_number) = UPPER(sp.roll_number)
       WHERE LOWER(s.email) = $1 OR UPPER(s.roll_number) = $2`,
      [cleanEmail, rollNo]
    );

    if (pwdResult.rows.length > 0) {
      const match = await bcrypt.compare(String(password), pwdResult.rows[0].password);
      if (match) {
        // Asynchronously sync to Cognito to heal any Cognito mismatch
        updateCognitoUserPassword(cleanEmail, String(password)).catch(() => {});
        return res.json({
          valid: true,
          student: pwdResult.rows[0],
        });
      }
    }

    return res.json({ valid: false });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// ============================================================================
// Auth: Faculty/HOD Registration Key Validation (SEC-01 fix)
// The secret key is stored server-side in FACULTY_SECRET_KEY env var.
// Frontend sends the user-entered key here for validation — never exposes it.
// ============================================================================
app.post('/auth/validate-faculty-key', async (req: Request, res: Response) => {
  try {
    const { securityKey } = req.body;
    if (!securityKey) {
      return res.status(400).json({ valid: false, error: 'Security key is required.' });
    }

    const serverKey = process.env.FACULTY_SECRET_KEY;
    if (!serverKey) {
      // Fail closed: if the env var isn't set, registration is disabled (GAP-08)
      console.warn('[AUTH] FACULTY_SECRET_KEY env var is not set. Faculty/HOD registration is disabled.');
      return res.status(503).json({
        valid: false,
        error: 'Faculty registration is currently disabled. Please contact the system administrator to configure the registration key.',
      });
    }

    if (securityKey === serverKey) {
      return res.json({ valid: true });
    }

    // Brute-force delay on failure
    await new Promise(resolve => setTimeout(resolve, 600));
    return res.status(401).json({ valid: false, error: 'Invalid security key. Please contact the department coordinator for the correct key.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Auth: Check Availability
// ============================================================================
app.get('/auth/check-availability', async (req: Request, res: Response) => {
  try {
    const { type, value } = req.query;
    if (!type || !value) {
      return res.status(400).json({ error: 'type and value query parameters are required' });
    }

    if (type === 'email') {
      const emailStr = String(value).trim().toLowerCase();
      if (!RGMCET_EMAIL_REGEX.test(emailStr)) {
        return res.json({ available: false, message: 'Email must end in @rgmcet.edu.in' });
      }

      if (db.isMock) {
        let taken = false;
        for (const s of db.mockStore.students.values()) {
          if (s.email.toLowerCase() === emailStr) { taken = true; break; }
        }
        return res.json({ available: !taken, message: taken ? 'Email is already registered' : 'Email available' });
      }

      const queryRes = await db.query('SELECT 1 FROM students WHERE LOWER(email) = $1', [emailStr]);
      const taken = queryRes.rows.length > 0;
      return res.json({ available: !taken, message: taken ? 'Email is already registered' : 'Email available' });
    }

    if (type === 'regNo') {
      const regStr = String(value).trim().toUpperCase();
      if (!REGISTRATION_NUMBER_REGEX.test(regStr)) {
        return res.json({ available: false, message: "10-char format required (e.g. 23091A0428 or 23095A0428). Positions 7-8 must be a valid department code." });
      }

      if (db.isMock) {
        const taken = db.mockStore.students.has(regStr);
        return res.json({ available: !taken, message: taken ? 'Registration number is already registered' : 'Registration number available' });
      }

      const queryRes = await db.query('SELECT 1 FROM students WHERE UPPER(roll_number) = $1', [regStr]);
      const taken = queryRes.rows.length > 0;
      return res.json({ available: !taken, message: taken ? 'Registration number is already registered' : 'Registration number available' });
    }

    return res.status(400).json({ error: 'Invalid check type' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Auth: Single-Session Enforcement
// ============================================================================

// POST /auth/session — Register a new session (overwrites any existing one for this email)
// Called by the frontend immediately after a successful Cognito sign-in.
app.post('/auth/session', async (req: Request, res: Response) => {
  try {
    const { email, session_token, role } = req.body;
    if (!email || !session_token || !role) {
      return res.status(400).json({ error: 'email, session_token, and role are required' });
    }

    const emailLower = email.toLowerCase();

    if (db.isMock) {
      // In mock mode just accept without DB
      return res.json({ success: true, message: 'Session registered (mock mode)' });
    }

    // UPSERT: one row per email. Replaces any existing session — old sessions become invalid.
    await db.query(`
      INSERT INTO user_sessions (email, session_token, role, created_at, last_seen, expires_at)
      VALUES ($1, $2, $3, NOW(), NOW(), NOW() + INTERVAL '24 hours')
      ON CONFLICT (email) DO UPDATE
        SET session_token = EXCLUDED.session_token,
            role          = EXCLUDED.role,
            created_at    = NOW(),
            last_seen     = NOW(),
            expires_at    = NOW() + INTERVAL '24 hours'
    `, [emailLower, session_token, role]);

    return res.json({ success: true, message: 'Session registered. Previous sessions (if any) have been invalidated.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /auth/validate-session — Check if a session token is still the active one for this email
// Returns { valid: true } if token matches, { valid: false, reason: '...' } otherwise.
// Frontend polls this every ~30s; if invalid, force-logout with a friendly message.
app.get('/auth/validate-session', async (req: Request, res: Response) => {
  try {
    const { email, session_token } = req.query as { email: string; session_token: string };
    if (!email || !session_token) {
      return res.status(400).json({ error: 'email and session_token query params are required' });
    }

    const emailLower = email.toLowerCase();

    if (db.isMock) {
      return res.json({ valid: true });
    }

    const result = await db.query(
      `SELECT session_token, expires_at FROM user_sessions WHERE email = $1`,
      [emailLower]
    );

    if (result.rows.length === 0) {
      return res.json({ valid: false, reason: 'no_session' });
    }

    const row = result.rows[0];

    if (new Date(row.expires_at) < new Date()) {
      return res.json({ valid: false, reason: 'session_expired' });
    }

    if (row.session_token !== session_token) {
      return res.json({ valid: false, reason: 'session_superseded' });
    }

    // Update last_seen heartbeat
    await db.query(
      `UPDATE user_sessions SET last_seen = NOW() WHERE email = $1`,
      [emailLower]
    ).catch(() => {/* non-critical */});

    return res.json({ valid: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Students CRUD

// ============================================================================

// ── Throttled Background Auto-Sync ──────────────────────────────────────────
// Automatically refreshes stale coding profiles (LeetCode/GitHub) in the
// background whenever GET /students is called. Fire-and-forget: doesn't block
// the response. Throttled to run at most once every 10 minutes.
// ─────────────────────────────────────────────────────────────────────────────
let lastAutoSyncTimestamp = 0;
const AUTO_SYNC_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
const AUTO_SYNC_STALE_HOURS = 2;              // sync profiles older than 2 hours
const AUTO_SYNC_BATCH_LIMIT = 20;             // max profiles per auto-sync run

function triggerBackgroundAutoSync() {
  const now = Date.now();
  if (now - lastAutoSyncTimestamp < AUTO_SYNC_THROTTLE_MS) return; // throttled
  if (db.isMock) return;
  lastAutoSyncTimestamp = now;

  // Fire-and-forget — do NOT await this
  (async () => {
    try {
      const staleRes = await db.query(
        `SELECT student_id, platform, handle FROM coding_profiles
         WHERE handle IS NOT NULL AND handle != '' AND handle != 'Not Linked'
           AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '${AUTO_SYNC_STALE_HOURS} hours')
         ORDER BY updated_at ASC NULLS FIRST
         LIMIT $1`,
        [AUTO_SYNC_BATCH_LIMIT]
      );

      const rows = staleRes.rows;
      if (rows.length === 0) return;
      console.log(`[AutoSync] Refreshing ${rows.length} stale coding profiles in background...`);

      const CHUNK = 5;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map(async (row: any) => {
            const { student_id, platform, handle } = row;
            const platLower = String(platform).toLowerCase();
            try {
              if (platLower === 'leetcode') {
                const lcData = await fetchLeetCodeStatsDirect(handle);
                if (lcData) {
                  await db.query(
                    `UPDATE coding_profiles
                     SET score_rating = $1, easy_count = $2, medium_count = $3, hard_count = $4,
                         streak = COALESCE($5, streak), updated_at = CURRENT_TIMESTAMP
                     WHERE student_id = $6 AND LOWER(platform) = 'leetcode'`,
                    [lcData.solved, lcData.easy, lcData.medium, lcData.hard, lcData.streak || 0, student_id]
                  ).catch(() => {});
                }
              } else if (platLower === 'github') {
                const ghData = await fetchGitHubStatsDirect(handle);
                if (ghData) {
                  await db.query(
                    `UPDATE coding_profiles
                     SET repositories_count = $1, followers_count = $2, stars_count = $3,
                         top_language = $4, updated_at = CURRENT_TIMESTAMP
                     WHERE student_id = $5 AND LOWER(platform) = 'github'`,
                    [ghData.repos, ghData.followers, ghData.stars, ghData.topLanguage, student_id]
                  ).catch(() => {});
                }
              }
            } catch (_) { /* individual profile failure — skip */ }
          })
        );
      }
      console.log(`[AutoSync] Background sync complete — ${rows.length} profiles refreshed.`);
    } catch (err: any) {
      console.warn('[AutoSync] Background sync error:', err.message || err);
    }
  })();
}

// GET /students — List/Search/Filter (Guarantees DISTINCT ON roll_number)
app.get('/students', async (req: Request, res: Response) => {
  // Kick off background auto-sync of stale coding profiles (fire-and-forget)
  triggerBackgroundAutoSync();
  try {
    const { department, batch, section, year, standing, mentor_id, search } = req.query;

    if (db.isMock) {
      let students = Array.from(db.mockStore.students.values());
      // Deduplicate mock store entries by roll_number
      students = Array.from(new Map(students.map((s) => [s.roll_number.toUpperCase(), s])).values());

      const callerDept = req.auth?.department;
      const isSuper = req.auth?.isSuperAdmin || callerDept === '*';
      if (!isSuper && callerDept && (req.auth?.role === 'admin' || req.auth?.role === 'hod' || req.auth?.role === 'student')) {
        students = students.filter((s) => s.department === callerDept);
      } else if (department && String(department) !== 'All') {
        students = students.filter((s) => s.department === department);
      }
      if (batch && String(batch) !== 'All') students = students.filter((s) => s.batch === batch);
      if (year && String(year) !== 'All') students = students.filter((s) => s.year === year);
      if (section && String(section) !== 'All') {
        const secFormatted = String(section).replace('Section ', '').replace('Sec ', '');
        students = students.filter((s) => s.section === secFormatted || s.section === `Sec ${secFormatted}`);
      }
      if (mentor_id) students = students.filter((s) => s.faculty_mentor_id === mentor_id);
      if (search) {
        const q = String(search).toLowerCase();
        students = students.filter((s) => s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
      }

      // Dynamically attach computed CGPA and coding profiles to each student
      const enriched = students.map((student) => {
        const rollNo = student.roll_number;
        const academics = db.mockStore.academics.get(rollNo) || [];
        const codingProfiles = db.mockStore.codingProfiles.get(rollNo) || [];

        let cgpa = student.cgpa ? Number(student.cgpa) : 9.0;
        if (academics.length > 0) {
          const sumGpa = academics.reduce((acc: number, a: any) => acc + Number(a.semester_gpa || 0), 0);
          cgpa = Number((sumGpa / academics.length).toFixed(2));
        }

        const lcProfile = codingProfiles.find((p: any) => String(p.platform).toLowerCase() === 'leetcode');
        const ghProfile = codingProfiles.find((p: any) => String(p.platform).toLowerCase() === 'github');

        const computedStanding = cgpa >= 8.0 ? 'Distinction' : (cgpa >= 6.5 && cgpa < 8.0) ? 'First Class' : (cgpa >= 5.5 && cgpa < 6.5) ? 'Second Class' : (cgpa > 4.5 && cgpa < 5.5) ? 'Pass' : 'Pass';

        return {
          ...student,
          cgpa,
          standing: computedStanding,
          coding_profiles: codingProfiles,
          leetcode_handle: lcProfile?.handle || null,
          leetcode_solved: lcProfile ? (lcProfile.score_rating || lcProfile.streak || 0) : 0,
          github_handle: ghProfile?.handle || null,
          github_repos: ghProfile ? (ghProfile.repositories_count || 0) : 0,
        };
      });

      if (standing && String(standing) !== 'All') {
        return res.json(enriched.filter((s) => s.standing === standing));
      }

      return res.json(enriched);
    }

    // Build dynamic SQL query with DISTINCT ON to eliminate duplicates
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Auto-apply department scoping if caller is non-super admin, HOD, or Student
    const callerDept = req.auth?.department;
    const isSuper = req.auth?.isSuperAdmin || callerDept === '*';
    if (!isSuper && callerDept && (req.auth?.role === 'admin' || req.auth?.role === 'hod' || req.auth?.role === 'student')) {
      conditions.push(`(LOWER(REPLACE(s.department, ' ', '')) = LOWER(REPLACE($${paramIndex++}, ' ', '')))`);
      params.push(callerDept);
    } else if (department && String(department) !== 'All' && String(department) !== 'undefined' && String(department) !== 'null') {
      conditions.push(`(LOWER(REPLACE(s.department, ' ', '')) = LOWER(REPLACE($${paramIndex++}, ' ', '')))`);
      params.push(String(department));
    }

    if (batch && String(batch) !== 'All' && String(batch) !== 'undefined' && String(batch) !== 'null') {
      conditions.push(`batch = $${paramIndex++}`);
      params.push(String(batch));
    }
    if (year && String(year) !== 'All' && String(year) !== 'undefined' && String(year) !== 'null') {
      conditions.push(`year = $${paramIndex++}`);
      params.push(String(year));
    }
    if (section && String(section) !== 'All' && String(section) !== 'undefined' && String(section) !== 'null') {
      const secFormatted = String(section).replace('Section ', '').replace('Sec ', '');
      conditions.push(`(section = $${paramIndex} OR section = $${paramIndex + 1})`);
      params.push(secFormatted, `Sec ${secFormatted}`);
      paramIndex += 2;
    }
    if (mentor_id && String(mentor_id) !== 'undefined' && String(mentor_id) !== 'null') {
      conditions.push(`faculty_mentor_id = $${paramIndex++}`);
      params.push(String(mentor_id));
    }
    if (search) {
      const q = `%${String(search).toLowerCase()}%`;
      conditions.push(`(LOWER(name) LIKE $${paramIndex} OR LOWER(roll_number) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex})`);
      params.push(q);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.map(c => c.startsWith('(') ? c : `s.${c}`).join(' AND ')}` : '';
    const result = await db.query(`
      SELECT DISTINCT ON (s.roll_number) 
        s.*,
        COALESCE(ROUND(AVG(a.semester_gpa), 2), 0.00) AS cgpa,
        MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.handle END) AS leetcode_handle,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN GREATEST(c.score_rating, (c.easy_count + c.medium_count + c.hard_count)) END), 0) AS leetcode_solved,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.easy_count END), 0) AS leetcode_easy,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.medium_count END), 0) AS leetcode_medium,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.hard_count END), 0) AS leetcode_hard,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.contest_rating END), 0) AS leetcode_contest,
        MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.handle END) AS github_handle,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.repositories_count END), 0) AS github_repos,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.followers_count END), 0) AS github_followers,
        COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.stars_count END), 0) AS github_stars,
        MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.top_language END) AS github_top_language
      FROM students s
      LEFT JOIN academics a ON a.student_id = s.roll_number
      LEFT JOIN coding_profiles c ON c.student_id = s.roll_number
      ${whereClause}
      GROUP BY s.roll_number, s.name, s.email, s.year, s.phone, s.address, s.native_place, s.department, s.batch, s.section, s.hostel_day_scholar, s.driving_license, s.passport, s.relocation_willingness, s.family_business, s.financial_background, s.faculty_mentor_id, s.photo_url, s.resume_url, s.linkedin_url, s.linkedin_updated, s.is_lateral_entry, s.created_at, s.updated_at
      ORDER BY s.roll_number, s.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students', async (req: Request, res: Response) => {
  try {
    const validatedData = studentProfileSchema.parse(req.body);
    const rawRoll = (validatedData.roll_number || req.body.roll_number || '').toString();
    if (!rawRoll) {
      return res.status(400).json({ error: 'roll_number is required' });
    }
    const regNo = rawRoll.toUpperCase();

    if (db.isMock) {
      if (db.mockStore.students.has(regNo)) {
        return res.status(400).json({ error: 'Student with this registration number already exists' });
      }
      const newStudent = { ...validatedData, roll_number: regNo, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      db.mockStore.students.set(regNo, newStudent);
      return res.status(201).json({ message: 'Student created successfully', student: newStudent });
    }

    const result = await db.query(
      `INSERT INTO students (roll_number, name, email, year, phone, address, native_place, department, batch, section,
        hostel_day_scholar, driving_license, passport, relocation_willingness, family_business, financial_background,
        faculty_mentor_id, photo_url, resume_url, linkedin_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (roll_number) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         year = EXCLUDED.year,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        regNo, validatedData.name, validatedData.email, validatedData.year || '',
        validatedData.phone || null, validatedData.address || null, validatedData.native_place || null,
        validatedData.department || '', validatedData.batch || '', validatedData.section || '',
        validatedData.hostel_day_scholar || null, validatedData.driving_license || false, validatedData.passport || false,
        validatedData.relocation_willingness || false, validatedData.family_business || null,
        validatedData.financial_background || null, validatedData.faculty_mentor_id || null,
        validatedData.photo_url || null, validatedData.resume_url || null, validatedData.linkedin_url || null,
      ]
    );

    const createdStudent = result.rows[0];

    // Automatically initialize coding profiles & academics for new registration
    await db.query(`
      INSERT INTO coding_profiles (student_id, platform, handle, streak, score_rating, easy_count, medium_count, hard_count, contest_rating)
      VALUES ($1, 'LeetCode', $2, 0, 0, 0, 0, 0, 0)
      ON CONFLICT (student_id, platform) DO NOTHING;

      INSERT INTO coding_profiles (student_id, platform, handle, streak, repositories_count)
      VALUES ($1, 'GitHub', $2, 0, 0)
      ON CONFLICT (student_id, platform) DO NOTHING;
    `, [regNo, regNo.toLowerCase()]).catch(() => {/* ignore */});

    // Auto-link mentor from mentor_assignments if a pre-assignment exists
    if (!db.isMock) {
      try {
        const ma = await db.query(
          `SELECT faculty_id FROM mentor_assignments WHERE UPPER(roll_number) = $1 LIMIT 1`,
          [regNo]
        );
        if (ma.rows.length > 0) {
          await db.query(
            `UPDATE students SET faculty_mentor_id = $1, updated_at = CURRENT_TIMESTAMP WHERE roll_number = $2`,
            [ma.rows[0].faculty_id, regNo]
          );
          createdStudent.faculty_mentor_id = ma.rows[0].faculty_id;
        }
      } catch (_) { /* mentor_assignments table may not exist yet — safe to ignore */ }
    }

    res.status(201).json({ message: 'Student created successfully', student: createdStudent });
  } catch (err: any) {
    res.status(400).json({ error: err.message || err });
  }
});

// POST /students/bulk-import — Bulk Import Students & Marks from CSV/Excel
app.post('/students/bulk-import', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const studentsArray = Array.isArray(req.body) ? req.body : req.body.students;
    if (!Array.isArray(studentsArray) || studentsArray.length === 0) {
      return res.status(400).json({ error: 'Payload must contain a non-empty array of student records.' });
    }

    let importedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < studentsArray.length; i++) {
      const s = studentsArray[i];
      const rawRoll = (s.roll_number || s.regNo || s.registrationNumber || '').toString().trim().toUpperCase();
      if (!rawRoll) {
        errors.push(`Row ${i + 1}: Missing roll number`);
        continue;
      }
      if (!REGISTRATION_NUMBER_REGEX.test(rawRoll)) {
        errors.push(`Row ${i + 1} (${rawRoll}): Invalid registration number format`);
        continue;
      }

      const name = s.name || s.fullName || `Student ${rawRoll}`;
      const email = (s.email || `${rawRoll.toLowerCase()}@rgmcet.edu.in`).toString().trim().toLowerCase();
      const year = s.year || '3rd Year';
      const department = s.department || getDeptFromRollNumber(rawRoll);
      const section = (s.section || 'A').toString().replace(/^Sec\s*/i, '');
      const batch = s.batch || '2023-2027';
      const phone = s.phone || null;
      const cgpa = s.cgpa !== undefined && s.cgpa !== null && s.cgpa !== '' ? Number(s.cgpa) : 0;
      const isLat = isLateralEntry(rawRoll);

      if (db.isMock) {
        const studentObj = { roll_number: rawRoll, name, email, year, department, section, batch, phone, cgpa, is_lateral_entry: isLat, updated_at: new Date().toISOString() };
        db.mockStore.students.set(rawRoll, studentObj);
        importedCount++;
        continue;
      }

      await db.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS cgpa NUMERIC(4,2) DEFAULT 0.00;').catch(() => {});
      await db.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS is_lateral_entry BOOLEAN DEFAULT FALSE;').catch(() => {});

      await db.query(
        `INSERT INTO students (roll_number, name, email, year, phone, department, batch, section, cgpa, is_lateral_entry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (roll_number) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           year = EXCLUDED.year,
           department = EXCLUDED.department,
           batch = EXCLUDED.batch,
           section = EXCLUDED.section,
           cgpa = EXCLUDED.cgpa,
           updated_at = CURRENT_TIMESTAMP`,
        [rawRoll, name, email, year, phone, department, batch, section, cgpa]
      );

      // Save academic entry if CGPA provided
      if (cgpa > 0) {
        await db.query(
          `INSERT INTO academics (student_id, semester, semester_gpa, attendance_pct)
           VALUES ($1, 1, $2, 95.0)
           ON CONFLICT (student_id, semester) DO UPDATE SET semester_gpa = EXCLUDED.semester_gpa`,
          [rawRoll, cgpa]
        ).catch(() => {});
      }

      // Ensure default coding profile entries
      await db.query(
        `INSERT INTO coding_profiles (student_id, platform, handle, streak, score_rating, easy_count, medium_count, hard_count, contest_rating)
         VALUES ($1, 'LeetCode', $2, 0, 0, 0, 0, 0, 0)
         ON CONFLICT (student_id, platform) DO NOTHING;

         INSERT INTO coding_profiles (student_id, platform, handle, streak, repositories_count)
         VALUES ($1, 'GitHub', $2, 0, 0)
         ON CONFLICT (student_id, platform) DO NOTHING;`,
        [rawRoll, rawRoll.toLowerCase()]
      ).catch(() => {});

      // Auto-link mentor from mentor_assignments if a pre-assignment exists
      try {
        const ma = await db.query(
          `SELECT faculty_id FROM mentor_assignments WHERE UPPER(roll_number) = $1 LIMIT 1`,
          [rawRoll]
        );
        if (ma.rows.length > 0) {
          await db.query(
            `UPDATE students SET faculty_mentor_id = $1, updated_at = CURRENT_TIMESTAMP WHERE roll_number = $2`,
            [ma.rows[0].faculty_id, rawRoll]
          );
        }
      } catch (_) { /* mentor_assignments table may not exist yet */ }

      importedCount++;
    }

    res.json({
      message: `Successfully processed ${importedCount} student records.`,
      importedCount,
      errorsCount: errors.length,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Bulk import failed' });
  }
});

// POST /reports/cron-sync — Trigger Background Sync for LeetCode & GitHub Profiles
app.post('/reports/cron-sync', requireRole('admin', 'hod'), async (_req: Request, res: Response) => {
  try {
    const result = await runCodingProfileCronSync();
    res.json({
      message: 'Background coding profile sync completed',
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Cron sync failed' });
  }
});

// GET /student/mentor — Returns the student's or ward's assigned mentor details + remarks
app.get('/student/mentor', async (req: Request, res: Response) => {
  try {
    // Identify the student from query, header, or Authorization token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    if (db.isMock) return res.json({ assigned: false });

    let queryRoll = (req.query.rollNumber as string || req.query.roll_number as string || '').trim().toLowerCase();
    let queryEmail = (req.query.email as string || '').trim().toLowerCase();
    const callerEmail = (req.headers['x-caller-email'] as string || '').trim().toLowerCase();

    let studentEmail = queryEmail || callerEmail;
    let studentRoll = queryRoll;

    // Decode JWT sub claim if it is a standard 3-part JWT
    try {
      if (token.includes('.')) {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (payload.email) studentEmail = payload.email.toLowerCase();
        if (payload['custom:reg_no'] || payload['cognito:username']) {
          studentRoll = (payload['custom:reg_no'] || payload['cognito:username']).toLowerCase();
        }
      }
    } catch (_) { /* ignore decode errors */ }

    // If demo_token, extract email if not already present
    if (!studentEmail && token.startsWith('demo_token_')) {
      const parts = token.split('_');
      if (parts.length >= 4) {
        studentEmail = decodeURIComponent(parts[3]).toLowerCase();
      }
    }

    // Find student record
    let student: any = null;
    if (studentRoll) {
      const byRoll = await db.query('SELECT * FROM students WHERE LOWER(roll_number) = $1 LIMIT 1', [studentRoll]);
      if (byRoll.rows.length > 0) student = byRoll.rows[0];
    }
    if (!student && studentEmail) {
      const byEmail = await db.query('SELECT * FROM students WHERE LOWER(email) = $1 LIMIT 1', [studentEmail]);
      if (byEmail.rows.length > 0) student = byEmail.rows[0];
    }
    if (!student) return res.json({ assigned: false });

    const mentorId = student.faculty_mentor_id;
    let facResult: any = null;

    if (mentorId) {
      facResult = await db.query(
        'SELECT faculty_id, name, email, department, role FROM faculty WHERE UPPER(faculty_id) = $1 OR LOWER(email) = $2 OR LOWER(name) = $3 LIMIT 1',
        [mentorId.toUpperCase(), mentorId.toLowerCase(), mentorId.toLowerCase()]
      );
    }

    // Fallback: check mentor_assignments table if not linked on student record
    if (!facResult || facResult.rows.length === 0) {
      const assignResult = await db.query(
        `SELECT f.faculty_id, f.name, f.email, f.department, f.role 
         FROM mentor_assignments ma 
         JOIN faculty f ON UPPER(ma.faculty_id) = UPPER(f.faculty_id) 
         WHERE LOWER(ma.roll_number) = $1 LIMIT 1`,
        [student.roll_number.toLowerCase()]
      );
      if (assignResult.rows.length > 0) {
        facResult = assignResult;
      }
    }

    if (!facResult || facResult.rows.length === 0) {
      return res.json({ assigned: false, remarks: student.faculty_remarks || null });
    }

    const mentor = facResult.rows[0];
    let mentorPhone: string | null = null;
    let mentorDesignation: string | null = null;
    let mentorDomains: string[] = [];

    if (mentor.email) {
      try {
        if (db.isMock) {
          const mockProf = (db.mockStore as any).facultyFullProfiles?.get(mentor.email.toLowerCase().trim());
          if (mockProf) {
            mentorPhone = mockProf.personal?.phone || null;
            mentorDesignation = mockProf.personal?.designation || null;
            mentorDomains = mockProf.domains || [];
          }
        } else {
          await ensureFacultyProfileTable();
          const fullProfRes = await db.query(
            'SELECT personal, domains FROM faculty_full_profiles WHERE LOWER(email) = $1 LIMIT 1',
            [mentor.email.toLowerCase().trim()]
          );
          if (fullProfRes.rows.length > 0) {
            const prof = fullProfRes.rows[0];
            mentorPhone = prof.personal?.phone || null;
            mentorDesignation = prof.personal?.designation || null;
            mentorDomains = prof.domains || [];
          }
        }
      } catch (_) {}
    }

    return res.json({
      assigned: true,
      faculty_id: mentor.faculty_id,
      name: mentor.name,
      email: (mentor.email && !mentor.email.startsWith('pending_')) ? mentor.email : null,
      phone: mentorPhone || null,
      designation: mentorDesignation || (mentor.role === 'hod' ? 'Head of Department' : 'Faculty Mentor'),
      domains: mentorDomains || [],
      department: mentor.department,
      role: mentor.role,
      remarks: student.faculty_remarks || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /students/by-email/:email — Lookup Student by Email
app.get('/students/by-email/:email', async (req: Request, res: Response) => {
  try {
    const emailStr = String(req.params.email).toLowerCase().trim();
    if (db.isMock) {
      for (const s of db.mockStore.students.values()) {
        if (s.email.toLowerCase() === emailStr) return res.json(s);
      }
      return res.status(404).json({ error: 'Student not found with this email' });
    }
    const result = await db.query('SELECT * FROM students WHERE LOWER(email) = $1', [emailStr]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found with this email' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /students/:id — Get Student Profile
app.get('/students/:id', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      const student = db.mockStore.students.get(studentId);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      return res.json(student);
    }

    await db.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS cgpa NUMERIC(4,2) DEFAULT 0.00;').catch(() => {});

    const result = await db.query(
      `SELECT s.*, COALESCE(ROUND(AVG(a.semester_gpa), 2), s.cgpa, 0.00) AS cgpa
       FROM students s
       LEFT JOIN academics a ON a.student_id = s.roll_number
       WHERE UPPER(s.roll_number) = $1
          OR UPPER(s.admission_id) = $1
          OR LOWER(s.email) = LOWER($1)
          OR s.personal_mobile = $1
       GROUP BY s.roll_number, s.name, s.email, s.year, s.phone, s.address, s.native_place, s.department, s.batch, s.section, s.hostel_day_scholar, s.driving_license, s.passport, s.relocation_willingness, s.family_business, s.financial_background, s.faculty_mentor_id, s.photo_url, s.resume_url, s.linkedin_url, s.linkedin_updated, s.created_at, s.updated_at, s.cgpa
       LIMIT 1`,
      [studentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const student = result.rows[0];
    if (student) {
      student.department = student.department || getDeptFromRollNumber(student.roll_number);
    }
    res.json(student);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /students/:id — Update Student Profile (Supports Partial Updates)
app.put('/students/:id', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const body = req.body || {};

    if (db.isMock) {
      const existing = db.mockStore.students.get(studentId) || { roll_number: studentId };
      const rawDept = body.department && body.department !== '' ? body.department : (existing.department || getDeptFromRollNumber(studentId));
      const updated = {
        ...existing,
        ...body,
        department: rawDept,
        year: body.year && body.year !== '' ? body.year : (existing.year || '3rd Year'),
        hostel_day_scholar: body.hostel_day_scholar && body.hostel_day_scholar !== '' ? body.hostel_day_scholar : (existing.hostel_day_scholar || 'Day Scholar'),
        cgpa: body.cgpa !== undefined && body.cgpa !== null && body.cgpa !== '' ? Number(body.cgpa) : (existing.cgpa || 0),
        updated_at: new Date().toISOString(),
      };
      db.mockStore.students.set(studentId, updated);
      return res.json({ message: 'Profile updated successfully', student: updated });
    }

    await db.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS cgpa NUMERIC(4,2) DEFAULT 0.00;').catch(() => {});

    // Fetch existing student record to merge partial updates
    const existingRes = await db.query('SELECT * FROM students WHERE UPPER(roll_number) = $1', [studentId]);
    const existing = existingRes.rows[0] || {};

    const name = body.name || existing.name || 'Student';
    const email = body.email || existing.email || `${studentId.toLowerCase()}@rgmcet.edu.in`;
    const year = body.year && body.year !== '' ? body.year : (existing.year || '3rd Year');
    const phone = body.phone !== undefined ? body.phone : (existing.phone || null);
    const address = body.address !== undefined ? body.address : (existing.address || null);
    const native_place = body.native_place !== undefined ? body.native_place : (existing.native_place || null);
    const department = body.department && body.department !== '' ? body.department : (existing.department || getDeptFromRollNumber(studentId));
    const batch = body.batch && body.batch !== '' ? body.batch : (existing.batch || '2023-2027');
    const section = body.section && body.section !== '' ? body.section : (existing.section || 'A');
    const hostel_day_scholar = body.hostel_day_scholar && body.hostel_day_scholar !== '' ? body.hostel_day_scholar : (existing.hostel_day_scholar || 'Day Scholar');
    const driving_license = body.driving_license !== undefined ? Boolean(body.driving_license) : Boolean(existing.driving_license);
    const passport = body.passport !== undefined ? Boolean(body.passport) : Boolean(existing.passport);
    const relocation_willingness = body.relocation_willingness !== undefined ? Boolean(body.relocation_willingness) : Boolean(existing.relocation_willingness);
    const family_business = body.family_business !== undefined ? body.family_business : (existing.family_business || null);
    const financial_background = body.financial_background !== undefined ? body.financial_background : (existing.financial_background || null);
    const faculty_mentor_id = body.faculty_mentor_id !== undefined ? body.faculty_mentor_id : (existing.faculty_mentor_id || null);
    const photo_url = body.photo_url !== undefined ? body.photo_url : (existing.photo_url || null);
    const resume_url = body.resume_url !== undefined ? body.resume_url : (existing.resume_url || null);
    const linkedin_url = body.linkedin_url !== undefined ? body.linkedin_url : (existing.linkedin_url || null);
    const cgpa = body.cgpa !== undefined && body.cgpa !== null && body.cgpa !== '' ? Number(body.cgpa) : (existing.cgpa || 0);

    let result;
    if (existingRes.rows.length === 0) {
      result = await db.query(
        `INSERT INTO students (roll_number, name, email, year, phone, address, native_place, department, batch, section, hostel_day_scholar, driving_license, passport, relocation_willingness, family_business, financial_background, faculty_mentor_id, photo_url, resume_url, linkedin_url, cgpa)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING *`,
        [studentId, name, email, year, phone, address, native_place, department, batch, section, hostel_day_scholar, driving_license, passport, relocation_willingness, family_business, financial_background, faculty_mentor_id, photo_url, resume_url, linkedin_url, cgpa]
      );
    } else {
      result = await db.query(
        `UPDATE students SET name=$1, email=$2, year=$3, phone=$4, address=$5, native_place=$6,
         department=$7, batch=$8, section=$9, hostel_day_scholar=$10, driving_license=$11,
         passport=$12, relocation_willingness=$13, family_business=$14, financial_background=$15,
         faculty_mentor_id=$16, photo_url=$17, resume_url=$18, linkedin_url=$19, cgpa=$20, updated_at=CURRENT_TIMESTAMP
         WHERE UPPER(roll_number) = $21 RETURNING *`,
        [name, email, year, phone, address, native_place, department, batch, section, hostel_day_scholar, driving_license, passport, relocation_willingness, family_business, financial_background, faculty_mentor_id, photo_url, resume_url, linkedin_url, cgpa, studentId]
      );
    }

    // Recalculate CGPA from all semester records in academics table
    try {
      const acadRes = await db.query(
        'SELECT semester_gpa FROM academics WHERE student_id = $1',
        [studentId]
      );
      if (acadRes.rows.length > 0) {
        const avgCgpa = acadRes.rows.reduce((sum: number, r: any) => sum + Number(r.semester_gpa), 0) / acadRes.rows.length;
        await db.query(
          'UPDATE students SET cgpa = $1 WHERE UPPER(roll_number) = $2',
          [Number(avgCgpa.toFixed(2)), studentId]
        );
      }
    } catch { /* ignore cgpa recalc errors */ }

    res.json({ message: 'Profile updated successfully', student: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || err });
  }
});

// DELETE /students — Delete ALL students
app.delete('/students', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    if (db.isMock) {
      db.mockStore.students.clear();
      return res.json({ message: 'All student records cleared from mock store' });
    }

    // Gather emails/rolls BEFORE truncate so we know who to clean up in Cognito
    const allStudents = await db.query('SELECT email, roll_number FROM students').catch(() => ({ rows: [] }));
    const allEmails = allStudents.rows.map((r: any) => r.email).filter(Boolean);
    const allRolls = allStudents.rows.map((r: any) => r.roll_number).filter(Boolean);

    // DB truncate is the authoritative step — must succeed
    await db.query('TRUNCATE TABLE students CASCADE');

    // Cognito cleanup is best-effort: failure must NOT cause a 500
    Promise.allSettled([
      deleteCognitoUsers([...allEmails, ...allRolls]),
      deleteAllCognitoUsers(),
    ]).catch(() => {}); // .catch is a safety net — allSettled never rejects

    res.json({ message: 'All existing student records deleted successfully from database. Cognito cleanup running in background.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /students/:id
app.delete('/students/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      const deleted = db.mockStore.students.delete(studentId);
      if (!deleted) return res.status(404).json({ error: 'Student not found' });
      return res.json({ message: `Student ${studentId} deleted successfully` });
    }

    // Resolve email BEFORE delete for Cognito cleanup
    let studentEmail = `${studentId.toLowerCase()}@rgmcet.edu.in`;
    const existingRes = await db.query('SELECT email FROM students WHERE UPPER(roll_number) = $1', [studentId]);
    if (existingRes.rows.length > 0 && existingRes.rows[0].email) {
      studentEmail = existingRes.rows[0].email.toLowerCase();
    }

    // DB delete is the authoritative step
    const result = await db.query('DELETE FROM students WHERE UPPER(roll_number) = $1 RETURNING roll_number', [studentId]);
    if (result.rows.length === 0) {
      // Not in DB — fire Cognito cleanup anyway, then return 404
      deleteCognitoUsers([studentId, studentEmail]).catch(() => {});
      return res.status(404).json({ error: 'Student not found in database' });
    }

    // Cognito + session cleanup — awaited so errors appear in Lambda logs
    // (does NOT throw — errors are caught and logged inside deleteCognitoUsers)
    await deleteCognitoUsers([studentId, studentEmail]);

    res.json({ message: `Student ${studentId} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Bulk Delete Students (Admin)
// ============================================================================

// POST /admin/students/bulk-delete — delete multiple students by roll-number array
app.post('/admin/students/bulk-delete', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { roll_numbers } = req.body;
    if (!Array.isArray(roll_numbers) || roll_numbers.length === 0) {
      return res.status(400).json({ error: 'roll_numbers must be a non-empty array' });
    }
    const ids = roll_numbers.map((r: string) => String(r).toUpperCase());

    if (db.isMock) {
      let deleted = 0;
      ids.forEach((id) => { if (db.mockStore.students.delete(id)) deleted++; });
      return res.json({ deleted, message: `${deleted} student(s) deleted from mock store` });
    }

    // Resolve emails BEFORE delete for Cognito cleanup
    let emailsToDelete: string[] = [];
    const existingRes = await db.query('SELECT email FROM students WHERE UPPER(roll_number) = ANY($1)', [ids]);
    if (existingRes.rows.length > 0) {
      emailsToDelete = existingRes.rows.map((r: any) => r.email).filter(Boolean);
    }

    // DB delete is the authoritative step
    const result = await db.query(
      'DELETE FROM students WHERE UPPER(roll_number) = ANY($1) RETURNING roll_number',
      [ids]
    );
    const deleted = result.rows.length;

    // Cognito + session cleanup — awaited so failures show in Lambda logs
    await deleteCognitoUsers([...ids, ...emailsToDelete]);

    res.json({ deleted, message: `${deleted} student(s) deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Academics
// ============================================================================
app.get('/students/:id/academics', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      return res.json(db.mockStore.academics.get(studentId) || []);
    }

    const result = await db.query(
      'SELECT * FROM academics WHERE student_id = $1 ORDER BY semester',
      [studentId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students/:id/academics', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = academicSchema.parse(req.body);

    if (db.isMock) {
      const existing = db.mockStore.academics.get(studentId) || [];
      const updated = existing.filter(a => a.semester !== validated.semester);
      updated.push(validated);
      updated.sort((a, b) => a.semester - b.semester);
      db.mockStore.academics.set(studentId, updated);
      return res.json({ message: 'Academic record saved', academics: updated });
    }

    await db.query(
      `INSERT INTO academics (student_id, semester, semester_gpa, programming_grade, attendance_pct, theory_grade, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (student_id, semester) DO UPDATE SET
         semester_gpa = EXCLUDED.semester_gpa,
         programming_grade = EXCLUDED.programming_grade,
         attendance_pct = EXCLUDED.attendance_pct,
         theory_grade = EXCLUDED.theory_grade,
         remarks = EXCLUDED.remarks,
         updated_at = CURRENT_TIMESTAMP`,
      [studentId, validated.semester, validated.semester_gpa, validated.programming_grade || null,
       validated.attendance_pct, validated.theory_grade || null, validated.remarks || null]
    );

    const result = await db.query(
      'SELECT * FROM academics WHERE student_id = $1 ORDER BY semester',
      [studentId]
    );
    res.json({ message: 'Academic record saved', academics: result.rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Coding Profiles
// ============================================================================
app.get('/students/:id/coding-profiles', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      return res.json(db.mockStore.codingProfiles.get(studentId) || []);
    }

    const result = await db.query(
      'SELECT * FROM coding_profiles WHERE student_id = $1 ORDER BY platform',
      [studentId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students/:id/coding-profiles', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = codingProfileSchema.parse(req.body);

    if (db.isMock) {
      const existing = db.mockStore.codingProfiles.get(studentId) || [];
      const updated = existing.filter(p => p.platform !== validated.platform);
      updated.push({ ...validated, id: String(Date.now()) });
      db.mockStore.codingProfiles.set(studentId, updated);
      return res.json({ message: 'Coding profile updated', profiles: updated });
    }

    await db.query(
      `INSERT INTO coding_profiles (student_id, platform, handle, streak, score_rating, easy_count, medium_count, hard_count, contest_rating, repositories_count, commits_count, prs_merged)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (student_id, platform) DO UPDATE SET
         handle = EXCLUDED.handle,
         streak = EXCLUDED.streak,
         score_rating = EXCLUDED.score_rating,
         easy_count = EXCLUDED.easy_count,
         medium_count = EXCLUDED.medium_count,
         hard_count = EXCLUDED.hard_count,
         contest_rating = EXCLUDED.contest_rating,
         commits_count = EXCLUDED.commits_count,
         prs_merged = EXCLUDED.prs_merged,
         last_synced = CURRENT_TIMESTAMP
         -- NOTE: repositories_count, followers_count, stars_count, top_language are intentionally
         -- NOT overwritten here — they are managed exclusively by the cron sync from GitHub API`,
      [studentId, validated.platform, validated.handle, validated.streak,
       validated.score_rating, validated.easy_count || 0, validated.medium_count || 0, validated.hard_count || 0, validated.contest_rating || 0,
       validated.repositories_count, validated.commits_count, validated.prs_merged]
    );

    // If platform is LeetCode, immediately fetch real stats from LeetCode GraphQL in background
    if (validated.platform === 'LeetCode' && validated.handle && validated.handle !== 'Not Linked') {
      (async () => {
        try {
          const lcData = await fetchLeetCodeStatsDirect(validated.handle);
          if (lcData) {
            await db.query(
              `UPDATE coding_profiles
               SET score_rating = $1, easy_count = $2, medium_count = $3, hard_count = $4,
                   streak = COALESCE($5, streak), updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $6 AND LOWER(platform) = 'leetcode'`,
              [lcData.solved, lcData.easy, lcData.medium, lcData.hard, lcData.streak || 0, studentId]
            ).catch(() => {});
            await db.query('UPDATE students SET updated_at = CURRENT_TIMESTAMP WHERE UPPER(roll_number) = $1', [studentId]).catch(() => {});
            console.log(`[LeetCode Sync] ${validated.handle} -> ${lcData.solved} solved (E:${lcData.easy}, M:${lcData.medium}, H:${lcData.hard})`);
          }
        } catch (e: any) {
          console.warn(`[LeetCode Sync] Failed for ${validated.handle}:`, e.message);
        }
      })();
    }

    // If platform is GitHub, immediately fetch stats from GitHub API in background
    if (validated.platform === 'GitHub' && validated.handle && validated.handle !== 'Not Linked') {
      (async () => {
        try {
          const ghData = await fetchGitHubStatsDirect(validated.handle);
          if (ghData) {
            await db.query(
              `UPDATE coding_profiles
               SET repositories_count = $1, followers_count = $2, stars_count = $3,
                   top_language = $4, updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $5 AND LOWER(platform) = 'github'`,
              [ghData.repos, ghData.followers, ghData.stars, ghData.topLanguage, studentId]
            ).catch(() => {});
            console.log(`[GitHub Sync] ${validated.handle}: repos=${ghData.repos}, stars=${ghData.stars}, followers=${ghData.followers}, lang=${ghData.topLanguage}`);
          }
        } catch (e: any) {
          console.warn(`[GitHub Sync] Failed for ${validated.handle}:`, e.message);
        }
      })();
    }

    const result = await db.query(
      'SELECT * FROM coding_profiles WHERE student_id = $1 ORDER BY platform',
      [studentId]
    );
    res.json({ message: 'Coding profile updated', profiles: result.rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /admin/sync-coding-profiles — Admin/HOD/Faculty triggers batch sync for student coding profiles
app.post('/admin/sync-coding-profiles', requireRole('admin', 'hod', 'faculty'), async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const result = await runCodingProfileCronSync(limit);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/students/:id/coding-profiles/:platform', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const platform = String(req.params.platform);

    if (db.isMock) {
      const existing = db.mockStore.codingProfiles.get(studentId) || [];
      const updated = existing.filter(p => p.platform.toLowerCase() !== platform.toLowerCase());
      db.mockStore.codingProfiles.set(studentId, updated);
      return res.json({ message: 'Coding profile deleted', profiles: updated });
    }

    await db.query(
      'DELETE FROM coding_profiles WHERE UPPER(student_id) = $1 AND LOWER(platform) = $2',
      [studentId, platform.toLowerCase()]
    );

    const result = await db.query(
      'SELECT * FROM coding_profiles WHERE student_id = $1 ORDER BY platform',
      [studentId]
    );
    res.json({ message: 'Coding profile deleted', profiles: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /proxy/leetcode/:handle — Proxy live LeetCode stats via GraphQL
app.get('/proxy/leetcode/:handle', async (req: Request, res: Response) => {
  try {
    const rawHandle = decodeURIComponent(String(req.params.handle || '')).trim();
    const handle = rawHandle
      .replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/|profile\/)?/i, '')
      .replace(/^https?:\/\/(www\.)?leetcode\.cn\/(u\/|profile\/)?/i, '')
      .replace(/^u\//i, '')
      .replace(/^profile\//i, '')
      .replace(/^@/, '')
      .replace(/\/.*$/, '')
      .trim();

    if (!handle || handle.toLowerCase() === 'not linked') {
      return res.status(400).json({ error: 'Valid LeetCode handle is required' });
    }
    const forceRefresh = req.query.refresh === 'true';

    // ── Cache-first (2-hour TTL) ──────────────────────────────────────────────
    const { data: result, fromCache } = await cachedFetch('leetcode', handle, async () => {
      const gql = `
        query userProblemsSolved($username: String!) {
          matchedUser(username: $username) {
            username
            userCalendar {
              streak
              totalActiveDays
              submissionCalendar
            }
            submitStats: submitStatsGlobal {
              acSubmissionNum { difficulty count submissions }
            }
            profile { ranking reputation }
          }
          recentAcSubmissionList(username: $username, limit: 15) {
            id
            title
            titleSlug
            timestamp
          }
          userContestRanking(username: $username) { rating globalRanking attendedContestsCount }
        }
      `;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      let lcFetch: Awaited<ReturnType<typeof fetch>> | null = null;
      try {
        lcFetch = await fetch('https://leetcode.com/graphql', {
          method: 'POST', signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
            'Referer': 'https://leetcode.com', 'Origin': 'https://leetcode.com',
            'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9',
          },
          body: JSON.stringify({ query: gql, variables: { username: handle } }),
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
      }
      clearTimeout(timeoutId);

      if (lcFetch && lcFetch.ok) {
        const json: any = await lcFetch.json();
        const matchedUser = json?.data?.matchedUser;
        if (matchedUser) {
          const stats = matchedUser.submitStats?.acSubmissionNum || [];
          let easySolved = 0, mediumSolved = 0, hardSolved = 0, totalSolved = 0;
          stats.forEach((s: any) => {
            if (s.difficulty === 'Easy')   easySolved   = s.count || 0;
            if (s.difficulty === 'Medium') mediumSolved = s.count || 0;
            if (s.difficulty === 'Hard')   hardSolved   = s.count || 0;
            if (s.difficulty === 'All')    totalSolved  = s.count || 0;
          });
          if (!totalSolved) totalSolved = easySolved + mediumSolved + hardSolved;
          const contestInfo = json?.data?.userContestRanking || {};

          const rawCalendar = matchedUser.userCalendar?.submissionCalendar;
          let submissionCalendar = {};
          if (rawCalendar) {
            try {
              submissionCalendar = typeof rawCalendar === 'string' ? JSON.parse(rawCalendar) : rawCalendar;
            } catch { /* ignore */ }
          }
          const recentSubmissions = json?.data?.recentAcSubmissionList || [];

          return {
            handle: matchedUser.username || handle,
            totalSolved,
            easySolved,
            mediumSolved,
            hardSolved,
            ranking: matchedUser.profile?.ranking || 0,
            reputation: matchedUser.profile?.reputation || 0,
            streak: matchedUser.userCalendar?.streak || 0,
            totalActiveDays: matchedUser.userCalendar?.totalActiveDays || 0,
            submissionCalendar,
            recentSubmissions,
            contestRating: Math.round(contestInfo.rating || 0),
            attendedContestsCount: contestInfo.attendedContestsCount || 0,
          };
        }
      }

      // Fallback: alfa-leetcode-api
      try {
        const alfaFetch = await fetch(`https://alfa-leetcode-api.onrender.com/${encodeURIComponent(handle)}/solved`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (alfaFetch.ok) {
          const alfaJson: any = await alfaFetch.json();
          if (alfaJson && typeof alfaJson.solvedProblem === 'number') {
            return {
              handle,
              totalSolved: alfaJson.solvedProblem || 0,
              easySolved: alfaJson.easySolved || 0,
              mediumSolved: alfaJson.mediumSolved || 0,
              hardSolved: alfaJson.hardSolved || 0,
              ranking: 0,
              reputation: 0,
              streak: 0,
              totalActiveDays: 0,
              submissionCalendar: {},
              recentSubmissions: [],
              contestRating: 0,
              attendedContestsCount: 0,
            };
          }
        }
      } catch (_) {}

      throw Object.assign(new Error('not_found'), { isNotFound: true });
    }, forceRefresh);

    // Auto-sync live stats into Postgres coding_profiles database so leaderboards update in real-time
    if (result && result.totalSolved !== undefined && !db.isMock) {
      const cleanH = handle.replace(/^https?:\/\/(www\.)?leetcode\.(com|cn)\/(u\/|profile\/)?/i, '').replace(/\/$/, '').trim();
      db.query(
        `UPDATE coding_profiles
         SET score_rating = $1, easy_count = $2, medium_count = $3, hard_count = $4,
             contest_rating = $5, streak = COALESCE(NULLIF($6, 0), streak), updated_at = CURRENT_TIMESTAMP
         WHERE (
           LOWER(TRIM(BOTH '/' FROM REPLACE(handle, ' ', ''))) = LOWER($7)
           OR LOWER(TRIM(BOTH '/' FROM REPLACE(REPLACE(REPLACE(handle, 'https://leetcode.com/u/', ''), 'https://leetcode.com/', ''), 'http://leetcode.com/', ''))) = LOWER($7)
           OR LOWER(handle) ILIKE '%' || LOWER($7) || '%'
         ) AND LOWER(platform) = 'leetcode'`,
        [result.totalSolved, result.easySolved, result.mediumSolved, result.hardSolved, result.contestRating || 0, result.streak || 0, cleanH]
      ).catch((e) => console.warn('[LC DB Sync warn]', e.message));
    }

    res.set('X-Cache', fromCache ? 'HIT' : 'MISS');
    res.json(result);
  } catch (err: any) {
    if (err.isTimeout || err.name === 'AbortError') return res.status(503).json({ error: 'LeetCode API timed out — may be rate limiting this server. Try again shortly.' });
    if (err.isNotFound) return res.status(404).json({ error: `LeetCode user "${req.params.handle}" not found` });
    if (err.message?.startsWith('LC_HTTP_')) return res.status(502).json({ error: `LeetCode API HTTP ${err.message.replace('LC_HTTP_','')}` });
    res.status(500).json({ error: err.message || 'Failed to fetch LeetCode profile' });
  }
});

// GET /proxy/github/:handle — Server-side GitHub proxy; uses GITHUB_PAT if set → 5000 req/hr
app.get('/proxy/github/:handle', async (req: Request, res: Response) => {
  try {
    const rawHandle = String(req.params.handle).trim();
    if (!rawHandle) return res.status(400).json({ error: 'Handle is required' });
    const handle = rawHandle.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '').trim();
    const forceRefresh = req.query.refresh === 'true';

    const { data: result, fromCache } = await cachedFetch('github', handle, async () => {
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Advitiyans-App/1.0' };
      if (process.env.GITHUB_PAT) headers['Authorization'] = `Bearer ${process.env.GITHUB_PAT}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const [userRes, reposRes, eventsRes] = await Promise.allSettled([
        fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, { headers, signal: controller.signal }),
        fetch(`https://api.github.com/users/${encodeURIComponent(handle)}/repos?sort=updated&per_page=100`, { headers }),
        fetch(`https://api.github.com/users/${encodeURIComponent(handle)}/events/public?per_page=30`, { headers }),
      ]);
      clearTimeout(timeoutId);

      if (userRes.status !== 'fulfilled') {
        const isAbort = (userRes.reason as any)?.name === 'AbortError';
        throw Object.assign(new Error(isAbort ? 'timeout' : 'network'), { isTimeout: isAbort });
      }
      if (!userRes.value.ok) {
        const s = userRes.value.status;
        if (s === 404) throw Object.assign(new Error('not_found'), { isNotFound: true });
        if (s === 403 || s === 429) throw Object.assign(new Error('rate_limited'), { isRateLimit: true });
        throw Object.assign(new Error(`GH_HTTP_${s}`), { httpStatus: s });
      }
      const user: any = await userRes.value.json();
      if (!user?.login) throw Object.assign(new Error('not_found'), { isNotFound: true });

      const repos  = reposRes.status  === 'fulfilled' && reposRes.value.ok  ? await reposRes.value.json()  : [];
      const events = eventsRes.status === 'fulfilled' && eventsRes.value.ok ? await eventsRes.value.json() : [];

      return { login: user.login, html_url: user.html_url, public_repos: user.public_repos ?? 0,
               followers: user.followers ?? 0, following: user.following ?? 0, avatar_url: user.avatar_url,
               repos: Array.isArray(repos) ? repos : [], events: Array.isArray(events) ? events : [] };
    });

    // Auto-sync GitHub stats into Postgres coding_profiles database so leaderboards update in real-time
    if (result && result.public_repos !== undefined && !db.isMock) {
      const cleanGh = handle.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '').trim();
      const stars = Array.isArray(result.repos) ? result.repos.reduce((acc: number, r: any) => acc + (r.stargazers_count || 0), 0) : 0;
      const langCounts: Record<string, number> = {};
      if (Array.isArray(result.repos)) {
        for (const r of result.repos) {
          if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
        }
      }
      const topLanguage = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      db.query(
        `UPDATE coding_profiles
         SET repositories_count = $1, followers_count = $2, stars_count = $3,
             top_language = $4, updated_at = CURRENT_TIMESTAMP
         WHERE (
           LOWER(TRIM(BOTH '/' FROM REPLACE(handle, ' ', ''))) = LOWER($5)
           OR LOWER(TRIM(BOTH '/' FROM REPLACE(REPLACE(handle, 'https://github.com/', ''), 'http://github.com/', ''))) = LOWER($5)
           OR LOWER(handle) ILIKE '%' || LOWER($5) || '%'
         ) AND LOWER(platform) = 'github'`,
        [result.public_repos, result.followers || 0, stars, topLanguage, cleanGh]
      ).catch((e) => console.warn('[GH DB Sync warn]', e.message));
    }

    res.set('X-Cache', fromCache ? 'HIT' : 'MISS');
    res.json(result);
  } catch (err: any) {
    if (err.isTimeout)    return res.status(503).json({ error: 'GitHub API timed out. Try again shortly.' });
    if (err.isNotFound)   return res.status(404).json({ error: `GitHub user "${req.params.handle}" not found` });
    if (err.isRateLimit)  return res.status(429).json({ error: 'GitHub rate limited. Add GITHUB_PAT to Lambda env to raise limit to 5000/hr.', retryAfter: 60 });
    if (err.message?.startsWith('GH_HTTP_')) return res.status(502).json({ error: `GitHub API HTTP ${err.message.replace('GH_HTTP_','')}` });
    res.status(500).json({ error: err.message || 'Failed to fetch GitHub profile' });
  }
});

// GET /proxy/gfg/:handle — Scrapes GFG's own profile page for accurate stats
// GFG embeds all user data in Next.js RSC __next_f.push() calls in the HTML
app.get('/proxy/gfg/:handle', async (req: Request, res: Response) => {
  try {
    const rawHandle = String(req.params.handle).trim();
    if (!rawHandle) return res.status(400).json({ error: 'Handle is required' });
    const handle = rawHandle
      .replace(/^https?:\/\/(www\.)?geeksforgeeks\.org\/profile\//i, '')
      .replace(/^https?:\/\/(www\.)?geeksforgeeks\.org\/user\//i, '')
      .replace(/^https?:\/\/auth\.geeksforgeeks\.org\/user\//i, '')
      .replace(/\?.*$/, '')   // strip query params like ?from=explore
      .replace(/\/$/, '').trim();
    if (!handle) return res.status(400).json({ error: 'Invalid handle' });

    const { data: result, fromCache } = await cachedFetch('gfg', handle, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let gfgFetch: Awaited<ReturnType<typeof fetch>>;
      try {
        // Scrape GFG's own profile page — it embeds all stats in Next.js RSC data
        gfgFetch = await fetch(`https://www.geeksforgeeks.org/profile/${encodeURIComponent(handle)}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') throw Object.assign(new Error('timeout'), { isTimeout: true });
        throw fetchErr;
      }
      clearTimeout(timeoutId);

      if (gfgFetch.status === 404) throw Object.assign(new Error('not_found'), { isNotFound: true });
      if (!gfgFetch.ok) throw Object.assign(new Error(`GFG_HTTP_${gfgFetch.status}`), { httpStatus: gfgFetch.status });

      const html = await gfgFetch.text();

      // GFG is a Next.js app — user stats are embedded as RSC data in __next_f.push() script tags
      // Extract all push payloads and find the one with articleCount / total_problems_solved
      const pushRegex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs;
      let articleCount: any = null;
      let mentor: any = null;
      let match;

      while ((match = pushRegex.exec(html)) !== null) {
        try {
          // Unescape the JSON string value
          const raw = match[1].replace(/\\"/g, '"').replace(/\\n/g, '').replace(/\\\\/g, '\\');
          if (raw.includes('total_problems_solved') || raw.includes('totalProblemsSolved')) {
            // Find the JSON object with the stats
            const jsonStart = raw.indexOf('"articleCount":{');
            if (jsonStart !== -1) {
              // Extract just the articleCount object by finding matching braces
              let depth = 0;
              let start = raw.indexOf('{', jsonStart + '"articleCount":'.length);
              let end = start;
              for (let i = start; i < raw.length; i++) {
                if (raw[i] === '{') depth++;
                else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
              }
              articleCount = JSON.parse(raw.substring(start, end + 1));
            }
            // Also find mentor object for profile info
            const mentorStart = raw.indexOf('"mentor":{');
            if (mentorStart !== -1) {
              let depth = 0;
              let start = raw.indexOf('{', mentorStart + '"mentor":'.length);
              let end = start;
              for (let i = start; i < raw.length; i++) {
                if (raw[i] === '{') depth++;
                else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
              }
              mentor = JSON.parse(raw.substring(start, end + 1));
            }
          }
        } catch { /* skip malformed chunks */ }
        if (articleCount) break;
      }

      // If no __next_f data, check if user not found (page shows 404 content)
      if (!articleCount) {
        if (html.includes('404.png') || html.includes('not-found') || html.includes('notFound')) {
          throw Object.assign(new Error('not_found'), { isNotFound: true });
        }
        // Profile exists but no stats yet (brand new account)
        return {
          info: { totalProblemsSolved: 0, codingScore: 0, streak: 0, monthlyScore: 0, globalRank: '' },
          solvedStats: {},
          handle,
        };
      }

      // Normalize to our expected format (compatible with liveFetchers.ts GFG parser)
      return {
        info: {
          totalProblemsSolved: articleCount.total_problems_solved ?? 0,
          codingScore:         articleCount.score ?? 0,
          monthlyScore:        articleCount.monthly_score ?? 0,
          streak:              articleCount.pod_solved_current_streak ?? 0,
          longestStreak:       articleCount.pod_solved_longest_streak ?? 0,
          globalLongestStreak: articleCount.pod_solved_global_longest_streak ?? 0,
          instituteRank:       articleCount.institute_rank || '',
          articlesPublished:   articleCount.total_articles_published ?? 0,
          userName:            handle,
          fullName:            mentor?.name || articleCount.name || handle,
          profilePicture:      mentor?.profile_image_url || '',
        },
        solvedStats: {},
        handle,
      };
    });

    res.set('X-Cache', fromCache ? 'HIT' : 'MISS');
    res.json(result);
  } catch (err: any) {
    if (err.isTimeout)   return res.status(503).json({ error: 'GFG profile page timed out. Try again shortly.' });
    if (err.isNotFound)  return res.status(404).json({ error: `GeeksforGeeks user "${req.params.handle}" not found` });
    if (err.message?.startsWith('GFG_HTTP_')) return res.status(502).json({ error: `GFG HTTP ${err.message.replace('GFG_HTTP_','')}` });
    res.status(500).json({ error: err.message || 'Failed to fetch GFG profile' });
  }
});
// ============================================================================
// Tech Skills
// ============================================================================
app.get('/students/:id/tech-skills', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      return res.json(db.mockStore.techSkills.get(studentId) || []);
    }

    const result = await db.query(
      'SELECT * FROM tech_skills WHERE student_id = $1 ORDER BY skill_category, specific_tool',
      [studentId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students/:id/tech-skills', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = techSkillSchema.parse(req.body);

    if (db.isMock) {
      const existing = db.mockStore.techSkills.get(studentId) || [];
      const updated = existing.filter(s => s.specific_tool !== validated.specific_tool);
      updated.push({ ...validated, id: String(Date.now()) });
      db.mockStore.techSkills.set(studentId, updated);
      return res.json({ message: 'Tech skill added', skills: updated });
    }

    await db.query(
      `INSERT INTO tech_skills (student_id, skill_category, specific_tool, self_rating, verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, specific_tool) DO UPDATE SET
         skill_category = EXCLUDED.skill_category,
         self_rating = EXCLUDED.self_rating,
         verified = EXCLUDED.verified`,
      [studentId, validated.skill_category, validated.specific_tool, validated.self_rating, validated.verified]
    );

    const result = await db.query(
      'SELECT * FROM tech_skills WHERE student_id = $1 ORDER BY skill_category, specific_tool',
      [studentId]
    );
    res.json({ message: 'Tech skill added', skills: result.rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Helper to extract clean S3 key from a full S3 URL or partial path
function extractS3Key(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  const raw = String(urlOrKey).trim();
  if (!raw) return null;
  const withoutQuery = raw.split('?')[0].trim();
  const idx = withoutQuery.indexOf('students/');
  if (idx !== -1) {
    try {
      return decodeURIComponent(withoutQuery.substring(idx));
    } catch {
      return withoutQuery.substring(idx);
    }
  }
  return null;
}

// Clean S3 URL for DB storage (strip temporary expired query params)
function cleanS3UrlForStorage(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  const key = extractS3Key(urlOrKey);
  if (key) return key;
  // Fallback: strip query string if it looks like an S3 presigned URL
  return String(urlOrKey).replace(/\?X-Amz-[\s\S]*$/i, '').trim() || null;
}

// Dynamic S3 signing for certification rows (ensures view URLs never expire)
async function signCertificationRows(rows: any[]): Promise<any[]> {
  const bucketName = process.env.UPLOADS_BUCKET_NAME;
  if (!bucketName || !Array.isArray(rows) || rows.length === 0) return rows;

  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3Client = new S3Client({});

    return await Promise.all(
      rows.map(async (row) => {
        if (!row.certificate_file_url) return row;
        const key = extractS3Key(row.certificate_file_url);
        if (!key) return row;

        try {
          const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          });
          // 24-hour expiration for dynamically generated signed URLs
          const freshUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 });
          return {
            ...row,
            certificate_file_url: freshUrl,
            file_key: key,
          };
        } catch (err: any) {
          console.warn(`[S3] Failed to re-sign cert key ${key}:`, err.message);
          return { ...row, file_key: key };
        }
      })
    );
  } catch (err: any) {
    console.warn('[S3] S3 signer initialization failed:', err.message);
    return rows;
  }
}

// Certifications
// ============================================================================
app.get('/students/:id/certifications', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      return res.json(db.mockStore.certifications.get(studentId) || []);
    }

    const result = await db.query(
      'SELECT * FROM certifications WHERE student_id = $1 ORDER BY date_completed DESC NULLS LAST',
      [studentId]
    );
    const signedRows = await signCertificationRows(result.rows);
    res.json(signedRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students/:id/certifications', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = certificationSchema.parse(req.body);
    const storageUrl = cleanS3UrlForStorage(validated.certificate_file_url);

    if (db.isMock) {
      const existing = db.mockStore.certifications.get(studentId) || [];
      existing.push({ ...validated, certificate_file_url: storageUrl || undefined, id: String(Date.now()) });
      db.mockStore.certifications.set(studentId, existing);
      return res.json({ message: 'Certification added', certifications: existing });
    }

    await db.query(
      `INSERT INTO certifications (student_id, provider, title, date_completed, certificate_file_url, suggested)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [studentId, validated.provider, validated.title, validated.date_completed || null,
       storageUrl, validated.suggested]
    );

    const result = await db.query(
      'SELECT * FROM certifications WHERE student_id = $1 ORDER BY date_completed DESC NULLS LAST',
      [studentId]
    );
    const signedRows = await signCertificationRows(result.rows);
    res.json({ message: 'Certification added', certifications: signedRows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/students/:id/certifications/:certId', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const certId = req.params.certId;
    const validated = certificationSchema.parse(req.body);
    const storageUrl = cleanS3UrlForStorage(validated.certificate_file_url);

    if (db.isMock) {
      const existing = db.mockStore.certifications.get(studentId) || [];
      const idx = existing.findIndex((c: any) => c.id === certId);
      if (idx >= 0) existing[idx] = { ...existing[idx], ...validated, certificate_file_url: storageUrl || undefined };
      db.mockStore.certifications.set(studentId, existing);
      return res.json({ message: 'Certification updated', certifications: existing });
    }

    await db.query(
      `UPDATE certifications SET provider = $1, title = $2, date_completed = $3, certificate_file_url = $4, suggested = $5
       WHERE id = $6 AND student_id = $7`,
      [validated.provider, validated.title, validated.date_completed || null,
       storageUrl, validated.suggested, certId, studentId]
    );

    const result = await db.query(
      'SELECT * FROM certifications WHERE student_id = $1 ORDER BY date_completed DESC NULLS LAST',
      [studentId]
    );
    const signedRows = await signCertificationRows(result.rows);
    res.json({ message: 'Certification updated', certifications: signedRows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/students/:id/certifications/:certId', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const certId = req.params.certId;

    if (db.isMock) {
      const existing = db.mockStore.certifications.get(studentId) || [];
      const updated = existing.filter((c: any) => c.id !== certId);
      db.mockStore.certifications.set(studentId, updated);
      return res.json({ message: 'Certification deleted', certifications: updated });
    }

    await db.query(
      'DELETE FROM certifications WHERE id = $1 AND student_id = $2',
      [certId, studentId]
    );

    const result = await db.query(
      'SELECT * FROM certifications WHERE student_id = $1 ORDER BY date_completed DESC NULLS LAST',
      [studentId]
    );
    const signedRows = await signCertificationRows(result.rows);
    res.json({ message: 'Certification deleted', certifications: signedRows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Soft Skills
// ============================================================================
app.get('/students/:id/soft-skills', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      return res.json(db.mockStore.softSkills.get(studentId) || []);
    }

    const result = await db.query(
      'SELECT * FROM soft_skills WHERE student_id = $1 ORDER BY skill',
      [studentId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students/:id/soft-skills', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = softSkillSchema.parse(req.body);

    if (db.isMock) {
      const existing = db.mockStore.softSkills.get(studentId) || [];
      const updated = existing.filter(s => !(s.skill === validated.skill && s.rated_by === validated.rated_by));
      updated.push(validated);
      db.mockStore.softSkills.set(studentId, updated);
      return res.json({ message: 'Soft skill rating saved', softSkills: updated });
    }

    await db.query(
      `INSERT INTO soft_skills (student_id, skill, rating, rated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, skill, rated_by) DO UPDATE SET
         rating = EXCLUDED.rating,
         updated_at = CURRENT_TIMESTAMP`,
      [studentId, validated.skill, validated.rating, validated.rated_by]
    );

    const result = await db.query(
      'SELECT * FROM soft_skills WHERE student_id = $1 ORDER BY skill',
      [studentId]
    );
    res.json({ message: 'Soft skill rating saved', softSkills: result.rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Achievements
// ============================================================================
app.get('/students/:id/achievements', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      return res.json(db.mockStore.achievements.get(studentId) || []);
    }

    const result = await db.query(
      'SELECT * FROM achievements WHERE student_id = $1 ORDER BY achievement_date DESC NULLS LAST',
      [studentId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students/:id/achievements', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = achievementSchema.parse(req.body);

    if (db.isMock) {
      const existing = db.mockStore.achievements.get(studentId) || [];
      existing.unshift({ ...validated, id: String(Date.now()) });
      db.mockStore.achievements.set(studentId, existing);
      return res.json({ message: 'Achievement added', achievements: existing });
    }

    await db.query(
      `INSERT INTO achievements (student_id, type, title, description, achievement_date, organization)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [studentId, validated.type, validated.title, validated.description,
       validated.achievement_date || null, validated.organization || null]
    );

    const result = await db.query(
      'SELECT * FROM achievements WHERE student_id = $1 ORDER BY achievement_date DESC NULLS LAST',
      [studentId]
    );
    res.json({ message: 'Achievement added', achievements: result.rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Placement Profile
// ============================================================================
app.get('/students/:id/placement-profile', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      const placement = db.mockStore.placement.get(studentId);
      return res.json(placement || {});
    }

    const result = await db.query(
      'SELECT * FROM placement_profile WHERE student_id = $1',
      [studentId]
    );
    res.json(result.rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/students/:id/placement-profile', requireOwnerOrRole('id', 'faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();
    const validated = placementProfileSchema.parse(req.body);

    if (db.isMock) {
      const existing = db.mockStore.placement.get(studentId) || {};
      const updated = { ...existing, ...validated, student_id: studentId, updated_at: new Date().toISOString() };
      db.mockStore.placement.set(studentId, updated);
      return res.json({ message: 'Placement preferences saved', placement: updated });
    }

    const result = await db.query(
      `INSERT INTO placement_profile (student_id, placement_category, preferred_career, dream_company, higher_studies_interest, need_from_department)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id) DO UPDATE SET
         placement_category = EXCLUDED.placement_category,
         preferred_career = EXCLUDED.preferred_career,
         dream_company = EXCLUDED.dream_company,
         higher_studies_interest = EXCLUDED.higher_studies_interest,
         need_from_department = EXCLUDED.need_from_department,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, validated.placement_category, validated.preferred_career,
       validated.dream_company, validated.higher_studies_interest, validated.need_from_department || null]
    );
    res.json({ message: 'Placement preferences saved', placement: result.rows[0] });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Employability Score
// ============================================================================
app.get('/students/:id/employability-score', async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id.toUpperCase();

    if (db.isMock) {
      const academics = db.mockStore.academics.get(studentId) || [];
      const codingProfiles = db.mockStore.codingProfiles.get(studentId) || [];
      const techSkills = db.mockStore.techSkills.get(studentId) || [];
      const certifications = db.mockStore.certifications.get(studentId) || [];
      const softSkills = db.mockStore.softSkills.get(studentId) || [];
      const achievements = db.mockStore.achievements.get(studentId) || [];
      return res.json(calculateEmployabilityScore({ academics, codingProfiles, techSkills, certifications, softSkills, achievements }));
    }

    const [academicsRes, codingRes, skillsRes, certsRes, softRes, achieveRes] = await Promise.all([
      db.query('SELECT * FROM academics WHERE student_id = $1', [studentId]),
      db.query('SELECT * FROM coding_profiles WHERE student_id = $1', [studentId]),
      db.query('SELECT * FROM tech_skills WHERE student_id = $1', [studentId]),
      db.query('SELECT * FROM certifications WHERE student_id = $1', [studentId]),
      db.query('SELECT * FROM soft_skills WHERE student_id = $1', [studentId]),
      db.query('SELECT * FROM achievements WHERE student_id = $1', [studentId]),
    ]);

    const scoreData = calculateEmployabilityScore({
      academics: academicsRes.rows,
      codingProfiles: codingRes.rows,
      techSkills: skillsRes.rows,
      certifications: certsRes.rows,
      softSkills: softRes.rows,
      achievements: achieveRes.rows,
    });
    res.json(scoreData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Upload URL (S3 Pre-signed URL) — Real pre-signed URL generation
// ============================================================================
app.get('/students/:id/upload-url', async (req: Request, res: Response) => {
  try {
    const { fileName, uploadType } = req.query;
    const studentId = req.params.id.toUpperCase();
    const fileKey = `students/${studentId}/${uploadType || 'docs'}/${Date.now()}_${fileName || 'file.pdf'}`;
    const bucketName = process.env.UPLOADS_BUCKET_NAME;

    if (!bucketName) {
      // Fallback for local dev without S3
      return res.json({
        uploadUrl: `https://placeholder-no-bucket.s3.amazonaws.com/${fileKey}`,
        viewUrl: `https://placeholder-no-bucket.s3.amazonaws.com/${fileKey}`,
        fileKey,
        expiresInSeconds: 300,
        warning: 'UPLOADS_BUCKET_NAME not set — using placeholder URL',
      });
    }

    const { S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const s3Client = new S3Client({});

    // Generate PUT pre-signed URL for upload
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: 'application/octet-stream',
    });
    const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });

    // Generate GET pre-signed URL for viewing the file after upload
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });
    const viewUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    res.json({
      uploadUrl,
      viewUrl,
      fileKey,
      expiresInSeconds: 300,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate pre-signed URL: ${err.message}` });
  }
});

// View/Download URL for existing files
app.get('/students/:id/view-url', async (req: Request, res: Response) => {
  try {
    const { fileKey } = req.query;
    const bucketName = process.env.UPLOADS_BUCKET_NAME;

    if (!fileKey || !bucketName) {
      return res.status(400).json({ error: 'fileKey query param and UPLOADS_BUCKET_NAME are required' });
    }

    const key = extractS3Key(String(fileKey)) || String(fileKey).replace(/^\//, '').split('?')[0];

    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const s3Client = new S3Client({});
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const viewUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 });

    res.json({ viewUrl, expiresInSeconds: 86400, fileKey: key });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate view URL: ${err.message}` });
  }
});

// ============================================================================
// Faculty: Registration & Mentees
// ============================================================================

// POST /faculty — Register a new faculty profile
app.post('/faculty', async (req: Request, res: Response) => {
  try {
    const { faculty_id, name, email, department, role } = req.body;
    const facId = (faculty_id || `FAC${Date.now().toString().slice(-4)}`).toUpperCase();
    const cleanEmail = String(email || '').toLowerCase().trim();

    if (db.isMock) {
      const newFaculty = { faculty_id: facId, name, email: cleanEmail, department: department || 'CSE', role: role || 'mentor' };
      return res.status(201).json({ message: 'Faculty registered successfully', faculty: newFaculty });
    }

    // Upsert the new faculty record (on email conflict, update name/dept/role)
    const result = await db.query(
      `INSERT INTO faculty (faculty_id, name, email, department, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name=$2, department=$4, role=$5
       RETURNING *`,
      [facId, name, cleanEmail, department || 'CSE', role || 'mentor']
    );
    const newFac = result.rows[0];
    const finalId = newFac.faculty_id.toUpperCase();

    // ── Auto-merge: find placeholder CSV records for this same person ──────────────────
    // When a faculty registers with their real email, we scan for any placeholder records
    // (auto-created from CSV upload with pending_ email) whose name matches, and migrate
    // all their mentees to the newly registered faculty_id.
    //
    // Safety rules (prevents false merges):
    //   1. Only consider placeholder (pending_*) records — never merge two real faculty.
    //   2. Require >= 2 significant words (length >= 4) to match in at least one direction.
    //      A single shared word like "Reddy", "Rao", "Basha" is NOT sufficient.
    //   3. Fallback: single-word names (like "Samunissa") use Levenshtein distance ≤ 2
    //      to catch typo variants ("samunissa" vs "samunnisa" = distance 1 → safe merge).
    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
            : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      return dp[m][n];
    };

    const normName = (s: string) => s.toLowerCase()
      .replace(/^(dr|prof|mr|mrs|ms|er)\.?\s*/i, '')
      .replace(/\b[a-z]\.\s*/g, '')   // strip single-letter initials
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const myNorm  = normName(name || '');
    const myWords = myNorm.split(' ').filter((w: string) => w.length >= 4);
    const MIN_MERGE_WORDS = 2;

    if (myWords.length >= 1) {
      const allFac = await db.query('SELECT faculty_id, name, email FROM faculty');
      const placeholders = allFac.rows.filter((f: any) => {
        if (f.faculty_id.toUpperCase() === finalId) return false;
        // Only merge placeholder (CSV-auto-created) records, never real-email faculty
        if (!f.email || !String(f.email).startsWith('pending_')) return false;
        const theirNorm  = normName(f.name || '');
        const theirWords = theirNorm.split(' ').filter((w: string) => w.length >= 4);
        // Primary check: >= 2 significant words match in at least one direction
        const myMatchCount    = myWords.filter((w: string) => theirNorm.includes(w)).length;
        const theirMatchCount = theirWords.filter((w: string) => myNorm.includes(w)).length;
        const multiWordMatch =
          (myWords.length    >= MIN_MERGE_WORDS && myMatchCount    >= MIN_MERGE_WORDS) ||
          (theirWords.length >= MIN_MERGE_WORDS && theirMatchCount >= MIN_MERGE_WORDS);
        if (multiWordMatch) return true;
        // Fallback: both reduce to a single significant word — use Levenshtein ≤ 2
        // Catches typos like "samunissa" vs "samunnisa" (dist=1), safe because both are placeholders
        if (myWords.length === 1 && theirWords.length === 1) {
          return levenshtein(myWords[0], theirWords[0]) <= 2;
        }
        return false;
      });

      for (const old of placeholders) {
        const oldId = old.faculty_id.toUpperCase();
        try {
          // Migrate mentor_assignments → new faculty_id.
          // ON CONFLICT (roll_number) DO UPDATE: works with our new single-PK schema.
          // The real (registered) faculty always wins — their assignment takes precedence.
          await db.query(
            `INSERT INTO mentor_assignments (roll_number, faculty_id, assigned_at)
             SELECT roll_number, $1, assigned_at FROM mentor_assignments WHERE UPPER(faculty_id) = $2
             ON CONFLICT (roll_number) DO UPDATE
               SET faculty_id = EXCLUDED.faculty_id, assigned_at = NOW()`,
            [finalId, oldId]
          ).catch(() => {});

          // Remove the old placeholder rows
          await db.query(
            'DELETE FROM mentor_assignments WHERE UPPER(faculty_id) = $1',
            [oldId]
          ).catch(() => {});

          // Update students.faculty_mentor_id for anyone still pointing at the placeholder
          await db.query(
            'UPDATE students SET faculty_mentor_id = $1, updated_at = NOW() WHERE UPPER(faculty_mentor_id) = $2',
            [finalId, oldId]
          ).catch(() => {});

          // Delete the placeholder faculty record
          await db.query(
            'DELETE FROM faculty WHERE UPPER(faculty_id) = $1',
            [oldId]
          ).catch(() => {});

          console.log(`[Faculty] Auto-merged placeholder ${oldId} → ${finalId} for "${name}" (${myWords.join(', ')} matched)`);
        } catch (mergeErr: any) {
          console.warn(`[Faculty] Merge failed for ${oldId} → ${finalId}:`, mergeErr.message);
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────────

    // Final sync: ensure ALL students whose mentor_assignment points to finalId
    // have their faculty_mentor_id updated — catches both direct CSV and post-merge cases.
    await db.query(
      `UPDATE students s
       SET faculty_mentor_id = $1, updated_at = NOW()
       FROM mentor_assignments ma
       WHERE UPPER(ma.roll_number) = UPPER(s.roll_number)
         AND UPPER(ma.faculty_id) = $1
         AND s.faculty_mentor_id IS DISTINCT FROM $1`,
      [finalId]
    ).catch(() => {});

    res.status(201).json({ message: 'Faculty registered successfully', faculty: newFac });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /faculty/by-email/:email — 3-tier lookup: exact → name-fuzzy → 404
app.get('/faculty/by-email/:email', async (req: Request, res: Response) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    if (db.isMock) {
      return res.json({ faculty_id: 'FAC001', name: 'Dr. M. V. Ramana', email, department: 'CSE', role: 'mentor' });
    }

    // Tier 1: exact email match
    const exact = await db.query('SELECT * FROM faculty WHERE LOWER(email) = $1', [email]);
    if (exact.rows.length > 0) return res.json(exact.rows[0]);

    // Tier 2: name-based fuzzy match from email prefix
    // Safety: prefix must be >= 6 chars to be reliable; require ALL normalized words
    // from the candidate faculty name to appear in the email prefix (word-containment, not substring).
    // We also only auto-link to placeholder (pending_email) records to avoid mis-linking real faculty.
    const prefix = email.split('@')[0].replace(/[^a-z]/gi, '').toLowerCase();
    if (prefix.length >= 6) {
      const all = await db.query('SELECT * FROM faculty', []);
      const normFac = (s: string) => s.toLowerCase()
        .replace(/^(dr|prof|mr|mrs|ms|er)\.?\s*/i, '')
        .replace(/\b[a-z]\.\s*/g, '')
        .replace(/[^a-z]/g, '')
        .trim();
      const match = all.rows.find((f: any) => {
        // Only auto-link placeholder records; real-email records need admin action
        if (f.email && !String(f.email).startsWith('pending_')) return false;
        const n = normFac(f.name);
        if (n.length < 4) return false;
        // The entire normalized name must be contained within the email prefix (or vice versa)
        // AND the overlap must be at least 6 chars to avoid short-name false positives
        const overlap = n.length >= 6 ? prefix.includes(n) : (n.includes(prefix) && prefix.length >= 6);
        return overlap;
      });
      if (match) {
        // Auto-link email to the matched faculty record
        await db.query('UPDATE faculty SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE faculty_id = $2', [email, match.faculty_id]);
        return res.json({ ...match, email });
      }
    }

    return res.status(404).json({ error: 'Faculty profile not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Faculty Full Profile (Personal, Education, Certs, Activities, Publications, Domains)
// ============================================================================
const ensureFacultyProfileTable = async () => {
  if (db.isMock) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS faculty_full_profiles (
      email TEXT PRIMARY KEY,
      faculty_id TEXT,
      personal JSONB DEFAULT '{}',
      education JSONB DEFAULT '{}',
      certifications JSONB DEFAULT '[]',
      activities JSONB DEFAULT '[]',
      publications JSONB DEFAULT '[]',
      domains JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

app.get('/faculty/full-profile/:email', async (req: Request, res: Response) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    if (db.isMock) {
      const mockProfile = (db.mockStore as any).facultyFullProfiles?.get(email);
      if (mockProfile) return res.json(mockProfile);
      return res.json({
        personal: { email, faculty_id: `FAC_${email.split('@')[0].toUpperCase()}`, name: email.split('@')[0], department: 'CSE (Data Science)' },
        education: {},
        certifications: [],
        activities: [],
        publications: [],
        domains: [],
      });
    }

    await ensureFacultyProfileTable();

    // Fetch existing faculty record for base info (Name, Department, ID)
    const facRes = await db.query('SELECT * FROM faculty WHERE LOWER(email) = $1', [email]);
    const fac = facRes.rows[0] || { faculty_id: `FAC_${email.split('@')[0].toUpperCase()}`, name: email.split('@')[0], email, department: 'CSE (Data Science)' };

    const profileRes = await db.query('SELECT * FROM faculty_full_profiles WHERE LOWER(email) = $1', [email]);
    if (profileRes.rows.length > 0) {
      const p = profileRes.rows[0];
      return res.json({
        personal: {
          ...p.personal,
          name: fac.name,
          email: fac.email,
          department: fac.department,
          faculty_id: fac.faculty_id,
        },
        education: p.education || {},
        certifications: p.certifications || [],
        activities: p.activities || [],
        publications: p.publications || [],
        domains: p.domains || [],
      });
    }

    // Default structure if not saved yet
    res.json({
      personal: {
        faculty_id: fac.faculty_id,
        name: fac.name,
        email: fac.email,
        department: fac.department,
      },
      education: {},
      certifications: [],
      activities: [],
      publications: [],
      domains: [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/faculty/full-profile/:email', async (req: Request, res: Response) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const data = req.body;

    if (db.isMock) {
      if (!(db.mockStore as any).facultyFullProfiles) {
        (db.mockStore as any).facultyFullProfiles = new Map();
      }
      (db.mockStore as any).facultyFullProfiles.set(email, data);
      return res.json({ message: 'Faculty profile updated successfully', profile: data });
    }

    await ensureFacultyProfileTable();

    // Preserve locked fields (Name, Email, Dept) from base faculty table
    const facRes = await db.query('SELECT * FROM faculty WHERE LOWER(email) = $1', [email]);
    const fac = facRes.rows[0];
    const facultyId = fac?.faculty_id || data.personal?.faculty_id || `FAC_${email.split('@')[0].toUpperCase()}`;

    // If designation was provided, mark designation_locked = true
    if (data.personal?.designation) {
      data.personal.designation_locked = true;
    }

    await db.query(
      `INSERT INTO faculty_full_profiles (email, faculty_id, personal, education, certifications, activities, publications, domains, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET
         personal = EXCLUDED.personal,
         education = EXCLUDED.education,
         certifications = EXCLUDED.certifications,
         activities = EXCLUDED.activities,
         publications = EXCLUDED.publications,
         domains = EXCLUDED.domains,
         updated_at = CURRENT_TIMESTAMP`,
      [
        email,
        facultyId,
        JSON.stringify(data.personal || {}),
        JSON.stringify(data.education || {}),
        JSON.stringify(data.certifications || []),
        JSON.stringify(data.activities || []),
        JSON.stringify(data.publications || []),
        JSON.stringify(data.domains || []),
      ]
    );

    res.json({ message: 'Faculty profile updated successfully', profile: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /faculty/mentees/by-email/:email — Returns ALL mentees across ALL faculty records for this person
// Solves the multi-record problem (e.g., HOD_CSEDS + FAC_BBHASKARARAO both belong to Bhaskara Rao)
app.get('/faculty/mentees/by-email/:email', async (req: Request, res: Response) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    if (db.isMock) return res.json([]);

    // Ensure mentor_assignments table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS mentor_assignments (
        roll_number  TEXT        NOT NULL PRIMARY KEY,
        faculty_id   TEXT        NOT NULL,
        assigned_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    // Step 1: Find primary faculty record by email
    const byEmail = await db.query('SELECT * FROM faculty WHERE LOWER(email) = $1', [email]);
    if (byEmail.rows.length === 0) return res.json([]);

    const primaryFac = byEmail.rows[0];
    const normalize = (s: string) => s.toLowerCase()
      .replace(/^(dr|prof|mr|mrs|ms|er)\.?\s*/i, '')
      .replace(/\b[a-z]\.\s*/g, '')   // strip single-letter initials like "B."
      .replace(/[^a-z\s]/g, '')
      .trim();

    const primaryNorm = normalize(primaryFac.name);
    // Extract significant words (length >= 4) from name for fuzzy matching
    const sigWords = primaryNorm.split(/\s+/).filter((w: string) => w.length >= 4);

    // Step 2: Find ALL faculty records whose name is a genuine alias for this person.
    // SAFETY RULES to prevent false merges:
    //   a) Only consider placeholder (unlinked) records — never merge two real faculty.
    //   b) Require >= 2 significant words to match bidirectionally, OR
    //      both names reduce to a single word with Levenshtein distance ≤ 2 (typo fallback).
    const MIN_MATCH_WORDS = 2;
    const lev = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
            : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      return dp[m][n];
    };
    const allFac = await db.query('SELECT faculty_id, name, email FROM faculty');
    const matchingIds: string[] = [primaryFac.faculty_id];
    for (const f of allFac.rows) {
      if (f.faculty_id === primaryFac.faculty_id) continue;
      // Only merge placeholder (CSV-auto-created, no real email) records
      if (!f.email || !String(f.email).startsWith('pending_')) continue;
      const norm = normalize(f.name);
      const theirWords = norm.split(/\s+/).filter((w: string) => w.length >= 4);
      // Primary: >= 2 significant words match
      const myMatchCount    = sigWords.filter((w: string) => norm.includes(w)).length;
      const theirMatchCount = theirWords.filter((w: string) => primaryNorm.includes(w)).length;
      const iMatch    = sigWords.length    >= MIN_MATCH_WORDS && myMatchCount    >= MIN_MATCH_WORDS;
      const theyMatch = theirWords.length  >= MIN_MATCH_WORDS && theirMatchCount >= MIN_MATCH_WORDS;
      if (iMatch || theyMatch) { matchingIds.push(f.faculty_id); continue; }
      // Fallback: both reduce to single word → Levenshtein ≤ 2 (typo safe)
      if (sigWords.length === 1 && theirWords.length === 1) {
        if (lev(sigWords[0], theirWords[0]) <= 2) matchingIds.push(f.faculty_id);
      }
    }

    // Step 3: Union mentees from mentor_assignments AND from students.faculty_mentor_id directly
    // This ensures HODs/faculty who have students pointing to them via faculty_mentor_id
    // are shown even if those students are not in the mentor_assignments table.
    const placeholders = matchingIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT DISTINCT ON (roll_number)
         roll_number,
         assigned_faculty_id,
         assigned_at,
         registered,
         name,
         email,
         year,
         batch,
         section,
         department,
         phone,
         photo_url,
         faculty_mentor_id,
         cgpa,
         leetcode_handle,
         leetcode_solved,
         github_handle,
         github_repos
       FROM (
         -- Source 1: from mentor_assignments table
         SELECT
           COALESCE(s.roll_number, ma.roll_number) AS roll_number,
           ma.faculty_id AS assigned_faculty_id,
           ma.assigned_at,
           CASE WHEN s.roll_number IS NOT NULL THEN true ELSE false END AS registered,
           s.name,
           s.email,
           s.year,
           s.batch,
           s.section,
           s.department,
           s.phone,
           s.photo_url,
           s.faculty_mentor_id,
           COALESCE(ROUND(AVG(a.semester_gpa), 2), 0.00) AS cgpa,
           MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.handle END) AS leetcode_handle,
           COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN GREATEST(c.score_rating, (c.easy_count + c.medium_count + c.hard_count)) END), 0) AS leetcode_solved,
           MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.handle END) AS github_handle,
           COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.repositories_count END), 0) AS github_repos
         FROM mentor_assignments ma
         LEFT JOIN students s ON UPPER(s.roll_number) = UPPER(ma.roll_number)
         LEFT JOIN academics a ON a.student_id = s.roll_number
         LEFT JOIN coding_profiles c ON c.student_id = s.roll_number
         WHERE UPPER(ma.faculty_id) IN (${placeholders})
         GROUP BY ma.roll_number, ma.faculty_id, ma.assigned_at, s.roll_number, s.name, s.email, s.year, s.batch, s.section, s.department, s.phone, s.photo_url, s.faculty_mentor_id

         UNION

         -- Source 2: from students.faculty_mentor_id directly (covers HODs and manually-set mentors)
         SELECT
           s.roll_number AS roll_number,
           s.faculty_mentor_id AS assigned_faculty_id,
           s.updated_at AS assigned_at,
           true AS registered,
           s.name,
           s.email,
           s.year,
           s.batch,
           s.section,
           s.department,
           s.phone,
           s.photo_url,
           s.faculty_mentor_id,
           COALESCE(ROUND(AVG(a.semester_gpa), 2), 0.00) AS cgpa,
           MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.handle END) AS leetcode_handle,
           COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.score_rating END), 0) AS leetcode_solved,
           MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.handle END) AS github_handle,
           COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.repositories_count END), 0) AS github_repos
         FROM students s
         LEFT JOIN academics a ON a.student_id = s.roll_number
         LEFT JOIN coding_profiles c ON c.student_id = s.roll_number
         WHERE UPPER(s.faculty_mentor_id) IN (${placeholders})
           AND s.roll_number IS NOT NULL
         GROUP BY s.roll_number, s.faculty_mentor_id, s.updated_at, s.name, s.email, s.year, s.batch, s.section, s.department, s.phone, s.photo_url
       ) combined
       ORDER BY roll_number, registered DESC`,
      matchingIds.map(id => id.toUpperCase())
    );

    const rows = result.rows.map((r: any) => ({
      ...r,
      name: r.name || null,
      department: r.department || null,
      registered: r.registered === true || r.registered === 't',
    }));

    // Year-wise breakdown summary
    const yearBreakdown: Record<string, number> = {
      '1st Year': 0, '2nd Year': 0, '3rd Year': 0, '4th Year': 0,
    };
    for (const r of rows) {
      if (r.year && yearBreakdown[r.year] !== undefined) yearBreakdown[r.year]++;
    }

    res.json({ mentees: rows, yearBreakdown, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /faculty — List all faculty with mentee counts (admin/HOD/coordinator view, scoped by department)
app.get('/faculty', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const callerRole = req.auth?.role;
    const callerDept = req.auth?.department;
    const isSuper = req.auth?.isSuperAdmin || callerDept === '*' || callerRole === 'coordinator' || callerRole === 'admin';
    const reqDept = req.query.department ? String(req.query.department) : undefined;

    let targetDept: string | undefined;
    if (!isSuper && callerDept) {
      targetDept = callerDept;
    } else if (reqDept && reqDept !== 'All' && reqDept !== 'undefined' && reqDept !== 'null') {
      targetDept = reqDept;
    }

    // Normalize department strings for flexible matching (handles 'CSE (Data Science)', 'CSE(Data Science)', 'Data Science')
    const normalizeDeptKey = (dept: string): string => {
      if (!dept) return '';
      const d = dept.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (d.includes('datascience') || d.includes('cseds') || d === 'ds' || d.includes('data')) return 'cseds';
      if (d.includes('aiml') || d.includes('aiandml') || d.includes('machinelearning')) return 'cseaiml';
      if (d.includes('cyber')) return 'csecyber';
      if (d.includes('business') || d === 'csebs' || d === 'bs') return 'csebs';
      if (d === 'cse' || d.includes('computerscience')) return 'cse';
      if (d === 'ece' || d.includes('electronicsandcomm')) return 'ece';
      if (d === 'eee' || d.includes('electrical')) return 'eee';
      if (d.includes('civil')) return 'civil';
      if (d.includes('mech')) return 'mech';
      return d;
    };

    // Auto-clean variations in DB asynchronously
    db.query(`
      UPDATE faculty SET department = 'CSE (Data Science)' 
      WHERE LOWER(REPLACE(department, ' ', '')) IN ('cse(datascience)', 'datascience', 'cseds', 'cse(ds)');
      UPDATE faculty SET department = 'CSE (AI & ML)' 
      WHERE LOWER(REPLACE(department, ' ', '')) IN ('cse(ai&ml)', 'cse(aiml)', 'aiml', 'cseaiml');
      UPDATE faculty SET department = 'CSE (Cyber Security)' 
      WHERE LOWER(REPLACE(department, ' ', '')) IN ('cse(cybersecurity)', 'cybersecurity', 'csecyber');
      UPDATE faculty SET department = 'ECE' 
      WHERE LOWER(REPLACE(department, ' ', '')) IN ('ece', 'electronics');
      UPDATE faculty SET department = 'CSE' 
      WHERE LOWER(REPLACE(department, ' ', '')) IN ('cse', 'computerscience');
    `).catch(() => {});

    if (db.isMock) {
      let list = [
        { faculty_id: 'FAC001', name: 'Dr. K. V. Subbaiah', email: 'kvsubbaiah@rgmcet.edu.in', department: 'CSE (Data Science)', role: 'mentor', mentee_count: 3 },
        { faculty_id: 'FAC002', name: 'Prof. M. Ramesh', email: 'mramesh@rgmcet.edu.in', department: 'ECE', role: 'mentor', mentee_count: 2 },
      ];
      if (targetDept) {
        list = list.filter(f => f.department && normalizeDeptKey(f.department) === normalizeDeptKey(targetDept!));
      }
      return res.json(list);
    }

    // Count mentees from BOTH mentor_assignments AND students.faculty_mentor_id (union, deduplicated)
    const result = await db.query(`
      SELECT f.*,
             COUNT(DISTINCT combined.roll_number)::int                            AS mentee_count,
             COUNT(DISTINCT CASE WHEN s2.year = '1st Year' THEN combined.roll_number END)::int AS year1_count,
             COUNT(DISTINCT CASE WHEN s2.year = '2nd Year' THEN combined.roll_number END)::int AS year2_count,
             COUNT(DISTINCT CASE WHEN s2.year = '3rd Year' THEN combined.roll_number END)::int AS year3_count,
             COUNT(DISTINCT CASE WHEN s2.year = '4th Year' THEN combined.roll_number END)::int AS year4_count
      FROM faculty f
      LEFT JOIN (
        SELECT roll_number, faculty_id FROM mentor_assignments
        UNION
        SELECT roll_number, faculty_mentor_id AS faculty_id FROM students WHERE faculty_mentor_id IS NOT NULL
      ) combined ON UPPER(combined.faculty_id) = UPPER(f.faculty_id)
      LEFT JOIN students s2 ON UPPER(s2.roll_number) = UPPER(combined.roll_number)
      GROUP BY f.faculty_id
      ORDER BY f.name
    `);

    let finalRows = result.rows;
    if (targetDept) {
      const targetKey = normalizeDeptKey(targetDept);
      finalRows = finalRows.filter((f: any) => normalizeDeptKey(f.department) === targetKey);
    }

    res.json(finalRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /faculty/:id/email — Admin manually links an email to a faculty record
app.patch('/faculty/:id/email', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const facId = req.params.id.toUpperCase();
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    const cleanEmail = String(email).toLowerCase().trim();

    if (db.isMock) {
      return res.json({ message: 'Email linked successfully', faculty_id: facId, email: cleanEmail });
    }

    // Check another faculty doesn't already own this email
    const conflict = await db.query(
      'SELECT faculty_id FROM faculty WHERE LOWER(email) = $1 AND faculty_id != $2',
      [cleanEmail, facId]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: `Email already linked to faculty ${conflict.rows[0].faculty_id}` });
    }

    const result = await db.query(
      `UPDATE faculty SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE faculty_id = $2 RETURNING *`,
      [cleanEmail, facId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });
    res.json({ message: 'Email linked successfully', faculty: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /faculty/:id/name — Admin updates a faculty member's display name
app.patch('/faculty/:id/name', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const facId = req.params.id.toUpperCase();
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const cleanName = String(name).trim();

    if (db.isMock) {
      return res.json({ message: 'Name updated successfully', faculty_id: facId, name: cleanName });
    }

    const result = await db.query(
      `UPDATE faculty SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE faculty_id = $2 RETURNING *`,
      [cleanName, facId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });
    res.json({ message: 'Name updated successfully', faculty: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /faculty/:id — Admin permanently removes a faculty record + Cognito user + blocks email
app.delete('/faculty/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const facId = req.params.id.toUpperCase();
    if (db.isMock) return res.json({ message: 'Faculty deleted', faculty_id: facId });

    // Resolve email BEFORE delete so we can block + clean Cognito
    let facultyEmail: string | null = null;
    let facultyName: string = facId;
    const existing = await db.query(
      'SELECT email, name FROM faculty WHERE UPPER(faculty_id) = $1',
      [facId]
    );
    if (existing.rows.length > 0) {
      facultyEmail = existing.rows[0].email || null;
      facultyName = existing.rows[0].name || facId;
    }

    // Unlink students that pointed to this faculty (set to NULL, not cascade-delete)
    await db.query(
      `UPDATE students SET faculty_mentor_id = NULL WHERE UPPER(faculty_mentor_id) = $1`,
      [facId]
    ).catch(() => {});

    // Remove mentor_assignments for this faculty_id
    await db.query('DELETE FROM mentor_assignments WHERE UPPER(faculty_id) = $1', [facId]).catch(() => {});

    // Delete the faculty record itself
    const result = await db.query(
      'DELETE FROM faculty WHERE UPPER(faculty_id) = $1 RETURNING faculty_id, name',
      [facId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });

    // Block the email so they cannot re-register until admin unblocks
    if (facultyEmail && !facultyEmail.startsWith('pending_')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS blocked_emails (
          email      TEXT PRIMARY KEY,
          blocked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          reason     TEXT
        )
      `).catch(() => {});
      await db.query(
        `INSERT INTO blocked_emails (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET blocked_at = CURRENT_TIMESTAMP, reason = $2`,
        [facultyEmail, `Deleted by admin: ${facultyName} (${facId})`]
      ).catch(() => {});

      // Cognito cleanup: fire-and-forget
      deleteCognitoUsers([facultyEmail]).catch((e: any) =>
        console.warn(`[Cognito] Faculty Cognito cleanup failed for ${facultyEmail}:`, e.message)
      );
    }

    res.json({ message: `Faculty ${facultyName} deleted. Their email is now blocked from re-registration.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /faculty/unblock/:email — Admin removes email from blocked list (allows re-registration)
app.post('/faculty/unblock/:email', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    if (db.isMock) return res.json({ message: 'Email unblocked', email });
    await db.query('DELETE FROM blocked_emails WHERE email = $1', [email]).catch(() => {});
    res.json({ message: `${email} has been unblocked and may now re-register.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /faculty/blocked — Admin lists all blocked emails
app.get('/faculty/blocked', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    if (db.isMock) return res.json([]);
    await db.query(`CREATE TABLE IF NOT EXISTS blocked_emails (email TEXT PRIMARY KEY, blocked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, reason TEXT)`).catch(() => {});
    const result = await db.query('SELECT * FROM blocked_emails ORDER BY blocked_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /faculty/:id/mentees-detail — Full mentee list for one faculty (for admin/HOD directory)
// Unions mentor_assignments + students.faculty_mentor_id to avoid missing mentees
app.get('/faculty/:id/mentees-detail', requireRole('admin', 'hod'), async (req: Request, res: Response) => {
  try {
    const facId = req.params.id.toUpperCase();
    if (db.isMock) return res.json([]);

    await db.query(`CREATE TABLE IF NOT EXISTS mentor_assignments (roll_number TEXT NOT NULL PRIMARY KEY, faculty_id TEXT NOT NULL, assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});

    const result = await db.query(
      `SELECT DISTINCT ON (roll_number)
         roll_number,
         faculty_id,
         assigned_at,
         registered,
         name,
         email,
         year,
         batch,
         section,
         department,
         phone,
         cgpa
       FROM (
         -- Source 1: from mentor_assignments
         SELECT
           COALESCE(s.roll_number, ma.roll_number) AS roll_number,
           ma.faculty_id,
           ma.assigned_at,
           CASE WHEN s.roll_number IS NOT NULL THEN true ELSE false END AS registered,
           s.name, s.email, s.year, s.batch, s.section, s.department, s.phone, s.cgpa
         FROM mentor_assignments ma
         LEFT JOIN students s ON UPPER(s.roll_number) = UPPER(ma.roll_number)
         WHERE UPPER(ma.faculty_id) = $1

         UNION

         -- Source 2: from students.faculty_mentor_id
         SELECT
           s.roll_number,
           s.faculty_mentor_id AS faculty_id,
           s.updated_at AS assigned_at,
           true AS registered,
           s.name, s.email, s.year, s.batch, s.section, s.department, s.phone, s.cgpa
         FROM students s
         WHERE UPPER(s.faculty_mentor_id) = $1
           AND s.roll_number IS NOT NULL
       ) combined
       ORDER BY roll_number, registered DESC`,
      [facId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /mentor-assignments/sync — Admin utility: reconcile students.faculty_mentor_id with mentor_assignments
// Ensures both tables agree; safe to run any number of times (idempotent).
app.post('/mentor-assignments/sync', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (db.isMock) return res.json({ synced: 0, message: 'Mock mode — sync skipped' });

    await db.query(`CREATE TABLE IF NOT EXISTS mentor_assignments (roll_number TEXT NOT NULL PRIMARY KEY, faculty_id TEXT NOT NULL, assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});

    // Sync: for every entry in mentor_assignments, update students.faculty_mentor_id
    const syncResult = await db.query(`
      UPDATE students s
      SET faculty_mentor_id = ma.faculty_id,
          updated_at        = NOW()
      FROM mentor_assignments ma
      WHERE UPPER(s.roll_number) = UPPER(ma.roll_number)
        AND s.faculty_mentor_id IS DISTINCT FROM ma.faculty_id
      RETURNING s.roll_number
    `);

    // Also clear faculty_mentor_id for any student whose roll_number is no longer in mentor_assignments
    const clearResult = await db.query(`
      UPDATE students
      SET faculty_mentor_id = NULL,
          updated_at        = NOW()
      WHERE faculty_mentor_id IS NOT NULL
        AND UPPER(roll_number) NOT IN (
          SELECT UPPER(roll_number) FROM mentor_assignments
        )
      RETURNING roll_number
    `);

    res.json({
      success: true,
      synced: syncResult.rowCount ?? 0,
      cleared: clearResult.rowCount ?? 0,
      message: `Synced ${syncResult.rowCount ?? 0} student(s); cleared ${clearResult.rowCount ?? 0} stale assignment(s).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /mentor-assignments/:facultyId/:rollNumber — Unassign a student from a faculty
app.delete('/mentor-assignments/:facultyId/:rollNumber', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const facId = req.params.facultyId.toUpperCase();
    const roll = req.params.rollNumber.toUpperCase();
    if (db.isMock) return res.json({ message: 'Unassigned' });
    await db.query('DELETE FROM mentor_assignments WHERE UPPER(faculty_id) = $1 AND UPPER(roll_number) = $2', [facId, roll]);
    await db.query(`UPDATE students SET faculty_mentor_id = NULL WHERE UPPER(roll_number) = $1 AND UPPER(faculty_mentor_id) = $2`, [roll, facId]).catch(() => {});
    res.json({ message: `${roll} unassigned from ${facId}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /faculty/:facultyId/mentees — Admin manually assigns one or more students to a faculty mentor
app.post('/faculty/:facultyId/mentees', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const facId = req.params.facultyId.toUpperCase();
    const rawRolls: any[] = Array.isArray(req.body?.rolls)
      ? req.body.rolls
      : typeof req.body?.rollNumber === 'string'
      ? [req.body.rollNumber]
      : [];

    const rolls = rawRolls
      .map((r: any) => String(r || '').trim().toUpperCase())
      .filter((r: string) => r.length > 0);

    if (rolls.length === 0) {
      return res.status(400).json({ error: 'At least one valid roll number is required' });
    }

    if (db.isMock) {
      return res.json({
        success: true,
        count: rolls.length,
        faculty_id: facId,
        assigned: rolls.map(r => ({ roll: r, status: 'assigned', reassignedFrom: null })),
      });
    }

    // Verify faculty exists
    const facCheck = await db.query('SELECT faculty_id, name FROM faculty WHERE UPPER(faculty_id) = $1', [facId]);
    if (facCheck.rows.length === 0) {
      return res.status(404).json({ error: `Faculty record ${facId} not found` });
    }
    const facultyName = facCheck.rows[0].name;

    // Ensure mentor_assignments table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS mentor_assignments (
        roll_number  TEXT        NOT NULL PRIMARY KEY,
        faculty_id   TEXT        NOT NULL,
        assigned_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    const assignedResults = [];

    for (const roll of rolls) {
      // Find current assignment & student details if any
      const cur = await db.query(
        `SELECT ma.faculty_id AS current_faculty_id, f.name AS current_faculty_name, s.name, s.year, s.section, s.department
         FROM mentor_assignments ma
         LEFT JOIN faculty f ON UPPER(f.faculty_id) = UPPER(ma.faculty_id)
         LEFT JOIN students s ON UPPER(s.roll_number) = UPPER(ma.roll_number)
         WHERE UPPER(ma.roll_number) = $1`,
        [roll]
      );

      const prevFacId = cur.rows[0]?.current_faculty_id;
      const prevFacName = cur.rows[0]?.current_faculty_name;
      const isReassigned = Boolean(prevFacId && prevFacId.toUpperCase() !== facId);

      // Upsert into mentor_assignments
      await db.query(
        `INSERT INTO mentor_assignments (roll_number, faculty_id, assigned_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (roll_number) DO UPDATE SET faculty_id = EXCLUDED.faculty_id, assigned_at = NOW()`,
        [roll, facId]
      );

      // Sync into students table if student exists
      const sUp = await db.query(
        `UPDATE students SET faculty_mentor_id = $1, updated_at = NOW()
         WHERE UPPER(roll_number) = $2 RETURNING name, year, section, department`,
        [facId, roll]
      );

      const studentData = sUp.rows[0] || cur.rows[0] || {};

      assignedResults.push({
        roll,
        name: studentData.name || null,
        year: studentData.year || null,
        section: studentData.section || null,
        department: studentData.department || null,
        registered: Boolean(sUp.rows.length > 0 || studentData.name),
        status: isReassigned ? 'reassigned' : 'assigned',
        reassignedFrom: isReassigned ? (prevFacName || prevFacId) : null,
      });
    }

    res.json({
      success: true,
      count: assignedResults.length,
      faculty_id: facId,
      faculty_name: facultyName,
      assigned: assignedResults,
      message: `Successfully assigned ${assignedResults.length} mentee(s) to ${facultyName}.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /students/search-assignable — Admin autocomplete search for students to assign as mentees
app.get('/students/search-assignable', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 1) {
      return res.json([]);
    }

    if (db.isMock) {
      const mockStudents = Array.from(db.mockStore.students.values())
        .filter(s => s.roll_number.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 15);
      return res.json(mockStudents.map(s => ({
        roll_number: s.roll_number,
        name: s.name,
        year: s.year,
        section: s.section,
        department: s.department,
        email: s.email,
        current_faculty_id: s.faculty_mentor_id || null,
        current_faculty_name: null,
      })));
    }

    const pattern = `%${q.toLowerCase()}%`;
    const result = await db.query(
      `SELECT
         s.roll_number,
         s.name,
         s.year,
         s.section,
         s.department,
         s.email,
         s.cgpa,
         ma.faculty_id AS current_faculty_id,
         f.name AS current_faculty_name
       FROM students s
       LEFT JOIN mentor_assignments ma ON UPPER(ma.roll_number) = UPPER(s.roll_number)
       LEFT JOIN faculty f ON UPPER(f.faculty_id) = UPPER(ma.faculty_id)
       WHERE LOWER(s.roll_number) LIKE $1 OR LOWER(s.name) LIKE $1
       ORDER BY s.roll_number
       LIMIT 15`,
      [pattern]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /students/mentor-lookup — HOD & Admin: search a student by roll no / name and return their assigned mentor details
app.get('/students/mentor-lookup', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);

    const pattern = `%${q.toLowerCase()}%`;

    const result = await db.query(
      `SELECT
         s.roll_number,
         s.name        AS student_name,
         s.year,
         s.section,
         s.department  AS student_department,
         s.email       AS student_email,
         s.batch,
         -- Mentor from mentor_assignments (preferred) or students.faculty_mentor_id fallback
         COALESCE(f.name, f2.name)        AS mentor_name,
         COALESCE(f.email, f2.email)      AS mentor_email,
         COALESCE(f.department, f2.department) AS mentor_department,
         COALESCE(f.faculty_id, f2.faculty_id) AS mentor_faculty_id,
         COALESCE(f.role, f2.role)        AS mentor_role
       FROM students s
       LEFT JOIN mentor_assignments ma ON UPPER(ma.roll_number) = UPPER(s.roll_number)
       LEFT JOIN faculty f  ON UPPER(f.faculty_id) = UPPER(ma.faculty_id)
       LEFT JOIN faculty f2 ON UPPER(f2.faculty_id) = UPPER(s.faculty_mentor_id)
       WHERE LOWER(s.roll_number) LIKE $1 OR LOWER(s.name) LIKE $1
       ORDER BY s.roll_number
       LIMIT 20`,
      [pattern]
    );

    // Enrich with mentor phone + designation from faculty_full_profiles if available
    const rows = await Promise.all(result.rows.map(async (row: any) => {
      let mentorPhone: string | null = null;
      let mentorDesignation: string | null = null;
      if (row.mentor_email) {
        try {
          const profRes = await db.query(
            `SELECT personal FROM faculty_full_profiles WHERE LOWER(email) = LOWER($1) LIMIT 1`,
            [row.mentor_email]
          );
          if (profRes.rows.length > 0 && profRes.rows[0].personal) {
            const p = typeof profRes.rows[0].personal === 'string'
              ? JSON.parse(profRes.rows[0].personal)
              : profRes.rows[0].personal;
            mentorPhone = p?.phone || p?.mobile || null;
            mentorDesignation = p?.designation || null;
          }
        } catch (_) { /* ignore */ }
      }
      return {
        roll_number: row.roll_number,
        student_name: row.student_name,
        year: row.year,
        section: row.section,
        student_department: row.student_department,
        student_email: row.student_email,
        batch: row.batch,
        mentor_assigned: Boolean(row.mentor_name),
        mentor_name: row.mentor_name || null,
        mentor_email: row.mentor_email || null,
        mentor_department: row.mentor_department || null,
        mentor_faculty_id: row.mentor_faculty_id || null,
        mentor_designation: mentorDesignation,
        mentor_phone: mentorPhone,
        mentor_role: row.mentor_role || null,
      };
    }));

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /mentor-assignments/upload — Bulk assign students to faculty mentors from CSV data
app.post('/mentor-assignments/upload', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    type AssignRow = { rolls: string[]; facultyName: string };
    const rawRows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rawRows.length === 0) return res.status(400).json({ error: 'rows array is required and must be non-empty' });

    // Normalize rows: support both new { rolls[], facultyName } and legacy { roll1, roll2?, facultyName }
    const rows: AssignRow[] = rawRows.map((r: any) => ({
      rolls: Array.isArray(r.rolls)
        ? r.rolls.filter(Boolean).map((x: string) => String(x).trim().toUpperCase())
        : [r.roll1, r.roll2].filter(Boolean).map((x: string) => String(x).trim().toUpperCase()),
      facultyName: String(r.facultyName || '').trim(),
    })).filter(r => r.rolls.length > 0 && r.facultyName);

    if (rows.length === 0) return res.status(400).json({ error: 'No valid assignment rows after normalization' });

    const updated: string[] = [];
    const notFoundRolls: string[] = [];
    const autoCreatedFaculty: string[] = [];
    const alreadyExistedFaculty: string[] = [];

    // Helper: generate a stable faculty_id slug from a name
    const slugify = (name: string) =>
      'FAC_' + name.toUpperCase().replace(/^(DR|PROF|MR|MRS|MS|ER)\.?\s*/i, '').replace(/[^A-Z0-9]/g, '').slice(0, 20);

    // Build faculty name → faculty_id cache (case-insensitive)
    const facultyCache: Record<string, string> = {};
    const normalize = (s: string) => s.toLowerCase().replace(/^(dr|prof|mr|mrs|ms|er)\.?\s*/i, '').replace(/\s+/g, ' ').trim();

    const getAllFaculty = async () => {
      if (db.isMock) return [];
      const r = await db.query('SELECT faculty_id, name, email FROM faculty');
      return r.rows;
    };
    const allFaculty = await getAllFaculty();
    for (const f of allFaculty) {
      facultyCache[normalize(f.name)] = f.faculty_id;
    }

    // Process unique faculty names first
    const uniqueNames = [...new Set(rows.map((r) => r.facultyName.trim()).filter(Boolean))];

    for (const rawName of uniqueNames) {
      const normName = normalize(rawName);
      if (facultyCache[normName]) {
        alreadyExistedFaculty.push(rawName);
        continue;
      }
      // Auto-create faculty
      const facId = slugify(rawName);
      const placeholder = `pending_${facId.replace('FAC_', '').toLowerCase()}@rgmcet.edu.in`;
      if (!db.isMock) {
        await db.query(
          `INSERT INTO faculty (faculty_id, name, email, department, role)
           VALUES ($1, $2, $3, $4, 'mentor')
           ON CONFLICT (faculty_id) DO UPDATE SET name = EXCLUDED.name`,
          [facId, rawName, placeholder, 'CSE(Data Science)']
        ).catch(async () => {
          // email unique constraint may fire — try without email
          await db.query(
            `INSERT INTO faculty (faculty_id, name, email, department, role)
             VALUES ($1, $2, $3, $4, 'mentor')
             ON CONFLICT (faculty_id) DO UPDATE SET name = EXCLUDED.name`,
          [facId, rawName, `pending_${Date.now()}@rgmcet.edu.in`, 'CSE(Data Science)']
          );
        });
      }
      facultyCache[normName] = facId;
      autoCreatedFaculty.push(rawName);
    }

    // Ensure mentor_assignments table exists with single-mentor-per-student PK
    if (!db.isMock) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS mentor_assignments (
          roll_number  TEXT        NOT NULL PRIMARY KEY,
          faculty_id   TEXT        NOT NULL,
          assigned_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});
      // Migration: if the table already exists with the old composite PK, migrate it.
      // Safe to run every time — DO NOTHING if already correct.
      await db.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'mentor_assignments'
              AND constraint_type = 'PRIMARY KEY'
              AND constraint_name != 'mentor_assignments_pkey'
          ) THEN NULL;
          ELSIF (
            SELECT COUNT(*) FROM information_schema.key_column_usage
            WHERE table_name = 'mentor_assignments' AND constraint_name = 'mentor_assignments_pkey'
          ) > 1 THEN
            -- Old composite PK detected: keep the most recent assignment per student, then re-key
            DELETE FROM mentor_assignments a USING mentor_assignments b
              WHERE a.roll_number = b.roll_number AND a.assigned_at < b.assigned_at;
            ALTER TABLE mentor_assignments DROP CONSTRAINT mentor_assignments_pkey;
            ALTER TABLE mentor_assignments ADD PRIMARY KEY (roll_number);
          END IF;
        END $$;
      `).catch(() => {/* Ignore if already migrated */});
      // Ensure index on faculty_id for fast mentee lookups
      await db.query(`CREATE INDEX IF NOT EXISTS idx_mentor_assignments_faculty ON mentor_assignments(faculty_id)`).catch(() => {});
    }

    // Now assign students — upsert into mentor_assignments AND update students if they exist
    // ON CONFLICT (roll_number) DO UPDATE: the latest upload always wins (one mentor per student)
    for (const row of rows) {
      const facId = facultyCache[normalize(row.facultyName.trim())];
      if (!facId) continue;

      const rolls = row.rolls;
      for (const roll of rolls) {
        const cleanRoll = roll.trim().toUpperCase();
        if (!cleanRoll) continue;

        if (db.isMock) {
          updated.push(cleanRoll);
          continue;
        }

        // Upsert: one mentor per student — latest CSV upload wins
        await db.query(
          `INSERT INTO mentor_assignments (roll_number, faculty_id)
           VALUES ($1, $2)
           ON CONFLICT (roll_number) DO UPDATE SET faculty_id = EXCLUDED.faculty_id, assigned_at = NOW()`,
          [cleanRoll, facId]
        );

        // Also update students table if the student already exists
        const r = await db.query(
          `UPDATE students SET faculty_mentor_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE UPPER(roll_number) = $2 RETURNING roll_number`,
          [facId, cleanRoll]
        );
        if (r.rows.length > 0) {
          updated.push(cleanRoll);
        } else {
          notFoundRolls.push(cleanRoll);
        }
      }
    }

    res.json({
      success: true,
      updated: updated.length,
      updatedRolls: updated,
      notFoundRolls,
      autoCreatedFaculty,
      alreadyExistedFaculty,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/faculty/:id/mentees', async (req: Request, res: Response) => {
  try {
    const facultyId = req.params.id.toUpperCase();

    if (db.isMock) {
      const students = Array.from(db.mockStore.students.values()).filter(
        (s) => s.faculty_mentor_id === facultyId || facultyId === 'FAC001'
      );
      return res.json(students.map(s => ({ ...s, registered: true })));
    }

    // Ensure mentor_assignments table exists before querying
    await db.query(`
      CREATE TABLE IF NOT EXISTS mentor_assignments (
        roll_number  TEXT        NOT NULL PRIMARY KEY,
        faculty_id   TEXT        NOT NULL,
        assigned_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    // LEFT JOIN: returns ALL assigned roll numbers, registered or not
    const result = await db.query(
      `SELECT
         ma.roll_number,
         ma.faculty_id AS assigned_faculty_id,
         ma.assigned_at,
         CASE WHEN s.roll_number IS NOT NULL THEN true ELSE false END AS registered,
         s.name,
         s.email,
         s.year,
         s.batch,
         s.section,
         s.department,
         s.phone,
         s.photo_url,
         s.linkedin_url,
         s.faculty_mentor_id,
         COALESCE(ROUND(AVG(a.semester_gpa), 2), 0.00) AS cgpa,
         MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.handle END) AS leetcode_handle,
         COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'leetcode' THEN c.score_rating END), 0) AS leetcode_solved,
         MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.handle END) AS github_handle,
         COALESCE(MAX(CASE WHEN LOWER(c.platform) = 'github' THEN c.repositories_count END), 0) AS github_repos
       FROM mentor_assignments ma
       LEFT JOIN students s ON UPPER(s.roll_number) = UPPER(ma.roll_number)
       LEFT JOIN academics a ON a.student_id = s.roll_number
       LEFT JOIN coding_profiles c ON c.student_id = s.roll_number
       WHERE UPPER(ma.faculty_id) = $1
       GROUP BY
         ma.roll_number, ma.faculty_id, ma.assigned_at,
         s.roll_number, s.name, s.email, s.year, s.batch, s.section,
         s.department, s.phone, s.photo_url, s.linkedin_url, s.faculty_mentor_id
       ORDER BY
         registered DESC,
         s.year DESC NULLS LAST,
         ma.roll_number`,
      [facultyId]
    );

    const formattedRows = result.rows.map((r: any) => ({
      ...r,
      name: r.name || null,
      department: r.department || null,
      registered: r.registered === true || r.registered === 't',
    }));
    res.json(formattedRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// Reports: HOD Analytics
// ============================================================================
app.get('/reports/hod-analytics', async (req: Request, res: Response) => {
  try {
    const targetDept = (req.query.department as string) || req.auth?.department || 'CSE (Data Science)';

    if (db.isMock) {
      return res.json({
        department: targetDept,
        totalStudents: 470,
        yearBreakdown: [
          { year: '1st Year', avgCgpa: 8.85, students: 120, distinction: 42, firstClass: 55, secondClass: 15, passClass: 8 },
          { year: '2nd Year', avgCgpa: 8.95, students: 115, distinction: 45, firstClass: 50, secondClass: 12, passClass: 8 },
          { year: '3rd Year', avgCgpa: 9.12, students: 125, distinction: 54, firstClass: 55, secondClass: 10, passClass: 6 },
          { year: '4th Year', avgCgpa: 9.25, students: 110, distinction: 52, firstClass: 46, secondClass: 8, passClass: 4 },
        ],
        sectionBreakdown: [
          { section: 'Section A', avgCgpa: 9.15, students: 155, distinction: 68, firstClass: 60, secondClass: 18, passClass: 9 },
          { section: 'Section B', avgCgpa: 9.02, students: 160, distinction: 64, firstClass: 65, secondClass: 21, passClass: 10 },
          { section: 'Section C', avgCgpa: 8.95, students: 155, distinction: 61, firstClass: 62, secondClass: 22, passClass: 10 },
        ],
        topRankers: Array.from(db.mockStore.students.values()).filter(s => s.department === targetDept).slice(0, 5),
      });
    }

    // Real aggregation queries scoped to targetDept (unless targetDept === '*')
    const deptWhere = targetDept === '*' ? '' : 'WHERE department = $1';
    const deptParams = targetDept === '*' ? [] : [targetDept];

    const totalRes = await db.query(
      `SELECT COUNT(*) as count FROM students ${deptWhere}`,
      deptParams
    );

    const sWhere = targetDept === '*' ? '' : 'WHERE s.department = $1';

    const yearRes = await db.query(
      `SELECT s.year,
              COUNT(*) as students,
              ROUND(AVG(a.avg_gpa)::numeric, 2) as "avgCgpa",
              COUNT(*) FILTER (WHERE a.avg_gpa >= 8.0) as distinction,
              COUNT(*) FILTER (WHERE a.avg_gpa >= 6.5 AND a.avg_gpa < 8.0) as "firstClass",
              COUNT(*) FILTER (WHERE a.avg_gpa >= 5.5 AND a.avg_gpa < 6.5) as "secondClass",
              COUNT(*) FILTER (WHERE a.avg_gpa > 4.5 AND a.avg_gpa < 5.5) as "passClass"
       FROM students s
       LEFT JOIN (SELECT student_id, AVG(semester_gpa) as avg_gpa FROM academics GROUP BY student_id) a
         ON s.roll_number = a.student_id
       ${sWhere}
       GROUP BY s.year
       ORDER BY s.year`,
      deptParams
    );

    const sectionRes = await db.query(
      `SELECT 'Section ' || s.section as section,
              COUNT(*) as students,
              ROUND(AVG(a.avg_gpa)::numeric, 2) as "avgCgpa",
              COUNT(*) FILTER (WHERE a.avg_gpa >= 8.0) as distinction,
              COUNT(*) FILTER (WHERE a.avg_gpa >= 6.5 AND a.avg_gpa < 8.0) as "firstClass",
              COUNT(*) FILTER (WHERE a.avg_gpa >= 5.5 AND a.avg_gpa < 6.5) as "secondClass",
              COUNT(*) FILTER (WHERE a.avg_gpa > 4.5 AND a.avg_gpa < 5.5) as "passClass"
       FROM students s
       LEFT JOIN (SELECT student_id, AVG(semester_gpa) as avg_gpa FROM academics GROUP BY student_id) a
         ON s.roll_number = a.student_id
       ${sWhere}
       GROUP BY s.section
       ORDER BY s.section`,
      deptParams
    );

    const topRes = await db.query(
      `SELECT s.*, ROUND(AVG(a.semester_gpa)::numeric, 2) as avg_gpa
       FROM students s
       JOIN academics a ON s.roll_number = a.student_id
       ${sWhere}
       GROUP BY s.roll_number, s.name, s.email, s.year, s.department, s.batch, s.section, s.phone, s.photo_url, s.resume_url, s.linkedin_url, s.created_at, s.updated_at
       ORDER BY avg_gpa DESC
       LIMIT 5`,
      deptParams
    );

    res.json({
      department: targetDept,
      totalStudents: parseInt(totalRes.rows[0]?.count || '0'),
      yearBreakdown: yearRes.rows,
      sectionBreakdown: sectionRes.rows,
      topRankers: topRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Reports: Department
// ============================================================================
app.get('/reports/department/:dept', async (req: Request, res: Response) => {
  try {
    const dept = req.params.dept.toUpperCase();
    const { year, section } = req.query;

    if (db.isMock) {
      let students = Array.from(db.mockStore.students.values()).filter((s) => s.department === dept);
      if (year && String(year) !== 'All') students = students.filter((s) => s.year === year);
      if (section && String(section) !== 'All') {
        const secFormatted = String(section).replace('Section ', '').replace('Sec ', '');
        students = students.filter((s) => s.section === secFormatted || s.section === `Sec ${secFormatted}`);
      }
      return res.json({
        department: dept, totalStudents: students.length || 5, avgGpa: 9.15,
        avgEmployabilityScore: 88.5, eligibleForPlacementCount: students.length || 5,
        topSkills: ['Claude Code & CrewAI', 'React & TypeScript', 'AWS Lambda & S3'],
      });
    }

    const conditions: string[] = ['s.department = $1'];
    const params: any[] = [dept];
    let paramIndex = 2;

    if (year && String(year) !== 'All') {
      conditions.push(`s.year = $${paramIndex++}`);
      params.push(String(year));
    }
    if (section && String(section) !== 'All') {
      const secFormatted = String(section).replace('Section ', '').replace('Sec ', '');
      conditions.push(`(s.section = $${paramIndex} OR s.section = $${paramIndex + 1})`);
      params.push(secFormatted, `Sec ${secFormatted}`);
      paramIndex += 2;
    }

    const whereClause = conditions.join(' AND ');

    const statsRes = await db.query(
      `SELECT COUNT(*) as total_students,
              ROUND(AVG(a.avg_gpa)::numeric, 2) as avg_gpa
       FROM students s
       LEFT JOIN (SELECT student_id, AVG(semester_gpa) as avg_gpa FROM academics GROUP BY student_id) a
         ON s.roll_number = a.student_id
       WHERE ${whereClause}`,
      params
    );

    const skillsRes = await db.query(
      `SELECT ts.specific_tool, COUNT(*) as cnt
       FROM tech_skills ts
       JOIN students s ON ts.student_id = s.roll_number
       WHERE ${whereClause}
       GROUP BY ts.specific_tool
       ORDER BY cnt DESC LIMIT 3`,
      params
    );

    const stats = statsRes.rows[0] || {};
    res.json({
      department: dept,
      totalStudents: parseInt(stats.total_students || '0'),
      avgGpa: parseFloat(stats.avg_gpa || '0'),
      avgEmployabilityScore: 0,
      eligibleForPlacementCount: parseInt(stats.total_students || '0'),
      topSkills: skillsRes.rows.map((r: any) => r.specific_tool),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Reports: Placement Summary
// ============================================================================
app.get('/reports/placement-summary', async (_req: Request, res: Response) => {
  try {
    if (db.isMock) {
      const students = Array.from(db.mockStore.students.values());
      return res.json({
        summary: {
          totalRegistered: students.length, placementEligible: students.length,
          avgEmployabilityScore: 89.2,
          topDreamCompanies: ['Google', 'Microsoft', 'Amazon', 'Atlassian', 'AWS'],
        },
        students,
      });
    }

    const studentsRes = await db.query('SELECT * FROM students ORDER BY roll_number');
    const summaryRes = await db.query(
      `SELECT COUNT(*) as total,
              ROUND(AVG(pp.employability_score)::numeric, 1) as avg_score
       FROM students s
       LEFT JOIN placement_profile pp ON s.roll_number = pp.student_id`
    );

    const companiesRes = await db.query(
      `SELECT UNNEST(dream_company) as company, COUNT(*) as cnt
       FROM placement_profile
       GROUP BY company
       ORDER BY cnt DESC LIMIT 5`
    );

    const summary = summaryRes.rows[0] || {};
    res.json({
      summary: {
        totalRegistered: parseInt(summary.total || '0'),
        placementEligible: parseInt(summary.total || '0'),
        avgEmployabilityScore: parseFloat(summary.avg_score || '0'),
        topDreamCompanies: companiesRes.rows.map((r: any) => r.company),
      },
      students: studentsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Attendance Management System Endpoints
// ============================================================================

// 1. Upload/Sync Faculty-Subject Allotments (Admin / HOD / Coordinator)
app.post('/attendance/allotments/upload', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { semester, allotments } = req.body;
    if (!semester || !Array.isArray(allotments) || allotments.length === 0) {
      return res.status(400).json({ error: 'Semester and non-empty allotments array are required' });
    }

    const callerDept = req.auth?.department;
    const isSuper = req.auth?.isSuperAdmin || callerDept === '*' || req.auth?.role === 'admin' || req.auth?.role === 'coordinator';

    let addedCount = 0;
    let updatedCount = 0;
    const errors: { row: number; reason: string; item: any }[] = [];

    for (let i = 0; i < allotments.length; i++) {
      const row = allotments[i];
      const facultyName = (row.faculty_name || row.facultyName || row['Faculty Name'] || '').trim();
      const facultyEmail = (row.faculty_email || row.facultyEmail || row['Faculty Email'] || '').trim().toLowerCase();
      const subjectName = (row.subject_name || row.subjectName || row['Subject Allotted'] || row['Subject Name'] || '').trim();
      const section = (row.section || row['Section'] || 'A').trim().toUpperCase();
      const subjectTypeRaw = (row.subject_type || row.subjectType || row['Subject Type'] || 'Theory').trim();
      const subjectType = subjectTypeRaw.toLowerCase().includes('lab') ? 'Lab' : 'Theory';
      const department = (row.department || row['Department'] || callerDept || '').trim();

      if (!facultyEmail || !subjectName) {
        errors.push({ row: i + 1, reason: 'Faculty Email and Subject Name are required', item: row });
        continue;
      }

      if (!RGMCET_EMAIL_REGEX.test(facultyEmail) && !facultyEmail.endsWith('@rgmcet.edu.in')) {
        errors.push({ row: i + 1, reason: 'Invalid RGMCET faculty email domain', item: row });
        continue;
      }

      // Upsert faculty record if not exists
      try {
        const facCheck = await db.query('SELECT faculty_id FROM faculty WHERE LOWER(email) = LOWER($1)', [facultyEmail]);
        if (facCheck.rows.length === 0) {
          const newFacId = `FAC_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          await db.query(
            `INSERT INTO faculty (faculty_id, name, email, department, role)
             VALUES ($1, $2, $3, $4, 'mentor')
             ON CONFLICT (email) DO NOTHING`,
            [newFacId, facultyName || facultyEmail.split('@')[0], facultyEmail, department || 'General']
          );
        }
      } catch (err: any) {
        // ignore conflict
      }

      try {
        const existing = await db.query(
          `SELECT id FROM subject_allotments 
           WHERE semester_label = $1 
             AND LOWER(COALESCE(department, '')) = LOWER($2) 
             AND section = $3 
             AND LOWER(subject_name) = LOWER($4) 
             AND LOWER(faculty_email) = LOWER($5)`,
          [semester, department || 'General', section, subjectName, facultyEmail]
        );

        if (existing.rows.length > 0) {
          await db.query(
            `UPDATE subject_allotments
             SET subject_type = $1, faculty_name = $2, department = $3
             WHERE id = $4`,
            [subjectType, facultyName, department || 'General', existing.rows[0].id]
          );
          updatedCount++;
        } else {
          await db.query(
            `INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, faculty_name, department)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [semester, subjectName, subjectType, section, facultyEmail, facultyName, department || 'General']
          );
          addedCount++;
        }
      } catch (err: any) {
        errors.push({ row: i + 1, reason: err.message, item: row });
      }
    }

    res.json({
      message: `Allotments processed: ${addedCount} added, ${updatedCount} updated.`,
      addedCount,
      updatedCount,
      errorsCount: errors.length,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1b. Add Single Allotment Entry (Admin / HOD / Coordinator)
app.post('/attendance/allotments/single', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { semester, department, section, subject_name, subject_type, faculty_name, faculty_email } = req.body;
    if (!semester || !department || !section || !subject_name || !faculty_email) {
      return res.status(400).json({ error: 'Semester, Department, Section, Subject Name, and Faculty Email are required' });
    }

    const cleanEmail = faculty_email.trim().toLowerCase();
    const cleanSubj = subject_name.trim();
    const cleanSection = section.trim().toUpperCase();
    const cleanType = (subject_type || 'Theory').toLowerCase().includes('lab') ? 'Lab' : 'Theory';
    const cleanFacName = (faculty_name || cleanEmail.split('@')[0]).trim();
    const cleanDept = department.trim();

    if (!RGMCET_EMAIL_REGEX.test(cleanEmail) && !cleanEmail.endsWith('@rgmcet.edu.in')) {
      return res.status(400).json({ error: 'Invalid RGMCET faculty email domain (must be @rgmcet.edu.in)' });
    }

    // Upsert faculty record if not exists
    try {
      const facCheck = await db.query('SELECT faculty_id FROM faculty WHERE LOWER(email) = LOWER($1)', [cleanEmail]);
      if (facCheck.rows.length === 0) {
        const newFacId = `FAC_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        await db.query(
          `INSERT INTO faculty (faculty_id, name, email, department, role)
           VALUES ($1, $2, $3, $4, 'mentor')
           ON CONFLICT (email) DO NOTHING`,
          [newFacId, cleanFacName, cleanEmail, cleanDept || 'General']
        );
      }
    } catch {
      // ignore conflict
    }

    const existing = await db.query(
      `SELECT id FROM subject_allotments 
       WHERE semester_label = $1 
         AND LOWER(COALESCE(department, '')) = LOWER($2) 
         AND section = $3 
         AND LOWER(subject_name) = LOWER($4) 
         AND LOWER(faculty_email) = LOWER($5)`,
      [semester, cleanDept, cleanSection, cleanSubj, cleanEmail]
    );

    let allotmentId: string;
    if (existing.rows.length > 0) {
      allotmentId = existing.rows[0].id;
      await db.query(
        `UPDATE subject_allotments
         SET subject_type = $1, faculty_name = $2, department = $3
         WHERE id = $4`,
        [cleanType, cleanFacName, cleanDept, allotmentId]
      );
    } else {
      const insertRes = await db.query(
        `INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, faculty_name, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [semester, cleanSubj, cleanType, cleanSection, cleanEmail, cleanFacName, cleanDept]
      );
      allotmentId = insertRes.rows[0].id;
    }

    const fullAllotment = await db.query('SELECT * FROM subject_allotments WHERE id = $1', [allotmentId]);
    res.json({
      success: true,
      message: `Subject allocation for "${cleanSubj}" (${cleanDept} Section ${cleanSection}) saved successfully.`,
      allotment: fullAllotment.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Allotments (Admin, HOD, Coordinator, Faculty)
app.get('/attendance/allotments', requireRole('admin', 'hod', 'coordinator', 'faculty'), async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '';
    const department = (req.query.department as string) || '';
    const callerRole = req.auth?.role;
    const callerEmail = req.auth?.email?.toLowerCase();
    const callerDept = req.auth?.department;

    let query = `
      SELECT a.*, 
        (SELECT COUNT(*) FROM subject_rosters r WHERE r.allotment_id = a.id) AS roster_count,
        (SELECT COUNT(*) FROM attendance_sessions s WHERE s.allotment_id = a.id) AS sessions_count
      FROM subject_allotments a
      WHERE 1=1
    `;
    const params: any[] = [];

    if (semester) {
      params.push(semester);
      query += ` AND a.semester_label = $${params.length}`;
    }

    if (callerRole === 'faculty') {
      params.push(callerEmail);
      query += ` AND LOWER(a.faculty_email) = LOWER($${params.length})`;
    } else {
      const targetDept = (callerRole === 'hod' && callerDept && callerDept !== '*') ? callerDept : (department && department !== 'All' ? department : '');
      if (targetDept) {
        params.push(targetDept);
        query += ` AND (LOWER(REPLACE(a.department, ' ', '')) ILIKE '%' || LOWER(REPLACE($${params.length}, ' ', '')) || '%' OR LOWER(REPLACE($${params.length}, ' ', '')) ILIKE '%' || LOWER(REPLACE(a.department, ' ', '')) || '%')`;
      }
    }

    query += ` ORDER BY a.semester_label, a.subject_name, a.section`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete an Allotment (Admin / HOD / Coordinator)
app.delete('/attendance/allotments/:id', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM subject_allotments WHERE id = $1', [id]);
    res.json({ success: true, message: 'Subject allotment deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Upload Student Roster for a Subject Allotment (Admin / HOD / Coordinator)
app.post('/attendance/rosters/upload', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { allotment_id, roster } = req.body;
    if (!allotment_id || !Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ error: 'Allotment ID and non-empty roster array are required' });
    }

    // Validate that allotment exists
    const allotCheck = await db.query('SELECT * FROM subject_allotments WHERE id = $1', [allotment_id]);
    if (allotCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject allotment not found for this roster' });
    }

    let addedCount = 0;
    const errors: { row: number; reason: string; item: any }[] = [];
    const seenRolls = new Set<string>();

    for (let i = 0; i < roster.length; i++) {
      const row = roster[i];
      const rollNumber = (row.roll_number || row.rollNumber || row['Roll Number'] || '').trim().toUpperCase();
      const studentEmail = (row.student_email || row.studentEmail || row['Student Email'] || (rollNumber ? `${rollNumber.toLowerCase()}@rgmcet.edu.in` : '')).trim().toLowerCase();
      
      // Optional Date of Joining (defaults to today if not provided)
      let joiningDate: string | null = null;
      const rawDate = row.joining_date || row.joiningDate || row['Joining Date'] || row['Date of Joining'] || row['Date of Joining This Subject'];
      if (rawDate) {
        try {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) {
            joiningDate = parsed.toISOString().split('T')[0];
          }
        } catch {
          joiningDate = null;
        }
      }

      if (!rollNumber) {
        errors.push({ row: i + 1, reason: 'Roll Number is required', item: row });
        continue;
      }

      if (seenRolls.has(rollNumber)) {
        errors.push({ row: i + 1, reason: `Duplicate roll number ${rollNumber} in upload file`, item: row });
        continue;
      }
      seenRolls.add(rollNumber);

      try {
        await db.query(
          `INSERT INTO subject_rosters (allotment_id, roll_number, student_email, joining_date)
           VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE))
           ON CONFLICT (allotment_id, roll_number) DO UPDATE
           SET student_email = EXCLUDED.student_email,
               joining_date = COALESCE($4::date, subject_rosters.joining_date, CURRENT_DATE)`,
          [allotment_id, rollNumber, studentEmail, joiningDate]
        );
        addedCount++;
      } catch (err: any) {
        errors.push({ row: i + 1, reason: err.message, item: row });
      }
    }

    res.json({
      message: `Roster upload complete: ${addedCount} students enrolled.`,
      addedCount,
      errorsCount: errors.length,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Update Student Joining Date for a Subject (Admin, HOD, Faculty)
app.put('/attendance/rosters/:rosterId/joining-date', requireRole('admin', 'hod', 'faculty'), async (req: Request, res: Response) => {
  try {
    const { rosterId } = req.params;
    const { joining_date } = req.body;
    if (!joining_date) {
      return res.status(400).json({ error: 'joining_date is required' });
    }

    const result = await db.query(
      `UPDATE subject_rosters
       SET joining_date = $1::date
       WHERE id = $2
       RETURNING *`,
      [joining_date, rosterId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Roster entry not found' });
    }

    res.json({ success: true, roster: result.rows[0], message: 'Joining date updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4c. Add Single Student to Roster (Admin, HOD, Coordinator)
app.post('/attendance/rosters/single', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { allotment_id, roll_number, student_name, student_email, joining_date } = req.body;
    if (!allotment_id || !roll_number) {
      return res.status(400).json({ error: 'Allotment ID and Roll Number are required' });
    }

    const cleanRoll = roll_number.trim().toUpperCase();
    const cleanEmail = (student_email || `${cleanRoll.toLowerCase()}@rgmcet.edu.in`).trim().toLowerCase();

    // Check allotment exists
    const allotCheck = await db.query('SELECT * FROM subject_allotments WHERE id = $1', [allotment_id]);
    if (allotCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject allotment not found' });
    }

    let parsedJoinDate: string | null = null;
    if (joining_date) {
      try {
        const d = new Date(joining_date);
        if (!isNaN(d.getTime())) {
          parsedJoinDate = d.toISOString().split('T')[0];
        }
      } catch {
        parsedJoinDate = null;
      }
    }

    const result = await db.query(
      `INSERT INTO subject_rosters (allotment_id, roll_number, student_email, joining_date)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE))
       ON CONFLICT (allotment_id, roll_number) DO UPDATE
       SET student_email = EXCLUDED.student_email,
           joining_date = COALESCE($4::date, subject_rosters.joining_date, CURRENT_DATE)
       RETURNING *`,
      [allotment_id, cleanRoll, cleanEmail, parsedJoinDate]
    );

    res.json({
      success: true,
      message: `Student ${cleanRoll} successfully enrolled in subject.`,
      roster: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4d. Unassign / Delete Student from Subject Roster (Admin, HOD, Coordinator)
app.delete('/attendance/rosters/:rosterId', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { rosterId } = req.params;
    const result = await db.query(
      `DELETE FROM subject_rosters
       WHERE id = $1
       RETURNING roll_number, allotment_id`,
      [rosterId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student roster entry not found' });
    }

    res.json({
      success: true,
      message: `Student ${result.rows[0].roll_number} has been unassigned from this subject roster.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Roster for an Allotment (Admin, HOD, Faculty)
app.get('/attendance/rosters/:allotmentId', requireRole('admin', 'hod', 'faculty'), async (req: Request, res: Response) => {
  try {
    const { allotmentId } = req.params;

    // Fetch allotment details
    const allot = await db.query('SELECT * FROM subject_allotments WHERE id = $1', [allotmentId]);
    if (allot.rows.length === 0) {
      return res.status(404).json({ error: 'Subject allotment not found.' });
    }
    const allotmentRow = allot.rows[0];

    // Check authorization for faculty
    if (req.auth?.role === 'faculty') {
      if (allotmentRow.faculty_email.toLowerCase() !== req.auth.email.toLowerCase()) {
        return res.status(403).json({ error: 'Access denied. You can only view rosters for your allotted subjects.' });
      }
    }

    const result = await db.query(
      `SELECT r.*, s.name as student_name, s.department as student_department, s.section as student_section
       FROM subject_rosters r
       LEFT JOIN students s ON s.roll_number = r.roll_number
       WHERE r.allotment_id = $1
       ORDER BY r.roll_number`,
      [allotmentId]
    );

    // If this is a 1st year semester (1-1 or 1-2) and subject_rosters has no rows for this allotment,
    // automatically retrieve active 1st Year freshers from the students table by department and section!
    if (result.rows.length === 0 && ['1-1', '1-2'].includes(allotmentRow.semester_label)) {
      const dept = allotmentRow.department || '';
      const sec = allotmentRow.section || 'A';
      const fresherRes = await db.query(
        `SELECT roll_number, name as student_name, email as student_email, department as student_department, section as student_section, created_at as joining_date
         FROM students
         WHERE year = '1st Year'
           AND (LOWER(department) = LOWER($1) OR LOWER(REPLACE(department, ' ', '')) = LOWER(REPLACE($1, ' ', '')) OR $1 = '' OR $1 = 'General')
           AND section = $2
         ORDER BY name ASC, roll_number ASC`,
        [dept, sec]
      );
      return res.json(fresherRes.rows.map(f => ({
        id: `fresher_${f.roll_number}`,
        allotment_id: allotmentId,
        roll_number: f.roll_number,
        student_name: f.student_name,
        student_email: f.student_email,
        student_department: f.student_department,
        student_section: f.student_section,
        joining_date: f.joining_date,
      })));
    }

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Faculty: Get My Allotted Subjects for a Semester
app.get('/attendance/my-subjects', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '';
    const facultyEmail = req.auth?.email?.toLowerCase();

    let query = `
      SELECT a.*,
        (SELECT COUNT(*) FROM subject_rosters r WHERE r.allotment_id = a.id) AS roster_count,
        (SELECT COUNT(*) FROM attendance_sessions s WHERE s.allotment_id = a.id) AS sessions_count
      FROM subject_allotments a
      WHERE 1=1
    `;
    const params: any[] = [];

    if (req.auth?.role === 'faculty') {
      params.push(facultyEmail);
      query += ` AND LOWER(a.faculty_email) = LOWER($${params.length})`;
    }

    if (semester) {
      params.push(semester);
      query += ` AND a.semester_label = $${params.length}`;
    }

    query += ` ORDER BY a.semester_label, a.subject_name, a.section`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Save Attendance Session + Records (Faculty, HOD, Admin)
app.post('/attendance/sessions', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const { allotment_id, session_date, num_periods, period_start, records } = req.body;
    if (!allotment_id || !session_date || !num_periods || !period_start || !Array.isArray(records)) {
      return res.status(400).json({ error: 'All fields (allotment_id, session_date, num_periods, period_start, records) are required' });
    }

    // Verify allotment permissions
    const allotRes = await db.query('SELECT * FROM subject_allotments WHERE id = $1', [allotment_id]);
    if (allotRes.rows.length === 0) {
      return res.status(404).json({ error: 'Subject allotment not found' });
    }
    const allotment = allotRes.rows[0];

    if (req.auth?.role === 'faculty' && allotment.faculty_email.toLowerCase() !== req.auth.email.toLowerCase()) {
      return res.status(403).json({ error: 'Access denied: You can only take attendance for your own allotted subjects' });
    }
    // 1. Holiday Check — Attendance cannot be marked on declared public/institutional holidays
    const holRes = await db.query('SELECT title, type FROM holiday_calendar WHERE date = $1', [session_date]);
    if (holRes.rows.length > 0) {
      const hol = holRes.rows[0];
      return res.status(400).json({
        error: `Cannot post attendance on ${session_date}: It is marked as an official ${hol.type || 'Holiday'} (${hol.title}).`,
      });
    }

    // 2. Academic Calendar Check — Attendance can only be marked within the active semester date window
    const semRes = await db.query(
      `SELECT * FROM academic_calendar 
       WHERE semester = $1 
       ORDER BY academic_year DESC LIMIT 1`,
      [allotment.semester]
    );
    if (semRes.rows.length > 0) {
      const cal = semRes.rows[0];
      const startIso = typeof cal.start_date === 'string' ? cal.start_date.split('T')[0] : new Date(cal.start_date).toISOString().split('T')[0];
      const endIso = typeof cal.end_date === 'string' ? cal.end_date.split('T')[0] : new Date(cal.end_date).toISOString().split('T')[0];
      if (session_date < startIso || session_date > endIso) {
        return res.status(400).json({
          error: `Cannot post attendance on ${session_date}: Outside active semester ${allotment.semester} academic calendar window (${startIso} to ${endIso} for ${cal.academic_year}).`,
        });
      }
    }

    const recordedBy = req.auth?.email?.toLowerCase() || allotment.faculty_email;

    // Check if session already exists for this slot
    const existing = await db.query(
      `SELECT id FROM attendance_sessions 
       WHERE allotment_id = $1 AND session_date = $2 AND period_start = $3`,
      [allotment_id, session_date, period_start]
    );

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
      await db.query(
        `UPDATE attendance_sessions 
         SET num_periods = $1, recorded_by = $2 
         WHERE id = $3`,
        [num_periods, recordedBy, sessionId]
      );
    } else {
      const ins = await db.query(
        `INSERT INTO attendance_sessions (allotment_id, session_date, num_periods, period_start, recorded_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [allotment_id, session_date, num_periods, period_start, recordedBy]
      );
      sessionId = ins.rows[0].id;
    }

    // Check for approved student permissions (On-Duty / Leaves) active on session_date
    let approvedODRolls = new Set<string>();
    try {
      const odRes = await db.query(
        `SELECT roll_number FROM student_permissions 
         WHERE status = 'Approved' 
           AND $1::date >= from_date 
           AND $1::date <= to_date`,
        [session_date]
      );
      approvedODRolls = new Set(odRes.rows.map((r: any) => r.roll_number?.trim().toUpperCase()));
    } catch (_) { /* ignore if table not created yet */ }

    // Insert or update individual student records
    let presentCount = 0;
    for (const rec of records) {
      const rollNumber = rec.roll_number?.trim().toUpperCase();
      if (!rollNumber) continue;

      // If student has an approved permission on this date, auto-lock as present (On-Duty)
      const hasApprovedPermission = approvedODRolls.has(rollNumber);
      const isPresent = hasApprovedPermission || Boolean(rec.is_present);
      if (isPresent) presentCount++;

      await db.query(
        `INSERT INTO attendance_records (session_id, roll_number, is_present)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, roll_number) DO UPDATE
         SET is_present = EXCLUDED.is_present`,
        [sessionId, rollNumber, isPresent]
      );
    }

    res.json({
      success: true,
      message: `Attendance saved for ${allotment.subject_name} — ${num_periods} Session(s) — ${presentCount}/${records.length} present.`,
      sessionId,
      presentCount,
      totalCount: records.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Get Attendance Sessions (with filters)
app.get('/attendance/sessions', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const allotmentId = req.query.allotment_id as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    let query = `
      SELECT s.*, a.subject_name, a.subject_type, a.section, a.semester_label, a.faculty_name,
        (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS total_marked,
        (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.is_present = true) AS present_count
      FROM attendance_sessions s
      JOIN subject_allotments a ON a.id = s.allotment_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (allotmentId) {
      params.push(allotmentId);
      query += ` AND s.allotment_id = $${params.length}`;
    }

    if (req.auth?.role === 'faculty') {
      params.push(req.auth.email.toLowerCase());
      query += ` AND LOWER(a.faculty_email) = LOWER($${params.length})`;
    } else if (req.auth?.role === 'hod' && req.auth.department && req.auth.department !== '*') {
      params.push(req.auth.department);
      query += ` AND (LOWER(REPLACE(a.department, ' ', '')) ILIKE '%' || LOWER(REPLACE($${params.length}, ' ', '')) || '%' OR LOWER(REPLACE($${params.length}, ' ', '')) ILIKE '%' || LOWER(REPLACE(a.department, ' ', '')) || '%')`;
    }

    if (dateFrom) {
      params.push(dateFrom);
      query += ` AND s.session_date >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      query += ` AND s.session_date <= $${params.length}`;
    }

    query += ` ORDER BY s.session_date DESC, s.period_start DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Get Single Session Details with Records (Faculty, HOD, Admin)
app.get('/attendance/sessions/:id', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sessRes = await db.query(
      `SELECT s.*, a.subject_name, a.subject_type, a.section, a.semester_label, a.faculty_name, a.faculty_email
       FROM attendance_sessions s
       JOIN subject_allotments a ON a.id = s.allotment_id
       WHERE s.id = $1`,
      [id]
    );
    if (sessRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessRes.rows[0];

    const recordsRes = await db.query(
      `SELECT r.roll_number, r.is_present, s.name as student_name
       FROM attendance_records r
       LEFT JOIN students s ON s.roll_number = r.roll_number
       WHERE r.session_id = $1
       ORDER BY r.roll_number`,
      [id]
    );

    res.json({
      session,
      records: recordsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Delete Attendance Session (Faculty, HOD, Admin)
app.delete('/attendance/sessions/:id', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM attendance_sessions WHERE id = $1', [id]);
    res.json({ success: true, message: 'Attendance session deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Student / Parent / General: Get Student Attendance Summary (Per-Subject % & Overall %)
// Correctly accounts for student's joining_date for each subject!
app.get('/attendance/student/:rollNumber', requireAuth, async (req: Request, res: Response) => {
  try {
    const rollNumber = req.params.rollNumber.toUpperCase();

    // Security check: students can only view own attendance
    if (req.auth?.role === 'student' && req.auth.regNo !== rollNumber) {
      return res.status(403).json({ error: 'Access denied: Students can only view their own attendance.' });
    }

    // Get student details
    const studentRes = await db.query('SELECT roll_number, name, department, batch, section, year FROM students WHERE roll_number = $1', [rollNumber]);
    const student = studentRes.rows[0] || { roll_number: rollNumber };

    // Query all subjects this student is enrolled in with joining_date filter
    const subjectsQuery = `
      SELECT 
        a.id AS allotment_id,
        a.subject_name,
        a.subject_type,
        a.semester_label,
        a.faculty_name,
        sr.joining_date,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(sr.joining_date, '1970-01-01'::date) THEN s.num_periods ELSE 0 END), 0) AS total_periods_held,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(sr.joining_date, '1970-01-01'::date) AND r.is_present = true THEN s.num_periods ELSE 0 END), 0) AS periods_attended
      FROM subject_rosters sr
      JOIN subject_allotments a ON a.id = sr.allotment_id
      LEFT JOIN attendance_sessions s ON s.allotment_id = a.id
      LEFT JOIN attendance_records r ON r.session_id = s.id AND r.roll_number = sr.roll_number
      WHERE sr.roll_number = $1
      GROUP BY a.id, a.subject_name, a.subject_type, a.semester_label, a.faculty_name, sr.joining_date
      ORDER BY a.semester_label, a.subject_name
    `;

    const subjectsRes = await db.query(subjectsQuery, [rollNumber]);

    let grandTotalHeld = 0;
    let grandTotalAttended = 0;

    const subjects = subjectsRes.rows.map((row: any) => {
      const held = parseInt(row.total_periods_held || '0');
      const attended = parseInt(row.periods_attended || '0');
      grandTotalHeld += held;
      grandTotalAttended += attended;
      const pct = held > 0 ? Math.round((attended / held) * 1000) / 10 : 100;
      return {
        allotment_id: row.allotment_id,
        subject_name: row.subject_name,
        subject_type: row.subject_type,
        semester_label: row.semester_label,
        faculty_name: row.faculty_name,
        joining_date: row.joining_date,
        periods_held: held,
        periods_attended: attended,
        percentage: pct,
      };
    });

    const overallPercentage = grandTotalHeld > 0 
      ? Math.round((grandTotalAttended / grandTotalHeld) * 1000) / 10 
      : 100;

    res.json({
      student,
      overall_percentage: overallPercentage,
      total_periods_held: grandTotalHeld,
      total_periods_attended: grandTotalAttended,
      subjects,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Student / Parent / Faculty / HOD / Admin: Day-wise 7-Period Attendance Dot Grid
// Excludes sessions held prior to student's joining date
app.get('/attendance/student/:rollNumber/daywise', requireAuth, async (req: Request, res: Response) => {
  try {
    const rollNumber = req.params.rollNumber.toUpperCase();

    if (req.auth?.role === 'student' && req.auth.regNo !== rollNumber) {
      return res.status(403).json({ error: 'Access denied: Students can only view their own attendance.' });
    }

    const fromDate = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (req.query.to as string) || new Date().toISOString().split('T')[0];

    const recordsQuery = `
      SELECT 
        s.session_date,
        s.period_start,
        s.num_periods,
        r.is_present,
        a.subject_name,
        a.subject_type,
        sr.joining_date
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r.session_id
      JOIN subject_allotments a ON a.id = s.allotment_id
      JOIN subject_rosters sr ON sr.allotment_id = a.id AND sr.roll_number = r.roll_number
      WHERE r.roll_number = $1
        AND s.session_date >= $2
        AND s.session_date <= $3
        AND s.session_date >= COALESCE(sr.joining_date, '1970-01-01'::date)
      ORDER BY s.session_date DESC, s.period_start ASC
    `;

    const result = await db.query(recordsQuery, [rollNumber, fromDate, toDate]);

    // Build map of date -> 7 periods (array of 7 slots)
    const dayMap: Record<string, any[]> = {};

    result.rows.forEach((row: any) => {
      const dateStr = typeof row.session_date === 'string' 
        ? row.session_date.split('T')[0] 
        : new Date(row.session_date).toISOString().split('T')[0];

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = [null, null, null, null, null, null, null]; // 7 periods (1-indexed mapping to 0-6)
      }

      const startIdx = Math.max(0, Math.min(6, parseInt(row.period_start) - 1));
      const count = Math.min(parseInt(row.num_periods) || 1, 7 - startIdx);

      for (let p = 0; p < count; p++) {
        const slotIdx = startIdx + p;
        if (slotIdx < 7) {
          dayMap[dateStr][slotIdx] = {
            is_present: row.is_present,
            subject_name: row.subject_name,
            subject_type: row.subject_type,
            period: slotIdx + 1,
          };
        }
      }
    });

    const days = Object.keys(dayMap).sort().reverse().map(date => ({
      date,
      periods: dayMap[date],
    }));

    res.json({
      rollNumber,
      fromDate,
      toDate,
      days,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Subject Attendance Summary (Per-Student Attendance Table for Faculty/HOD/Admin)
// Respects each individual student's joining_date
app.get('/attendance/subject/:allotmentId/summary', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    const { allotmentId } = req.params;

    const allotRes = await db.query('SELECT * FROM subject_allotments WHERE id = $1', [allotmentId]);
    if (allotRes.rows.length === 0) {
      return res.status(404).json({ error: 'Subject allotment not found' });
    }
    const allotment = allotRes.rows[0];

    // Total periods held overall for this subject
    const heldRes = await db.query(
      'SELECT COALESCE(SUM(num_periods), 0) as total_held, COUNT(*) as sessions_count FROM attendance_sessions WHERE allotment_id = $1',
      [allotmentId]
    );
    const totalHeldOverall = parseInt(heldRes.rows[0]?.total_held || '0');
    const sessionsCount = parseInt(heldRes.rows[0]?.sessions_count || '0');

    // Per-student attendance with joining_date consideration
    const studentsRes = await db.query(
      `SELECT 
        r.id AS roster_id,
        r.roll_number,
        r.joining_date,
        COALESCE(st.name, r.roll_number) AS student_name,
        COALESCE(st.section, allotment.section) AS section,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) THEN s.num_periods ELSE 0 END), 0) AS student_periods_held,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) AND ar.is_present = true THEN s.num_periods ELSE 0 END), 0) AS periods_attended
       FROM subject_rosters r
       CROSS JOIN (SELECT $1::uuid AS id, $2::text AS section) allotment
       LEFT JOIN students st ON st.roll_number = r.roll_number
       LEFT JOIN attendance_sessions s ON s.allotment_id = $1
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.roll_number = r.roll_number
       WHERE r.allotment_id = $1
       GROUP BY r.id, r.roll_number, r.joining_date, st.name, st.section, allotment.section
       ORDER BY r.roll_number`,
      [allotmentId, allotment.section]
    );

    const students = studentsRes.rows.map((row: any) => {
      const held = parseInt(row.student_periods_held || '0');
      const attended = parseInt(row.periods_attended || '0');
      const pct = held > 0 ? Math.round((attended / held) * 1000) / 10 : 100;
      return {
        roster_id: row.roster_id,
        roll_number: row.roll_number,
        student_name: row.student_name,
        section: row.section,
        joining_date: row.joining_date,
        periods_held: held,
        periods_attended: attended,
        percentage: pct,
      };
    });

    res.json({
      allotment,
      total_periods_held: totalHeldOverall,
      sessions_count: sessionsCount,
      total_students: students.length,
      students,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Timetable: Upload Timetable Schedule (Admin / HOD / Coordinator)
app.post('/attendance/timetable/upload', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { semester, department, section, entries } = req.body;
    if (!semester || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Semester and non-empty entries array are required' });
    }

    const callerDept = req.auth?.department;
    const targetDept = department || callerDept || 'General';
    const targetSec = (section || 'A').trim().toUpperCase();

    let addedCount = 0;
    let updatedCount = 0;
    const errors: { row: number; reason: string; item: any }[] = [];

    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 0; i < entries.length; i++) {
      const row = entries[i];
      const dayRaw = (row.day_of_week || row.day || row['Day'] || row['Day of Week'] || '').trim();
      const dayOfWeek = validDays.find(d => d.toLowerCase() === dayRaw.toLowerCase()) || dayRaw;
      const periodStart = parseInt(row.period_start || row.periodStart || row['Period Start'] || row['Period'] || '1');
      const numPeriods = parseInt(row.num_periods || row.numPeriods || row['Num Periods'] || row['Duration'] || '1');
      const subjectName = (row.subject_name || row.subjectName || row['Subject Name'] || row['Subject'] || '').trim();
      const subjectTypeRaw = (row.subject_type || row.subjectType || row['Subject Type'] || 'Theory').trim();
      const subjectType = subjectTypeRaw.toLowerCase().includes('lab') ? 'Lab' : 'Theory';
      const facultyEmail = (row.faculty_email || row.facultyEmail || row['Faculty Email'] || '').trim().toLowerCase();
      const facultyName = (row.faculty_name || row.facultyName || row['Faculty Name'] || '').trim();
      const roomNo = (row.room_no || row.roomNo || row['Room No'] || row['Room'] || '').trim();
      const rowSec = (row.section || row['Section'] || targetSec).trim().toUpperCase();

      if (!dayOfWeek || !subjectName || isNaN(periodStart) || periodStart < 1 || periodStart > 7) {
        errors.push({ row: i + 1, reason: 'Valid Day (Mon-Sat), Subject Name, and Period Start (1-7) are required', item: row });
        continue;
      }

      const validNumPeriods = Math.max(1, Math.min(3, isNaN(numPeriods) ? 1 : numPeriods));

      try {
        await db.query(
          `INSERT INTO timetable_entries (semester_label, department, section, day_of_week, period_start, num_periods, subject_name, subject_type, faculty_email, faculty_name, room_no)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (semester_label, department, section, day_of_week, period_start) DO UPDATE
           SET num_periods = EXCLUDED.num_periods,
               subject_name = EXCLUDED.subject_name,
               subject_type = EXCLUDED.subject_type,
               faculty_email = EXCLUDED.faculty_email,
               faculty_name = EXCLUDED.faculty_name,
               room_no = EXCLUDED.room_no`,
          [semester, targetDept, rowSec, dayOfWeek, periodStart, validNumPeriods, subjectName, subjectType, facultyEmail, facultyName, roomNo]
        );
        addedCount++;
      } catch (err: any) {
        errors.push({ row: i + 1, reason: err.message, item: row });
      }
    }

    res.json({
      message: `Timetable processed: ${addedCount} slots saved.`,
      addedCount,
      errorsCount: errors.length,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Timetable: Get Timetable Entries (Filterable)
app.get('/attendance/timetable', requireAuth, async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '';
    const section = (req.query.section as string) || '';
    const department = (req.query.department as string) || '';
    const dayOfWeek = (req.query.day as string) || '';

    let query = `SELECT * FROM timetable_entries WHERE 1=1`;
    const params: any[] = [];

    if (semester) {
      params.push(semester);
      query += ` AND semester_label = $${params.length}`;
    }
    if (section && section !== 'All') {
      params.push(section.toUpperCase());
      query += ` AND section = $${params.length}`;
    }
    if (department && department !== 'All' && department !== '*') {
      params.push(`%${department}%`);
      query += ` AND (department ILIKE $${params.length} OR department = '' OR department = '*')`;
    }
    if (dayOfWeek && dayOfWeek !== 'All') {
      params.push(dayOfWeek);
      query += ` AND day_of_week = $${params.length}`;
    }

    query += ` ORDER BY 
      CASE day_of_week
        WHEN 'Monday' THEN 1
        WHEN 'Tuesday' THEN 2
        WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4
        WHEN 'Friday' THEN 5
        WHEN 'Saturday' THEN 6
        ELSE 7
      END, period_start ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Timetable: Delete Timetable Entry
app.delete('/attendance/timetable/:id', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM timetable_entries WHERE id = $1', [id]);
    res.json({ success: true, message: 'Timetable slot deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16b. Timetable: Upload Official Timetable PDF Document (Admin / HOD / Coordinator)
app.post('/attendance/timetable/document/upload', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { semester, department, section, file_name, file_data, file_size } = req.body;
    if (!semester || !file_name || !file_data) {
      return res.status(400).json({ error: 'Semester, file_name, and file_data are required' });
    }

    const callerDept = req.auth?.department;
    let targetDept = (department || callerDept || 'CSE').trim();
    if (targetDept === '*' || targetDept === 'All') {
      targetDept = 'CSE';
    }
    const targetSec = (section || 'A').trim().toUpperCase();
    const uploadedBy = req.auth?.email || 'Admin';

    const result = await db.query(
      `INSERT INTO timetable_documents (semester_label, department, section, file_name, file_data, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (semester_label, department, section) DO UPDATE
       SET file_name = EXCLUDED.file_name,
           file_data = EXCLUDED.file_data,
           file_size = EXCLUDED.file_size,
           uploaded_by = EXCLUDED.uploaded_by,
           created_at = NOW()
       RETURNING id, semester_label, department, section, file_name, file_size, uploaded_by, created_at`,
      [semester, targetDept, targetSec, file_name, file_data, file_size || 0, uploadedBy]
    );

    res.json({
      success: true,
      message: `Official Timetable PDF "${file_name}" uploaded successfully for ${targetDept} - Semester ${semester} (Sec ${targetSec}).`,
      document: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16c. Timetable: Get Official Timetable PDF Document
app.get('/attendance/timetable/document', requireAuth, async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '';
    const section = ((req.query.section as string) || 'A').toUpperCase();
    const department = ((req.query.department as string) || '').trim();

    let query = `SELECT id, semester_label, department, section, file_name, file_data, file_size, uploaded_by, created_at 
                 FROM timetable_documents WHERE semester_label = $1`;
    const params: any[] = [semester];

    if (section && section !== 'All') {
      params.push(section);
      query += ` AND section = $${params.length}`;
    }
    if (department && department !== 'All' && department !== '*') {
      params.push(`%${department}%`);
      query += ` AND (department ILIKE $${params.length} OR department = '' OR department = '*')`;
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      return res.json({ document: null });
    }

    res.json({ document: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16d. Timetable: Delete Official Timetable PDF Document
app.delete('/attendance/timetable/document/:id', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM timetable_documents WHERE id = $1', [id]);
    res.json({ success: true, message: 'Timetable document deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Timetable: Clear Section Timetable
app.delete('/attendance/timetable/clear/section', requireRole('admin', 'hod', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { semester, section, department } = req.query;
    if (!semester) {
      return res.status(400).json({ error: 'Semester is required' });
    }
    let query = `DELETE FROM timetable_entries WHERE semester_label = $1`;
    const params: any[] = [semester];

    if (section && section !== 'All') {
      params.push(section);
      query += ` AND section = $${params.length}`;
    }
    if (department && department !== 'All') {
      params.push(`%${department}%`);
      query += ` AND department ILIKE $${params.length}`;
    }

    const result = await db.query(query, params);
    res.json({ success: true, message: `Cleared ${result.rowCount || 0} timetable slots.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 18. Timetable: Get Today's Scheduled Session Slots (Auto-Generator for Faculty & Students)
app.get('/attendance/timetable/today-slots', requireAuth, async (req: Request, res: Response) => {
  try {
    const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const semester = (req.query.semester as string) || '';
    const section = (req.query.section as string) || '';
    const facultyEmail = (req.query.faculty_email as string) || (req.auth?.role === 'faculty' ? req.auth.email : '');

    const dateObj = new Date(dateStr);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];

    if (dayOfWeek === 'Sunday') {
      return res.json({ dayOfWeek, date: dateStr, slots: [], message: 'Sunday is a holiday' });
    }

    let query = `SELECT * FROM timetable_entries WHERE day_of_week = $1`;
    const params: any[] = [dayOfWeek];

    if (semester) {
      params.push(semester);
      query += ` AND semester_label = $${params.length}`;
    }
    if (section && section !== 'All') {
      params.push(section.toUpperCase());
      query += ` AND section = $${params.length}`;
    }
    if (facultyEmail) {
      params.push(facultyEmail.toLowerCase());
      query += ` AND LOWER(faculty_email) = LOWER($${params.length})`;
    }

    query += ` ORDER BY period_start ASC`;

    const result = await db.query(query, params);

    // Attach period timing metadata based on year
    const slots = result.rows.map((row: any) => {
      const isFirstOrFourthYear = ['1-1', '1-2', '4-1', '4-2'].includes(row.semester_label);
      let timingStr = '';
      const p = parseInt(row.period_start);
      const span = parseInt(row.num_periods);

      if (isFirstOrFourthYear) {
        // 1st & 4th year period structure:
        // P1: 09:00-09:50, P2: 09:50-10:40 [Break 10:40-11:00]
        // P3: 11:00-11:50 [Lunch 11:50-01:00]
        // P4: 01:00-01:50, P5: 01:50-02:40 [Break 02:40-03:00]
        // P6: 03:00-03:50, P7: 03:50-04:40
        const startTimes = ['', '09:00 AM', '09:50 AM', '11:00 AM', '01:00 PM', '01:50 PM', '03:00 PM', '03:50 PM'];
        const endTimes = ['', '09:50 AM', '10:40 AM', '11:50 AM', '01:50 PM', '02:40 PM', '03:50 PM', '04:40 PM'];
        const start = startTimes[p] || '09:00 AM';
        const end = endTimes[Math.min(7, p + span - 1)] || '04:40 PM';
        timingStr = `${start} – ${end}`;
      } else {
        // 2nd & 3rd year period structure:
        // P1: 09:00-09:50, P2: 09:50-10:40 [Break 10:40-11:00]
        // P3: 11:00-11:50, P4: 11:50-12:40 [Lunch 12:40-01:50]
        // P5: 01:50-02:40, P6: 02:40-03:30, P7: 03:30-04:20
        const startTimes = ['', '09:00 AM', '09:50 AM', '11:00 AM', '11:50 AM', '01:50 PM', '02:40 PM', '03:30 PM'];
        const endTimes = ['', '09:50 AM', '10:40 AM', '11:50 AM', '12:40 PM', '02:40 PM', '03:30 PM', '04:20 PM'];
        const start = startTimes[p] || '09:00 AM';
        const end = endTimes[Math.min(7, p + span - 1)] || '04:20 PM';
        timingStr = `${start} – ${end}`;
      }

      return {
        ...row,
        timing_display: timingStr,
      };
    });

    res.json({
      date: dateStr,
      dayOfWeek,
      slots,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19. Year-Wise Attendance Summary Report (for PDF & Excel Export)
// Accessible by Admin, HOD, and Faculty (for their allotted subjects)
app.get('/attendance/reports/year-summary', requireRole('admin', 'hod', 'faculty'), async (req: Request, res: Response) => {
  try {
    const yearParam = (req.query.year as string) || '2nd Year';
    const departmentParam = (req.query.department as string) || '';
    const sectionParam = (req.query.section as string) || '';
    const callerRole = req.auth?.role;
    const callerEmail = req.auth?.email?.toLowerCase();
    const callerDept = req.auth?.department;

    // Resolve semester labels for the selected year
    let semesterLabels: string[] = ['2-1', '2-2'];
    if (yearParam.includes('1') || yearParam === '1st Year') semesterLabels = ['1-1', '1-2'];
    else if (yearParam.includes('2') || yearParam === '2nd Year') semesterLabels = ['2-1', '2-2'];
    else if (yearParam.includes('3') || yearParam === '3rd Year') semesterLabels = ['3-1', '3-2'];
    else if (yearParam.includes('4') || yearParam === '4th Year') semesterLabels = ['4-1', '4-2'];
    else semesterLabels = [yearParam];

    // Filter department
    let targetDept = departmentParam;
    if (callerRole === 'hod' && callerDept && callerDept !== '*') {
      targetDept = callerDept;
    }

    // Step 1: Get all subjects in these semesters for the department
    let subjQuery = `
      SELECT a.id, a.subject_name, a.subject_type, a.semester_label, a.section, a.faculty_name, a.faculty_email, a.department
      FROM subject_allotments a
      WHERE a.semester_label = ANY($1)
    `;
    const subjParams: any[] = [semesterLabels];

    if (targetDept && targetDept !== 'All') {
      subjParams.push(targetDept);
      subjQuery += ` AND (LOWER(REPLACE(a.department, ' ', '')) ILIKE '%' || LOWER(REPLACE($${subjParams.length}, ' ', '')) || '%' OR LOWER(REPLACE($${subjParams.length}, ' ', '')) ILIKE '%' || LOWER(REPLACE(a.department, ' ', '')) || '%')`;
    }
    if (sectionParam && sectionParam !== 'All') {
      subjParams.push(sectionParam.toUpperCase());
      subjQuery += ` AND a.section = $${subjParams.length}`;
    }
    if (callerRole === 'faculty') {
      subjParams.push(callerEmail);
      subjQuery += ` AND LOWER(a.faculty_email) = LOWER($${subjParams.length})`;
    }

    subjQuery += ` ORDER BY a.semester_label, a.subject_name, a.section`;
    const subjectsRes = await db.query(subjQuery, subjParams);
    const subjects = subjectsRes.rows;

    if (subjects.length === 0) {
      return res.json({
        year: yearParam,
        semesters: semesterLabels,
        department: targetDept || 'All',
        section: sectionParam || 'All',
        subjects: [],
        students: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const allotmentIds = subjects.map((s: any) => s.id);

    // Step 2: Get all students enrolled in any of these allotments with per-subject attendance
    const studentDataQuery = `
      SELECT 
        st.roll_number,
        st.name AS student_name,
        st.section AS student_section,
        st.department AS student_department,
        r.allotment_id,
        r.joining_date,
        a.subject_name,
        a.semester_label,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) THEN s.num_periods ELSE 0 END), 0) AS periods_held,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) AND ar.is_present = true THEN s.num_periods ELSE 0 END), 0) AS periods_attended
      FROM subject_rosters r
      JOIN subject_allotments a ON a.id = r.allotment_id
      LEFT JOIN students st ON st.roll_number = r.roll_number
      LEFT JOIN attendance_sessions s ON s.allotment_id = a.id
      LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.roll_number = r.roll_number
      WHERE r.allotment_id = ANY($1)
      GROUP BY st.roll_number, st.name, st.section, st.department, r.allotment_id, r.joining_date, a.subject_name, a.semester_label
      ORDER BY st.roll_number, a.subject_name
    `;

    const studentDataRes = await db.query(studentDataQuery, [allotmentIds]);

    // Aggregate by student
    const studentMap: Record<string, any> = {};

    studentDataRes.rows.forEach((row: any) => {
      const roll = row.roll_number || 'UNKNOWN';
      if (!studentMap[roll]) {
        studentMap[roll] = {
          roll_number: roll,
          name: row.student_name || roll,
          section: row.student_section || sectionParam || 'A',
          department: row.student_department || targetDept || 'General',
          subjects: {},
          total_periods_held: 0,
          total_periods_attended: 0,
        };
      }

      const held = parseInt(row.periods_held || '0');
      const attended = parseInt(row.periods_attended || '0');
      const pct = held > 0 ? Math.round((attended / held) * 1000) / 10 : 100;

      studentMap[roll].subjects[row.allotment_id] = {
        allotment_id: row.allotment_id,
        subject_name: row.subject_name,
        semester_label: row.semester_label,
        joining_date: row.joining_date,
        periods_held: held,
        periods_attended: attended,
        percentage: pct,
      };

      studentMap[roll].total_periods_held += held;
      studentMap[roll].total_periods_attended += attended;
    });

    const students = Object.values(studentMap).map((s: any) => {
      const overallPct = s.total_periods_held > 0
        ? Math.round((s.total_periods_attended / s.total_periods_held) * 1000) / 10
        : 100;
      return {
        ...s,
        overall_percentage: overallPct,
      };
    });

    // Sort students by roll number
    students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));

    res.json({
      year: yearParam,
      semesters: semesterLabels,
      department: targetDept || 'All Departments',
      section: sectionParam || 'All Sections',
      subjects,
      students,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 18. SEMESTER ATTENDANCE ANALYTICS (SUMMARY, SECTION DRILL-DOWN, MENTOR VIEW)
// ============================================================================
app.get('/attendance/analytics/semester-summary', requireRole('admin', 'hod', 'faculty', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '2-1';
    const departmentParam = (req.query.department as string) || '';
    const sectionParam = (req.query.section as string) || '';
    const viewMode = (req.query.view_mode as string) || 'all';

    const callerRole = req.auth?.role;
    const callerEmail = req.auth?.email?.toLowerCase();
    const callerDept = req.auth?.department;

    let targetDept = departmentParam;
    if (callerRole === 'hod' && callerDept && callerDept !== '*') {
      targetDept = callerDept;
    }

    // ── MENTOR VIEW: If viewMode === 'mentor', return attendance for assigned mentees only ──
    if (viewMode === 'mentor' && callerEmail) {
      // 1. Resolve mentees for this faculty/mentor
      const facQuery = await db.query(
        'SELECT faculty_id FROM faculty WHERE LOWER(email) = LOWER($1)',
        [callerEmail]
      );
      const facultyId = facQuery.rows[0]?.faculty_id || '';

      const menteeRollsRes = await db.query(
        `SELECT DISTINCT roll_number FROM (
           SELECT student_id AS roll_number FROM mentor_assignments WHERE LOWER(faculty_email) = LOWER($1) OR faculty_id = $2
           UNION
           SELECT roll_number FROM students WHERE faculty_mentor_id = $2 OR LOWER(faculty_mentor_id) = LOWER($1)
         ) m`,
        [callerEmail, facultyId]
      );

      const menteeRolls = menteeRollsRes.rows.map((r: any) => r.roll_number);

      if (menteeRolls.length === 0) {
        return res.json({
          semester,
          viewMode: 'mentor',
          totalMentees: 0,
          overall: {
            total_periods_held: 0,
            total_periods_attended: 0,
            total_periods_absent: 0,
            present_percentage: 100,
            absent_percentage: 0,
            total_students: 0,
            at_risk_count: 0,
          },
          mentees: [],
        });
      }

      // Fetch attendance for these mentees in the selected semester
      const menteeDataQuery = `
        SELECT 
          st.roll_number,
          st.name AS student_name,
          st.section AS student_section,
          st.department AS student_department,
          a.id AS allotment_id,
          a.subject_name,
          a.subject_type,
          a.faculty_name,
          COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) THEN s.num_periods ELSE 0 END), 0) AS periods_held,
          COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) AND ar.is_present = true THEN s.num_periods ELSE 0 END), 0) AS periods_attended
        FROM subject_rosters r
        JOIN subject_allotments a ON a.id = r.allotment_id
        JOIN students st ON st.roll_number = r.roll_number
        LEFT JOIN attendance_sessions s ON s.allotment_id = a.id
        LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.roll_number = r.roll_number
        WHERE a.semester_label = $1 AND r.roll_number = ANY($2)
        GROUP BY st.roll_number, st.name, st.section, st.department, a.id, a.subject_name, a.subject_type, a.faculty_name
        ORDER BY st.roll_number, a.subject_name
      `;

      const menteeDataRes = await db.query(menteeDataQuery, [semester, menteeRolls]);

      const menteeMap: Record<string, any> = {};
      let totalHeld = 0;
      let totalAttended = 0;

      menteeRolls.forEach((roll: string) => {
        menteeMap[roll] = {
          roll_number: roll,
          name: roll,
          section: 'A',
          department: 'General',
          total_held: 0,
          total_attended: 0,
          total_absent: 0,
          overall_percentage: 100,
          subjects: [],
        };
      });

      menteeDataRes.rows.forEach((row: any) => {
        const roll = row.roll_number;
        if (menteeMap[roll]) {
          menteeMap[roll].name = row.student_name || roll;
          menteeMap[roll].section = row.student_section || 'A';
          menteeMap[roll].department = row.student_department || 'General';

          const held = parseInt(row.periods_held || '0');
          const attended = parseInt(row.periods_attended || '0');
          const absent = Math.max(0, held - attended);
          const pct = held > 0 ? Math.round((attended / held) * 1000) / 10 : 100;

          menteeMap[roll].total_held += held;
          menteeMap[roll].total_attended += attended;
          menteeMap[roll].total_absent += absent;

          totalHeld += held;
          totalAttended += attended;

          menteeMap[roll].subjects.push({
            allotment_id: row.allotment_id,
            subject_name: row.subject_name,
            subject_type: row.subject_type,
            faculty_name: row.faculty_name,
            periods_held: held,
            periods_attended: attended,
            periods_absent: absent,
            percentage: pct,
          });
        }
      });

      let atRisk = 0;
      const menteesList = Object.values(menteeMap).map((m: any) => {
        const pct = m.total_held > 0 ? Math.round((m.total_attended / m.total_held) * 1000) / 10 : 100;
        m.overall_percentage = pct;
        if (pct < 75 && m.total_held > 0) atRisk++;
        return m;
      });

      menteesList.sort((a, b) => a.roll_number.localeCompare(b.roll_number));

      const totalAbsent = Math.max(0, totalHeld - totalAttended);
      const overallPresentPct = totalHeld > 0 ? Math.round((totalAttended / totalHeld) * 1000) / 10 : 100;
      const overallAbsentPct = totalHeld > 0 ? Math.round((totalAbsent / totalHeld) * 1000) / 10 : 0;

      return res.json({
        semester,
        viewMode: 'mentor',
        totalMentees: menteesList.length,
        overall: {
          total_periods_held: totalHeld,
          total_periods_attended: totalAttended,
          total_periods_absent: totalAbsent,
          present_percentage: overallPresentPct,
          absent_percentage: overallAbsentPct,
          total_students: menteesList.length,
          at_risk_count: atRisk,
        },
        mentees: menteesList,
      });
    }

    // ── STANDARD / HOD / FACULTY SEMESTER-WIDE SUMMARY ──
    let subjQuery = `
      SELECT a.id, a.subject_name, a.subject_type, a.semester_label, a.section, a.faculty_name, a.faculty_email, a.department
      FROM subject_allotments a
      WHERE a.semester_label = $1
    `;
    const subjParams: any[] = [semester];

    if (targetDept && targetDept !== 'All') {
      subjParams.push(`%${targetDept}%`);
      subjQuery += ` AND a.department ILIKE $${subjParams.length}`;
    }
    if (sectionParam && sectionParam !== 'All') {
      subjParams.push(sectionParam.toUpperCase());
      subjQuery += ` AND a.section = $${subjParams.length}`;
    }
    if (callerRole === 'faculty') {
      subjParams.push(callerEmail);
      subjQuery += ` AND LOWER(a.faculty_email) = LOWER($${subjParams.length})`;
    }

    subjQuery += ` ORDER BY a.department, a.section, a.subject_name`;
    const subjectsRes = await db.query(subjQuery, subjParams);
    const subjects = subjectsRes.rows;

    if (subjects.length === 0) {
      return res.json({
        semester,
        department: targetDept || 'All',
        section: sectionParam || 'All',
        overall: {
          total_periods_held: 0,
          total_periods_attended: 0,
          total_periods_absent: 0,
          present_percentage: 100,
          absent_percentage: 0,
          total_students: 0,
          total_sessions: 0,
          at_risk_count: 0,
        },
        sections: [],
        subjects: [],
        students: [],
      });
    }

    const allotmentIds = subjects.map((s: any) => s.id);

    // Get attendance per student per subject
    const studentDataQuery = `
      SELECT 
        st.roll_number,
        st.name AS student_name,
        st.section AS student_section,
        st.department AS student_department,
        r.allotment_id,
        a.subject_name,
        a.subject_type,
        a.section AS allotment_section,
        a.department AS allotment_department,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) THEN s.num_periods ELSE 0 END), 0) AS periods_held,
        COALESCE(SUM(CASE WHEN s.session_date >= COALESCE(r.joining_date, '1970-01-01'::date) AND ar.is_present = true THEN s.num_periods ELSE 0 END), 0) AS periods_attended
      FROM subject_rosters r
      JOIN subject_allotments a ON a.id = r.allotment_id
      LEFT JOIN students st ON st.roll_number = r.roll_number
      LEFT JOIN attendance_sessions s ON s.allotment_id = a.id
      LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.roll_number = r.roll_number
      WHERE r.allotment_id = ANY($1)
      GROUP BY st.roll_number, st.name, st.section, st.department, r.allotment_id, a.subject_name, a.subject_type, a.section, a.department
      ORDER BY st.roll_number, a.subject_name
    `;

    const studentDataRes = await db.query(studentDataQuery, [allotmentIds]);

    // Aggregate statistics
    let grandHeld = 0;
    let grandAttended = 0;

    const studentMap: Record<string, any> = {};
    const sectionMap: Record<string, any> = {};
    const subjectStatsMap: Record<string, any> = {};

    subjects.forEach((sub: any) => {
      subjectStatsMap[sub.id] = {
        ...sub,
        total_students: 0,
        periods_held: 0,
        periods_attended: 0,
        periods_absent: 0,
        present_percentage: 100,
      };
    });

    studentDataRes.rows.forEach((row: any) => {
      const roll = row.roll_number || 'UNKNOWN';
      const sec = row.allotment_section || row.student_section || 'A';
      const dept = row.allotment_department || row.student_department || 'General';
      const secKey = `${dept}__${sec}`;

      const held = parseInt(row.periods_held || '0');
      const attended = parseInt(row.periods_attended || '0');
      const absent = Math.max(0, held - attended);

      grandHeld += held;
      grandAttended += attended;

      // Subject stats
      if (subjectStatsMap[row.allotment_id]) {
        subjectStatsMap[row.allotment_id].total_students += 1;
        subjectStatsMap[row.allotment_id].periods_held += held;
        subjectStatsMap[row.allotment_id].periods_attended += attended;
        subjectStatsMap[row.allotment_id].periods_absent += absent;
      }

      // Section stats
      if (!sectionMap[secKey]) {
        sectionMap[secKey] = {
          section: sec,
          department: dept,
          studentsSet: new Set<string>(),
          periods_held: 0,
          periods_attended: 0,
          periods_absent: 0,
        };
      }
      sectionMap[secKey].studentsSet.add(roll);
      sectionMap[secKey].periods_held += held;
      sectionMap[secKey].periods_attended += attended;
      sectionMap[secKey].periods_absent += absent;

      // Student aggregate
      if (!studentMap[roll]) {
        studentMap[roll] = {
          roll_number: roll,
          name: row.student_name || roll,
          section: sec,
          department: dept,
          total_held: 0,
          total_attended: 0,
          total_absent: 0,
          subjects: {},
        };
      }
      studentMap[roll].total_held += held;
      studentMap[roll].total_attended += attended;
      studentMap[roll].total_absent += absent;
      studentMap[roll].subjects[row.allotment_id] = {
        subject_name: row.subject_name,
        periods_held: held,
        periods_attended: attended,
        percentage: held > 0 ? Math.round((attended / held) * 1000) / 10 : 100,
      };
    });

    // Compute subject percentages
    const finalSubjects = Object.values(subjectStatsMap).map((s: any) => {
      s.present_percentage = s.periods_held > 0 ? Math.round((s.periods_attended / s.periods_held) * 1000) / 10 : 100;
      return s;
    });

    // Compute section percentages
    const finalSections = Object.values(sectionMap).map((sec: any) => {
      const held = sec.periods_held;
      const attended = sec.periods_attended;
      const absent = sec.periods_absent;
      const presentPct = held > 0 ? Math.round((attended / held) * 1000) / 10 : 100;
      const absentPct = held > 0 ? Math.round((absent / held) * 1000) / 10 : 0;
      return {
        section: sec.section,
        department: sec.department,
        total_students: sec.studentsSet.size,
        periods_held: held,
        periods_attended: attended,
        periods_absent: absent,
        present_percentage: presentPct,
        absent_percentage: absentPct,
      };
    });

    finalSections.sort((a, b) => a.section.localeCompare(b.section));

    // Compute student percentages & at-risk counts
    let atRiskCount = 0;
    const finalStudents = Object.values(studentMap).map((st: any) => {
      const pct = st.total_held > 0 ? Math.round((st.total_attended / st.total_held) * 1000) / 10 : 100;
      st.overall_percentage = pct;
      if (pct < 75 && st.total_held > 0) atRiskCount++;
      return st;
    });

    finalStudents.sort((a, b) => a.roll_number.localeCompare(b.roll_number));

    const grandAbsent = Math.max(0, grandHeld - grandAttended);
    const overallPresentPct = grandHeld > 0 ? Math.round((grandAttended / grandHeld) * 1000) / 10 : 100;
    const overallAbsentPct = grandHeld > 0 ? Math.round((grandAbsent / grandHeld) * 1000) / 10 : 0;

    res.json({
      semester,
      department: targetDept || 'All',
      section: sectionParam || 'All',
      overall: {
        total_periods_held: grandHeld,
        total_periods_attended: grandAttended,
        total_periods_absent: grandAbsent,
        present_percentage: overallPresentPct,
        absent_percentage: overallAbsentPct,
        total_students: finalStudents.length,
        at_risk_count: atRiskCount,
      },
      sections: finalSections,
      subjects: finalSubjects,
      students: finalStudents,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 19. 1ST YEAR SYSTEM: FRESHER ADMISSION, SELF-SERVICE MIGRATION,
//     COORDINATOR OVERSIGHT & CLASS INCHARGE
// ============================================================================

// 19a. Admin / Coordinator: Upload Fresher Admission Roster (Excel)
app.post('/admin/freshers/upload-roster', requireRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const { students: rosterData } = req.body;
    if (!Array.isArray(rosterData) || rosterData.length === 0) {
      return res.status(400).json({ error: 'Roster data must be a non-empty array of students.' });
    }

    let inserted = 0;
    let updated = 0;
    const errors: Array<{ row: number; admission_id?: string; reason: string }> = [];

    for (let i = 0; i < rosterData.length; i++) {
      const row = rosterData[i];
      const admissionId = String(row.admission_id || row['Admission ID'] || row['Admission No'] || '').trim().toUpperCase();
      const fullName = String(row.name || row['Full Name'] || row['Student Name'] || '').trim();
      const rawDob = String(row.dob || row['Date of Birth'] || row['DOB'] || '').trim();
      const mobile = String(row.phone || row['Mobile'] || row['Personal Mobile'] || row['Phone'] || '').trim();
      const personalEmail = String(row.personal_email || row['Personal Email'] || row['Email'] || '').trim().toLowerCase();
      const dept = String(row.department || row['Department'] || row['Branch'] || 'CSE').trim();
      const section = String(row.section || row['Section'] || 'A').trim().toUpperCase();

      if (!admissionId) {
        errors.push({ row: i + 1, reason: 'Admission ID is required' });
        continue;
      }
      if (!fullName) {
        errors.push({ row: i + 1, admission_id: admissionId, reason: 'Full Name is required' });
        continue;
      }

      let parsedDob: string | null = null;
      if (rawDob) {
        const d = new Date(rawDob);
        if (!isNaN(d.getTime())) {
          parsedDob = d.toISOString().split('T')[0];
        } else if (rawDob.match(/^\d{4}-\d{2}-\d{2}$/)) {
          parsedDob = rawDob;
        } else if (rawDob.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)) {
          const parts = rawDob.split(/[-/]/);
          parsedDob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      const rollNumber = admissionId;
      const placeholderEmail = `adm_${admissionId.toLowerCase()}@fresher.rgmcet.edu.in`;
      const cleanMobile = mobile.replace(/\D/g, '');
      const defaultUsername = cleanMobile || admissionId.toLowerCase();

      // Pre-compute password hash using DOB (YYYY-MM-DD or rawDob or admissionId)
      let initialPasswordHash: string | null = null;
      if (parsedDob || rawDob) {
        const passwordPlain = parsedDob || rawDob;
        initialPasswordHash = await bcrypt.hash(passwordPlain, 10);
      }

      try {
        const existing = await db.query(
          'SELECT roll_number, admission_id, migration_stage, email, password_hash, username FROM students WHERE LOWER(admission_id) = LOWER($1) OR roll_number = $2',
          [admissionId, rollNumber]
        );

        if (existing.rows.length > 0) {
          const ex = existing.rows[0];
          const finalHash = ex.password_hash || initialPasswordHash;
          const finalUsername = ex.username || defaultUsername;

          await db.query(
            `UPDATE students
             SET name = $1,
                 dob = COALESCE($2, dob),
                 phone = COALESCE(NULLIF($3, ''), phone),
                 personal_mobile = COALESCE(NULLIF($3, ''), personal_mobile),
                 personal_email = COALESCE(NULLIF($4, ''), personal_email),
                 department = $5,
                 section = $6,
                 admission_id = $7,
                 username = COALESCE(username, $8),
                 password_hash = COALESCE(password_hash, $9),
                 is_first_year_setup_complete = CASE WHEN $9 IS NOT NULL THEN TRUE ELSE is_first_year_setup_complete END,
                 year = '1st Year',
                 updated_at = NOW()
             WHERE roll_number = $10 OR LOWER(admission_id) = LOWER($7)`,
            [fullName, parsedDob, mobile, personalEmail, dept, section, admissionId, finalUsername, finalHash, rollNumber]
          );
          updated++;
        } else {
          await db.query(
            `INSERT INTO students (
              roll_number, name, email, year, department, section, batch,
              admission_id, dob, personal_mobile, personal_email, username, password_hash, migration_stage, is_first_year_setup_complete
             )
             VALUES ($1, $2, $3, '1st Year', $4, $5, '2025-2029', $6, $7, $8, $9, $10, $11, 0, $12)`,
            [
              rollNumber,
              fullName,
              placeholderEmail,
              dept,
              section,
              admissionId,
              parsedDob,
              mobile,
              personalEmail,
              defaultUsername,
              initialPasswordHash,
              initialPasswordHash ? true : false,
            ]
          );
          inserted++;
        }
      } catch (err: any) {
        errors.push({ row: i + 1, admission_id: admissionId, reason: err.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${rosterData.length} students (${inserted} newly inserted, ${updated} updated).`,
      inserted,
      updated,
      errorsCount: errors.length,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19b. Check Username Availability
app.get('/auth/check-username-availability', async (req: Request, res: Response) => {
  try {
    const rawUsername = String(req.query.username || '').trim();
    if (!rawUsername) {
      return res.status(400).json({ available: false, message: 'Username cannot be empty.' });
    }

    if (rawUsername.length < 4 || rawUsername.length > 30) {
      return res.json({ available: false, message: 'Username must be between 4 and 30 characters.' });
    }

    if (!/^[a-zA-Z0-9_.]+$/.test(rawUsername)) {
      return res.json({ available: false, message: 'Username can only contain letters, numbers, underscores (_), and periods (.).' });
    }

    const check = await db.query(
      'SELECT roll_number FROM students WHERE LOWER(username) = LOWER($1)',
      [rawUsername]
    );

    if (check.rows.length > 0) {
      return res.json({ available: false, message: `Username "${rawUsername}" is already taken.` });
    }

    return res.json({ available: true, message: '✓ Username is available.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19c. Fresher Login (Admission ID + DOB OR Username + Password)
app.post('/auth/fresher-login', async (req: Request, res: Response) => {
  try {
    const { admissionId, dob, username, password } = req.body;

    if (username && password) {
      const cleanUser = username.trim();
      const uRes = await db.query(
        `SELECT roll_number, name, email, year, department, section, admission_id, dob, personal_mobile, username, password_hash, migration_stage, is_first_year_setup_complete
         FROM students 
         WHERE LOWER(username) = LOWER($1) 
            OR LOWER(admission_id) = LOWER($1)
            OR roll_number = $1
            OR personal_mobile = $1
            OR REPLACE(personal_mobile, ' ', '') = REPLACE($1, ' ', '')`,
        [cleanUser]
      );

      if (uRes.rows.length === 0) {
        return res.status(401).json({ valid: false, error: 'Invalid username / mobile number or password.' });
      }

      const stu = uRes.rows[0];
      if (stu.migration_stage === 1) {
        return res.status(400).json({
          valid: false,
          error: `Your account has been linked to your College Email (${stu.email}). Please log in using your @rgmcet.edu.in email address on the standard Student tab.`,
        });
      }

      let passwordMatches = false;
      if (stu.password_hash) {
        passwordMatches = await bcrypt.compare(password, stu.password_hash);
      }
      // Also allow direct DOB comparison (e.g. 2007-05-14 or YYYYMMDD) if password matches DOB
      if (!passwordMatches && stu.dob) {
        const studentDobIso = new Date(stu.dob).toISOString().split('T')[0];
        const inputDobIso = !isNaN(new Date(password).getTime()) ? new Date(password).toISOString().split('T')[0] : '';
        if (password === studentDobIso || inputDobIso === studentDobIso || password.replace(/\D/g, '') === studentDobIso.replace(/\D/g, '')) {
          passwordMatches = true;
        }
      }

      if (!passwordMatches) {
        return res.status(401).json({ valid: false, error: 'Invalid username or password (use your registered Mobile Number and DOB).' });
      }

      const token = `demo_token_student_${encodeURIComponent(stu.email || stu.admission_id)}_${Date.now()}`;
      return res.json({
        valid: true,
        token,
        requiresPasswordSetup: false,
        student: {
          roll_number: stu.roll_number,
          admission_id: stu.admission_id,
          name: stu.name,
          email: stu.email,
          year: stu.year,
          department: stu.department,
          section: stu.section,
          username: stu.username || stu.personal_mobile || stu.admission_id,
          migration_stage: stu.migration_stage,
        },
      });
    }

    if (!admissionId || !dob) {
      return res.status(400).json({ error: 'Admission ID and Date of Birth are required.' });
    }

    const admRes = await db.query(
      `SELECT roll_number, name, email, year, department, section, admission_id, dob, username, password_hash, migration_stage, is_first_year_setup_complete
       FROM students WHERE LOWER(admission_id) = LOWER($1) OR roll_number = $1`,
      [admissionId.trim()]
    );

    if (admRes.rows.length === 0) {
      return res.status(404).json({
        valid: false,
        error: `No fresher record found for Admission ID "${admissionId}". Please verify your admission details with the 1st Year Coordinator or Admin.`,
      });
    }

    const stu = admRes.rows[0];
    if (stu.migration_stage === 1) {
      return res.status(400).json({
        valid: false,
        error: `Your account has already been linked to your College Email (${stu.email}). Please log in using your official @rgmcet.edu.in email address on the standard Student tab.`,
      });
    }

    const normalizedInputDob = new Date(dob).toISOString().split('T')[0];
    const studentDob = stu.dob ? new Date(stu.dob).toISOString().split('T')[0] : '';

    if (studentDob && studentDob !== normalizedInputDob) {
      return res.status(401).json({ valid: false, error: 'Invalid Date of Birth for this Admission ID.' });
    }

    if (!stu.is_first_year_setup_complete || !stu.password_hash) {
      return res.json({
        valid: true,
        requiresPasswordSetup: true,
        student: {
          admission_id: stu.admission_id,
          roll_number: stu.roll_number,
          name: stu.name,
          department: stu.department,
          section: stu.section,
          dob: studentDob,
          username: stu.username || '',
        },
      });
    }

    if (password) {
      const match = await bcrypt.compare(password, stu.password_hash);
      if (!match) {
        return res.status(401).json({ valid: false, error: 'Incorrect password.' });
      }
    }

    const token = `demo_token_student_${encodeURIComponent(stu.email || stu.admission_id)}_${Date.now()}`;
    return res.json({
      valid: true,
      token,
      requiresPasswordSetup: false,
      student: {
        roll_number: stu.roll_number,
        admission_id: stu.admission_id,
        name: stu.name,
        email: stu.email,
        year: stu.year,
        department: stu.department,
        section: stu.section,
        username: stu.username,
        migration_stage: stu.migration_stage,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19d. First-Time Setup: Set Username & Password for Fresher
app.post('/auth/fresher-setup-password', async (req: Request, res: Response) => {
  try {
    const { admissionId, dob, username, password } = req.body;
    if (!admissionId || !dob || !username || !password) {
      return res.status(400).json({ error: 'Admission ID, DOB, username, and password are required.' });
    }

    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 4 || cleanUsername.length > 30) {
      return res.status(400).json({ error: 'Username must be between 4 and 30 characters.' });
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores (_), and periods (.).' });
    }

    const admRes = await db.query(
      `SELECT roll_number, name, email, year, department, section, admission_id, dob, migration_stage
       FROM students WHERE LOWER(admission_id) = LOWER($1) OR roll_number = $1`,
      [admissionId.trim()]
    );

    if (admRes.rows.length === 0) {
      return res.status(404).json({ error: 'No student found for this Admission ID.' });
    }

    const stu = admRes.rows[0];
    const normalizedInputDob = new Date(dob).toISOString().split('T')[0];
    const studentDob = stu.dob ? new Date(stu.dob).toISOString().split('T')[0] : '';
    if (studentDob && studentDob !== normalizedInputDob) {
      return res.status(401).json({ error: 'Invalid Date of Birth.' });
    }

    const userCheck = await db.query(
      `SELECT roll_number FROM students WHERE LOWER(username) = LOWER($1) AND roll_number != $2`,
      [cleanUsername, stu.roll_number]
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: `Username "${cleanUsername}" is already taken.` });
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await db.query(
      `UPDATE students
       SET username = $1,
           password_hash = $2,
           is_first_year_setup_complete = TRUE,
           updated_at = NOW()
       WHERE roll_number = $3`,
      [cleanUsername, hashed, stu.roll_number]
    );

    const token = `demo_token_student_${encodeURIComponent(stu.email || stu.admission_id)}_${Date.now()}`;

    res.json({
      success: true,
      message: 'Username and password configured successfully!',
      token,
      student: {
        roll_number: stu.roll_number,
        admission_id: stu.admission_id,
        name: stu.name,
        email: stu.email,
        year: stu.year,
        department: stu.department,
        section: stu.section,
        username: cleanUsername,
        migration_stage: 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19e. Student Self-Links College Email (Stage 1 Migration — Direct with Password Verification)
app.post('/student/link-college-email', requireAuth, async (req: Request, res: Response) => {
  try {
    const { collegeEmail, currentPassword } = req.body;
    if (!collegeEmail || !currentPassword) {
      return res.status(400).json({ error: 'College Email and Current Password are required.' });
    }

    const cleanEmail = collegeEmail.trim().toLowerCase();
    if (!cleanEmail.endsWith('@rgmcet.edu.in')) {
      return res.status(400).json({ error: 'College Email must be an official @rgmcet.edu.in address.' });
    }

    const studentRollOrEmail = req.auth?.regNo || req.auth?.email;

    const stuRes = await db.query(
      `SELECT roll_number, name, email, year, department, section, admission_id, password_hash, migration_stage
       FROM students
       WHERE roll_number = $1 OR LOWER(email) = LOWER($1) OR LOWER(admission_id) = LOWER($1)`,
      [studentRollOrEmail]
    );

    if (stuRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const stu = stuRes.rows[0];

    if (stu.password_hash) {
      const match = await bcrypt.compare(currentPassword, stu.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Incorrect current password. Re-authentication failed.' });
      }
    }

    const emailCheck = await db.query(
      `SELECT roll_number FROM students WHERE LOWER(email) = LOWER($1) AND roll_number != $2`,
      [cleanEmail, stu.roll_number]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: `The email "${cleanEmail}" is already registered by another student.` });
    }

    const emailPrefix = cleanEmail.split('@')[0].toUpperCase();
    let finalRollNumber = stu.roll_number;
    if (emailPrefix.match(/^\d{4}[15]A[0-9A-Z]{4}$/i)) {
      finalRollNumber = emailPrefix;
    }

    await db.query(
      `UPDATE students
       SET email = $1,
           migration_stage = 1,
           roll_number = $2,
           updated_at = NOW()
       WHERE roll_number = $3 OR LOWER(admission_id) = LOWER($4)`,
      [cleanEmail, finalRollNumber, stu.roll_number, stu.admission_id]
    );

    if (finalRollNumber !== stu.roll_number) {
      await db.query(
        `UPDATE subject_rosters SET roll_number = $1, student_email = $2 WHERE roll_number = $3`,
        [finalRollNumber, cleanEmail, stu.roll_number]
      );
      await db.query(
        `UPDATE attendance_records SET roll_number = $1 WHERE roll_number = $2`,
        [finalRollNumber, stu.roll_number]
      );
    }

    res.json({
      success: true,
      message: `Official College Email (${cleanEmail}) linked successfully! From now on, please log in using your College Email and Password.`,
      email: cleanEmail,
      roll_number: finalRollNumber,
      migration_stage: 1,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19f. Student Updates Username (Profile / Account Settings)
app.put('/student/username', requireAuth, async (req: Request, res: Response) => {
  try {
    const { newUsername, currentPassword } = req.body;
    if (!newUsername || !currentPassword) {
      return res.status(400).json({ error: 'New username and current password are required.' });
    }

    const cleanUsername = String(newUsername).trim();
    if (cleanUsername.length < 4 || cleanUsername.length > 30) {
      return res.status(400).json({ error: 'Username must be between 4 and 30 characters.' });
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores (_), and periods (.).' });
    }

    const studentId = req.auth?.regNo || req.auth?.email;
    const stuRes = await db.query(
      `SELECT roll_number, username, password_hash, migration_stage FROM students WHERE roll_number = $1 OR LOWER(email) = LOWER($1) OR LOWER(admission_id) = LOWER($1)`,
      [studentId]
    );
    if (stuRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const stu = stuRes.rows[0];
    if (stu.password_hash) {
      const match = await bcrypt.compare(currentPassword, stu.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Incorrect current password.' });
      }
    }

    const check = await db.query(
      `SELECT roll_number FROM students WHERE LOWER(username) = LOWER($1) AND roll_number != $2`,
      [cleanUsername, stu.roll_number]
    );
    if (check.rows.length > 0) {
      return res.status(400).json({ error: `Username "${cleanUsername}" is already taken.` });
    }

    await db.query(
      `UPDATE students SET username = $1, updated_at = NOW() WHERE roll_number = $2`,
      [cleanUsername, stu.roll_number]
    );

    res.json({
      success: true,
      message: `Username updated to "${cleanUsername}" successfully.`,
      username: cleanUsername,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19g. Coordinator & Admin: Get 1st Year Freshers Directory & Migration Tracking
app.get('/coordinator/freshers', requireRole('coordinator', 'admin'), async (req: Request, res: Response) => {
  try {
    const department = (req.query.department as string) || '';
    const section = (req.query.section as string) || '';
    const stage = req.query.stage as string;
    const search = (req.query.search as string) || '';

    let query = `
      SELECT 
        s.roll_number,
        s.admission_id,
        s.name,
        s.email,
        s.dob,
        s.personal_mobile,
        s.personal_email,
        s.department,
        s.section,
        s.batch,
        s.username,
        s.migration_stage,
        s.is_first_year_setup_complete,
        s.created_at,
        COALESCE(
          ROUND(
            (SUM(CASE WHEN ar.is_present THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(ar.id), 0)) * 100, 1
          ), 100
        ) AS attendance_pct,
        COUNT(DISTINCT a.id) AS total_subjects_enrolled
      FROM students s
      LEFT JOIN subject_rosters sr ON sr.roll_number = s.roll_number
      LEFT JOIN subject_allotments a ON a.id = sr.allotment_id
      LEFT JOIN attendance_records ar ON ar.roll_number = s.roll_number
      WHERE s.year = '1st Year'
    `;
    const params: any[] = [];

    if (department && department !== 'All') {
      params.push(`%${department}%`);
      query += ` AND s.department ILIKE $${params.length}`;
    }
    if (section && section !== 'All') {
      params.push(section.toUpperCase());
      query += ` AND s.section = $${params.length}`;
    }
    if (stage !== undefined && stage !== '' && stage !== 'All') {
      params.push(Number(stage));
      query += ` AND s.migration_stage = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(s.name) LIKE $${params.length} OR LOWER(s.roll_number) LIKE $${params.length} OR LOWER(COALESCE(s.admission_id, '')) LIKE $${params.length} OR LOWER(COALESCE(s.username, '')) LIKE $${params.length})`;
    }

    query += ` GROUP BY s.roll_number, s.admission_id, s.name, s.email, s.dob, s.personal_mobile, s.personal_email, s.department, s.section, s.batch, s.username, s.migration_stage, s.is_first_year_setup_complete, s.created_at`;
    query += ` ORDER BY s.department ASC, s.section ASC, s.name ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19h. Coordinator & Admin: 1st Year Freshers KPI Statistics
app.get('/coordinator/freshers/stats', requireRole('coordinator', 'admin'), async (_req: Request, res: Response) => {
  try {
    const totalRes = await db.query(`SELECT COUNT(*) as count FROM students WHERE year = '1st Year'`);
    const stage0Res = await db.query(`SELECT COUNT(*) as count FROM students WHERE year = '1st Year' AND migration_stage = 0`);
    const stage1Res = await db.query(`SELECT COUNT(*) as count FROM students WHERE year = '1st Year' AND migration_stage = 1`);
    const inchargeRes = await db.query(`SELECT COUNT(*) as count FROM class_incharges`);
    const sectionsRes = await db.query(`SELECT COUNT(DISTINCT (department || '_' || section)) as count FROM students WHERE year = '1st Year'`);

    res.json({
      totalFreshers: Number(totalRes.rows[0]?.count || 0),
      stage0AdmissionCount: Number(stage0Res.rows[0]?.count || 0),
      stage1EmailLinkedCount: Number(stage1Res.rows[0]?.count || 0),
      activeClassInchargesCount: Number(inchargeRes.rows[0]?.count || 0),
      totalFirstYearSections: Number(sectionsRes.rows[0]?.count || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19i. Class Incharge: Assign / Replace Class Incharge for 1st Year Section (1-1 and 1-2 only)
app.post('/coordinator/class-incharge', requireRole('coordinator', 'admin'), async (req: Request, res: Response) => {
  try {
    const { semester_label, department, section, faculty_email, faculty_name } = req.body;
    if (!semester_label || !department || !section || !faculty_email) {
      return res.status(400).json({ error: 'Semester, Department, Section, and Faculty Email are required.' });
    }

    if (!['1-1', '1-2'].includes(semester_label)) {
      return res.status(400).json({ error: 'Class Incharge designation is applicable only to 1st-year sections (1-1 and 1-2).' });
    }

    const assignedBy = req.auth?.email || 'Coordinator';

    const result = await db.query(
      `INSERT INTO class_incharges (semester_label, department, section, faculty_email, faculty_name, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (semester_label, department, section) DO UPDATE
       SET faculty_email = EXCLUDED.faculty_email,
           faculty_name = EXCLUDED.faculty_name,
           assigned_by = EXCLUDED.assigned_by,
           updated_at = NOW()
       RETURNING *`,
      [semester_label, department.trim(), section.trim().toUpperCase(), faculty_email.trim().toLowerCase(), faculty_name || '', assignedBy]
    );

    res.json({
      success: true,
      message: `Assigned ${faculty_name || faculty_email} as Class Incharge for ${department} Sem ${semester_label} (Sec ${section.toUpperCase()}).`,
      incharge: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19j. Class Incharge: List All 1st Year Class Incharges
app.get('/coordinator/class-incharge', requireRole('coordinator', 'admin', 'faculty'), async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '';
    const department = (req.query.department as string) || '';

    let query = `SELECT * FROM class_incharges WHERE 1=1`;
    const params: any[] = [];

    if (semester && semester !== 'All') {
      params.push(semester);
      query += ` AND semester_label = $${params.length}`;
    }
    if (department && department !== 'All') {
      params.push(`%${department}%`);
      query += ` AND department ILIKE $${params.length}`;
    }

    query += ` ORDER BY semester_label ASC, department ASC, section ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19k. Class Incharge: Delete Assignment
app.delete('/coordinator/class-incharge/:id', requireRole('coordinator', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM class_incharges WHERE id = $1', [id]);
    res.json({ success: true, message: 'Class Incharge assignment removed.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19l. Faculty: Get Sections where Logged-in Faculty is Class Incharge (1st Year Only)
app.get('/faculty/incharge-sections', requireRole('faculty', 'admin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    const email = req.auth?.email;
    if (!email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT id, semester_label, department, section, faculty_email, faculty_name, created_at
       FROM class_incharges
       WHERE LOWER(faculty_email) = LOWER($1)
       ORDER BY semester_label ASC, department ASC, section ASC`,
      [email]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19m. Class Incharge & Coordinator: Section Intelligence Analytics (View-Only)
app.get('/faculty/incharge-section-analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '1-1';
    const department = (req.query.department as string) || '';
    const section = (req.query.section as string) || 'A';

    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    const studentsRes = await db.query(
      `SELECT roll_number, name, email, admission_id, personal_mobile, migration_stage
       FROM students
       WHERE year = '1st Year' AND department ILIKE $1 AND section = $2
       ORDER BY roll_number ASC`,
      [`%${department}%`, section.toUpperCase()]
    );
    const students = studentsRes.rows;

    const subjectsRes = await db.query(
      `SELECT id, subject_name, subject_type, faculty_name, faculty_email, department, section
       FROM subject_allotments
       WHERE semester_label = $1 AND department ILIKE $2 AND section = $3
       ORDER BY subject_name ASC`,
      [semester, `%${department}%`, section.toUpperCase()]
    );
    const subjects = subjectsRes.rows;

    const studentStats: Array<{
      roll_number: string;
      name: string;
      email: string;
      admission_id: string;
      total_held: number;
      total_attended: number;
      overall_percentage: number;
      subjects: Record<string, { held: number; attended: number; percentage: number }>;
    }> = [];

    let sectionTotalHeld = 0;
    let sectionTotalAttended = 0;

    for (const st of students) {
      let stHeld = 0;
      let stAttended = 0;
      const subMap: Record<string, { held: number; attended: number; percentage: number }> = {};

      for (const sub of subjects) {
        const sessRes = await db.query(
          `SELECT s.id, s.num_periods, s.session_date, sr.joining_date
           FROM attendance_sessions s
           LEFT JOIN subject_rosters sr ON sr.allotment_id = s.allotment_id AND sr.roll_number = $1
           WHERE s.allotment_id = $2`,
          [st.roll_number, sub.id]
        );

        let subHeld = 0;
        let subAttended = 0;

        for (const s of sessRes.rows) {
          const joinDate = s.joining_date ? new Date(s.joining_date).toISOString().split('T')[0] : '';
          const sessDate = s.session_date ? new Date(s.session_date).toISOString().split('T')[0] : '';
          if (joinDate && sessDate && sessDate < joinDate) continue;

          subHeld += Number(s.num_periods || 1);

          const recRes = await db.query(
            `SELECT is_present FROM attendance_records WHERE session_id = $1 AND roll_number = $2`,
            [s.id, st.roll_number]
          );
          if (recRes.rows.length > 0 && recRes.rows[0].is_present) {
            subAttended += Number(s.num_periods || 1);
          }
        }

        const pct = subHeld > 0 ? Math.round((subAttended / subHeld) * 1000) / 10 : 100;
        subMap[sub.id] = { held: subHeld, attended: subAttended, percentage: pct };

        stHeld += subHeld;
        stAttended += subAttended;
      }

      const overallPct = stHeld > 0 ? Math.round((stAttended / stHeld) * 1000) / 10 : 100;
      sectionTotalHeld += stHeld;
      sectionTotalAttended += stAttended;

      studentStats.push({
        roll_number: st.roll_number,
        name: st.name,
        email: st.email,
        admission_id: st.admission_id || '',
        total_held: stHeld,
        total_attended: stAttended,
        overall_percentage: overallPct,
        subjects: subMap,
      });
    }

    const sectionAverage = sectionTotalHeld > 0 ? Math.round((sectionTotalAttended / sectionTotalHeld) * 1000) / 10 : 100;
    const belowThreshold = studentStats.filter(s => s.overall_percentage < 75);

    res.json({
      semester,
      department,
      section,
      totalStudents: students.length,
      totalSubjects: subjects.length,
      sectionAverage,
      subjects,
      students: studentStats,
      lowAttendanceCount: belowThreshold.length,
      lowAttendanceStudents: belowThreshold,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19n. Coordinator & Admin: Promote 1st Year Section (1-2 → 2-1)
app.post('/coordinator/promote-section', requireRole('coordinator', 'admin'), async (req: Request, res: Response) => {
  try {
    const { department, section } = req.body;
    if (!department) {
      return res.status(400).json({ error: 'Department is required for promotion.' });
    }

    let query = `UPDATE students SET year = '2nd Year', updated_at = NOW() WHERE year = '1st Year' AND department ILIKE $1`;
    const params: any[] = [`%${department}%`];

    if (section && section !== 'All') {
      params.push(section.toUpperCase());
      query += ` AND section = $${params.length}`;
    }

    const result = await db.query(query, params);

    res.json({
      success: true,
      message: `Successfully promoted ${result.rowCount || 0} student(s) of ${department} (Section ${section || 'All'}) from 1st Year to 2nd Year (2-1). Active dashboard visibility is now transferred to the ${department} HOD.`,
      promotedCount: result.rowCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19o. Coordinator / Admin: Sync Section Roster to Allotments (Auto-enroll freshers)
app.post('/attendance/allotments/fresher-section-sync', requireRole('coordinator', 'admin', 'hod'), async (req: Request, res: Response) => {
  try {
    const { semester, department, section } = req.body;
    if (!semester || !department || !section) {
      return res.status(400).json({ error: 'Semester, Department, and Section are required.' });
    }

    // 1. Get all 1st year students matching this department & section
    const studentsRes = await db.query(
      `SELECT roll_number, name, email
       FROM students
       WHERE year = '1st Year'
         AND (LOWER(department) = LOWER($1) OR LOWER(REPLACE(department, ' ', '')) = LOWER(REPLACE($1, ' ', '')) OR $1 = 'All' OR $1 = 'General')
         AND (section = $2 OR $2 = 'All')
       ORDER BY roll_number ASC`,
      [department, section.toUpperCase()]
    );

    if (studentsRes.rows.length === 0) {
      return res.json({
        success: true,
        message: `No active 1st Year freshers found for ${department} Section ${section}. Upload the student roster first.`,
        enrolledCount: 0,
        allotmentsCount: 0,
      });
    }

    // 2. Get all subject allotments for this department, section, and semester
    const allotmentsRes = await db.query(
      `SELECT id, subject_name, section
       FROM subject_allotments
       WHERE semester_label = $1
         AND (LOWER(department) = LOWER($2) OR LOWER(REPLACE(department, ' ', '')) = LOWER(REPLACE($2, ' ', '')) OR $2 = 'All' OR $2 = 'General')
         AND (section = $3 OR $3 = 'All')`,
      [semester, department, section.toUpperCase()]
    );

    if (allotmentsRes.rows.length === 0) {
      return res.json({
        success: true,
        message: `No subject allotments configured for ${department} Section ${section} in Semester ${semester}. Add subjects first.`,
        enrolledCount: 0,
        allotmentsCount: 0,
      });
    }

    let totalEnrolled = 0;
    for (const allot of allotmentsRes.rows) {
      for (const st of studentsRes.rows) {
        await db.query(
          `INSERT INTO subject_rosters (allotment_id, roll_number, student_email, joining_date)
           VALUES ($1, $2, $3, CURRENT_DATE)
           ON CONFLICT (allotment_id, roll_number) DO UPDATE
           SET student_email = EXCLUDED.student_email`,
          [allot.id, st.roll_number, st.email || `${st.roll_number.toLowerCase()}@rgmcet.edu.in`]
        );
        totalEnrolled++;
      }
    }

    res.json({
      success: true,
      message: `Enrolled ${studentsRes.rows.length} student(s) into ${allotmentsRes.rows.length} subject(s) for ${department} Section ${section} (${totalEnrolled} roster records synchronized).`,
      studentsCount: studentsRes.rows.length,
      allotmentsCount: allotmentsRes.rows.length,
      enrolledCount: totalEnrolled,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19p. Coordinator / Admin: Get Section-wise Fresher Attendance Overview
app.get('/coordinator/fresher-attendance', requireRole('coordinator', 'admin', 'hod'), async (req: Request, res: Response) => {
  try {
    const semester = (req.query.semester as string) || '1-1';
    const department = (req.query.department as string) || 'All';
    const section = (req.query.section as string) || 'All';

    let allotQuery = `
      SELECT a.id, a.semester_label, a.department, a.section, a.subject_name, a.subject_type, a.faculty_name, a.faculty_email,
        (SELECT COUNT(*) FROM attendance_sessions s WHERE s.allotment_id = a.id) as total_sessions,
        (SELECT COALESCE(SUM(s.num_periods), 0) FROM attendance_sessions s WHERE s.allotment_id = a.id) as total_periods_held
      FROM subject_allotments a
      WHERE a.semester_label = $1
    `;
    const params: any[] = [semester];

    if (department && department !== 'All') {
      params.push(department);
      allotQuery += ` AND (LOWER(a.department) = LOWER($${params.length}) OR LOWER(REPLACE(a.department, ' ', '')) = LOWER(REPLACE($${params.length}, ' ', '')))`;
    }
    if (section && section !== 'All') {
      params.push(section.toUpperCase());
      allotQuery += ` AND a.section = $${params.length}`;
    }

    allotQuery += ` ORDER BY a.department ASC, a.section ASC, a.subject_name ASC`;

    const allotRes = await db.query(allotQuery, params);
    const summaryList: any[] = [];

    for (const allot of allotRes.rows) {
      // Calculate attendance stats for this allotment
      const sessionsRes = await db.query(
        `SELECT s.id, s.num_periods FROM attendance_sessions s WHERE s.allotment_id = $1`,
        [allot.id]
      );
      const sessionIds = sessionsRes.rows.map(r => r.id);

      let totalStudentPeriodsHeld = 0;
      let totalStudentPeriodsAttended = 0;
      let atRiskCount = 0;

      // Get enrolled students for this allotment
      const rosterRes = await db.query(
        `SELECT DISTINCT r.roll_number, s.name as student_name, s.personal_mobile
         FROM subject_rosters r
         LEFT JOIN students s ON s.roll_number = r.roll_number
         WHERE r.allotment_id = $1
         UNION
         SELECT s.roll_number, s.name as student_name, s.personal_mobile
         FROM students s
         WHERE s.year = '1st Year'
           AND (LOWER(s.department) = LOWER($2) OR LOWER(REPLACE(s.department, ' ', '')) = LOWER(REPLACE($2, ' ', '')))
           AND s.section = $3`,
        [allot.id, allot.department, allot.section]
      );

      const enrolledStudents = rosterRes.rows;

      if (sessionIds.length > 0 && enrolledStudents.length > 0) {
        for (const st of enrolledStudents) {
          let stHeld = 0;
          let stAttended = 0;
          for (const s of sessionsRes.rows) {
            stHeld += Number(s.num_periods || 1);
            const rec = await db.query(
              `SELECT is_present FROM attendance_records WHERE session_id = $1 AND roll_number = $2`,
              [s.id, st.roll_number]
            );
            if (rec.rows.length > 0 && rec.rows[0].is_present) {
              stAttended += Number(s.num_periods || 1);
            }
          }
          totalStudentPeriodsHeld += stHeld;
          totalStudentPeriodsAttended += stAttended;
          const pct = stHeld > 0 ? (stAttended / stHeld) * 100 : 100;
          if (pct < 75) atRiskCount++;
        }
      }

      const avgPercentage = totalStudentPeriodsHeld > 0
        ? Math.round((totalStudentPeriodsAttended / totalStudentPeriodsHeld) * 1000) / 10
        : 100;

      summaryList.push({
        id: allot.id,
        semester_label: allot.semester_label,
        department: allot.department,
        section: allot.section,
        subject_name: allot.subject_name,
        subject_type: allot.subject_type,
        faculty_name: allot.faculty_name,
        faculty_email: allot.faculty_email,
        total_sessions: Number(allot.total_sessions || 0),
        total_periods_held: Number(allot.total_periods_held || 0),
        enrolled_students: enrolledStudents.length,
        avg_percentage: avgPercentage,
        at_risk_count: atRiskCount,
      });
    }

    res.json({
      semester,
      department,
      section,
      total_allotments: summaryList.length,
      summaries: summaryList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19q. Student / Fresher: Get My Subject-wise Attendance (Fresher Dashboard)
app.get('/freshers/my-attendance', requireAuth, async (req: Request, res: Response) => {
  try {
    const studentUser = req.auth;
    if (!studentUser) return res.status(401).json({ error: 'Unauthorized' });

    // Look up student by email, roll_number, or admission_id
    const stuRes = await db.query(
      `SELECT roll_number, admission_id, name, department, section, year
       FROM students
       WHERE LOWER(email) = LOWER($1)
          OR roll_number = $1
          OR LOWER(admission_id) = LOWER($1)
          OR personal_mobile = $1
       LIMIT 1`,
      [(studentUser as any).email || (studentUser as any).regNo || (studentUser as any).id || '']
    );

    if (stuRes.rows.length === 0) {
      return res.json({ subjects: [], overall_percentage: 100, total_held: 0, total_attended: 0 });
    }

    const stu = stuRes.rows[0];
    const rollNumber = stu.roll_number;

    // Get all subject allotments for this student's department & section in 1st year (1-1 / 1-2)
    const allotRes = await db.query(
      `SELECT a.id, a.semester_label, a.department, a.section, a.subject_name, a.subject_type, a.faculty_name
       FROM subject_allotments a
       WHERE a.semester_label IN ('1-1', '1-2')
         AND (LOWER(a.department) = LOWER($1) OR LOWER(REPLACE(a.department, ' ', '')) = LOWER(REPLACE($1, ' ', '')))
         AND a.section = $2
       ORDER BY a.semester_label ASC, a.subject_name ASC`,
      [stu.department, stu.section]
    );

    const subjectsAttendance: any[] = [];
    let grandHeld = 0;
    let grandAttended = 0;

    for (const allot of allotRes.rows) {
      const sessionsRes = await db.query(
        `SELECT s.id, s.num_periods, s.session_date, s.period_start
         FROM attendance_sessions s
         WHERE s.allotment_id = $1
         ORDER BY s.session_date ASC`,
        [allot.id]
      );

      let subHeld = 0;
      let subAttended = 0;
      const sessionHistory: any[] = [];

      for (const s of sessionsRes.rows) {
        const pCount = Number(s.num_periods || 1);
        subHeld += pCount;

        const rec = await db.query(
          `SELECT is_present FROM attendance_records WHERE session_id = $1 AND roll_number = $2`,
          [s.id, rollNumber]
        );
        const isPresent = rec.rows.length > 0 ? rec.rows[0].is_present : true;
        if (isPresent) {
          subAttended += pCount;
        }

        sessionHistory.push({
          session_id: s.id,
          date: s.session_date,
          period_start: s.period_start,
          num_periods: pCount,
          is_present: isPresent,
        });
      }

      const pct = subHeld > 0 ? Math.round((subAttended / subHeld) * 1000) / 10 : 100;
      grandHeld += subHeld;
      grandAttended += subAttended;

      subjectsAttendance.push({
        allotment_id: allot.id,
        semester_label: allot.semester_label,
        subject_name: allot.subject_name,
        subject_type: allot.subject_type,
        faculty_name: allot.faculty_name,
        sessions_held: subHeld,
        sessions_attended: subAttended,
        percentage: pct,
        is_low: pct < 75 && subHeld > 0,
        history: sessionHistory,
      });
    }

    const overallPct = grandHeld > 0 ? Math.round((grandAttended / grandHeld) * 1000) / 10 : 100;

    res.json({
      student: {
        roll_number: stu.roll_number,
        admission_id: stu.admission_id,
        name: stu.name,
        department: stu.department,
        section: stu.section,
        year: stu.year,
      },
      overall_percentage: overallPct,
      total_held: grandHeld,
      total_attended: grandAttended,
      is_overall_low: overallPct < 75 && grandHeld > 0,
      subjects: subjectsAttendance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MODULE 4: Faculty Profile — Subjects Handled (Results)
// MODULE 5: Leave Management (Faculty + Student) Approved by HOD + Holiday Calendar
// ============================================================================

const ensureLeaveAndSubjectsHandledTables = async () => {
  if (db.isMock) return;
  try {
    // 1. Faculty Subjects Handled (Results)
    await db.query(`
      CREATE TABLE IF NOT EXISTS faculty_subjects_handled (
        id TEXT PRIMARY KEY,
        faculty_email TEXT NOT NULL,
        year_batch TEXT NOT NULL,
        section TEXT NOT NULL,
        subject TEXT NOT NULL,
        branch TEXT NOT NULL,
        registered INT NOT NULL DEFAULT 0,
        appeared INT NOT NULL DEFAULT 0,
        failed INT NOT NULL DEFAULT 0,
        pass_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
        highest_marks NUMERIC(5,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Holiday Calendar
    await db.query(`
      CREATE TABLE IF NOT EXISTS holiday_calendar (
        id TEXT PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        title TEXT NOT NULL,
        type TEXT DEFAULT 'Holiday',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2B. Academic Calendar (Semester Start & End Dates)
    await db.query(`
      CREATE TABLE IF NOT EXISTS academic_calendar (
        id TEXT PRIMARY KEY,
        academic_year TEXT NOT NULL,
        semester TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (academic_year, semester)
      );
    `);

    // Seed default academic calendars if empty
    const calCount = await db.query('SELECT COUNT(*) FROM academic_calendar');
    if (parseInt(calCount.rows[0]?.count || '0') === 0) {
      const defaultAcademicWindows = [
        { id: 'AC_2024_25_1_1', academic_year: '2024-2025', semester: '1-1', start_date: '2024-07-15', end_date: '2024-11-30', description: 'Odd Semester 2024-25' },
        { id: 'AC_2024_25_1_2', academic_year: '2024-2025', semester: '1-2', start_date: '2024-12-15', end_date: '2025-04-30', description: 'Even Semester 2024-25' },
        { id: 'AC_2024_25_2_1', academic_year: '2024-2025', semester: '2-1', start_date: '2024-07-01', end_date: '2024-11-15', description: 'Odd Semester 2024-25' },
        { id: 'AC_2024_25_2_2', academic_year: '2024-2025', semester: '2-2', start_date: '2024-12-01', end_date: '2025-04-15', description: 'Even Semester 2024-25' },
        { id: 'AC_2024_25_3_1', academic_year: '2024-2025', semester: '3-1', start_date: '2024-06-24', end_date: '2024-11-10', description: 'Odd Semester 2024-25' },
        { id: 'AC_2024_25_3_2', academic_year: '2024-2025', semester: '3-2', start_date: '2024-11-25', end_date: '2025-04-10', description: 'Even Semester 2024-25' },
        { id: 'AC_2024_25_4_1', academic_year: '2024-2025', semester: '4-1', start_date: '2024-06-24', end_date: '2024-11-10', description: 'Odd Semester 2024-25' },
        { id: 'AC_2024_25_4_2', academic_year: '2024-2025', semester: '4-2', start_date: '2024-11-25', end_date: '2025-03-31', description: 'Even Semester 2024-25' },
        { id: 'AC_2025_26_1_1', academic_year: '2025-2026', semester: '1-1', start_date: '2025-07-15', end_date: '2025-11-30', description: 'Odd Semester 2025-26' },
        { id: 'AC_2025_26_1_2', academic_year: '2025-2026', semester: '1-2', start_date: '2025-12-15', end_date: '2026-04-30', description: 'Even Semester 2025-26' },
        { id: 'AC_2025_26_2_1', academic_year: '2025-2026', semester: '2-1', start_date: '2025-07-01', end_date: '2025-11-15', description: 'Odd Semester 2025-26' },
        { id: 'AC_2025_26_2_2', academic_year: '2025-2026', semester: '2-2', start_date: '2025-12-01', end_date: '2026-04-15', description: 'Even Semester 2025-26' },
        { id: 'AC_2025_26_3_1', academic_year: '2025-2026', semester: '3-1', start_date: '2025-06-23', end_date: '2025-11-08', description: 'Odd Semester 2025-26' },
        { id: 'AC_2025_26_3_2', academic_year: '2025-2026', semester: '3-2', start_date: '2025-11-24', end_date: '2026-04-11', description: 'Even Semester 2025-26' },
        { id: 'AC_2025_26_4_1', academic_year: '2025-2026', semester: '4-1', start_date: '2025-06-23', end_date: '2025-11-08', description: 'Odd Semester 2025-26' },
        { id: 'AC_2025_26_4_2', academic_year: '2025-2026', semester: '4-2', start_date: '2025-11-24', end_date: '2026-03-31', description: 'Even Semester 2025-26' },
      ];
      for (const w of defaultAcademicWindows) {
        await db.query(
          `INSERT INTO academic_calendar (id, academic_year, semester, start_date, end_date, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (academic_year, semester) DO NOTHING`,
          [w.id, w.academic_year, w.semester, w.start_date, w.end_date, w.description]
        ).catch(() => {});
      }
    }

    // Seed default holidays if table is empty
    const holCount = await db.query('SELECT COUNT(*) FROM holiday_calendar');
    if (parseInt(holCount.rows[0]?.count || '0') === 0) {
      const defaultHolidays = [
        { id: 'HOL_01', date: '2025-01-01', title: 'New Year Day' },
        { id: 'HOL_02', date: '2025-01-14', title: 'Bhogi' },
        { id: 'HOL_03', date: '2025-01-15', title: 'Makara Sankranti' },
        { id: 'HOL_04', date: '2025-01-26', title: 'Republic Day' },
        { id: 'HOL_05', date: '2025-02-26', title: 'Maha Shivaratri' },
        { id: 'HOL_06', date: '2025-03-14', title: 'Holi' },
        { id: 'HOL_07', date: '2025-03-30', title: 'Ugadi' },
        { id: 'HOL_08', date: '2025-03-31', title: 'Ramzan (Eid-ul-Fitr)' },
        { id: 'HOL_09', date: '2025-04-05', title: 'Babu Jagjivan Ram Birthday' },
        { id: 'HOL_10', date: '2025-04-14', title: 'Dr. B.R. Ambedkar Birthday' },
        { id: 'HOL_11', date: '2025-04-18', title: 'Good Friday' },
        { id: 'HOL_12', date: '2025-08-15', title: 'Independence Day' },
        { id: 'HOL_13', date: '2025-08-27', title: 'Vinayaka Chavithi' },
        { id: 'HOL_14', date: '2025-10-02', title: 'Mahatma Gandhi Birthday' },
        { id: 'HOL_15', date: '2025-10-02', title: 'Vijaya Dasami / Dussehra' },
        { id: 'HOL_16', date: '2025-10-20', title: 'Deepavali' },
        { id: 'HOL_17', date: '2025-12-25', title: 'Christmas' },
      ];
      for (const h of defaultHolidays) {
        await db.query(
          `INSERT INTO holiday_calendar (id, date, title) VALUES ($1, $2, $3) ON CONFLICT (date) DO NOTHING`,
          [h.id, h.date, h.title]
        ).catch(() => {});
      }
    }

    // 3. Faculty Leaves
    await db.query(`
      CREATE TABLE IF NOT EXISTS faculty_leaves (
        id TEXT PRIMARY KEY,
        faculty_email TEXT NOT NULL,
        faculty_name TEXT NOT NULL,
        department TEXT NOT NULL,
        leave_type TEXT NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        num_days NUMERIC(4,1) NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        hod_remarks TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Faculty Leave Adjustments (Classwork & Exam Duty)
    await db.query(`
      CREATE TABLE IF NOT EXISTS faculty_leave_adjustments (
        id TEXT PRIMARY KEY,
        leave_id TEXT NOT NULL REFERENCES faculty_leaves(id) ON DELETE CASCADE,
        adjustment_type TEXT NOT NULL,
        date DATE NOT NULL,
        subject_or_duty TEXT NOT NULL,
        timing_slot TEXT NOT NULL,
        reassigned_faculty_email TEXT NOT NULL,
        reassigned_faculty_name TEXT NOT NULL
      );
    `);

    // 5. Student Permissions (On-Duty / Leaves)
    await db.query(`
      CREATE TABLE IF NOT EXISTS student_permissions (
        id TEXT PRIMARY KEY,
        roll_number TEXT NOT NULL,
        student_name TEXT NOT NULL,
        department TEXT NOT NULL,
        section TEXT NOT NULL,
        year TEXT NOT NULL,
        permission_type TEXT NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        num_days INT NOT NULL,
        reason TEXT NOT NULL,
        proof_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        hod_remarks TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err: any) {
    console.warn('[Schema] Failed to ensure leave/subjects handled tables:', err.message);
  }
};

// ── SUBJECTS HANDLED ENDPOINTS ──────────────────────────────────────────────

// GET /faculty/subjects-handled/:email — Get all subject result records for a faculty
app.get('/faculty/subjects-handled/:email', requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const email = req.params.email.toLowerCase().trim();
    const result = await db.query(
      `SELECT * FROM faculty_subjects_handled 
       WHERE LOWER(faculty_email) = $1 
       ORDER BY created_at DESC, year_batch DESC`,
      [email]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /faculty/subjects-handled/:email — Add single or bulk subject handled records
app.post('/faculty/subjects-handled/:email', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const email = req.params.email.toLowerCase().trim();
    const rawData = req.body;
    const rows = Array.isArray(rawData) ? rawData : (Array.isArray(rawData.rows) ? rawData.rows : [rawData]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No subject records provided' });
    }

    const inserted: any[] = [];
    for (const r of rows) {
      const id = r.id || `SUBJ_RES_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const yearBatch = String(r.year_batch || r.year || '').trim();
      const section = String(r.section || 'A').trim().toUpperCase();
      const subject = String(r.subject || r.subject_name || '').trim();
      const branch = String(r.branch || r.department || '').trim();
      const registered = parseInt(r.registered || r.registered_count || '0');
      const appeared = parseInt(r.appeared || r.appeared_count || '0');
      const failed = parseInt(r.failed || r.failed_count || '0');
      let passPct = parseFloat(r.pass_percentage || r.pass_pct || '0');
      if (!passPct && appeared > 0) {
        passPct = Math.round(((appeared - failed) / appeared) * 10000) / 100;
      }
      const highest = parseFloat(r.highest_marks || r.highest || '0');

      if (!yearBatch || !subject) continue;

      const ins = await db.query(
        `INSERT INTO faculty_subjects_handled 
         (id, faculty_email, year_batch, section, subject, branch, registered, appeared, failed, pass_percentage, highest_marks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [id, email, yearBatch, section, subject, branch, registered, appeared, failed, passPct, highest]
      );
      inserted.push(ins.rows[0]);
    }

    res.json({
      success: true,
      message: `Successfully saved ${inserted.length} subject handled record(s).`,
      records: inserted,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /faculty/subjects-handled/:id — Delete a record
app.delete('/faculty/subjects-handled/:id', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    await db.query('DELETE FROM faculty_subjects_handled WHERE id = $1', [id]);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── HOLIDAY CALENDAR ENDPOINTS ──────────────────────────────────────────────

// GET /holidays — Get all recorded holidays
app.get('/holidays', requireAuth, async (_req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const result = await db.query('SELECT * FROM holiday_calendar ORDER BY date ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /holidays — Add a holiday (Admin)
app.post('/holidays', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { date, title, type } = req.body;
    if (!date || !title) return res.status(400).json({ error: 'Date and Title are required' });

    const id = `HOL_${Date.now()}`;
    const ins = await db.query(
      `INSERT INTO holiday_calendar (id, date, title, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (date) DO UPDATE SET title = EXCLUDED.title, type = EXCLUDED.type
       RETURNING *`,
      [id, date, title.trim(), type || 'Holiday']
    );
    res.json({ success: true, holiday: ins.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /holidays/:id — Update a holiday (Admin)
app.put('/holidays/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    const { date, title, type } = req.body;
    if (!date || !title) return res.status(400).json({ error: 'Date and Title are required' });

    const result = await db.query(
      `UPDATE holiday_calendar 
       SET date = $1, title = $2, type = $3 
       WHERE id = $4
       RETURNING *`,
      [date, title.trim(), type || 'Holiday', id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ success: true, holiday: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /holidays/:id — Delete a holiday (Admin)
app.delete('/holidays/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    await db.query('DELETE FROM holiday_calendar WHERE id = $1', [id]);
    res.json({ success: true, message: 'Holiday deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ACADEMIC CALENDAR ENDPOINTS ─────────────────────────────────────────────

// GET /academic-calendar — Get all academic calendar semester date windows
app.get('/academic-calendar', requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const academicYear = req.query.academic_year as string;
    let query = 'SELECT * FROM academic_calendar';
    const params: any[] = [];
    if (academicYear) {
      params.push(academicYear);
      query += ' WHERE academic_year = $1';
    }
    query += ' ORDER BY academic_year DESC, semester ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /academic-calendar — Create or update academic semester date range (Admin)
app.post('/academic-calendar', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { academic_year, semester, start_date, end_date, description } = req.body;
    if (!academic_year || !semester || !start_date || !end_date) {
      return res.status(400).json({ error: 'Academic year, semester, start date, and end date are required' });
    }

    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: 'Semester start date cannot be after end date' });
    }

    const id = `AC_${academic_year.replace(/[^a-zA-Z0-9]/g, '_')}_${semester.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const ins = await db.query(
      `INSERT INTO academic_calendar (id, academic_year, semester, start_date, end_date, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (academic_year, semester) DO UPDATE 
       SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, description = EXCLUDED.description
       RETURNING *`,
      [id, academic_year.trim(), semester.trim(), start_date, end_date, description?.trim() || null]
    );

    res.json({
      success: true,
      message: `Academic calendar for ${academic_year} (Sem ${semester}) saved successfully.`,
      calendar: ins.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /academic-calendar/:id — Delete academic calendar semester entry (Admin)
app.delete('/academic-calendar/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    await db.query('DELETE FROM academic_calendar WHERE id = $1', [id]);
    res.json({ success: true, message: 'Academic calendar entry deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: calculate working days between two dates excluding Sundays and holidays
const calculateLeaveDaysFromDb = async (fromDateStr: string, toDateStr: string): Promise<number> => {
  const holidaysRes = await db.query('SELECT date FROM holiday_calendar');
  const holidaySet = new Set(
    holidaysRes.rows.map((r: any) => {
      return typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0];
    })
  );

  const start = new Date(fromDateStr);
  const end = new Date(toDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dayOfWeek = cur.getDay(); // 0 is Sunday
    const curIso = cur.toISOString().split('T')[0];

    // Skip Sundays and declared holidays
    if (dayOfWeek !== 0 && !holidaySet.has(curIso)) {
      days++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

// ── FACULTY LEAVE MANAGEMENT ENDPOINTS ──────────────────────────────────────

const LEAVE_QUOTAS: Record<string, number> = {
  'Casual Leave': 15,
  'Academic Leave': 6,
  'SP CL': 7,
  'Paid Leave': 999, // Unlimited / Loss of pay fallback
};

// GET /faculty/leaves/my-summary — Current faculty's leave balances & history
app.get('/faculty/leaves/my-summary', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const email = req.auth?.email?.toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;

    // Fetch leaves for this faculty
    const leavesRes = await db.query(
      `SELECT * FROM faculty_leaves 
       WHERE LOWER(faculty_email) = $1 
       ORDER BY created_at DESC`,
      [email]
    );

    const leaves = leavesRes.rows;

    // Fetch adjustments for these leaves
    const leaveIds = leaves.map((l: any) => l.id);
    let adjustments: any[] = [];
    if (leaveIds.length > 0) {
      const adjRes = await db.query(
        `SELECT * FROM faculty_leave_adjustments WHERE leave_id = ANY($1)`,
        [leaveIds]
      );
      adjustments = adjRes.rows;
    }

    const leavesWithAdj = leaves.map((l: any) => ({
      ...l,
      adjustments: adjustments.filter((a: any) => a.leave_id === l.id),
    }));

    // Compute used balances (Approved + Pending applications)
    const usedCounts: Record<string, number> = {
      'Casual Leave': 0,
      'Academic Leave': 0,
      'SP CL': 0,
      'Paid Leave': 0,
    };

    leaves.forEach((l: any) => {
      if (l.status === 'Approved' || l.status === 'Pending') {
        const type = l.leave_type;
        const days = parseFloat(l.num_days || '0');
        if (usedCounts[type] !== undefined) {
          usedCounts[type] += days;
        }
      }
    });

    const balances = {
      'Casual Leave': {
        quota: LEAVE_QUOTAS['Casual Leave'],
        used: usedCounts['Casual Leave'],
        remaining: Math.max(0, LEAVE_QUOTAS['Casual Leave'] - usedCounts['Casual Leave']),
      },
      'Academic Leave': {
        quota: LEAVE_QUOTAS['Academic Leave'],
        used: usedCounts['Academic Leave'],
        remaining: Math.max(0, LEAVE_QUOTAS['Academic Leave'] - usedCounts['Academic Leave']),
      },
      'SP CL': {
        quota: LEAVE_QUOTAS['SP CL'],
        used: usedCounts['SP CL'],
        remaining: Math.max(0, LEAVE_QUOTAS['SP CL'] - usedCounts['SP CL']),
      },
      'Paid Leave': {
        quota: 0,
        used: usedCounts['Paid Leave'],
        remaining: 999,
      },
    };

    res.json({
      faculty_email: email,
      year: currentYear,
      balances,
      leaves: leavesWithAdj,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /faculty/leaves/reassigned-duties — Get duties reassigned to the current faculty
app.get('/faculty/leaves/reassigned-duties', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const email = req.auth?.email?.toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    const result = await db.query(
      `SELECT 
         a.*,
         l.faculty_name AS original_faculty_name,
         l.faculty_email AS original_faculty_email,
         l.department,
         l.leave_type,
         l.status AS leave_status
       FROM faculty_leave_adjustments a
       JOIN faculty_leaves l ON l.id = a.leave_id
       WHERE LOWER(a.reassigned_faculty_email) = $1
       ORDER BY a.date DESC`,
      [email]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /faculty/leaves/apply — Apply for leave with classwork & exam duty adjustments
app.post('/faculty/leaves/apply', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const email = req.auth?.email?.toLowerCase().trim();
    const { leave_type, from_date, to_date, reason, adjustments = [] } = req.body;

    if (!email || !leave_type || !from_date || !to_date || !reason) {
      return res.status(400).json({ error: 'Leave type, from date, to date, and reason are required' });
    }

    // Auto-calculate days excluding holidays & Sundays
    const calculatedDays = await calculateLeaveDaysFromDb(from_date, to_date);
    if (calculatedDays <= 0) {
      return res.status(400).json({ error: 'The selected date range contains 0 working days (all dates fall on Sundays/holidays).' });
    }

    // Check balance if not Paid Leave
    if (leave_type !== 'Paid Leave') {
      const currentYear = new Date().getFullYear();
      const usedRes = await db.query(
        `SELECT COALESCE(SUM(num_days), 0) AS total_used 
         FROM faculty_leaves 
         WHERE LOWER(faculty_email) = $1 
           AND leave_type = $2 
           AND (status = 'Approved' OR status = 'Pending')
           AND from_date >= $3 AND from_date <= $4`,
        [email, leave_type, `${currentYear}-01-01`, `${currentYear}-12-31`]
      );
      const usedDays = parseFloat(usedRes.rows[0]?.total_used || '0');
      const maxQuota = LEAVE_QUOTAS[leave_type] || 0;
      const remaining = maxQuota - usedDays;

      if (calculatedDays > remaining) {
        return res.status(400).json({
          error: `Insufficient leave balance. You have ${Math.max(0, remaining)} day(s) remaining for ${leave_type}, but requested ${calculatedDays} day(s). You may apply as 'Paid Leave' instead.`,
          remaining,
          requested: calculatedDays,
          allowPaidLeave: true,
        });
      }
    }

    // Fetch faculty metadata
    const facRes = await db.query('SELECT name, department FROM faculty WHERE LOWER(email) = $1 LIMIT 1', [email]);
    const fac = facRes.rows[0] || { name: email.split('@')[0], department: 'CSE (Data Science)' };

    const leaveId = `FAC_LV_${Date.now()}`;
    const insLeave = await db.query(
      `INSERT INTO faculty_leaves 
       (id, faculty_email, faculty_name, department, leave_type, from_date, to_date, num_days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending')
       RETURNING *`,
      [leaveId, email, fac.name, fac.department, leave_type, from_date, to_date, calculatedDays, reason.trim()]
    );

    // Save adjustments
    const savedAdj: any[] = [];
    if (Array.isArray(adjustments)) {
      for (const adj of adjustments) {
        if (!adj.date || !adj.reassigned_faculty_email) continue;
        const adjId = `ADJ_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const reassignedEmail = adj.reassigned_faculty_email.toLowerCase().trim();
        let reassignedName = adj.reassigned_faculty_name?.trim();
        if (!reassignedName || reassignedName === reassignedEmail) {
          const rfRes = await db.query('SELECT name FROM faculty WHERE LOWER(email) = $1 LIMIT 1', [reassignedEmail]);
          reassignedName = rfRes.rows[0]?.name || reassignedEmail.split('@')[0];
        }

        const insAdj = await db.query(
          `INSERT INTO faculty_leave_adjustments 
           (id, leave_id, adjustment_type, date, subject_or_duty, timing_slot, reassigned_faculty_email, reassigned_faculty_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            adjId,
            leaveId,
            adj.adjustment_type || 'classwork',
            adj.date,
            adj.subject_or_duty || 'Classwork',
            adj.timing_slot || 'Regular Slot',
            reassignedEmail,
            reassignedName,
          ]
        );
        savedAdj.push(insAdj.rows[0]);
      }
    }

    res.json({
      success: true,
      message: `Leave application submitted (${calculatedDays} working days) and sent to HOD for approval.`,
      leave: {
        ...insLeave.rows[0],
        adjustments: savedAdj,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /hod/leaves/faculty — HOD fetch faculty leave requests (filtered by HOD department or all for admin)
app.get('/hod/leaves/faculty', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const callerRole = req.auth?.role;
    const callerDept = req.auth?.department;

    let query = `SELECT * FROM faculty_leaves WHERE 1=1`;
    const params: any[] = [];

    if (callerRole === 'hod' && callerDept && callerDept !== '*') {
      params.push(callerDept);
      query += ` AND (LOWER(REPLACE(department, ' ', '')) ILIKE '%' || LOWER(REPLACE($1, ' ', '')) || '%' OR LOWER(REPLACE($1, ' ', '')) ILIKE '%' || LOWER(REPLACE(department, ' ', '')) || '%')`;
    }

    query += ` ORDER BY created_at DESC`;
    const result = await db.query(query, params);
    const leaves = result.rows;

    const leaveIds = leaves.map((l: any) => l.id);
    let adjustments: any[] = [];
    if (leaveIds.length > 0) {
      const adjRes = await db.query(
        `SELECT * FROM faculty_leave_adjustments WHERE leave_id = ANY($1)`,
        [leaveIds]
      );
      adjustments = adjRes.rows;
    }

    const responseData = leaves.map((l: any) => ({
      ...l,
      adjustments: adjustments.filter((a: any) => a.leave_id === l.id),
    }));

    res.json(responseData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /hod/leaves/faculty/:id/status — HOD Approve or Reject leave with remarks
app.put('/hod/leaves/faculty/:id/status', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    const { status, hod_remarks } = req.body;
    const approvedBy = req.auth?.email || 'HOD';

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'Approved' or 'Rejected'" });
    }

    const result = await db.query(
      `UPDATE faculty_leaves 
       SET status = $1, hod_remarks = $2, approved_by = $3, approved_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, hod_remarks || null, approvedBy, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Leave record not found' });

    res.json({
      success: true,
      message: `Leave application ${status.toLowerCase()} successfully.`,
      leave: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /faculty/leaves/:id — Faculty cancel own leave (Approved, Pending, or Rejected) -> restores balance & removes reassigned adjustments
app.delete('/faculty/leaves/:id', requireRole('faculty', 'hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    const email = req.auth?.email?.toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    // Check ownership
    const chk = await db.query('SELECT * FROM faculty_leaves WHERE id = $1 AND LOWER(faculty_email) = $2', [id, email]);
    if (chk.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found or does not belong to you' });
    }

    const leave = chk.rows[0];

    // ── 9:00 AM CUTOFF CHECK (IST) ──
    // Faculty can only cancel their leave BEFORE 9:00 AM on the start date (from_date).
    // If it is on or after 9:00 AM on from_date (or past from_date), only HOD/Admin can delete/cancel it.
    const fromDateStr = typeof leave.from_date === 'string'
      ? leave.from_date.split('T')[0]
      : new Date(leave.from_date).toISOString().split('T')[0];

    // Convert current time to IST (UTC+5:30)
    const nowUtc = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(nowUtc.getTime() + istOffsetMs);
    const todayIstStr = nowIst.toISOString().split('T')[0];
    const istHours = nowIst.getUTCHours();
    const istMinutes = nowIst.getUTCMinutes();
    const isPast9Am = istHours > 9 || (istHours === 9 && istMinutes > 0);

    const isCutoffPassed = todayIstStr > fromDateStr || (todayIstStr === fromDateStr && isPast9Am);

    if (isCutoffPassed) {
      return res.status(403).json({
        error: `Cancellation window closed: Leaves starting today (${fromDateStr}) or in the past cannot be cancelled by faculty after 9:00 AM. Please contact your HOD to cancel this leave and restore your leave credit.`,
      });
    }

    await db.query('DELETE FROM faculty_leave_adjustments WHERE leave_id = $1', [id]);
    await db.query('DELETE FROM faculty_leaves WHERE id = $1', [id]);

    res.json({
      success: true,
      message: `Leave request for ${leave.num_days} day(s) (${leave.leave_type}) has been cancelled and credited back to your balance.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /hod/leaves/faculty/:id — HOD or Admin delete/cancel a faculty leave -> restores faculty leave balance & deletes adjustments
app.delete('/hod/leaves/faculty/:id', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;

    const chk = await db.query('SELECT * FROM faculty_leaves WHERE id = $1', [id]);
    if (chk.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const leave = chk.rows[0];
    await db.query('DELETE FROM faculty_leave_adjustments WHERE leave_id = $1', [id]);
    await db.query('DELETE FROM faculty_leaves WHERE id = $1', [id]);

    res.json({
      success: true,
      message: `Leave request for ${leave.faculty_name} (${leave.num_days} days) deleted. Leave balance has been credited back to faculty account.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /hod/permissions/students/:id — HOD or Admin delete/cancel a student permission
app.delete('/hod/permissions/students/:id', requireRole('hod', 'admin'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    await db.query('DELETE FROM student_permissions WHERE id = $1', [id]);
    res.json({ success: true, message: 'Student permission request deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /student/permissions/apply — Student apply for permission with proof file
app.post('/student/permissions/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const rollNumber = (req.auth?.regNo || req.body.roll_number || '').toUpperCase().trim();
    const { permission_type, from_date, to_date, reason, proof_url } = req.body;

    if (!rollNumber || !permission_type || !from_date || !to_date || !reason || !proof_url) {
      return res.status(400).json({
        error: 'Permission type, from date, to date, description/reason, and proof document upload are required.',
      });
    }

    const calculatedDays = await calculateLeaveDaysFromDb(from_date, to_date);
    const numDays = Math.max(1, calculatedDays);

    // Fetch student info
    const stRes = await db.query('SELECT name, department, section, year FROM students WHERE UPPER(roll_number) = $1 LIMIT 1', [rollNumber]);
    const st = stRes.rows[0] || {
      name: rollNumber,
      department: req.auth?.department || 'General',
      section: 'A',
      year: '2nd Year',
    };

    const permId = `ST_PERM_${Date.now()}`;
    const ins = await db.query(
      `INSERT INTO student_permissions 
       (id, roll_number, student_name, department, section, year, permission_type, from_date, to_date, num_days, reason, proof_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Pending')
       RETURNING *`,
      [permId, rollNumber, st.name, st.department, st.section, st.year, permission_type, from_date, to_date, numDays, reason.trim(), proof_url]
    );

    res.json({
      success: true,
      message: `Permission application submitted (${numDays} days) and forwarded to HOD for approval.`,
      permission: ins.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/permissions/my-history — Student view permission history
app.get('/student/permissions/my-history', requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const rollNumber = (req.auth?.regNo || req.query.rollNumber as string || '').toUpperCase().trim();
    if (!rollNumber) return res.status(400).json({ error: 'Roll number required' });

    const result = await db.query(
      `SELECT * FROM student_permissions WHERE UPPER(roll_number) = $1 ORDER BY created_at DESC`,
      [rollNumber]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /hod/permissions/students — HOD/Coordinator/Mentor view student permissions
app.get('/hod/permissions/students', requireRole('hod', 'admin', 'faculty', 'coordinator'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const callerRole = req.auth?.role;
    const callerDept = req.auth?.department;

    let query = `SELECT * FROM student_permissions WHERE 1=1`;
    const params: any[] = [];

    // Coordinator exclusively supervises 1st Year (1-1 / 1-2) student permissions across all departments
    if (callerRole === 'coordinator') {
      query += ` AND (year = '1st Year' OR year ILIKE '1%')`;
    } else if (callerRole === 'hod' && callerDept && callerDept !== '*') {
      params.push(callerDept);
      query += ` AND (LOWER(REPLACE(department, ' ', '')) ILIKE '%' || LOWER(REPLACE($1, ' ', '')) || '%' OR LOWER(REPLACE($1, ' ', '')) ILIKE '%' || LOWER(REPLACE(department, ' ', '')) || '%')`;
    }

    query += ` ORDER BY created_at DESC`;
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /hod/permissions/students/:id/status — HOD/Coordinator Approve or Reject student permission
app.put('/hod/permissions/students/:id/status', requireRole('hod', 'admin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    const { status, remarks } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Approved or Rejected' });
    }

    const result = await db.query(
      `UPDATE student_permissions 
       SET status = $1, remarks = $2, approved_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, remarks || '', req.auth?.email || 'HOD/Coordinator', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Permission request not found' });
    }

    res.json({ success: true, message: `Student permission ${status.toLowerCase()} successfully.`, permission: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /hod/permissions/students/:id — HOD, Coordinator, or Admin delete/cancel a student permission
app.delete('/hod/permissions/students/:id', requireRole('hod', 'admin', 'coordinator'), async (req: Request, res: Response) => {
  try {
    await ensureLeaveAndSubjectsHandledTables();
    const { id } = req.params;
    await db.query('DELETE FROM student_permissions WHERE id = $1', [id]);
    res.json({ success: true, message: 'Student permission deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all SPA route fallback for client-side React routes
app.get('*', (_req: Request, res: Response) => {
  return sendIndexHtml(res);
});


// ============================================================================
// Startup Migration: Enforce Semester Lock on Existing Data
// Only runs in traditional server mode (not serverless/Lambda).
// In Lambda, ensureSchema() runs per-request and handles the seed correction.
// ============================================================================
(async () => {
  if (db.isMock) return;
  // Skip in AWS Lambda — don't compete for DB connections on cold start
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return;
  try {
    const settings = await db.query(
      `SELECT year_label, max_semester FROM semester_unlock_settings`
    );
    if (!settings.rows.length) return;

    let totalDeleted = 0;
    for (const row of settings.rows) {
      const { year_label, max_semester } = row;
      const del = await db.query(
        `DELETE FROM academics
         WHERE semester > $1
           AND student_id IN (
             SELECT roll_number FROM students WHERE year = $2
           )`,
        [Number(max_semester), year_label]
      );
      totalDeleted += del.rowCount ?? 0;
    }
    if (totalDeleted > 0) {
      console.log(`[Startup] Semester lock migration: deleted ${totalDeleted} academic record(s) that exceeded semester lock.`);
    } else {
      console.log('[Startup] Semester lock migration: no excess records found — all data is within lock bounds.');
    }
  } catch (err: any) {
    console.warn('[Startup] Semester lock migration warning:', err.message);
  }
})();

export const handler = serverless(app);
export default app;
