/**
 * tests/smoke/attendance.test.ts
 * Attendance posting, not-posted tracking, academic-calendar lock, and admin controls.
 * The DB is the shared jest mock; each test routes SQL text to canned rows.
 */
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'attendance-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

type Route = [RegExp | string, any[] | ((sql: string, params: any[]) => any[])];

/** Route db.query by SQL text; unmatched queries return no rows. Records every call. */
function routeDb(routes: Route[]) {
  const calls: { sql: string; params: any[] }[] = [];
  db.query.mockReset();
  // The admin session is verified against super_admin_credentials on every request
  const all: Route[] = [...routes, ['FROM super_admin_credentials', [{ '?column?': 1 }]]];
  db.query.mockImplementation(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    for (const [match, rows] of all) {
      const hit = typeof match === 'string' ? sql.includes(match) : match.test(sql);
      if (hit) {
        const r = typeof rows === 'function' ? rows(sql, params) : rows;
        return { rows: r, rowCount: r.length };
      }
    }
    return { rows: [], rowCount: 0 };
  });
  return calls;
}

const bearer = (role: string, email: string) => `Bearer ${signSessionToken({ role, email })}`;
const ADMIN = () => bearer('admin', 'admin@rgmcet.edu.in');
const FACULTY = () => bearer('faculty', 'ramesh@rgmcet.edu.in');

afterAll(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /attendance/not-posted', () => {
  // 2026-11-09 is a Monday
  const slot = (department: string, subject = 'DBMS') => ({
    id: `${department}-${subject}`, day_of_week: 'Monday', department, semester_label: '3-1', section: 'A',
    subject_name: subject, period_start: 1, num_periods: 1, faculty_email: 'ramesh@rgmcet.edu.in',
  });

  it('does not crash and reads holiday titles', async () => {
    const calls = routeDb([
      ['FROM holiday_calendar', [{ date: '2026-11-10', holiday_name: 'Founders Day' }]],
      ['FROM timetable_entries', [slot('CSE (Data Science)')]],
    ]);
    const res = await request(app)
      .get('/attendance/not-posted?from=2026-11-09&to=2026-11-10')
      .set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(calls.find(c => c.sql.includes('FROM holiday_calendar'))!.sql).toContain('title AS holiday_name');
    const holiday = res.body.byDate.find((d: any) => d.date === '2026-11-10');
    expect(holiday).toMatchObject({ isWorkingDay: false, holidayName: 'Founders Day' });
  });

  it('does not count another department’s session as posted', async () => {
    routeDb([
      ['FROM timetable_entries', [slot('CSE (Data Science)'), slot('ECE')]],
      ['FROM attendance_sessions s', [{ department: 'ECE', semester_label: '3-1', section: 'A', subject_name: 'DBMS', period_start: 1 }]],
    ]);
    const res = await request(app).get('/attendance/not-posted?date=2026-11-09').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total_scheduled: 2, total_posted: 1, total_pending: 1 });
    expect(res.body.byDate[0].pendingSlots.map((p: any) => p.department)).toEqual(['CSE (Data Science)']);
  });
});

describe('POST /attendance/no-class-request', () => {
  it('reads the faculty name from faculty.name and saves the request', async () => {
    const calls = routeDb([['name AS faculty_name FROM faculty', [{ faculty_name: 'Dr. Ramesh' }]]]);
    const res = await request(app)
      .post('/attendance/no-class-request')
      .set('Authorization', FACULTY())
      .send({ date: '2026-11-09', semester_label: '3-1', department: 'CSE (Data Science)', section: 'a', subject_name: 'DBMS', period_start: 1, reason: 'Exam' });
    expect(res.status).toBe(200);
    // the old query selected a non-existent faculty.faculty_name column
    expect(calls.some(c => /SELECT faculty_name FROM faculty/.test(c.sql))).toBe(false);
    const insert = calls.find(c => c.sql.includes('INSERT INTO attendance_no_class_requests'))!;
    expect(insert.params[1]).toBe('Dr. Ramesh');
    expect(insert.params[5]).toBe('A');
  });
});
