import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// AWS Secrets Manager retrieval (for Lambda deployment with RDS Proxy)
// ---------------------------------------------------------------------------
let cachedPassword: string | null = null;

async function getDbPassword(): Promise<string> {
  // If DB_PASSWORD is set directly, use it (local dev)
  if (process.env.DB_PASSWORD) {
    return process.env.DB_PASSWORD;
  }

  // If we already fetched the secret, reuse cached value
  if (cachedPassword) {
    return cachedPassword;
  }

  // Fetch from AWS Secrets Manager
  const secretArn = process.env.DB_SECRET_ARN;
  if (secretArn) {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({});
      const resp = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
      if (resp.SecretString) {
        const secret = JSON.parse(resp.SecretString);
        cachedPassword = secret.password;
        return cachedPassword!;
      }
    } catch (err: any) {
      console.error('[DB] Failed to retrieve secret from Secrets Manager:', err.message);
    }
  }

  // Fallback
  return process.env.DB_PASSWORD || 'postgres';
}

// ---------------------------------------------------------------------------
// Connection pool (lazy-initialized)
// ---------------------------------------------------------------------------
let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (pool) return pool;

  const password = await getDbPassword();

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password,
    database: process.env.DB_NAME || 'advitiyans',
    // For Lambda + RDS Proxy: keep local pool small; proxy handles pooling
    max: process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 5,
    idleTimeoutMillis: 120000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  return pool;
}

// ---------------------------------------------------------------------------
// In-memory mock store (USE_MOCK=true fallback for local dev without DB)
// ---------------------------------------------------------------------------
const USE_MOCK = process.env.USE_MOCK === 'true';

const mockStudentsStore = new Map<string, any>();
const mockAcademicsStore = new Map<string, any[]>();
const mockCodingStore = new Map<string, any[]>();
const mockSkillsStore = new Map<string, any[]>();
const mockCertsStore = new Map<string, any[]>();
const mockSoftSkillsStore = new Map<string, any[]>();
const mockAchievementsStore = new Map<string, any[]>();
const mockPlacementStore = new Map<string, any>();

if (USE_MOCK) {
  console.log('[DB] Running in MOCK mode (USE_MOCK=true). No database connection.');

  const SAMPLE_STUDENTS: any[] = [];


  SAMPLE_STUDENTS.forEach((s) => {
    mockStudentsStore.set(s.roll_number, s);
    mockAcademicsStore.set(s.roll_number, []);
    mockCodingStore.set(s.roll_number, []);
    mockSkillsStore.set(s.roll_number, []);
    mockCertsStore.set(s.roll_number, []);
    mockSoftSkillsStore.set(s.roll_number, []);
    mockAchievementsStore.set(s.roll_number, []);
    mockPlacementStore.set(s.roll_number, {
      student_id: s.roll_number,
      placement_category: '',
      preferred_career: '',
      dream_company: [],
      employability_score: 0,
      skill_gap: [],
      suggested_certifications: [],
      higher_studies_interest: false,
      overall_potential: 0,
      research_potential: 0,
      need_from_department: '',
    });
  });
}

let schemaInitialized = false;

async function ensureSchema(p: Pool) {
  if (schemaInitialized) return;
  schemaInitialized = true;

  const ddlStatements = [
    // Departments lookup table — must be created first (before students references it)
    `CREATE TABLE IF NOT EXISTS departments (
      code VARCHAR(4) PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      short_name VARCHAR(20) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Seed the departments — safe to re-run
    `INSERT INTO departments (code, name, short_name) VALUES
      ('01', 'Civil', 'CIVIL'),
      ('02', 'EEE', 'EEE'),
      ('03', 'Mechanical', 'MECH'),
      ('04', 'ECE', 'ECE'),
      ('05', 'CSE', 'CSE'),
      ('32', 'CSE (Data Science)', 'DS'),
      ('33', 'CSE (AI & ML)', 'AIML'),
      ('34', 'CSE (BS)', 'BS'),
      ('37', 'CSE (CS)', 'CS'),
      ('MCA', 'MCA', 'MCA'),
      ('MBA', 'MBA', 'MBA')
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name;`,

    // Migrate old 'CSE (Cyber Security)' rows to 'CSE (CS)' for consistency
    `UPDATE departments SET name = 'CSE (CS)', short_name = 'CS' WHERE name = 'CSE (Cyber Security)';`,
    `UPDATE students SET department = 'CSE (CS)' WHERE department = 'CSE (Cyber Security)';`,
    `UPDATE faculty SET department = 'CSE (CS)' WHERE department = 'CSE (Cyber Security)';`,

    `CREATE TABLE IF NOT EXISTS faculty (
      faculty_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      department VARCHAR(50) NOT NULL,
      role VARCHAR(50) DEFAULT 'mentor',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS students (
      roll_number VARCHAR(10) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      year VARCHAR(20) NOT NULL,
      phone VARCHAR(20),
      address TEXT,
      native_place VARCHAR(100),
      department VARCHAR(50) NOT NULL,
      batch VARCHAR(20) NOT NULL DEFAULT '2023-2027',
      section VARCHAR(10) DEFAULT 'A',
      hostel_day_scholar VARCHAR(20) DEFAULT 'Day Scholar',
      driving_license BOOLEAN DEFAULT FALSE,
      passport BOOLEAN DEFAULT FALSE,
      relocation_willingness BOOLEAN DEFAULT TRUE,
      family_business TEXT,
      financial_background VARCHAR(50),
      faculty_mentor_id VARCHAR(50) REFERENCES faculty(faculty_id) ON DELETE SET NULL,
      photo_url TEXT,
      resume_url TEXT,
      linkedin_url TEXT,
      linkedin_updated TIMESTAMP WITH TIME ZONE,
      is_lateral_entry BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Migration: add is_lateral_entry column for existing DBs
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS is_lateral_entry BOOLEAN DEFAULT FALSE;`,

    // Migration: normalize legacy DS department names to 'CSE (Data Science)'
    `UPDATE students SET department = 'CSE (Data Science)' WHERE department IN ('CSE(Data Science)', 'Data Science', 'CSE (Data Science) ');`,

    `CREATE TABLE IF NOT EXISTS academics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
      semester INT NOT NULL,
      semester_gpa NUMERIC(4, 2),
      programming_grade VARCHAR(5),
      attendance_pct NUMERIC(5, 2),
      theory_grade VARCHAR(5),
      remarks TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, semester)
    );`,

    `CREATE TABLE IF NOT EXISTS coding_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
      platform VARCHAR(50) NOT NULL,
      handle VARCHAR(100) NOT NULL,
      streak INT DEFAULT 0,
      repositories_count INT DEFAULT 0,
      followers_count INT DEFAULT 0,
      stars_count INT DEFAULT 0,
      top_language VARCHAR(50) DEFAULT '',
      commits_count INT DEFAULT 0,
      prs_merged INT DEFAULT 0,
      score_rating NUMERIC(10, 2) DEFAULT 0.00,
      easy_count INT DEFAULT 0,
      medium_count INT DEFAULT 0,
      hard_count INT DEFAULT 0,
      contest_rating NUMERIC(10, 2) DEFAULT 0.00,
      last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, platform)
    );`,

    // Migrate existing deployed DBs — safe no-op if columns already exist
    `ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS followers_count INT DEFAULT 0;`,
    `ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS stars_count INT DEFAULT 0;`,
    `ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS top_language VARCHAR(50) DEFAULT '';`,
    `ALTER TABLE coding_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`,

    `CREATE TABLE IF NOT EXISTS tech_skills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
      skill_category VARCHAR(100) NOT NULL,
      specific_tool VARCHAR(100) NOT NULL,
      self_rating INT NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, specific_tool)
    );`,

    `CREATE TABLE IF NOT EXISTS certifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL,
      title VARCHAR(200) NOT NULL,
      date_completed DATE,
      certificate_file_url TEXT,
      suggested BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS soft_skills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
      skill VARCHAR(100) NOT NULL,
      rating INT NOT NULL,
      rated_by VARCHAR(20) DEFAULT 'self',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, skill, rated_by)
    );`,

    `CREATE TABLE IF NOT EXISTS achievements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      achievement_date DATE,
      organization VARCHAR(150),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS placement_profile (
      student_id VARCHAR(10) PRIMARY KEY REFERENCES students(roll_number) ON DELETE CASCADE,
      placement_category VARCHAR(100) DEFAULT 'Product Companies',
      preferred_career VARCHAR(100) DEFAULT 'AI & Full Stack Engineer',
      dream_company TEXT[] DEFAULT ARRAY['Google', 'Microsoft', 'Amazon'],
      employability_score NUMERIC(5, 2) DEFAULT 85.50,
      skill_gap JSONB DEFAULT '[]'::jsonb,
      suggested_certifications JSONB DEFAULT '[]'::jsonb,
      higher_studies_interest BOOLEAN DEFAULT FALSE,
      overall_potential NUMERIC(3, 1) DEFAULT 4.5,
      research_potential NUMERIC(3, 1) DEFAULT 4.0,
      need_from_department TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Migrations: add columns that may be missing from earlier schema versions
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS linkedin_updated TIMESTAMP WITH TIME ZONE;`,

    // Pre-seed fixed HOD account (legacy fallback — now managed via hod_credentials table)
    `INSERT INTO faculty (faculty_id, name, email, department, role)
     VALUES ('HOD_CSEDS', 'Dr. HOD (CSE & Data Science)', 'hcseds@rgmcet.edu.in', 'CSE (Data Science)', 'hod')
     ON CONFLICT (email) DO UPDATE SET role = 'hod', department = 'CSE (Data Science)';`,

    // HOD credentials table — per-department HOD login credentials
    `CREATE TABLE IF NOT EXISTS hod_credentials (
      id SERIAL PRIMARY KEY,
      email VARCHAR(100) NOT NULL,
      password TEXT NOT NULL,
      department VARCHAR(100),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Migration: add department column to existing hod_credentials
    `ALTER TABLE hod_credentials ADD COLUMN IF NOT EXISTS department VARCHAR(100);`,

    // Set existing legacy DS HOD row's department if not set
    `UPDATE hod_credentials SET department = 'CSE (Data Science)' WHERE department IS NULL OR department = '';`,

    // Create unique index on department for hod_credentials
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_hod_dept ON hod_credentials(LOWER(department)) WHERE department IS NOT NULL;`,

    // Seed official HOD credentials — all departments with new official email IDs
    // Email format: h<short_dept>@rgmcet.edu.in, Password: hod@2026
    // Branch HODs (2nd-4th year students of their dept):
    //   hece→ECE, hcse→CSE, heee→EEE, hme→Mechanical, hce→Civil
    //   hcseds→CSE(DS), hcseaiml→CSE(AI&ML), hcsebs→CSE(BS), hcsecs→CSE(CS), hmca→MCA, hmba→MBA
    // S&H HODs (ALL 1st year students only — scoped by year, not department):
    //   hmathematics→Mathematics, henglish→English, hphysics→Physics, hchemistry→Chemistry
    //   fycoordinator→FY Coordinator (sees all 1st year students)
    `INSERT INTO hod_credentials (id, email, password, department) VALUES
      (101, 'hce@rgmcet.edu.in',          'hod@2026', 'Civil'),
      (102, 'heee@rgmcet.edu.in',          'hod@2026', 'EEE'),
      (103, 'hme@rgmcet.edu.in',           'hod@2026', 'Mechanical'),
      (104, 'hece@rgmcet.edu.in',          'hod@2026', 'ECE'),
      (105, 'hcse@rgmcet.edu.in',          'hod@2026', 'CSE'),
      (106, 'hcseds@rgmcet.edu.in',        'hod@2026', 'CSE (Data Science)'),
      (107, 'hcseaiml@rgmcet.edu.in',      'hod@2026', 'CSE (AI & ML)'),
      (108, 'hcsebs@rgmcet.edu.in',        'hod@2026', 'CSE (BS)'),
      (109, 'hcsecs@rgmcet.edu.in',        'hod@2026', 'CSE (CS)'),
      (110, 'hmca@rgmcet.edu.in',          'hod@2026', 'MCA'),
      (111, 'hmba@rgmcet.edu.in',          'hod@2026', 'MBA'),
      (112, 'hmathematics@rgmcet.edu.in',  'hod@2026', 'Mathematics'),
      (113, 'henglish@rgmcet.edu.in',      'hod@2026', 'English'),
      (114, 'hphysics@rgmcet.edu.in',      'hod@2026', 'Physics'),
      (115, 'hchemistry@rgmcet.edu.in',    'hod@2026', 'Chemistry'),
      (116, 'fycoordinator@rgmcet.edu.in', 'hod@2026', '1st Year')
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, department = EXCLUDED.department, updated_at = NOW();`,

    // Remove old row 1 that duplicated hcseds; row 106 now handles CSE (Data Science)
    `DELETE FROM hod_credentials WHERE id = 1;`,

    // Semester unlock settings — HOD/Admin controls which semesters students can fill
    `CREATE TABLE IF NOT EXISTS semester_unlock_settings (
      year_label VARCHAR(20) PRIMARY KEY,
      max_semester INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Seed/correct semester unlock settings.
    // DO UPDATE enforces per-year maximum ceilings so legacy rows with invalid values (e.g. 8 for 1st Year)
    // get reset to the floor (0/2/4/6). Valid unlocked values (e.g. 1st Year at 1 or 2, 4th Year at 7 or 8)
    // are preserved.
    `INSERT INTO semester_unlock_settings (year_label, max_semester) VALUES
      ('1st Year', 0), ('2nd Year', 2), ('3rd Year', 4), ('4th Year', 6)
     ON CONFLICT (year_label) DO UPDATE
       SET max_semester = CASE
         WHEN semester_unlock_settings.year_label = '1st Year' AND semester_unlock_settings.max_semester > 2 THEN 0
         WHEN semester_unlock_settings.year_label = '2nd Year' AND semester_unlock_settings.max_semester > 4 THEN 2
         WHEN semester_unlock_settings.year_label = '3rd Year' AND semester_unlock_settings.max_semester > 6 THEN 4
         WHEN semester_unlock_settings.year_label = '4th Year' AND semester_unlock_settings.max_semester > 8 THEN 6
         ELSE semester_unlock_settings.max_semester
       END,
       updated_at = NOW();`,

    // Student passwords — admin-managed plain-text passwords (not Cognito)
    `CREATE TABLE IF NOT EXISTS student_passwords (
      roll_number VARCHAR(10) PRIMARY KEY REFERENCES students(roll_number) ON DELETE CASCADE,
      password TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Super admin credentials — 3 fixed super admins, individually-changeable passwords
    `CREATE TABLE IF NOT EXISTS super_admin_credentials (
      email VARCHAR(100) PRIMARY KEY,
      password TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Seed the super admins — DO NOTHING on conflict so changed passwords survive redeploys
    `INSERT INTO super_admin_credentials (email, password) VALUES
      ('admin@rgmcet.edu.in', 'admin@2026'),
      ('jayakrushna1622@gmail.com', 'jdj275152'),
      ('dineshkumarpathipati@gmail.com', 'jdj275152'),
      ('jayanthkumarnaidu777@gmail.com', 'jdj275152')
     ON CONFLICT (email) DO NOTHING;`,

    // Regular admin accounts — created/managed by super admins, scoped to a department
    `CREATE TABLE IF NOT EXISTS admin_accounts (
      email VARCHAR(100) PRIMARY KEY,
      name  VARCHAR(100) NOT NULL DEFAULT 'Admin',
      password TEXT NOT NULL,
      department VARCHAR(100),
      created_by VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // Migration: add department column to existing admin_accounts
    `ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS department VARCHAR(100);`,

    `DELETE FROM admin_accounts WHERE LOWER(email) = 'admin@rgmcet.edu.in';`,

    `INSERT INTO admin_accounts (email, name, password, department, created_by) VALUES
      ('admincivil@rgmcet.edu.in', 'Civil Admin', 'admin@2026', 'Civil', 'System'),
      ('admineee@rgmcet.edu.in', 'EEE Admin', 'admin@2026', 'EEE', 'System'),
      ('adminmech@rgmcet.edu.in', 'Mechanical Admin', 'admin@2026', 'Mechanical', 'System'),
      ('adminece@rgmcet.edu.in', 'ECE Admin', 'admin@2026', 'ECE', 'System'),
      ('admincse@rgmcet.edu.in', 'CSE Admin', 'admin@2026', 'CSE', 'System'),
      ('adminds@rgmcet.edu.in', 'Data Science Admin', 'admin@2026', 'CSE (Data Science)', 'System'),
      ('adminaiml@rgmcet.edu.in', 'AI & ML Admin', 'admin@2026', 'CSE (AI & ML)', 'System'),
      ('adminbs@rgmcet.edu.in', 'BS Admin', 'admin@2026', 'CSE (BS)', 'System'),
      ('admincs@rgmcet.edu.in', 'CS Admin', 'admin@2026', 'CSE (CS)', 'System'),
      ('adminmca@rgmcet.edu.in', 'MCA Admin', 'admin@2026', 'MCA', 'System'),
      ('adminmba@rgmcet.edu.in', 'MBA Admin', 'admin@2026', 'MBA', 'System'),
      ('coordinator@rgmcet.edu.in', '1st Year Coordinator', 'coordinator@2026', 'All', 'System')
     ON CONFLICT (email) DO UPDATE SET department = EXCLUDED.department, password = EXCLUDED.password;`,

    // Migration: add 1st year fresher admission and migration columns to students table
    `ALTER TABLE students DROP CONSTRAINT IF EXISTS check_roll_number_format;`,
    `ALTER TABLE students DROP CONSTRAINT IF EXISTS check_rgmcet_email;`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_id VARCHAR(50);`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS dob DATE;`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS personal_mobile VARCHAR(20);`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS personal_email VARCHAR(100);`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS username VARCHAR(50);`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash TEXT;`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS migration_stage INT DEFAULT 0;`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS is_first_year_setup_complete BOOLEAN DEFAULT FALSE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_admission_id ON students(admission_id) WHERE admission_id IS NOT NULL AND admission_id != '';`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username ON students(LOWER(username)) WHERE username IS NOT NULL AND username != '';`,

    // Index for department-based lookups
    `CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);`,
    `CREATE INDEX IF NOT EXISTS idx_faculty_department ON faculty(department);`,

    // Single-session enforcement table — one active session per email
    // Must exist before any delete route tries to clean up user_sessions
    `CREATE TABLE IF NOT EXISTS user_sessions (
      email VARCHAR(100) PRIMARY KEY,
      session_token VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
    );`,

    // ── Attendance Management System Tables ──────────────────────────────────
    `CREATE TABLE IF NOT EXISTS subject_allotments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      semester_label VARCHAR(5) NOT NULL,
      subject_name VARCHAR(200) NOT NULL,
      subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('Theory', 'Lab')),
      section VARCHAR(10) NOT NULL DEFAULT '',
      faculty_email VARCHAR(100) NOT NULL,
      faculty_name VARCHAR(100) NOT NULL DEFAULT '',
      department VARCHAR(50) NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(semester_label, subject_name, section, faculty_email)
    );`,
    `CREATE TABLE IF NOT EXISTS subject_rosters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      allotment_id UUID NOT NULL REFERENCES subject_allotments(id) ON DELETE CASCADE,
      roll_number VARCHAR(10) NOT NULL,
      student_email VARCHAR(100) NOT NULL DEFAULT '',
      joining_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(allotment_id, roll_number)
    );`,
    `ALTER TABLE subject_rosters ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT CURRENT_DATE;`,
    `CREATE TABLE IF NOT EXISTS attendance_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      allotment_id UUID NOT NULL REFERENCES subject_allotments(id) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      num_periods INT NOT NULL CHECK (num_periods BETWEEN 1 AND 3),
      period_start INT NOT NULL CHECK (period_start BETWEEN 1 AND 7),
      recorded_by VARCHAR(100) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(allotment_id, session_date, period_start)
    );`,
    `CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      roll_number VARCHAR(10) NOT NULL,
      is_present BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE(session_id, roll_number)
    );`,
    `CREATE TABLE IF NOT EXISTS timetable_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      semester_label VARCHAR(5) NOT NULL,
      department VARCHAR(50) NOT NULL DEFAULT '',
      section VARCHAR(10) NOT NULL DEFAULT '',
      day_of_week VARCHAR(15) NOT NULL,
      period_start INT NOT NULL CHECK (period_start BETWEEN 1 AND 7),
      num_periods INT NOT NULL CHECK (num_periods BETWEEN 1 AND 3),
      subject_name VARCHAR(200) NOT NULL,
      subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('Theory', 'Lab')),
      faculty_email VARCHAR(100) NOT NULL DEFAULT '',
      faculty_name VARCHAR(100) NOT NULL DEFAULT '',
      room_no VARCHAR(50) NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(semester_label, department, section, day_of_week, period_start)
    );`,
    `CREATE TABLE IF NOT EXISTS timetable_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      semester_label VARCHAR(5) NOT NULL,
      department VARCHAR(50) NOT NULL DEFAULT '',
      section VARCHAR(10) NOT NULL DEFAULT '',
      file_name VARCHAR(255) NOT NULL,
      file_data TEXT NOT NULL,
      file_size INT NOT NULL DEFAULT 0,
      uploaded_by VARCHAR(100) NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(semester_label, department, section)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_allotments_faculty ON subject_allotments(faculty_email);`,
    `CREATE INDEX IF NOT EXISTS idx_allotments_semester ON subject_allotments(semester_label);`,
    `CREATE INDEX IF NOT EXISTS idx_allotments_dept ON subject_allotments(department);`,
    `CREATE INDEX IF NOT EXISTS idx_rosters_allotment ON subject_rosters(allotment_id);`,
    `CREATE INDEX IF NOT EXISTS idx_rosters_roll ON subject_rosters(roll_number);`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_allotment ON attendance_sessions(allotment_id);`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_date ON attendance_sessions(session_date);`,
    `CREATE INDEX IF NOT EXISTS idx_records_session ON attendance_records(session_id);`,
    `CREATE INDEX IF NOT EXISTS idx_timetable_lookup ON timetable_entries(semester_label, department, section, day_of_week);`,
    `CREATE INDEX IF NOT EXISTS idx_timetable_faculty ON timetable_entries(faculty_email);`,
    `CREATE INDEX IF NOT EXISTS idx_timetable_docs ON timetable_documents(semester_label, department, section);`,
    `CREATE TABLE IF NOT EXISTS class_incharges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      semester_label VARCHAR(5) NOT NULL CHECK (semester_label IN ('1-1', '1-2')),
      department VARCHAR(50) NOT NULL,
      section VARCHAR(10) NOT NULL,
      faculty_email VARCHAR(100) NOT NULL,
      faculty_name VARCHAR(100) NOT NULL DEFAULT '',
      assigned_by VARCHAR(100) NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(semester_label, department, section)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_class_incharges_faculty ON class_incharges(faculty_email);`
  ];

  try {
    const client = await p.connect();
    try {
      for (const stmt of ddlStatements) {
        await client.query(stmt).catch((err) => {
          console.warn('[DB] DDL statement warning:', err.message);
        });
      }
      console.log('[DB] Automatic database schema setup verified.');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('[DB] Schema connection warning:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Exported db object
// ---------------------------------------------------------------------------
export const db = {
  /**
   * Execute a parameterized SQL query against PostgreSQL (via RDS Proxy in production).
   * In mock mode, returns empty results.
   */
  async query(text: string, params: any[] = []): Promise<QueryResult> {
    if (USE_MOCK) {
      // Return empty result for mock mode — routes use mockStore directly
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any;
    }
    const p = await getPool();
    await ensureSchema(p);
    try {
      return await p.query(text, params);
    } catch (err: any) {
      const msg = String(err.message || err);
      if (msg.includes('does not exist') || err.code === '42P01') {
        console.warn('[DB] Missing table error caught. Retrying schema initialization...');
        schemaInitialized = false;
        await ensureSchema(p);
        return await p.query(text, params);
      }
      throw err;
    }
  },

  /**
   * Health check — verifies database connectivity.
   */
  async healthCheck(): Promise<{ connected: boolean; via: string; host: string }> {
    if (USE_MOCK) {
      return { connected: true, via: 'mock', host: 'in-memory' };
    }
    try {
      const p = await getPool();
      const res = await p.query('SELECT 1 AS ok');
      const host = process.env.DB_HOST || 'localhost';
      const isProxy = host.includes('.proxy-') || host.includes('rds-proxy');
      return { connected: res.rows[0]?.ok === 1, via: isProxy ? 'rds-proxy' : 'direct', host };
    } catch (err: any) {
      return { connected: false, via: 'error', host: err.message };
    }
  },

  /**
   * Mock store — only populated when USE_MOCK=true.
   */
  mockStore: {
    students: mockStudentsStore,
    academics: mockAcademicsStore,
    codingProfiles: mockCodingStore,
    techSkills: mockSkillsStore,
    certifications: mockCertsStore,
    softSkills: mockSoftSkillsStore,
    achievements: mockAchievementsStore,
    placement: mockPlacementStore,
  },

  /** Whether mock mode is active */
  isMock: USE_MOCK,
};
