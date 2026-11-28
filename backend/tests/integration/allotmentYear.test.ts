/**
 * tests/integration/allotmentYear.test.ts — subject allotments belong to an academic year, on a real Postgres:
 * the start-up migration (backfill, old uniqueness rule replaced, default year), lists showing one year,
 * starting a new year from last year's allotments, copying an earlier lesson plan, and the safer delete.
 * Runs only when FS_TEST_DATABASE_URL is set.
 */
import request from 'supertest';
import { Pool } from 'pg';
import { ALLOTMENT_YEAR_DDL } from '../../src/db/allotmentYear';

const URL = process.env.FS_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
jest.setTimeout(60000);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'ay-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

const ayOf = (d: Date) => { const ist = new Date(d.getTime() + 330 * 60000); const y = ist.getUTCFullYear(); const s = ist.getUTCMonth() + 1 >= 6 ? y : y - 1; return `${s}–${String(s + 1).slice(-2)}`; };
const NOW = ayOf(new Date());
const PREV = `${Number(NOW.slice(0, 4)) - 1}–${NOW.slice(2, 4)}`;
const NEXT = `${Number(NOW.slice(0, 4)) + 1}–${String(Number(NOW.slice(0, 4)) + 2).slice(-2)}`;
const startOf = (ay: string) => Number(ay.slice(0, 4));

const FAC = 'ramesh@rgmcet.edu.in';
const tok = (role: string, email: string, extra: any = {}) => `Bearer ${signSessionToken({ role, email, ...extra })}`;
const ADMIN = () => tok('admin', 'admin@rgmcet.edu.in');
const HOD = () => tok('hod', 'hodcse@rgmcet.edu.in', { department: 'CSE' });
const FACULTY = () => tok('faculty', FAC);

let pool: Pool;
const ids: Record<string, string> = {};

d('Allotments by academic year (real Postgres)', () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: URL });
    await admin.query('DROP SCHEMA IF EXISTS ay_test CASCADE; CREATE SCHEMA ay_test');
    await admin.end();
    pool = new Pool({ connectionString: URL, options: '-c search_path=ay_test' });
    // the tables as production has them before this change (same definition as db/index.ts)
    await pool.query(`
      CREATE TABLE subject_allotments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester_label VARCHAR(5) NOT NULL, subject_name VARCHAR(200) NOT NULL,
        subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('Theory', 'Lab')), section VARCHAR(10) NOT NULL DEFAULT '',
        faculty_email VARCHAR(100) NOT NULL, faculty_name VARCHAR(100) NOT NULL DEFAULT '', department VARCHAR(50) NOT NULL DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, UNIQUE(semester_label, subject_name, section, faculty_email));
      CREATE TABLE subject_rosters (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), allotment_id UUID NOT NULL REFERENCES subject_allotments(id) ON DELETE CASCADE,
        roll_number VARCHAR(10) NOT NULL, student_email VARCHAR(100) NOT NULL DEFAULT '', joining_date DATE DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(allotment_id, roll_number));
      CREATE TABLE attendance_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), allotment_id UUID NOT NULL REFERENCES subject_allotments(id) ON DELETE CASCADE,
        session_date DATE NOT NULL, period_start INT NOT NULL, num_periods INT NOT NULL DEFAULT 1, recorded_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(allotment_id, session_date, period_start));
      CREATE TABLE attendance_records (id SERIAL PRIMARY KEY, session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE, roll_number TEXT, is_present BOOLEAN);
      CREATE TABLE students (roll_number TEXT PRIMARY KEY, name TEXT, department TEXT, batch TEXT, section TEXT, year TEXT, email TEXT);
      CREATE TABLE timetable_entries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester_label TEXT, department TEXT, section TEXT, day_of_week TEXT,
        period_start INT, num_periods INT, subject_name TEXT, subject_type TEXT, room_no TEXT, faculty_email TEXT, faculty_name TEXT);
      INSERT INTO students VALUES ('24091A0501', 'Ravi', 'CSE', '2024', 'A', '2nd Year', '');`);
    const add = async (key: string, created: string, extra = '') => {
      ids[key] = (await pool.query(
        `INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, faculty_name, department, created_at)
         VALUES ('2-1', $1, 'Theory', 'A', $2, 'Ramesh', 'CSE', $3) RETURNING id`, [`DBMS${extra}`, FAC, created])).rows[0].id;
    };
    const s = startOf(PREV);
    await add('taught_last_year', `${s}-07-01`);
    await add('allotted_in_may', `${s + 1}-05-20`, ' Lab');   // made in advance in May, taught from July: belongs to this year
    await add('this_year_untaught', `${s + 1}-07-02`, ' II');
    await pool.query(`INSERT INTO attendance_sessions (allotment_id, session_date, period_start) VALUES ($1, $2, 1), ($1, $3, 2)`,
      [ids.taught_last_year, `${s}-08-10`, `${s}-09-10`]);
    await pool.query(`INSERT INTO attendance_sessions (allotment_id, session_date, period_start) VALUES ($1, $2, 1)`, [ids.allotted_in_may, `${s + 1}-08-05`]);
    const sess = (await pool.query(`SELECT id FROM attendance_sessions WHERE allotment_id = $1 ORDER BY session_date LIMIT 1`, [ids.taught_last_year])).rows[0].id;
    await pool.query(`INSERT INTO attendance_records (session_id, roll_number, is_present) VALUES ($1, '24091A0501', true)`, [sess]);
    await pool.query(`INSERT INTO subject_rosters (allotment_id, roll_number, joining_date) VALUES ($1, '24091A0501', $2)`, [ids.taught_last_year, `${s}-07-01`]);

    // the start-up migration, twice (it runs on every cold start)
    for (let i = 0; i < 2; i++) for (const stmt of ALLOTMENT_YEAR_DDL) await pool.query(stmt);

    db.query.mockReset();
    db.query.mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM super_admin_credentials')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('FROM hod_credentials')) return { rows: [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }], rowCount: 1 };
      try { return await pool.query(sql, params); } catch (e: any) {
        if (e.code === '42P01') return { rows: [], rowCount: 0 };   // a table this test doesn't create
        throw e;
      }
    });
  });
  afterAll(async () => { await pool?.end(); });

  it('gives existing allotments the year they were taught in and replaces the old uniqueness rule', async () => {
    const r = await pool.query('SELECT id, academic_year FROM subject_allotments');
    const year = (k: string) => r.rows.find((x: any) => x.id === ids[k]).academic_year;
    expect(year('taught_last_year')).toBe(PREV);
    expect(year('allotted_in_may')).toBe(NOW);      // its classes are in this year
    expect(year('this_year_untaught')).toBe(NOW);
    // the same semester + subject + section + faculty again next year is allowed …
    await pool.query(`INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, department, academic_year)
                      VALUES ('2-1', 'DBMS', 'Theory', 'A', $1, 'CSE', $2)`, [FAC, NOW]);
    // … but not twice in the same year
    await expect(pool.query(`INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, department, academic_year)
                      VALUES ('2-1', 'DBMS', 'Theory', 'A', $1, 'CSE', $2)`, [FAC, NOW])).rejects.toThrow(/duplicate/);
    // an insert that forgets the year gets the year in progress
    const def = await pool.query(`INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, department)
                                  VALUES ('3-1', 'CN', 'Theory', 'B', $1, 'CSE') RETURNING academic_year`, [FAC]);
    expect(def.rows[0].academic_year).toBe(NOW);
    await pool.query(`DELETE FROM subject_allotments WHERE subject_name = 'CN'`);
    ids.dbms_now = (await pool.query(`SELECT id FROM subject_allotments WHERE subject_name = 'DBMS' AND academic_year = $1`, [NOW])).rows[0].id;
  });

  it('lists one academic year at a time and creates allotments in the chosen year', async () => {
    const now = await request(app).get('/attendance/allotments').set('Authorization', ADMIN());
    expect(now.status).toBe(200);
    expect(now.body.map((a: any) => a.academic_year)).toEqual(expect.arrayContaining([NOW]));
    expect(now.body.every((a: any) => a.academic_year === NOW)).toBe(true);
    const past = await request(app).get(`/attendance/allotments?ay=${PREV.replace('–', '-')}`).set('Authorization', ADMIN());
    expect(past.body.map((a: any) => a.id)).toEqual([ids.taught_last_year]);
    const mine = await request(app).get('/attendance/my-subjects').set('Authorization', FACULTY());
    expect(mine.body.map((a: any) => a.id)).not.toContain(ids.taught_last_year);

    // allotting next year's DBMS creates a new allotment instead of reusing this year's
    const nextYear = await request(app).post('/attendance/allotments/single').set('Authorization', ADMIN()).send({
      semester: '2-1', department: 'CSE', section: 'A', subject_name: 'DBMS', subject_type: 'Theory', faculty_email: FAC, faculty_name: 'Ramesh',
      academic_year: NEXT.replace('–', '-') });
    expect(nextYear.status).toBe(200);
    expect(nextYear.body.allotment.academic_year).toBe(NEXT);
    expect(nextYear.body.allotment.id).not.toBe(ids.dbms_now);
    await pool.query('DELETE FROM subject_allotments WHERE id = $1', [nextYear.body.allotment.id]);

    const years = await request(app).get('/academic-years').set('Authorization', FACULTY());
    expect(years.body).toMatchObject({ current: NOW, next: NEXT });
    expect(years.body.years).toEqual(expect.arrayContaining([NEXT, NOW, PREV]));
  });

  it("starts a new year from last year's allotments, once", async () => {
    const first = await request(app).post('/attendance/allotments/copy-year').set('Authorization', HOD()).send({ from: PREV, to: NEXT });
    expect(first.body.error).toBeUndefined();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ created: 1, source_count: 1, department: 'CSE' });
    const again = await request(app).post('/attendance/allotments/copy-year').set('Authorization', HOD()).send({ from: PREV, to: NEXT });
    expect(again.body.created).toBe(0);
    const copy = (await pool.query(`SELECT * FROM subject_allotments WHERE academic_year = $1`, [NEXT])).rows;
    expect(copy.map((a: any) => a.subject_name)).toEqual(['DBMS']);
    const rosters = await pool.query('SELECT COUNT(*)::int AS n FROM subject_rosters WHERE allotment_id = $1', [copy[0].id]);
    expect(rosters.rows[0].n).toBe(0);   // each new class gets its own roster
    ids.dbms_next = copy[0].id;
  });

  it("copies last year's lesson plan into this year's subject, with dates and coverage cleared", async () => {
    await request(app).get(`/lesson-plans/allotment/${ids.taught_last_year}`).set('Authorization', FACULTY());   // creates the quality tables
    await pool.query(
      `INSERT INTO lesson_plans (allotment_id, faculty_email, semester_label, subject_name, academic_year, objectives, topics, status)
       VALUES ($1, $2, '2-1', 'DBMS', $3, 'Understand databases', $4, 'approved')`,
      [ids.taught_last_year, FAC, PREV, JSON.stringify([{ id: 'tA1', unit: 1, topic: 'ER model', planned_date: `${startOf(PREV)}-08-10`, covered_on: `${startOf(PREV)}-08-10`, periods: 2 }])]);
    const src = await request(app).get(`/allotments/${ids.dbms_now}/copy-sources`).set('Authorization', FACULTY());
    expect(src.status).toBe(200);
    expect(src.body.can_copy).toBe(true);
    expect(src.body.sources.map((x: any) => [x.allotment_id, x.academic_year, x.lesson_topics, x.mine])).toEqual([[ids.taught_last_year, PREV, 1, true]]);

    const res = await request(app).post(`/allotments/${ids.dbms_now}/copy-from`).set('Authorization', FACULTY())
      .send({ source: ids.taught_last_year, parts: ['lesson_plan'] });
    expect(res.status).toBe(200);
    expect(res.body.copied).toEqual(['lesson_plan']);
    const p = (await pool.query('SELECT * FROM lesson_plans WHERE allotment_id = $1', [ids.dbms_now])).rows[0];
    expect(p).toMatchObject({ status: 'draft', academic_year: NOW, objectives: 'Understand databases' });
    expect(p.topics[0]).toMatchObject({ topic: 'ER model', planned_date: null, covered_on: null, periods: 2 });
    // a second copy never overwrites what is there now
    const again = await request(app).post(`/allotments/${ids.dbms_now}/copy-from`).set('Authorization', FACULTY())
      .send({ source: ids.taught_last_year, parts: ['lesson_plan'] });
    expect(again.body).toMatchObject({ copied: [], skipped: ['lesson_plan: already has topics'] });
    // only from the same subject
    const other = await request(app).post(`/allotments/${ids.dbms_now}/copy-from`).set('Authorization', FACULTY()).send({ source: ids.allotted_in_may });
    expect(other.status).toBe(400);
  });

  it('shows a student their latest year by default, and earlier years on request', async () => {
    await pool.query(`INSERT INTO subject_rosters (allotment_id, roll_number) VALUES ($1, '24091A0501')`, [ids.dbms_now]);
    const res = await request(app).get('/attendance/student/24091A0501').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.academic_year).toBe(NOW);
    expect(res.body.academic_years).toEqual([NOW, PREV]);
    expect(res.body.subjects.map((x: any) => x.allotment_id)).toEqual([ids.dbms_now]);
    const past = await request(app).get(`/attendance/student/24091A0501?ay=${encodeURIComponent(PREV)}`).set('Authorization', ADMIN());
    expect(past.body.subjects.map((x: any) => [x.allotment_id, x.periods_held])).toEqual([[ids.taught_last_year, 2]]);
  });

  it('asks before deleting an allotment that has attendance', async () => {
    const ask = await request(app).delete(`/attendance/allotments/${ids.taught_last_year}`).set('Authorization', ADMIN());
    expect(ask.status).toBe(409);
    expect(ask.body).toMatchObject({ code: 'HAS_ATTENDANCE', sessions: 2 });
    expect((await pool.query('SELECT 1 FROM subject_allotments WHERE id = $1', [ids.taught_last_year])).rowCount).toBe(1);
    const ok = await request(app).delete(`/attendance/allotments/${ids.taught_last_year}?confirm=1`).set('Authorization', ADMIN());
    expect(ok.body.error).toBeUndefined();
    expect(ok.status).toBe(200);
    // an allotment with no classes yet goes without asking
    expect((await request(app).delete(`/attendance/allotments/${ids.dbms_next}`).set('Authorization', ADMIN())).status).toBe(200);
  });
});
