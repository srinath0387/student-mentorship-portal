/**
 * tests/smoke/quality.test.ts — lesson plans, department meetings (minutes), event reports.
 */
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'quality-test-secret';
delete process.env.UPLOADS_BUCKET_NAME;
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
const FAC = () => bearer('faculty', 'ramesh@rgmcet.edu.in');
const HOD = () => bearer('hod', 'hodcseds@rgmcet.edu.in');
const HOD_ROW: Route = ['FROM hod_credentials', [{ email: 'hodcseds@rgmcet.edu.in', department: 'CSE (Data Science)' }]];
const AID = '11111111-2222-3333-4444-555555555555';
const allot = { id: AID, subject_name: 'DBMS', semester_label: '3-1', department: 'CSE (Data Science)', section: 'A', faculty_email: 'Ramesh@rgmcet.edu.in', faculty_name: 'Dr. K. Ramesh', co_faculty_email: null };
const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

describe('Lesson plans', () => {
  it('only the subject faculty can save; coverage dates are never overwritten by a plan edit', async () => {
    const calls = routeDb([
      ['SELECT * FROM subject_allotments WHERE id', [allot]],
      ['SELECT * FROM lesson_plans WHERE allotment_id', [{ status: 'approved', topics: [{ id: 'tA1b', topic: 'ER model', covered_on: '2026-11-01' }] }]],
      ['INSERT INTO lesson_plans', (_s, p) => [{ id: 1, topics: JSON.parse(p[10]), status: p[14] }]],
    ]);
    const res = await request(app).put(`/lesson-plans/allotment/${AID}`).set('Authorization', FAC()).send({
      outcomes: [{ code: 'co1', text: 'Design ER models' }, { text: '' }],
      topics: [{ id: 'tA1b', unit: 1, topic: 'ER model', periods: 2, planned_date: '2026-11-03', covered_on: null }, { unit: 2, topic: '  ', periods: 1 }, { unit: 99, topic: 'Normalisation', periods: 50, method: 'Hacking' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.resubmitted).toBe(true);           // editing an approved plan → back to HOD
    expect(res.body.status).toBe('submitted');
    expect(res.body.topics).toHaveLength(2);            // blank topic dropped
    expect(res.body.topics[0].covered_on).toBe('2026-11-01'); // kept from the stored plan
    expect(res.body.topics[1]).toMatchObject({ unit: 20, periods: 10, method: null });
    const ins = calls.find(c => c.sql.includes('INSERT INTO lesson_plans'))!;
    expect(JSON.parse(ins.params[9])).toEqual([{ code: 'co1', text: 'Design ER models' }]);

    routeDb([['SELECT * FROM subject_allotments WHERE id', [allot]]]);
    const other = await request(app).put(`/lesson-plans/allotment/${AID}`).set('Authorization', bearer('faculty', 'someone@rgmcet.edu.in')).send({ topics: [] });
    expect(other.status).toBe(403);
  });

  it('submit needs a planned date for every topic', async () => {
    routeDb([
      ['SELECT * FROM subject_allotments WHERE id', [allot]],
      ['SELECT * FROM lesson_plans WHERE allotment_id', [{ id: 3, status: 'draft', topics: [{ id: 'a', topic: 'x', planned_date: '2026-11-03' }, { id: 'b', topic: 'y', planned_date: null }] }]],
    ]);
    const res = await request(app).post(`/lesson-plans/allotment/${AID}/submit`).set('Authorization', FAC());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1 topic\(s\) have no planned date/);
  });

  it('coverage cannot be recorded for a future date', async () => {
    routeDb([['SELECT * FROM subject_allotments WHERE id', [allot]]]);
    const res = await request(app).patch(`/lesson-plans/allotment/${AID}/coverage`).set('Authorization', FAC()).send({ topic_id: 'a', covered_on: future });
    expect(res.status).toBe(400);
  });

  it('HOD reviews only their own department; returning needs remarks', async () => {
    routeDb([HOD_ROW, ['SELECT * FROM lesson_plans WHERE id', [{ id: 3, status: 'submitted', department: 'ECE', faculty_email: 'x@y' }]]]);
    expect((await request(app).patch('/lesson-plans/3/review').set('Authorization', HOD()).send({ status: 'approved' })).status).toBe(403);
    routeDb([HOD_ROW]);
    expect((await request(app).patch('/lesson-plans/3/review').set('Authorization', HOD()).send({ status: 'returned' })).status).toBe(400);
    const calls = routeDb([HOD_ROW, ['SELECT * FROM lesson_plans WHERE id', [{ id: 3, status: 'submitted', department: 'CSE (Data Science)', faculty_email: 'ramesh@rgmcet.edu.in' }]]]);
    expect((await request(app).patch('/lesson-plans/3/review').set('Authorization', HOD()).send({ status: 'approved' })).status).toBe(200);
    expect(calls.some(c => c.sql.startsWith('UPDATE lesson_plans SET status') && c.params[0] === 'approved')).toBe(true);
  });

  it('department register summarises coverage and how far behind each class is', async () => {
    const past = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    routeDb([HOD_ROW, ['FROM subject_allotments a LEFT JOIN lesson_plans p', [{ allotment_id: AID, subject_name: 'DBMS', status: 'approved',
      topics: [{ planned_date: past(5), covered_on: past(5) }, { planned_date: past(2), covered_on: null }, { planned_date: past(1), covered_on: null }, { planned_date: future, covered_on: null }] }]]]);
    const res = await request(app).get('/lesson-plans/department').set('Authorization', HOD());
    expect(res.body.rows[0]).toMatchObject({ total: 4, covered: 1, due: 3, behind: 2, coverage_pct: 25 });
  });
});

describe('Meetings & minutes', () => {
  it('faculty cannot schedule meetings', async () => {
    routeDb([]);
    expect((await request(app).post('/meetings').set('Authorization', FAC()).send({ title: 'x', meeting_date: '2026-11-20' })).status).toBe(403);
  });

  it('HOD schedules for their own department', async () => {
    const calls = routeDb([HOD_ROW, ['INSERT INTO dept_meetings', (_s, p) => [{ id: 7, department: p[0], title: p[2] }]]]);
    const res = await request(app).post('/meetings').set('Authorization', HOD()).send({
      department: 'ECE', title: 'Mid-semester review', meeting_date: '2026-11-20', agenda: [{ item: 'Attendance' }, { item: '' }],
      attendees: [{ email: 'Ramesh@rgmcet.edu.in', name: 'Dr. K. Ramesh' }],
    });
    expect(res.status).toBe(201);
    const ins = calls.find(c => c.sql.includes('INSERT INTO dept_meetings'))!;
    expect(ins.params[0]).toBe('CSE (Data Science)'); // body department ignored for a HOD
    expect(JSON.parse(ins.params[10])).toHaveLength(1);
    expect(JSON.parse(ins.params[11])[0].email).toBe('ramesh@rgmcet.edu.in');
  });

  it('publishing needs attendance + minutes, then gets a numbered reference', async () => {
    const base = { id: 7, department: 'CSE (Data Science)', academic_year: '2026–27', status: 'scheduled', title: 'Review', meeting_date: '2026-11-20' };
    routeDb([HOD_ROW, ['SELECT * FROM dept_meetings WHERE id', [{ ...base, attendees: [{ name: 'A', present: null }], agenda: [{ item: 'x' }] }]]]);
    expect((await request(app).post('/meetings/7/publish').set('Authorization', HOD())).body.error).toMatch(/Mark who was present/);
    const calls = routeDb([HOD_ROW,
      ['SELECT * FROM dept_meetings WHERE id', [{ ...base, attendees: [{ name: 'A', email: 'a@x', present: true }], agenda: [{ item: 'x', resolution: 'Agreed' }], action_items: [] }]],
      ['COUNT(*)::int AS n FROM dept_meetings', [{ n: 2 }]],
      ["UPDATE dept_meetings SET status = 'published'", (_s, p) => [{ ...base, status: 'published', ref_no: p[0] }]],
    ]);
    const ok = await request(app).post('/meetings/7/publish').set('Authorization', HOD());
    expect(ok.status).toBe(200);
    expect(ok.body.ref_no).toBe('RGMCET/CSD/MoM/2026-27/003');
    expect(calls.find(c => c.sql.includes('COUNT(*)::int AS n FROM dept_meetings'))!.params[0]).toBe('RGMCET/CSD/MoM/2026-27/%');
  });

  it('only the owner (or HOD) can close an action item', async () => {
    const m = { id: 7, department: 'CSE (Data Science)', action_items: [{ id: 'a1x', task: 'Collect feedback', owner_email: 'ramesh@rgmcet.edu.in', status: 'open' }] };
    routeDb([['SELECT * FROM dept_meetings WHERE id', [m]], ['SELECT department FROM faculty', [{ department: 'CSE (Data Science)' }]]]);
    expect((await request(app).patch('/meetings/7/actions/a1x').set('Authorization', bearer('faculty', 'other@rgmcet.edu.in')).send({ status: 'done' })).status).toBe(403);
    const calls = routeDb([['SELECT * FROM dept_meetings WHERE id', [m]], ['SELECT department FROM faculty', [{ department: 'CSE (Data Science)' }]]]);
    expect((await request(app).patch('/meetings/7/actions/a1x').set('Authorization', FAC()).send({ status: 'done' })).status).toBe(200);
    const upd = calls.find(c => c.sql.startsWith('UPDATE dept_meetings SET action_items'))!;
    expect(JSON.parse(upd.params[0])[0].status).toBe('done');
  });
});

describe('Event reports', () => {
  const ev = { id: 9, department: 'CSE (Data Science)', academic_year: '2026–27', event_type: 'Industrial Visit', title: 'Visit to Infosys', status: 'draft',
    submitted_by: 'ramesh@rgmcet.edu.in', submitted_by_name: 'Dr. K. Ramesh', summary: '', photos: [], visit: null, student_count: null };

  it('submission lists what is missing (summary, photo, place visited, participants)', async () => {
    routeDb([['SELECT * FROM dept_events WHERE id', [ev]], ['SELECT department FROM faculty', [{ department: 'CSE (Data Science)' }]]]);
    const res = await request(app).post('/events/9/submit').set('Authorization', FAC());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Add a summary of the event, at least one photo, the company / place visited, the number of participants before submitting');
  });

  it('only photos stored under academic/events are accepted', async () => {
    const calls = routeDb([['SELECT department FROM faculty', [{ department: 'CSE (Data Science)' }]], ['INSERT INTO dept_events', [{ id: 10 }]], ['SELECT name FROM faculty', [{ name: 'Dr. K. Ramesh' }]]]);
    const res = await request(app).post('/events').set('Authorization', FAC()).send({
      event_type: 'Guest Lecture', title: 'GenAI talk', start_date: '2026-11-10', photos: [{ key: 'academic/events/2026-11/abc_x.jpg', caption: 'Speaker' }, { key: 'students/X/secret.pdf' }],
      resource_persons: [{ name: 'Dr. A', organization: 'IIT' }], student_count: '120',
    });
    expect(res.status).toBe(201);
    const ins = calls.find(c => c.sql.includes('INSERT INTO dept_events'))!;
    expect(JSON.parse(ins.params[22])).toEqual([{ key: 'academic/events/2026-11/abc_x.jpg', caption: 'Speaker', name: null }]);
    expect(ins.params[0]).toBe('2026–27');
    expect(ins.params[13]).toBe(120);
  });

  it('HOD approval assigns a numbered reference by event type', async () => {
    routeDb([HOD_ROW, ['SELECT * FROM dept_events WHERE id', [{ ...ev, status: 'submitted' }]], ['COUNT(*)::int AS n FROM dept_events', [{ n: 0 }]]]);
    const res = await request(app).patch('/events/9/review').set('Authorization', HOD()).send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.ref_no).toBe('RGMCET/CSD/IV/2026-27/001');
  });

  it('faculty see approved reports plus their own drafts', async () => {
    const calls = routeDb([['SELECT department FROM faculty', [{ department: 'CSE (Data Science)' }]]]);
    await request(app).get('/events').set('Authorization', FAC());
    const q = calls.find(c => c.sql.includes('FROM dept_events'))!;
    expect(q.sql).toContain("status = 'approved' OR LOWER(submitted_by)");
  });
});
