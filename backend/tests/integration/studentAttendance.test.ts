/**
 * tests/integration/studentAttendance.test.ts — mentors see their mentees' attendance, and the Student Directory
 * (Principal / HOD) lists students with attendance and mentor, on a real Postgres.
 * Runs only when FS_TEST_DATABASE_URL is set.
 */
import request from 'supertest';
import { Pool } from 'pg';
import { AY_NOW_SQL } from '../../src/db/allotmentYear';

const URL = process.env.FS_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
jest.setTimeout(60000);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'sa-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

const tok = (role: string, email: string, extra: any = {}) => `Bearer ${signSessionToken({ role, email, ...extra })}`;
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5.5 * 3600000 - n * 86400000).toISOString().slice(0, 10);
let pool: Pool;

d('Student attendance for mentors and the Student Directory (real Postgres)', () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: URL });
    await admin.query('DROP SCHEMA IF EXISTS sa_test CASCADE; CREATE SCHEMA sa_test');
    await admin.end();
    pool = new Pool({ connectionString: URL, options: '-c search_path=sa_test' });
    await pool.query(`
      CREATE TABLE faculty (faculty_id TEXT PRIMARY KEY, name TEXT, email TEXT, department TEXT);
      CREATE TABLE students (roll_number TEXT PRIMARY KEY, name TEXT, email TEXT, year TEXT, batch TEXT, section TEXT, department TEXT, phone TEXT, photo_url TEXT,
        linkedin_url TEXT, faculty_mentor_id TEXT, cgpa NUMERIC DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE mentor_assignments (roll_number TEXT PRIMARY KEY, faculty_id TEXT, assigned_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE academics (student_id TEXT, semester_gpa NUMERIC);
      CREATE TABLE coding_profiles (student_id TEXT, platform TEXT, handle TEXT, score_rating INT, easy_count INT, medium_count INT, hard_count INT, repositories_count INT);
      CREATE TABLE subject_allotments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester_label TEXT, subject_name TEXT, section TEXT, department TEXT,
        faculty_email TEXT, academic_year TEXT DEFAULT ${AY_NOW_SQL});
      CREATE TABLE subject_rosters (allotment_id UUID, roll_number TEXT, joining_date DATE);
      CREATE TABLE attendance_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), allotment_id UUID, session_date DATE, period_start INT, num_periods INT DEFAULT 1);
      CREATE TABLE attendance_records (session_id UUID, roll_number TEXT, is_present BOOLEAN);
      INSERT INTO faculty VALUES ('F1', 'Ramesh K', 'ramesh@rgmcet.edu.in', 'CSE'), ('F2', 'Lakshmi S', 'lakshmi@rgmcet.edu.in', 'ECE');
      INSERT INTO students (roll_number, name, email, year, section, department, phone, faculty_mentor_id) VALUES
        ('24091A0501', 'Ravi', 'r@x', '2nd Year', 'A', 'CSE', '9000000001', 'F1'),
        ('24091A0502', 'Sita', 's@x', '2nd Year', 'Sec A', 'CSE', '9000000002', NULL),
        ('24091A0401', 'Arun', 'a@x', '2nd Year', 'A', 'ECE', NULL, 'F2');
      INSERT INTO mentor_assignments (roll_number, faculty_id) VALUES ('24091A0502', 'F1');`);
    const al = (await pool.query(`INSERT INTO subject_allotments (semester_label, subject_name, section, department) VALUES ('2-1', 'DBMS', 'A', 'CSE') RETURNING id`)).rows[0].id;
    const old = (await pool.query(`INSERT INTO subject_allotments (semester_label, subject_name, section, department, academic_year) VALUES ('1-2', 'C', 'A', 'CSE', '2001–02') RETURNING id`)).rows[0].id;
    await pool.query(`INSERT INTO subject_rosters VALUES ($1, '24091A0501', NULL), ($1, '24091A0502', NULL), ($2, '24091A0501', NULL)`, [al, old]);
    // 4 classes this year: Ravi present 1 of 4 (absent today), Sita present 4 of 4; an old-year class must not count
    for (const [date, ravi] of [[daysAgo(60), true], [daysAgo(10), false], [daysAgo(2), false], [today, false]] as const) {
      const sid = (await pool.query(`INSERT INTO attendance_sessions (allotment_id, session_date, period_start) VALUES ($1, $2, 1) RETURNING id`, [al, date])).rows[0].id;
      await pool.query(`INSERT INTO attendance_records VALUES ($1, '24091A0501', $2), ($1, '24091A0502', true)`, [sid, ravi]);
    }
    const os = (await pool.query(`INSERT INTO attendance_sessions (allotment_id, session_date, period_start) VALUES ($1, '2002-01-10', 1) RETURNING id`, [old])).rows[0].id;
    await pool.query(`INSERT INTO attendance_records VALUES ($1, '24091A0501', true)`, [os]);

    db.query.mockReset();
    db.query.mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM super_admin_credentials')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('FROM hod_credentials')) return { rows: [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }], rowCount: 1 };
      try { return await pool.query(sql, params); } catch (e: any) { if (e.code === '42P01') return { rows: [], rowCount: 0 }; throw e; }
    });
  });
  afterAll(async () => { await pool?.end(); });

  it('shows a mentor this year\'s attendance of both kinds of mentees; never to a student', async () => {
    const res = await request(app).get('/faculty/mentees/by-email/ramesh@rgmcet.edu.in').set('Authorization', tok('faculty', 'ramesh@rgmcet.edu.in'));
    expect(res.status).toBe(200);
    const byRoll = Object.fromEntries(res.body.mentees.map((m: any) => [m.roll_number, m.attendance]));
    expect(byRoll['24091A0501']).toMatchObject({ held: 4, attended: 1, pct: 25, held_30: 3, attended_30: 0, pct_30: 0, absent_today: 1, last_absent: today });
    expect(byRoll['24091A0502']).toMatchObject({ held: 4, attended: 4, pct: 100, absent_today: 0, last_absent: null });

    const student = await request(app).get('/faculty/mentees/by-email/ramesh@rgmcet.edu.in').set('Authorization', tok('student', '24091a0501@rgmcet.edu.in', { reg: '24091A0501' }));
    expect(student.body.mentees?.every((m: any) => m.attendance === undefined)).toBe(true);
  });

  it('lists every department for the Principal, with mentor and attendance; filters by section and below 75%', async () => {
    const all = await request(app).get('/student-directory').set('Authorization', tok('principal', 'principal@rgmcet.edu.in'));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ scope: 'All', total: 3 });
    const ravi = all.body.rows.find((r: any) => r.roll_number === '24091A0501');
    expect(ravi).toMatchObject({ mentor_name: 'Ramesh K', phone: '9000000001', attendance: { pct: 25 } });
    expect(all.body.rows.find((r: any) => r.roll_number === '24091A0502').mentor_name).toBe('Ramesh K');   // via mentor_assignments
    expect(all.body.rows.find((r: any) => r.roll_number === '24091A0401').attendance).toBeNull();

    const ece = await request(app).get('/student-directory?department=ECE').set('Authorization', tok('principal', 'principal@rgmcet.edu.in'));
    expect(ece.body.rows.map((r: any) => r.roll_number)).toEqual(['24091A0401']);
    const secA = await request(app).get('/student-directory?department=CSE&section=A').set('Authorization', tok('principal', 'principal@rgmcet.edu.in'));
    expect(secA.body.error).toBeUndefined();
    expect(secA.body.total).toBe(2);   // 'A' and 'Sec A'
    const low = await request(app).get('/student-directory?low=1').set('Authorization', tok('principal', 'principal@rgmcet.edu.in'));
    expect(low.body.rows.map((r: any) => r.roll_number)).toEqual(['24091A0501']);
    const search = await request(app).get('/student-directory?search=sit').set('Authorization', tok('principal', 'principal@rgmcet.edu.in'));
    expect(search.body.rows.map((r: any) => r.name)).toEqual(['Sita']);
  });

  it('keeps a HOD to their department whatever they ask for; students cannot open it', async () => {
    const hod = await request(app).get('/student-directory?department=ECE').set('Authorization', tok('hod', 'hodcse@rgmcet.edu.in', { department: 'CSE' }));
    expect(hod.status).toBe(200);
    expect(hod.body.scope).toBe('CSE');
    expect(hod.body.rows.map((r: any) => r.department)).toEqual(['CSE', 'CSE']);
    const student = await request(app).get('/student-directory').set('Authorization', tok('student', '24091a0501@rgmcet.edu.in', { reg: '24091A0501' }));
    expect(student.status).toBe(403);
  });
});
