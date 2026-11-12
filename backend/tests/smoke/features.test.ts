/**
 * tests/smoke/features.test.ts
 * Management features: risk alerts, monthly report, feedback, placement drives, appraisal,
 * accreditation pack, parent alerts, live-code attendance, CO-PO, alumni, exam planner.
 */
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'features-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

type Route = [RegExp | string, any[] | ((sql: string, params: any[]) => any[])];

function routeDb(routes: Route[]) {
  const calls: { sql: string; params: any[] }[] = [];
  const all: Route[] = [...routes, ['FROM super_admin_credentials', [{ '?column?': 1 }]]];
  db.query.mockReset();
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

export const bearer = (role: string, email: string, reg?: string) => `Bearer ${signSessionToken({ role, email, reg })}`;
const ADMIN = () => bearer('admin', 'admin@rgmcet.edu.in');
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

afterAll(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('FT001 risk alerts', () => {
  const students = [
    // attendance 60% (40) + CGPA 4.8 (25) + no meeting (10) + no coding (5) = 80 → high
    { roll_number: '23091A3201', name: 'A', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', cgpa: '4.80', coding_profiles: 0, last_meeting: null, gpa_drop: null },
    // attendance 72% (25) → medium (meeting recent, coding linked, good CGPA)
    { roll_number: '23091A3202', name: 'B', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', cgpa: '8.10', coding_profiles: 2, last_meeting: daysAgo(5), gpa_drop: null },
    // GPA drop 1.2 (15) + meeting 90 days ago (10) = 25 → medium
    { roll_number: '23091A3203', name: 'C', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', cgpa: '7.40', coding_profiles: 1, last_meeting: daysAgo(90), gpa_drop: '1.20' },
    // all fine → low
    { roll_number: '23091A3204', name: 'D', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', cgpa: '9.00', coding_profiles: 3, last_meeting: daysAgo(10), gpa_drop: '0.10' },
  ];
  const attendance = [
    { roll_number: '23091A3201', held: '100', attended: '60', name: 'A', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', semester: '3-1' },
    { roll_number: '23091A3202', held: '100', attended: '72', name: 'B', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', semester: '3-1' },
    { roll_number: '23091A3203', held: '100', attended: '90', name: 'C', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', semester: '3-1' },
    { roll_number: '23091A3204', held: '100', attended: '95', name: 'D', department: 'CSE (Data Science)', year: '3rd Year', section: 'A', semester: '3-1' },
  ];

  it('scores and ranks flagged students with reasons', async () => {
    routeDb([['FROM students st', students], ['WITH cur AS', attendance]]);
    const res = await request(app).get('/risk/students').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 4, high: 1, medium: 2, low: 1 });
    expect(res.body.students.map((s: any) => [s.roll_number, s.score, s.level])).toEqual([
      ['23091A3201', 80, 'high'], ['23091A3202', 25, 'medium'], ['23091A3203', 25, 'medium'],
    ]);
    const a = res.body.students.find((s: any) => s.roll_number === '23091A3201');
    expect(a.reasons.map((r: any) => r.code)).toEqual(['attendance_critical', 'cgpa_critical', 'no_mentoring', 'no_coding']);
  });

  it('scopes a faculty member to their mentees and an HOD to their department', async () => {
    let calls = routeDb([['SELECT faculty_id FROM faculty', [{ faculty_id: 'FAC9' }]]]);
    await request(app).get('/risk/students').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    let q = calls.find(c => c.sql.includes('FROM students st'))!;
    expect(q.sql).toContain('mentor_assignments');
    expect(q.params[0]).toBe('FAC9');

    calls = routeDb([['FROM hod_credentials', [{ department: 'ECE' }]]]);
    await request(app).get('/risk/students').set('Authorization', bearer('hod', 'hece@rgmcet.edu.in'));
    q = calls.find(c => c.sql.includes('FROM students st'))!;
    expect(q.sql).toContain('st.department = $1');
    expect(q.params[0]).toBe('ECE');
  });

  it('is not available to students (they use /risk/me)', async () => {
    routeDb([]);
    const res = await request(app).get('/risk/students').set('Authorization', bearer('student', '23091a3201@rgmcet.edu.in'));
    expect(res.status).toBe(403);
  });
});
