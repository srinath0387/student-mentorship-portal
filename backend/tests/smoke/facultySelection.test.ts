/**
 * tests/smoke/facultySelection.test.ts — HTTP layer of /faculty-selection with the mock db:
 * roles, department scoping, per-subject results, group-lock message, capacity guard,
 * and the student attendance view keeping whole-section classes.
 * (Concurrency is proven against real Postgres in tests/integration/facultySelection.race.test.ts.)
 */
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'fs-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

type Route = [RegExp | string, any[] | ((sql: string, params: any[]) => any[])];
function routeDb(routes: Route[], opts: { superAdmin?: boolean } = { superAdmin: true }) {
  const calls: { sql: string; params: any[] }[] = [];
  const all: Route[] = [...routes, ['FROM super_admin_credentials', opts.superAdmin ? [{ '?column?': 1 }] : []]];
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
const ROLL = '22091A0517';
const STUDENT = () => bearer('student', '22091a0517@rgmcet.edu.in', ROLL);
const ADMIN = () => bearer('admin', 'superadmin@rgmcet.edu.in');
const HOD = () => bearer('hod', 'hodcse@rgmcet.edu.in');
const FAC = () => bearer('faculty', 'srinath@rgmcet.edu.in');

const RID = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222221';
const S2 = '22222222-2222-4222-8222-222222222222';
const O1 = '33333333-3333-4333-8333-333333333331';
const O2 = '33333333-3333-4333-8333-333333333332';
const GA = '44444444-4444-4444-8444-44444444444a';
const GB = '44444444-4444-4444-8444-44444444444b';
const hourAgo = new Date(Date.now() - 3600e3).toISOString();
const inHour = new Date(Date.now() + 3600e3).toISOString();
const openRound = { id: RID, department: 'CSE', semester_label: '4-1', title: '4-1 Electives', status: 'open', starts_at: hourAgo, ends_at: inHour, sections: [] };
const studentRec = { roll_number: ROLL, name: 'Akhil', email: '22091a0517@rgmcet.edu.in', department: 'CSE', section: 'B', year: '4th Year' };
const offeringRow = (id: string, group: string, groupName: string) => ({
  id, group_id: group, section: 'B', faculty_email: 'srinath@rgmcet.edu.in', faculty_name: 'Srinath',
  subject_name: 'Deep Learning', subject_type: 'Theory', semester_label: '4-1', department: 'CSE', group_name: groupName,
});
const studentRoutes = (extra: Route[] = []): Route[] => [
  ...extra,
  [/FROM students WHERE UPPER\(roll_number\) = \$1/, [studentRec]],
  ['SELECT * FROM fs_rounds WHERE id', [openRound]],
  ['FROM fs_eligible_students WHERE round_id', [{ '?column?': 1 }]],
  ['SELECT id, subject_name FROM fs_subjects WHERE round_id', [{ id: S1, subject_name: 'Deep Learning' }, { id: S2, subject_name: 'NLP' }]],
];
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

describe('Faculty selection — student picks', () => {
  it('rejects students who are not on the round\'s list (403)', async () => {
    routeDb([
      [/FROM students WHERE UPPER\(roll_number\) = \$1/, [studentRec]],
      ['SELECT * FROM fs_rounds WHERE id', [openRound]],
    ]);
    const res = await request(app).post(`/faculty-selection/me/rounds/${RID}/select`).set('Authorization', STUDENT())
      .send({ choices: [{ subject_id: S1, offering_id: O1 }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ELIGIBLE');
  });

  it('rejects picks once the round is closed (409)', async () => {
    routeDb(studentRoutes([['SELECT * FROM fs_rounds WHERE id', [{ ...openRound, ends_at: hourAgo, starts_at: new Date(Date.now() - 7200e3).toISOString() }]]]));
    const res = await request(app).post(`/faculty-selection/me/rounds/${RID}/select`).set('Authorization', STUDENT())
      .send({ choices: [{ subject_id: S1, offering_id: O1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Selection is closed.');
  });

  it('a first choice is final and a released choice waits for admin — per-subject results with 207', async () => {
    const calls = routeDb(studentRoutes([
      ['SELECT subject_id, status FROM fs_selections', [{ subject_id: S1, status: 'active' }, { subject_id: S2, status: 'released' }]],
    ]));
    const res = await request(app).post(`/faculty-selection/me/rounds/${RID}/select`).set('Authorization', STUDENT())
      .send({ choices: [{ subject_id: S1, offering_id: O1 }, { subject_id: S2, offering_id: O2 }] });
    expect(res.status).toBe(207);
    expect(res.body.results.map((r: any) => [r.status, r.code])).toEqual([[409, 'ALREADY_SELECTED'], [409, 'RELEASED']]);
    expect(res.body.results[1].message).toMatch(/admin will assign/);
    expect(calls.some(c => c.sql.includes('UPDATE fs_offerings SET filled = filled + 1'))).toBe(false);
  });

  it('a successful pick claims the seat atomically and rosters the student in their own section', async () => {
    const calls = routeDb(studentRoutes([
      ['FROM fs_offerings o\n       JOIN fs_subjects', [offeringRow(O1, GA, 'Group A')]],
      ['FROM fs_student_groups sg JOIN fs_groups g', [{ group_id: GA, name: 'Group A' }]],
      ['UPDATE fs_offerings SET filled = filled + 1', [{ id: O1, capacity: 30, filled: 12 }]],
      ['INSERT INTO fs_selections', [{ id: 'sel-1', created_at: new Date().toISOString() }]],
      ['INSERT INTO subject_allotments', [{ id: 'allot-B' }]],
      ['INSERT INTO subject_rosters', [{ id: 'roster-1' }]],
    ]));
    const res = await request(app).post(`/faculty-selection/me/rounds/${RID}/select`).set('Authorization', STUDENT())
      .send({ roll_number: 'SOMEONE_ELSE', choices: [{ subject_id: S1, offering_id: O1 }] });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ ok: true, faculty_name: 'Srinath', section: 'B', seats_left: 18 });
    const seat = calls.find(c => c.sql.includes('filled = filled + 1'))!;
    expect(seat.sql).toMatch(/WHERE id = \$1 AND filled < capacity/);
    const allot = calls.find(c => c.sql.includes('INSERT INTO subject_allotments'))!;
    expect(allot.params).toEqual(['4-1', 'Deep Learning', 'Theory', 'B', 'srinath@rgmcet.edu.in', 'Srinath', 'CSE']);
    const roster = calls.find(c => c.sql.includes('INSERT INTO subject_rosters'))!;
    expect(roster.params).toEqual(['allot-B', ROLL, '22091a0517@rgmcet.edu.in']); // roll from the login, never the body
    expect(calls.filter(c => c.sql.includes('INSERT INTO fs_created_rows')).map(c => c.sql.match(/'(subject_\w+)'/)![1]))
      .toEqual(['subject_allotments', 'subject_rosters']);
    expect(calls.some(c => c.sql.includes('INSERT INTO fs_audit_log'))).toBe(true);
  });

  it('group lock: a pick from another group is refused with a clear message (403 in the result)', async () => {
    routeDb(studentRoutes([
      ['FROM fs_offerings o\n       JOIN fs_subjects', [offeringRow(O2, GB, 'Group B')]],
      ['FROM fs_student_groups sg JOIN fs_groups g', [{ group_id: GA, name: 'Group A' }]],
    ]));
    const res = await request(app).post(`/faculty-selection/me/rounds/${RID}/select`).set('Authorization', STUDENT())
      .send({ choices: [{ subject_id: S1, offering_id: O2 }] });
    expect(res.status).toBe(207);
    expect(res.body.results[0]).toMatchObject({ ok: false, status: 403, code: 'GROUP_LOCKED' });
    expect(res.body.results[0].message).toMatch(/You are in Group A/);
  });

  it('seats full comes back as 409 with the refreshed seat list', async () => {
    routeDb(studentRoutes([
      ['FROM fs_offerings o\n       JOIN fs_subjects', [offeringRow(O1, GA, 'Group A')]],
      ['FROM fs_student_groups sg JOIN fs_groups g', [{ group_id: GA, name: 'Group A' }]],
      [/FROM fs_offerings o JOIN fs_groups g ON g.id = o.group_id\s+WHERE o.round_id = \$1 AND UPPER/, [{ id: O1, subject_id: S1, group_id: GA, group_name: 'Group A', faculty_name: 'Srinath', capacity: 30, filled: 30 }]],
      ['SELECT id, subject_name, subject_type FROM fs_subjects', [{ id: S1, subject_name: 'Deep Learning', subject_type: 'Theory' }]],
    ]));
    const res = await request(app).post(`/faculty-selection/me/rounds/${RID}/select`).set('Authorization', STUDENT())
      .send({ choices: [{ subject_id: S1, offering_id: O1 }] });
    expect(res.status).toBe(207);
    expect(res.body.results[0]).toMatchObject({ status: 409, code: 'SEATS_FULL' });
    expect(res.body.subjects[0].options[0]).toMatchObject({ id: O1, remaining: 0 });
  });
});

describe('Faculty selection — admin / HOD', () => {
  it('students and faculty cannot manage rounds', async () => {
    routeDb([]);
    expect((await request(app).post('/faculty-selection/rounds').set('Authorization', STUDENT()).send({})).status).toBe(403);
    expect((await request(app).get('/faculty-selection/rounds').set('Authorization', FAC())).status).toBe(403);
  });

  it('HOD creates rounds only for their own department (the body department is ignored)', async () => {
    const calls = routeDb([
      ['FROM hod_credentials', [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }]],
      ['INSERT INTO fs_rounds', (_s, p) => [{ id: RID, department: p[0], semester_label: p[1] }]],
    ]);
    const res = await request(app).post('/faculty-selection/rounds').set('Authorization', HOD())
      .send({ title: '4-1 Electives', semester_label: '4-1', department: 'ECE', starts_at: hourAgo, ends_at: inHour });
    expect(res.status).toBe(201);
    expect(calls.find(c => c.sql.includes('INSERT INTO fs_rounds'))!.params[0]).toBe('CSE');
  });

  it('HOD cannot open another department\'s round', async () => {
    routeDb([
      ['FROM hod_credentials', [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }]],
      ['SELECT * FROM fs_rounds WHERE id', [{ ...openRound, department: 'ECE' }]],
    ]);
    const res = await request(app).get(`/faculty-selection/rounds/${RID}`).set('Authorization', HOD());
    expect(res.status).toBe(403);
  });

  it('department admin only sees their own department\'s rounds', async () => {
    routeDb([
      ['FROM admin_accounts', [{ department: 'CSE' }]],
      [/FROM fs_rounds r ORDER BY/, [{ ...openRound }, { ...openRound, id: 'x', department: 'ECE' }]],
    ], { superAdmin: false });
    const res = await request(app).get('/faculty-selection/rounds').set('Authorization', bearer('admin', 'csead@rgmcet.edu.in'));
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.department)).toEqual(['CSE']);
  });

  it('eligible upload reports duplicates, unknown rolls and other-department students, and shows each section', async () => {
    const calls = routeDb([
      ['SELECT * FROM fs_rounds WHERE id', [openRound]],
      ['SELECT roll_number, name, department, section, year FROM students', [
        { roll_number: '22091A0501', name: 'A', department: 'CSE', section: 'a', year: '4th Year' },
        { roll_number: '22091A0401', name: 'B', department: 'ECE', section: 'A', year: '4th Year' },
      ]],
    ]);
    const res = await request(app).post(`/faculty-selection/rounds/${RID}/eligible`).set('Authorization', ADMIN())
      .send({ rolls: ['22091a0501', '22091A0501', '22091A0401', '22091A05ZZ', 'bad'] });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ added: 1, duplicate: 1, other_department: 1, not_found: 1, invalid: 1 });
    expect(res.body.results.find((r: any) => r.result === 'added')).toMatchObject({ roll_number: '22091A0501', section: 'A' });
    expect(calls.find(c => c.sql.includes('INSERT INTO fs_eligible_students'))!.params[1]).toEqual(['22091A0501']);
  });

  it('capacity can never go below the seats already filled (409)', async () => {
    routeDb([
      ['SELECT round_id FROM fs_offerings', [{ round_id: RID }]],
      ['SELECT * FROM fs_rounds WHERE id', [openRound]],
      [/SELECT o\.\*, s\.subject_name FROM fs_offerings/, [{ id: O1, capacity: 30, filled: 12, faculty_email: 'srinath@rgmcet.edu.in', faculty_name: 'Srinath', section: 'A', subject_name: 'DL' }]],
      ['SELECT filled FROM fs_offerings', [{ filled: 12 }]],
    ]);
    const res = await request(app).put(`/faculty-selection/offerings/${O1}`).set('Authorization', ADMIN()).send({ capacity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/12 students have already picked/);
  });

  it('adding a faculty option that would merge with another department\'s class is blocked', async () => {
    routeDb([
      ['SELECT round_id FROM fs_subjects', [{ round_id: RID }]],
      ['SELECT * FROM fs_rounds WHERE id', [openRound]],
      ['SELECT * FROM fs_subjects WHERE id', [{ id: S1, subject_name: 'Deep Learning' }]],
      ['SELECT id, name FROM fs_groups WHERE id', [{ id: GA, name: 'Group A' }]],
      ['FROM faculty WHERE LOWER(email)', [{ name: 'Srinath', email: 'srinath@rgmcet.edu.in', department: 'CSE' }]],
      ['SELECT id, department FROM subject_allotments', [{ id: 'x', department: 'CSE (AI & ML)' }]],
    ]);
    const res = await request(app).post(`/faculty-selection/subjects/${S1}/offerings`).set('Authorization', ADMIN())
      .send({ group_id: GA, section: 'a', faculty_email: 'srinath@rgmcet.edu.in', capacity: 30 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DEPT_CLASH');
    expect(res.body.error).toMatch(/Deep Learning \(CSE\)/);
  });
});

describe('Faculty selection — faculty view and existing attendance', () => {
  it('faculty see only students who picked them', async () => {
    const calls = routeDb([['FROM fs_selections sel\n       JOIN fs_offerings o', [{ subject_name: 'DL', section: 'A', roll_number: ROLL }]]]);
    const res = await request(app).get('/faculty-selection/my-students').set('Authorization', FAC());
    expect(res.status).toBe(200);
    expect(calls.find(c => c.sql.includes('LOWER(o.faculty_email) = LOWER($1)'))!.params).toEqual(['srinath@rgmcet.edu.in']);
  });

  it('a rostered student still sees their section\'s whole-class subjects in My Attendance', async () => {
    routeDb([
      ['SELECT roll_number, name, department, batch, section, year FROM students', [studentRec]],
      ['FROM subject_rosters sr\n      JOIN subject_allotments a', [{ allotment_id: 'el-1', subject_name: 'Deep Learning', semester_label: '4-1', total_periods_held: 4, periods_attended: 3 }]],
      ['WHERE NOT EXISTS (SELECT 1 FROM subject_rosters x', [{ allotment_id: 'core-1', subject_name: 'Compiler Design', semester_label: '4-1', total_periods_held: 10, periods_attended: 9 }]],
    ]);
    const res = await request(app).get(`/attendance/student/${ROLL}`).set('Authorization', STUDENT());
    expect(res.status).toBe(200);
    expect(res.body.subjects.map((s: any) => s.subject_name)).toEqual(['Compiler Design', 'Deep Learning']);
  });
});
