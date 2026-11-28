/**
 * tests/integration/timetableMerge.test.ts — saving timetable slots joins back-to-back periods into one class,
 * and older timetables are merged once, on a real Postgres. Runs only when FS_TEST_DATABASE_URL is set.
 */
import request from 'supertest';
import { Pool } from 'pg';

const URL = process.env.FS_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
jest.setTimeout(60000);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'tt-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');
const ADMIN = () => `Bearer ${signSessionToken({ role: 'admin', email: 'admin@rgmcet.edu.in' })}`;
let pool: Pool;

d('Timetable merging (real Postgres)', () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: URL });
    await admin.query('DROP SCHEMA IF EXISTS tt_test CASCADE; CREATE SCHEMA tt_test');
    await admin.end();
    pool = new Pool({ connectionString: URL, options: '-c search_path=tt_test' });
    await pool.query(`
      CREATE TABLE timetable_entries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester_label VARCHAR(5) NOT NULL, department VARCHAR(50) NOT NULL DEFAULT '',
        section VARCHAR(10) NOT NULL DEFAULT '', day_of_week VARCHAR(10) NOT NULL, period_start INT NOT NULL, num_periods INT NOT NULL DEFAULT 1,
        subject_name VARCHAR(200) NOT NULL, subject_type VARCHAR(10) NOT NULL DEFAULT 'Theory', faculty_email VARCHAR(100), faculty_name VARCHAR(100), room_no VARCHAR(20),
        UNIQUE(semester_label, department, section, day_of_week, period_start));
      -- an older timetable entered period by period
      INSERT INTO timetable_entries (semester_label, department, section, day_of_week, period_start, subject_name, subject_type, faculty_email) VALUES
        ('3-1', 'ECE', 'B', 'Monday', 5, 'VLSI Lab', 'Lab', 'f@rgmcet.edu.in'), ('3-1', 'ECE', 'B', 'Monday', 6, 'VLSI Lab', 'Lab', 'f@rgmcet.edu.in'),
        ('3-1', 'ECE', 'B', 'Monday', 7, 'VLSI Lab', 'Lab', 'f@rgmcet.edu.in');`);
    db.query.mockReset();
    db.query.mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM super_admin_credentials')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      try { return await pool.query(sql, params); } catch (e: any) { if (e.code === '42P01') return { rows: [], rowCount: 0 }; throw e; }
    });
    db.transaction.mockImplementation(async (cb: any) => {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const r = await cb(c); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    });
  });
  afterAll(async () => { await pool?.end(); });

  it('merges an older period-by-period timetable once, when the timetable is first read', async () => {
    const res = await request(app).get('/attendance/timetable?semester=3-1&section=B').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    const rows = (await pool.query(`SELECT period_start, num_periods FROM timetable_entries WHERE subject_name = 'VLSI Lab'`)).rows;
    expect(rows).toEqual([{ period_start: 5, num_periods: 3 }]);
    expect((await pool.query(`SELECT note FROM app_migrations WHERE name = 'timetable-merge-v1'`)).rows[0].note).toBe('1 classes merged');
  });

  it('joins slots saved one at a time into one class and warns about a 1-hour lab', async () => {
    const save = (period: number, subject: string, type = 'Theory') => request(app).post('/attendance/timetable/upload').set('Authorization', ADMIN())
      .send({ semester: '2-1', department: 'CSE', section: 'A', entries: [{ day_of_week: 'Wednesday', period_start: period, num_periods: 1, subject_name: subject, subject_type: type, faculty_email: 'ramesh@rgmcet.edu.in' }] });
    expect((await save(3, 'DBMS')).body.merged).toEqual([]);
    const second = await save(4, 'DBMS');
    expect(second.body.merged).toEqual(['DBMS on Wednesday P3–4']);
    expect(second.body.message).toContain('Joined back-to-back periods: DBMS on Wednesday P3–4');
    expect((await pool.query(`SELECT period_start, num_periods FROM timetable_entries WHERE subject_name = 'DBMS'`)).rows).toEqual([{ period_start: 3, num_periods: 2 }]);

    const lab = await save(6, 'Java Lab', 'Lab');
    expect(lab.body.warnings).toEqual([expect.stringContaining('Java Lab (lab) on Wednesday P6 is only 1 hour')]);
    // lunch keeps P4 and P5 apart
    await save(5, 'DBMS');
    expect((await pool.query(`SELECT period_start, num_periods FROM timetable_entries WHERE subject_name = 'DBMS' ORDER BY period_start`)).rows)
      .toEqual([{ period_start: 3, num_periods: 2 }, { period_start: 5, num_periods: 1 }]);
  });
});
