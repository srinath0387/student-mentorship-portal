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

describe('Academic-calendar posting lock', () => {
  const allotment = { id: 'AL1', faculty_email: 'ramesh@rgmcet.edu.in', department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS' };
  const semesterEnded = [{ academic_year: '2026-27', semester: 'Odd', start_date: '2026-07-01', end_date: '2026-11-01' }];
  const body = { allotment_id: 'AL1', session_date: '2026-11-09', num_periods: 1, period_start: 1, records: [{ roll_number: '23091a3201', is_present: true }] };
  const baseRoutes = (calendar: any[], lateStatus?: string): Route[] => [
    ['FROM subject_allotments WHERE id', [allotment]],
    ['FROM academic_calendar', calendar],
    ['SELECT status FROM attendance_late_post_requests', lateStatus ? [{ status: lateStatus }] : []],
    ['INSERT INTO attendance_sessions', [{ id: 'S1' }]],
  ];

  it('blocks faculty posting after the semester end until approved', async () => {
    routeDb(baseRoutes(semesterEnded));
    const res = await request(app).post('/attendance/sessions').set('Authorization', FACULTY()).send(body);
    expect(res.status).toBe(423);
    expect(res.body).toMatchObject({ code: 'SEMESTER_LOCKED', request_status: 'none' });
    expect(res.body.error).toContain('2026-11-01');
  });

  it('reports a pending request while still blocking', async () => {
    routeDb(baseRoutes(semesterEnded, 'Pending'));
    const res = await request(app).post('/attendance/sessions').set('Authorization', FACULTY()).send(body);
    expect(res.status).toBe(423);
    expect(res.body.request_status).toBe('pending');
  });

  it('allows posting once the admin approved the late-posting request', async () => {
    routeDb(baseRoutes(semesterEnded, 'Approved'));
    const res = await request(app).post('/attendance/sessions').set('Authorization', FACULTY()).send(body);
    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe('S1');
  });

  it('never blocks the admin', async () => {
    routeDb(baseRoutes(semesterEnded));
    const res = await request(app).post('/attendance/sessions').set('Authorization', ADMIN()).send(body);
    expect(res.status).toBe(200);
  });

  it('does not lock anything when no academic calendar is configured', async () => {
    routeDb(baseRoutes([]));
    const res = await request(app).post('/attendance/sessions').set('Authorization', FACULTY()).send(body);
    expect(res.status).toBe(200);
  });

  it('lets faculty request approval only for their own subjects; only admin can approve', async () => {
    let calls = routeDb([['FROM subject_allotments WHERE id', [{ ...allotment, faculty_email: 'someone@rgmcet.edu.in' }]]]);
    const notMine = await request(app).post('/attendance/late-post-requests').set('Authorization', FACULTY()).send({ allotment_id: 'AL1', session_date: '2026-11-09' });
    expect(notMine.status).toBe(403);

    calls = routeDb([['FROM subject_allotments WHERE id', [allotment]]]);
    const mine = await request(app).post('/attendance/late-post-requests').set('Authorization', FACULTY()).send({ allotment_id: 'AL1', session_date: '2026-11-09', reason: 'Semester extended for labs' });
    expect(mine.status).toBe(200);
    expect(calls.some(c => c.sql.includes('INSERT INTO attendance_late_post_requests'))).toBe(true);

    const facultyApprove = await request(app).patch('/attendance/late-post-requests/1/approve').set('Authorization', FACULTY());
    expect(facultyApprove.status).toBe(403);

    routeDb([['UPDATE attendance_late_post_requests', [{ id: 1, status: 'Approved' }]]]);
    const adminApprove = await request(app).patch('/attendance/late-post-requests/1/approve').set('Authorization', ADMIN());
    expect(adminApprove.status).toBe(200);
    expect(adminApprove.body.request.status).toBe('Approved');
  });
});

describe('Admin attendance control', () => {
  const tt = (subject: string, period: number, section = 'A') => ({
    id: `T-${subject}-${period}`, day_of_week: 'Monday', department: 'CSE (Data Science)', semester_label: '3-1',
    section, subject_name: subject, subject_type: 'Theory', period_start: period, num_periods: 1,
    faculty_email: 'ramesh@rgmcet.edu.in', faculty_name: 'Dr. Ramesh', room_no: '101',
  });

  it('day-status classifies each class as posted / not posted / no class, plus extra sessions', async () => {
    routeDb([
      ['FROM timetable_entries', [tt('DBMS', 1), tt('OS', 2), tt('CN', 3)]],
      ['FROM attendance_sessions s JOIN subject_allotments', [
        { session_id: 'S1', period_start: 1, num_periods: 1, department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS', faculty_email: 'ramesh@rgmcet.edu.in', total_marked: 60, present_count: 55 },
        { session_id: 'S9', period_start: 6, num_periods: 1, department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS', faculty_email: 'ramesh@rgmcet.edu.in', total_marked: 60, present_count: 50 },
      ]],
      ['FROM attendance_no_class_requests', [{ id: 7, department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'CN', period_start: 3, reason: 'Exam' }]],
    ]);
    const res = await request(app).get('/attendance/admin/day-status?date=2026-11-09').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.day_of_week).toBe('Monday');
    expect(res.body.summary).toEqual({ scheduled: 3, posted: 1, not_posted: 1, no_class: 1, extra: 1 });
    const bySubject = Object.fromEntries(res.body.slots.filter((s: any) => !s.extra_class).map((s: any) => [s.subject_name, s.status]));
    expect(bySubject).toEqual({ DBMS: 'posted', OS: 'not_posted', CN: 'no_class' });
    expect(res.body.slots.find((s: any) => s.extra_class).session.session_id).toBe('S9');
  });

  it('day-status is not available to faculty', async () => {
    routeDb([]);
    const res = await request(app).get('/attendance/admin/day-status?date=2026-11-09').set('Authorization', FACULTY());
    expect(res.status).toBe(403);
  });

  it('remove-class records approved no-class entries and can delete posted attendance', async () => {
    const calls = routeDb([
      ['FROM timetable_entries', [tt('DBMS', 1), tt('OS', 2)]],
      ['DELETE FROM attendance_sessions', [{ id: 'S1' }]],
    ]);
    const res = await request(app).post('/attendance/admin/cancel-class').set('Authorization', ADMIN())
      .send({ date: '2026-11-09', department: 'CSE (Data Science)', section: 'a', reason: 'Mid exams', delete_posted: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cancelled: 2, deleted_sessions: 2 });
    const inserts = calls.filter(c => c.sql.includes('INSERT INTO attendance_no_class_requests'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params[9]).toBe('admin@rgmcet.edu.in');
    const tq = calls.find(c => c.sql.includes('FROM timetable_entries'))!;
    expect(tq.params).toEqual(['Monday', 'CSE (Data Science)', 'A']);
  });

  it('remove-class requires a reason and is admin/HOD only', async () => {
    routeDb([['FROM timetable_entries', [tt('DBMS', 1)]]]);
    const noReason = await request(app).post('/attendance/admin/cancel-class').set('Authorization', ADMIN())
      .send({ date: '2026-11-09', department: 'CSE (Data Science)' });
    expect(noReason.status).toBe(400);
    const asFaculty = await request(app).post('/attendance/admin/cancel-class').set('Authorization', FACULTY())
      .send({ date: '2026-11-09', department: 'CSE (Data Science)', reason: 'x' });
    expect(asFaculty.status).toBe(403);
  });
});

describe('Student / parent attendance view', () => {
  const PARENT = () => `Bearer ${signSessionToken({ role: 'parent', email: 'parent_23091a3201@rgmcet.edu.in', reg: '23091A3201' })}`;

  it('reports periods held/attended from posted sessions, matching roll numbers case-insensitively', async () => {
    const calls = routeDb([
      ['FROM students WHERE UPPER(roll_number)', [{ roll_number: '23091A3201', name: 'Aarav', department: 'CSE (Data Science)', section: 'A' }]],
      ['FROM subject_rosters sr', [{ allotment_id: 'AL1', subject_name: 'DBMS Lab', subject_type: 'Lab', semester_label: '3-1', faculty_name: 'Dr. Ramesh', total_periods_held: '4', periods_attended: '3' }]],
    ]);
    const res = await request(app).get('/attendance/student/23091a3201').set('Authorization', PARENT());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ overall_percentage: 75, total_periods_held: 4, total_periods_attended: 3 });
    const q = calls.find(c => c.sql.includes('FROM subject_rosters sr'))!.sql;
    expect(q).toContain('UPPER(r.roll_number) = UPPER(sr.roll_number)');
  });

  it('stops a parent reading another student’s attendance', async () => {
    routeDb([]);
    const res = await request(app).get('/attendance/student/23091A3299').set('Authorization', PARENT());
    expect(res.status).toBe(403);
  });
});
