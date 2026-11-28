/**
 * tests/integration/qualityOverview.test.ts — runs GET /quality/overview against a real Postgres, so its SQL
 * (JSONB coverage counts, department grouping, academic-year filter) is executed for real.
 * Runs only when FS_TEST_DATABASE_URL is set (same switch as the faculty-selection race test).
 */
import request from 'supertest';
import { Pool } from 'pg';
import { AY_NOW_SQL } from '../../src/db/allotmentYear';

const URL = process.env.FS_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
jest.setTimeout(60000);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'overview-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

const OURS = /subject_allotments|course_exec_|lesson_plans|dept_events|event_requests|subject_syllabi|dept_meetings|CREATE |ALTER /;
let pool: Pool;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => ymd(new Date(Date.now() + 5.5 * 3600000 + n * 86400000));

d('Department progress overview (real Postgres)', () => {
  beforeAll(async () => {
    // a schema of its own, so this test never touches the tables other integration tests use
    const admin = new Pool({ connectionString: URL });
    await admin.query('DROP SCHEMA IF EXISTS qo_test CASCADE; CREATE SCHEMA qo_test');
    await admin.end();
    pool = new Pool({ connectionString: URL, options: '-c search_path=qo_test' });
    await pool.query(`DROP TABLE IF EXISTS subject_allotments, course_exec_plans, course_exec_settings, lesson_plans, dept_events, event_requests CASCADE`);
    await pool.query(`CREATE TABLE subject_allotments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester_label TEXT NOT NULL DEFAULT '2-2',
      subject_name TEXT NOT NULL DEFAULT 'X', subject_type TEXT NOT NULL DEFAULT 'Theory', section TEXT NOT NULL DEFAULT 'A',
      faculty_email TEXT NOT NULL DEFAULT 'f@x', faculty_name TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT '', co_faculty_email TEXT, academic_year TEXT DEFAULT ${AY_NOW_SQL})`);
    // forward the app's queries on these tables to the real database; answer login checks here
    db.query.mockReset();
    db.query.mockImplementation(async (sql: string, params: any[] = []) => {
      if (OURS.test(sql)) return pool.query(sql, params);
      if (sql.includes('super_admin_credentials')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('hod_credentials')) return { rows: [{ email: 'hodece@rgmcet.edu.in', department: 'ECE' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    // create the quality tables through the app itself
    await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'principal', email: 'principal@rgmcet.edu.in' })}`);

    const ins = async (dept: string) => (await pool.query(`INSERT INTO subject_allotments (department) VALUES ($1) RETURNING id`, [dept])).rows[0].id;
    const cse = [await ins('CSE'), await ins('CSE'), await ins('CSE'), await ins('CSE')];
    const ece = [await ins('ECE'), await ins('ECE')];
    const ds = [await ins('CSE (Data Science)'), await ins('CSE(Data Science)')];   // two spellings, one department
    await pool.query(`INSERT INTO course_exec_plans (allotment_id, department, progress) VALUES ($1,'CSE',95), ($2,'CSE',40), ($3,'CSE (Data Science)',100)`, [cse[0], cse[1], ds[0]]);
    await pool.query(`INSERT INTO course_exec_settings (dept_key, department, due_date) VALUES ('cse','CSE',$1)`, [daysFromNow(-3)]);
    const topics = (n: number, covered: number, past: boolean) => JSON.stringify(Array.from({ length: n }, (_, i) => ({
      id: `t${i}`, topic: `T${i}`, planned_date: past ? daysFromNow(-10 + i) : daysFromNow(10 + i), covered_on: i < covered ? daysFromNow(-5) : null })));
    await pool.query(`INSERT INTO lesson_plans (allotment_id, faculty_email, status, topics) VALUES
      ($1,'f@x','approved',$4), ($2,'f@x','submitted',$5), ($3,'f@x','approved',$6)`,
      [cse[0], cse[1], ece[0], topics(4, 1, true), topics(4, 0, false), topics(2, 2, true)]);
    const ay = (await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'principal', email: 'principal@rgmcet.edu.in' })}`)).body.academic_year;
    await pool.query(`INSERT INTO dept_events (academic_year, department, event_type, title, start_date, end_date, status, budget, participation) VALUES
      ($1,'CSE','Workshop','W1',$2,$2,'approved',5000,'organized'), ($1,'CSE','Seminar','S1',$2,$2,'submitted',NULL,'organized'),
      ($1,'ECE','FDP','F1',$2,$2,'approved',1200,'attended'), ('2019–20','CSE','Workshop','old',$2,$2,'approved',999,'organized')`, [ay, daysFromNow(-20)]);
    await pool.query(`INSERT INTO event_requests (department, title, start_date, data, created_by) VALUES
      ('CSE','past, no report',$1,$2,'f@x'), ('CSE','future',$3,$4,'f@x')`,
      [daysFromNow(-7), JSON.stringify({ from_date: daysFromNow(-7), to_date: daysFromNow(-6), honorarium: '10000', travel: '2000' }),
        daysFromNow(14), JSON.stringify({ from_date: daysFromNow(14), lodging: '1500' })]);
  });
  afterAll(async () => { await pool?.end(); });

  it('principal sees every department with the right counts', async () => {
    const res = await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'principal', email: 'principal@rgmcet.edu.in' })}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('All');
    const by = Object.fromEntries(res.body.departments.map((x: any) => [x.key, x]));
    expect(Object.keys(by).sort()).toEqual(['cse', 'csedatascience', 'ece']);
    expect(by.cse.plans).toEqual({ total: 4, not_started: 2, in_progress: 1, ready: 1 });
    expect(by.cse.plans_due).toBe(daysFromNow(-3));
    expect(by.csedatascience.plans).toEqual({ total: 2, not_started: 1, in_progress: 0, ready: 1 });
    expect(by.cse.lessons).toMatchObject({ total: 4, approved: 1, submitted: 1, missing: 2, behind: 1, coverage_pct: 13 });   // 1 of 8 topics covered
    expect(by.ece.lessons).toMatchObject({ total: 2, approved: 1, behind: 0, coverage_pct: 100 });
    expect(by.cse.events).toMatchObject({ total: 2, approved: 1, awaiting_hod: 1, spent: 5000 });   // the 2019–20 event is not counted
    expect(by.ece.events).toMatchObject({ approved: 1, attended: 1, spent: 1200 });
    expect(by.cse.requests).toEqual({ total: 2, reports_due: 1, upcoming: 1, requested: 13500, awaiting_hod: 0, awaiting_principal: 0, approved: 0 });
  });

  it('counts requests waiting for the HOD and the Principal', async () => {
    await pool.query(`UPDATE event_requests SET status = 'recommended' WHERE title = 'future'`);
    await pool.query(`UPDATE event_requests SET status = 'submitted' WHERE title = 'past, no report'`);
    const res = await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'principal', email: 'principal@rgmcet.edu.in' })}`);
    const cse = res.body.departments.find((x: any) => x.key === 'cse');
    expect(cse.requests).toMatchObject({ awaiting_hod: 1, awaiting_principal: 1, approved: 0 });
  });

  it('a HOD sees only their own department', async () => {
    const res = await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'hod', email: 'hodece@rgmcet.edu.in', department: 'ECE' })}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('ECE');
    expect(res.body.departments.map((x: any) => x.key)).toEqual(['ece']);
  });

  it('faculty cannot open it', async () => {
    const res = await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'faculty', email: 'f@x' })}`);
    expect(res.status).toBe(403);
  });
});
