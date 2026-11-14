/**
 * tests/smoke/audit-fixes.test.ts — regressions for bugs found in the all-roles audit (Nov 2026).
 */
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'audit-fixes-secret';
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
    for (const [m, rows] of all) {
      if (typeof m === 'string' ? sql.includes(m) : m.test(sql)) {
        const r = typeof rows === 'function' ? rows(sql, params) : rows;
        return { rows: r, rowCount: r.length };
      }
    }
    return { rows: [], rowCount: 0 };
  });
  return calls;
}
const bearer = (role: string, email: string, reg?: string) => `Bearer ${signSessionToken({ role, email, reg })}`;
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

describe('Audit fixes', () => {
  it('attendance not-posted: role filters are numbered after the day-of-week parameter', async () => {
    const calls = routeDb([['FROM faculty WHERE LOWER(email)', [{ department: 'CSE (Data Science)' }]]]);
    const res = await request(app).get('/attendance/not-posted?from=2026-11-09&to=2026-11-09').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    expect(res.status).toBe(200);
    const q = calls.find(c => c.sql.includes('FROM timetable_entries t WHERE t.day_of_week = $1'))!;
    expect(q.sql).toContain('LOWER(t.faculty_email) = LOWER($2)');
    expect(q.params).toEqual(['Monday', 'ramesh@rgmcet.edu.in']);
  });

  it('program chair student list builds valid SQL (no "s.s." prefix)', async () => {
    const calls = routeDb([]);
    await request(app).get('/students?limit=20').set('Authorization', bearer('program_chair', 'chair@rgmcet.edu.in'));
    const q = calls.find(c => /FROM students s/.test(c.sql) && c.sql.includes('ANY('));
    expect(q).toBeTruthy();
    expect(q!.sql).not.toContain('s.s.');
  });

  it('employability score counts staff-verified certificates (looked up by roll_number)', async () => {
    const calls = routeDb([
      ['FROM student_certifications', [{ certificate_name: 'AWS Certified Cloud Practitioner', issuer: 'Amazon Web Services', status: 'verified' }]],
    ]);
    const res = await request(app).get('/students/23091A3202/employability-score').set('Authorization', bearer('student', '23091a3202@rgmcet.edu.in', '23091A3202'));
    expect(res.status).toBe(200);
    expect(calls.find(c => c.sql.includes('FROM student_certifications'))!.sql).toContain('UPPER(roll_number) = $1');
    expect(res.body.certsScore).toBeGreaterThan(0);
  });

  it('a certificate entered by the student and also verified by staff counts once', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { calculateRPGScore } = require('../../src/services/employability');
    const one = calculateRPGScore({ certifications: [{ title: 'AWS Certified Cloud Practitioner', provider: 'AWS' }] });
    expect(one.certsBreakdown.totalCerts).toBe(1);
  });

  it('mentoring compliance reads names from the faculty table and locks a HOD to their department', async () => {
    const calls = routeDb([['FROM hod_credentials', [{ email: 'hcseds@rgmcet.edu.in', department: 'CSE (Data Science)' }]]]);
    const res = await request(app).get('/hod/mentoring-compliance?department=ECE').set('Authorization', bearer('hod', 'hcseds@rgmcet.edu.in'));
    expect(res.status).toBe(200);
    const q = calls.find(c => c.sql.includes('FROM mentor_meetings mm'))!;
    expect(q.sql).toContain('JOIN faculty fp');
    expect(q.params).toEqual(['CSE (Data Science)']);
  });

  it('faculty document review lists only their mentees; approving checks mentees by faculty_id', async () => {
    let calls = routeDb([]);
    const list = await request(app).get('/documents/download-zip-urls').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    expect(list.status).toBe(200);
    const q = calls.find(c => c.sql.includes('FROM student_documents sd'))!;
    expect(q.sql).toContain('UPPER(s.faculty_mentor_id) = UPPER(f.faculty_id)');
    calls = routeDb([]);
    const ok = await request(app).patch('/students/23091A3299/documents/5/status').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in')).send({ verification_status: 'Verified' });
    expect(ok.status).toBe(403); // not a mentee → refused (used to crash on a missing column)
    expect(calls.find(c => c.sql.includes('FROM students s'))!.sql).toContain('mentor_assignments ma');
  });

  it('notices: the table is created before use', async () => {
    const calls = routeDb([]);
    await request(app).get('/notices/broadcast').set('Authorization', bearer('admin', 'admin@rgmcet.edu.in'));
    expect(calls.some(c => c.sql.includes('CREATE TABLE IF NOT EXISTS notices'))).toBe(true);
  });
});
