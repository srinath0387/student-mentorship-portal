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

describe('FT002 monthly report', () => {
  it('computes attendance, posting compliance, certifications and placements by department', async () => {
    const slot = { department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS', period_start: 1, day_of_week: 'Monday', faculty_email: 'ramesh@rgmcet.edu.in', faculty_name: 'Dr. Ramesh' };
    const posted = ['2026-10-05', '2026-10-12', '2026-10-19'].map(d => ({ d, period_start: 1, department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS' }));
    routeDb([
      ['GROUP BY a.department', [{ department: 'CSE (Data Science)', held: '180', attended: '153', sessions: 3 }]],
      ['FROM timetable_entries', [slot]],
      ["s.session_date::text AS d", posted],
      ['FROM student_certifications sc', [{ department: 'CSE (Data Science)', n: 7 }]],
      ['FROM student_placements p', [{ department: 'CSE (Data Science)', n: 2, max_lpa: 12.5 }]],
    ]);
    const res = await request(app).get('/reports/monthly?month=2026-10').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.label).toContain('October');
    const d = res.body.departments.find((x: any) => x.department === 'CSE (Data Science)');
    expect(d).toMatchObject({ attendance_pct: 85, classes_scheduled: 4, classes_posted: 3, posting_compliance_pct: 75, new_certifications: 7, new_placements: 2, highest_package_lpa: 12.5 });
    expect(res.body.lowest_posting_compliance[0]).toMatchObject({ faculty_email: 'ramesh@rgmcet.edu.in', scheduled: 4, posted: 3, compliance_pct: 75 });
  });

  it('rejects a bad month and is not available to faculty', async () => {
    routeDb([]);
    expect((await request(app).get('/reports/monthly?month=2026-13').set('Authorization', ADMIN())).status).toBe(400);
    expect((await request(app).get('/reports/monthly').set('Authorization', bearer('faculty', 'x@rgmcet.edu.in'))).status).toBe(403);
  });
});

describe('FT003 anonymous feedback', () => {
  const STUDENT = () => bearer('student', '23091a3201@rgmcet.edu.in');
  const openCycle = { id: 5, title: 'Odd sem 2026', department: 'All', semester_label: 'All', start_date: '2020-01-01', end_date: '2099-12-31',
    questions: [{ id: 'q1', text: 'Clarity' }, { id: 'q2', text: 'Punctuality' }] };
  const allot = { id: 'AL1', faculty_email: 'Ramesh@rgmcet.edu.in', faculty_name: 'Dr. Ramesh', department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS' };

  it('stores the response without any student identity', async () => {
    const calls = routeDb([
      ['SELECT * FROM feedback_cycles WHERE id', [openCycle]],
      ['FROM subject_rosters r JOIN subject_allotments a', [allot]],
      ['INSERT INTO feedback_submissions', [{ cycle_id: 5 }]],
    ]);
    const res = await request(app).post('/feedback/cycles/5/submit').set('Authorization', STUDENT())
      .send({ allotment_id: 'AL1', ratings: { q1: 5, q2: 4 }, comment: 'Explains well' });
    expect(res.status).toBe(200);
    const resp = calls.find(c => c.sql.includes('INSERT INTO feedback_responses'))!;
    expect(resp.sql).not.toMatch(/roll_number/);
    expect(JSON.stringify(resp.params)).not.toContain('23091A3201');
    expect(resp.params[2]).toBe('ramesh@rgmcet.edu.in');
  });

  it('blocks duplicates, non-enrolled subjects and incomplete ratings', async () => {
    routeDb([['SELECT * FROM feedback_cycles WHERE id', [openCycle]], ['FROM subject_rosters r JOIN subject_allotments a', [allot]]]);
    const dup = await request(app).post('/feedback/cycles/5/submit').set('Authorization', STUDENT()).send({ allotment_id: 'AL1', ratings: { q1: 5, q2: 4 } });
    expect(dup.status).toBe(409);

    routeDb([['SELECT * FROM feedback_cycles WHERE id', [openCycle]]]);
    const notMine = await request(app).post('/feedback/cycles/5/submit').set('Authorization', STUDENT()).send({ allotment_id: 'AL9', ratings: { q1: 5, q2: 4 } });
    expect(notMine.status).toBe(403);

    const incomplete = await request(app).post('/feedback/cycles/5/submit').set('Authorization', STUDENT()).send({ allotment_id: 'AL1', ratings: { q1: 5 } });
    expect(incomplete.status).toBe(400);
  });

  it('summarises averages, hides comments below 3 responses, and holds faculty results until close', async () => {
    const responses = [
      { allotment_id: 'AL1', faculty_email: 'ramesh@rgmcet.edu.in', faculty_name: 'Dr. Ramesh', department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS', ratings: { q1: 5, q2: 4 }, comment: 'Good' },
      { allotment_id: 'AL1', faculty_email: 'ramesh@rgmcet.edu.in', faculty_name: 'Dr. Ramesh', department: 'CSE (Data Science)', semester_label: '3-1', section: 'A', subject_name: 'DBMS', ratings: { q1: 3, q2: 4 }, comment: 'Too fast' },
    ];
    routeDb([['SELECT * FROM feedback_cycles WHERE id', [openCycle]], ['FROM feedback_responses WHERE cycle_id', responses], ['FROM subject_rosters GROUP BY', [{ allotment_id: 'AL1', n: 60 }]]]);
    const admin = await request(app).get('/feedback/cycles/5/summary').set('Authorization', ADMIN());
    expect(admin.status).toBe(200);
    expect(admin.body.rows[0]).toMatchObject({ responses: 2, enrolled: 60, averages: { q1: 4, q2: 4 }, overall: 4, comments: [], comments_hidden: true });

    const faculty = await request(app).get('/feedback/cycles/5/summary').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    expect(faculty.status).toBe(403);
  });
});

describe('FT004 placement drives', () => {
  const drive = { id: 3, company_name: 'Infosys', role_title: 'Systems Engineer', package_lpa: 3.6, drive_date: '2026-12-01', last_date: '2099-12-31',
    min_cgpa: '6.5', max_backlogs: 0, departments: ['CSE (Data Science)'], batches: ['2023-2027'], required_skills: ['java', 'sql'], exclude_placed: false, status: 'Open' };
  const row = (roll: string, cgpa: number, skills: string[], status: string | null = null) =>
    ({ roll_number: roll, name: roll, email: `${roll.toLowerCase()}@rgmcet.edu.in`, department: 'CSE (Data Science)', batch: '2023-2027', section: 'A', year: '4th Year', cgpa, backlogs: 0, skills, application_status: status });

  it('applies hard criteria in SQL and ranks by skill match, with funnel counts', async () => {
    const calls = routeDb([
      ['SELECT * FROM placement_drives WHERE id', [drive]],
      ['FROM students st', [row('A1', 9.1, ['python']), row('A2', 7.0, ['java', 'mysql']), row('A3', 8.0, ['java'], 'Shortlisted')]],
    ]);
    const res = await request(app).get('/placement/drives/3/eligible').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.students.map((s: any) => [s.roll_number, s.skills_matched.length])).toEqual([['A2', 2], ['A3', 1], ['A1', 0]]);
    expect(res.body.funnel).toEqual({ eligible: 3, applied: 1, shortlisted: 1, selected: 0, rejected: 0 });
    const q = calls.find(c => c.sql.includes('FROM students st'))!;
    expect(q.params.slice(0, 2)).toEqual([6.5, 0]);
    expect(q.sql).toContain('st.department = ANY');
    expect(q.sql).toContain('st.batch = ANY');
  });

  it('selecting a student records the placement', async () => {
    const calls = routeDb([
      ['SELECT * FROM placement_drives WHERE id', [drive]],
      ['FROM students st', [row('A2', 7.0, ['java'])]],
    ]);
    const res = await request(app).put('/placement/drives/3/applications/a2').set('Authorization', ADMIN()).send({ status: 'Selected' });
    expect(res.status).toBe(200);
    const ins = calls.find(c => c.sql.includes('INSERT INTO student_placements'))!;
    expect(ins.params.slice(0, 1)).toEqual(['A2']);
    expect(ins.params[4]).toBe('Infosys');
  });

  it('students can apply only when eligible', async () => {
    routeDb([['SELECT * FROM placement_drives WHERE id', [drive]]]);
    const no = await request(app).post('/placement/drives/3/apply').set('Authorization', bearer('student', 'a9@rgmcet.edu.in'));
    expect(no.status).toBe(403);
    const calls = routeDb([['SELECT * FROM placement_drives WHERE id', [drive]], ['FROM students st', [row('A2', 7.0, ['java'])]]]);
    const yes = await request(app).post('/placement/drives/3/apply').set('Authorization', bearer('student', 'a2@rgmcet.edu.in'));
    expect(yes.status).toBe(200);
    expect(calls.some(c => c.sql.includes('INSERT INTO placement_drive_applications'))).toBe(true);
  });
});

describe('FT005 faculty appraisal workflow', () => {
  const base = { id: 11, faculty_email: 'ramesh@rgmcet.edu.in', academic_year: '2026–27', department: 'CSE (Data Science)', snapshot: {} };
  const routes = (status: string, facultyDept = 'CSE (Data Science)'): Route[] => [
    ['FROM faculty_appraisals WHERE LOWER(faculty_email)', [{ ...base, status }]],
    ['UPDATE faculty_appraisals', (_sql: string, params: any[]) => [{ ...base, status: params.includes('Submitted') ? 'Submitted' : status, params }]],
    ['SELECT department FROM faculty WHERE LOWER(email) = $1 LIMIT 1', [{ department: facultyDept }]],
    ['FROM hod_credentials', [{ department: 'CSE (Data Science)' }]],
  ];
  const act = (who: string, body: any) => request(app).post('/appraisals/ramesh%40rgmcet.edu.in/action').set('Authorization', who).send({ academic_year: '2026-27', ...body });
  const FACULTY = () => bearer('faculty', 'ramesh@rgmcet.edu.in');
  const HOD = () => bearer('hod', 'hcseds@rgmcet.edu.in');

  it('faculty must add remarks to submit; the draft then becomes Submitted', async () => {
    routeDb(routes('Draft'));
    expect((await act(FACULTY(), { action: 'submit' })).status).toBe(400);
    const calls = routeDb(routes('Draft'));
    const ok = await act(FACULTY(), { action: 'submit', self_remarks: 'Completed 2 FDPs and an NPTEL course' });
    expect(ok.status).toBe(200);
    expect(calls.find(c => c.sql.includes('UPDATE faculty_appraisals'))!.params[2]).toBe('Submitted');
  });

  it('enforces roles and order: faculty cannot review, HOD only own department, approval needs a review first', async () => {
    routeDb(routes('Submitted'));
    expect((await act(FACULTY(), { action: 'review', hod_rating: 'Good' })).status).toBe(403);
    routeDb(routes('Submitted', 'ECE'));
    expect((await act(HOD(), { action: 'review', hod_rating: 'Good' })).status).toBe(403);
    routeDb(routes('Submitted'));
    expect((await act(HOD(), { action: 'review', hod_rating: 'Excellent!!' })).status).toBe(400);
    expect((await act(HOD(), { action: 'review', hod_rating: 'Very Good', hod_remarks: 'Strong mentoring' })).status).toBe(200);
    routeDb(routes('Submitted'));
    expect((await act(ADMIN(), { action: 'approve', final_rating: 'Very Good' })).status).toBe(400);
    routeDb(routes('Reviewed'));
    expect((await act(HOD(), { action: 'approve', final_rating: 'Very Good' })).status).toBe(403);
    expect((await act(bearer('principal', 'principal@rgmcet.edu.in'), { action: 'approve', final_rating: 'Very Good' })).status).toBe(200);
  });

  it('a return needs a note and sends the appraisal back to Draft', async () => {
    routeDb(routes('Submitted'));
    expect((await act(HOD(), { action: 'return' })).status).toBe(400);
    const calls = routeDb(routes('Submitted'));
    expect((await act(HOD(), { action: 'return', return_note: 'Add publication details' })).status).toBe(200);
    expect(calls.find(c => c.sql.includes('UPDATE faculty_appraisals'))!.sql).toContain("status = 'Draft'");
  });
});

describe('FT006 accreditation pack', () => {
  it('builds sheet rows filtered to the academic year, with ratio and PhD counts', async () => {
    routeDb([
      ['GROUP BY department, year', [{ department: 'CSE (Data Science)', year: '3rd Year', students: 120 }, { department: 'CSE (Data Science)', year: '4th Year', students: 60 }]],
      ['FROM faculty f LEFT JOIN faculty_full_profiles', [
        { name: 'Dr. Ramesh', email: 'ramesh@rgmcet.edu.in', department: 'CSE (Data Science)',
          personal: { designation: 'Professor', joining_date: '2016-07-01', prior_experience_years: 4 },
          education: { highest_qualification: 'Ph.D', specialization: 'Data Mining' },
          activities: [
            { type: 'FDP', title: 'FDP on GenAI', organizer: 'ATAL', from_date: '2026-07-14', to_date: '2026-07-18', academic_year: '2026–27', level: 'National' },
            { type: 'Workshop', title: 'Old workshop', organizer: 'X', date: '2024-08-01', academic_year: '2024–25', level: 'State' },
          ],
          publications: [{ category: 'Journal', title: 'Paper A', journal_name: 'IEEE Access', year: 2026 }, { category: 'Journal', title: 'Paper B', journal_name: 'J', year: 2020 }],
          certifications: [] },
        { name: 'Mr. Naveen', email: 'naveen@rgmcet.edu.in', department: 'CSE (Data Science)', personal: {}, education: { highest_qualification: 'M.Tech' }, activities: [], publications: [], certifications: [] },
      ]],
    ]);
    const res = await request(app).get('/accreditation/pack?academic_year=2026-27').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    const sh = res.body.sheets;
    expect(sh['Student-Faculty Ratio'][0]).toMatchObject({ 'Department': 'CSE (Data Science)', 'Students': 180, 'Faculty': 2, 'Student : Faculty': '90 : 1', 'Faculty with PhD': 1, 'PhD %': 50 });
    expect(sh['FDPs & Workshops'].map((a: any) => a['Title'])).toEqual(['FDP on GenAI']);
    expect(sh['Publications & Patents'].map((p: any) => p['Title'])).toEqual(['Paper A']);
    expect(sh['Faculty'][0]['PhD']).toBe('Yes');
  });

  it('rejects a bad academic year and keeps HODs to their department', async () => {
    routeDb([['FROM hod_credentials', [{ department: 'ECE' }]]]);
    expect((await request(app).get('/accreditation/pack?academic_year=2026').set('Authorization', ADMIN())).status).toBe(400);
    expect((await request(app).get('/accreditation/pack?department=CSE').set('Authorization', bearer('hod', 'hece@rgmcet.edu.in'))).status).toBe(403);
  });
});

describe('FT007 parent alerts', () => {
  const PARENT = () => bearer('parent', 'parent_23091a3201@rgmcet.edu.in', '23091A3201');
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

  it('builds absent-today, this-week and low-attendance alerts for the ward', async () => {
    routeDb([
      ["r.is_present = false AND s.session_date BETWEEN", [
        { d: today, period_start: 1, num_periods: 1, subject_name: 'DBMS' },
        { d: '2000-01-01', period_start: 3, num_periods: 2, subject_name: 'OS Lab' },
      ]],
      ['WITH cur AS', [{ roll_number: '23091A3201', name: 'A', department: 'CSE', year: '3rd Year', section: 'A', semester: '3-1', held: '100', attended: '62' }]],
      ['SUM(CASE WHEN r.is_present', [{ held: 80, attended: 60 }]],
    ]);
    const res = await request(app).get('/parent/alerts').set('Authorization', PARENT());
    expect(res.status).toBe(200);
    expect(res.body.alerts.map((a: any) => a.code)).toEqual(['absent_today', 'absent_week', 'attendance_low']);
    expect(res.body.alerts[0].detail).toBe('DBMS (P1)');
    expect(res.body.alerts[2].level).toBe('high');
    expect(res.body.monthly).toMatchObject({ held: 80, attended: 60, percentage: 75 });
  });

  it('dispatch previews messages and sends nothing while messaging is not configured', async () => {
    delete process.env.MESSAGING_WEBHOOK_URL;
    routeDb([['GROUP BY st.roll_number, st.name, st.parent_phone', [
      { roll_number: '23091A3201', name: 'Aarav', parent_phone: '9876543210', subjects: ['DBMS', 'OS'] },
      { roll_number: '23091A3202', name: 'Bhavya', parent_phone: null, subjects: ['DBMS'] },
    ]]]);
    const res = await request(app).post('/parent/alerts/dispatch').set('Authorization', ADMIN()).send({ date: '2026-11-09', send: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'disabled', absent_students: 2, with_parent_phone: 1, sent: 0 });
    expect(res.body.preview[0].text).toContain('Aarav (23091A3201) was absent on 2026-11-09 for DBMS, OS');
  });
});

describe('FT008 live-code attendance', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  const codeFor = (secret: string, step: number) => String(crypto.createHmac('sha256', secret).update(String(step)).digest().readUInt32BE(0) % 1000000).padStart(6, '0');
  const step = () => Math.floor(Date.now() / 1000 / 30);
  const live = { id: 4, allotment_id: 'AL1', secret: 'test-secret', faculty_email: 'ramesh@rgmcet.edu.in', closed: false, expires_at: new Date(Date.now() + 600000).toISOString(), subject_name: 'DBMS', session_date: '2026-11-12' };
  const STUDENT = () => bearer('student', '23091a3201@rgmcet.edu.in');

  it('accepts the current and previous code once per student, rejects others', async () => {
    let calls = routeDb([['FROM live_attendance la', [live]], ['INSERT INTO live_attendance_checkins', [{ live_id: 4 }]]]);
    const ok = await request(app).post('/attendance/live/checkin').set('Authorization', STUDENT()).send({ code: codeFor('test-secret', step()) });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ success: true, already: false, subject_name: 'DBMS' });
    expect(calls.find(c => c.sql.includes('INSERT INTO live_attendance_checkins'))!.params).toEqual([4, '23091A3201']);

    routeDb([['FROM live_attendance la', [live]]]);
    const prev = await request(app).post('/attendance/live/checkin').set('Authorization', STUDENT()).send({ code: codeFor('test-secret', step() - 1) });
    expect(prev.body.already).toBe(true);

    const bad = await request(app).post('/attendance/live/checkin').set('Authorization', STUDENT()).send({ code: codeFor('test-secret', step() - 5) });
    expect(bad.status).toBe(400);
    calls = routeDb([]);
    const notOnRoll = await request(app).post('/attendance/live/checkin').set('Authorization', STUDENT()).send({ code: codeFor('test-secret', step()) });
    expect(notOnRoll.status).toBe(400);
  });

  it('only the main faculty can start; the owner sees the rotating code', async () => {
    routeDb([['SELECT * FROM subject_allotments WHERE id', [{ id: 'AL1', faculty_email: 'main@rgmcet.edu.in', subject_name: 'DBMS', section: 'A' }]]]);
    const co = await request(app).post('/attendance/live/start').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in')).send({ allotment_id: 'AL1', period_start: 1 });
    expect(co.status).toBe(403);

    routeDb([['SELECT * FROM live_attendance WHERE id', [live]], ['FROM live_attendance_checkins c', [{ roll_number: '23091A3201', name: 'A' }]]]);
    const view = await request(app).get('/attendance/live/4').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    expect(view.status).toBe(200);
    expect([codeFor('test-secret', step()), codeFor('test-secret', step() + 1)]).toContain(view.body.code);
    expect(view.body.checkins).toHaveLength(1);
    const other = await request(app).get('/attendance/live/4').set('Authorization', bearer('faculty', 'other@rgmcet.edu.in'));
    expect(other.status).toBe(404);
  });
});

describe('FT009 CO-PO attainment', () => {
  const allot = { id: 'AL1', faculty_email: 'ramesh@rgmcet.edu.in', department: 'CSE (Data Science)', subject_name: 'DBMS', semester_label: '3-1', section: 'A', faculty_name: 'Dr. Ramesh' };
  const cfg = {
    settings: {}, cos: [{ id: 'CO1', text: 'Design ER models' }, { id: 'CO2', text: 'Write SQL queries' }],
    mapping: { CO1: { PO1: 3 }, CO2: { PO1: 1, PO2: 2 } },
    attainment: { CO1: { direct_pct: 75, indirect: 2 }, CO2: { direct_pct: 62, indirect: null } },
  };

  it('computes CO levels and weighted PO attainment', async () => {
    routeDb([['FROM subject_allotments WHERE id::text', [allot]], ['SELECT * FROM obe_courses WHERE allotment_id', [cfg]]]);
    const res = await request(app).get('/obe/course/AL1').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    expect(res.status).toBe(200);
    expect(res.body.computed.cos.map((c: any) => [c.id, c.direct_level, c.attainment])).toEqual([['CO1', 3, 2.8], ['CO2', 2, 2]]);
    expect(res.body.computed.po_attainment).toMatchObject({ PO1: 2.6, PO2: 2, PO3: null });
    expect(res.body.can_edit).toBe(true);
  });

  it('only the course faculty (or HOD/admin) can edit, and thresholds must be ordered', async () => {
    routeDb([['FROM subject_allotments WHERE id::text', [allot]]]);
    expect((await request(app).put('/obe/course/AL1').set('Authorization', bearer('faculty', 'other@rgmcet.edu.in')).send(cfg)).status).toBe(403);
    expect((await request(app).put('/obe/course/AL1').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in')).send({ ...cfg, settings: { l1: 70, l2: 60, l3: 50 } })).status).toBe(400);
    const calls = routeDb([['FROM subject_allotments WHERE id::text', [allot]]]);
    const ok = await request(app).put('/obe/course/AL1').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'))
      .send({ ...cfg, mapping: { CO1: { PO1: 3, PO5: 9 } } });
    expect(ok.status).toBe(200);
    const saved = calls.find(c => c.sql.includes('INSERT INTO obe_courses'))!;
    expect(JSON.parse(saved.params[3])).toEqual({ CO1: { PO1: 3 }, CO2: {} });
  });
});

describe('FT010 alumni', () => {
  const rows = [
    { id: 1, name: 'A', batch: '2021-2025', department: 'CSE', status: 'Employed', organization: 'Infosys', source: 'self', self_token: 'x'.repeat(32) },
    { id: 2, name: 'B', batch: '2021-2025', department: 'CSE', status: 'Employed', organization: 'Infosys', source: 'admin', self_token: null },
    { id: 3, name: 'C', batch: '2020-2024', department: 'CSE', status: 'Higher Studies', institute: 'IIT Madras', source: 'admin', self_token: null },
  ];

  it('lists with analytics and never exposes self-update tokens', async () => {
    routeDb([['SELECT * FROM alumni WHERE', rows]]);
    const res = await request(app).get('/alumni').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 3, by_status: { Employed: 2, 'Higher Studies': 1 }, self_updated: 1, top_employers: [{ name: 'Infosys', n: 2 }] });
    expect(JSON.stringify(res.body.alumni)).not.toContain('x'.repeat(32));
    expect(res.body.alumni[0].has_self_link).toBe(true);
  });

  it('self-update link edits only allowed fields of that record', async () => {
    const calls = routeDb([['SELECT id FROM alumni WHERE self_token', [{ id: 7 }]]]);
    const res = await request(app).put(`/alumni/self/${'t'.repeat(32)}`).send({ organization: 'TCS', status: 'Employed', name: 'Hacker', department: 'ECE' });
    expect(res.status).toBe(200);
    const upd = calls.find(c => c.sql.startsWith('UPDATE alumni SET'))!;
    expect(upd.sql).toContain('status = $1');
    expect(upd.sql).toContain('organization = $2');
    expect(upd.sql).not.toMatch(/\bname =|department =/);
    expect(upd.params[upd.params.length - 1]).toBe(7);

    routeDb([]);
    expect((await request(app).put('/alumni/self/short').send({ organization: 'X' })).status).toBe(404);
  });

  it('only admin/HOD can create; name is required', async () => {
    routeDb([]);
    expect((await request(app).post('/alumni').set('Authorization', bearer('faculty', 'x@rgmcet.edu.in')).send({ name: 'Z' })).status).toBe(403);
    expect((await request(app).post('/alumni').set('Authorization', ADMIN()).send({ batch: '2020-2024' })).status).toBe(400);
  });
});

describe('FT011 exam seating & invigilation', () => {
  const rooms = [{ id: 1, name: 'A101', capacity: 3 }, { id: 2, name: 'A102', capacity: 3 }];
  const cse = [{ roll_number: 'C1' }, { roll_number: 'C2' }, { roll_number: 'C3' }];
  const ece = [{ roll_number: 'E1' }, { roll_number: 'E2' }];
  const body = { title: 'Mid-1', exam_date: '2026-12-01', slot: 'FN', groups: [{ department: 'CSE', year: '3rd Year' }, { department: 'ECE', year: '3rd Year' }], room_ids: [1, 2], invigilators_per_room: 1 };

  it('interleaves groups across seats and assigns balanced invigilators, skipping leave', async () => {
    const calls = routeDb([
      ['SELECT * FROM exam_rooms WHERE id', rooms],
      ['FROM students WHERE department = $1', (_sql: string, params: any[]) => params[0] === 'CSE' ? cse : ece],
      ['INSERT INTO exam_sessions', [{ id: 9 }]],
      ['FROM faculty f', [{ email: 'busy@rgmcet.edu.in', name: 'Busy', duties: 5 }, { email: 'leave@rgmcet.edu.in', name: 'OnLeave', duties: 0 }, { email: 'free@rgmcet.edu.in', name: 'Free', duties: 1 }]],
      ['FROM faculty_leaves', [{ e: 'leave@rgmcet.edu.in' }]],
    ]);
    const res = await request(app).post('/exams/sessions').set('Authorization', ADMIN()).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ students: 5, rooms_used: 2, invigilators_assigned: 2, invigilators_short: 0 });
    const seatRows = JSON.parse(calls.find(c => c.sql.includes('INSERT INTO exam_seating'))!.params[1]);
    expect(seatRows.map((x: any) => `${x.roll}@${x.room}:${x.seat}`)).toEqual(['C1@1:1', 'E1@1:2', 'C2@1:3', 'E2@2:1', 'C3@2:2']);
    const inv = calls.filter(c => c.sql.includes('INSERT INTO exam_invigilation')).map(c => [c.params[1], c.params[2]]);
    expect(inv).toEqual([[1, 'free@rgmcet.edu.in'], [2, 'busy@rgmcet.edu.in']]);
  });

  it('refuses when there are not enough seats', async () => {
    routeDb([
      ['SELECT * FROM exam_rooms WHERE id', [{ id: 1, name: 'A101', capacity: 2 }]],
      ['FROM students WHERE department = $1', cse],
    ]);
    const res = await request(app).post('/exams/sessions').set('Authorization', ADMIN()).send({ ...body, groups: [body.groups[0]], room_ids: [1] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('1 short');
  });
});

describe('Leave eligibility table', () => {
  it('counts only the year’s leaves: availed (principal-approved), in process, balance', async () => {
    routeDb([
      ['FROM faculty_leave_credits', [{ casual_leave_quota: '12', academic_leave_quota: '6', sp_cl_quota: '7' }]],
      ['SELECT * FROM faculty_leaves WHERE LOWER(faculty_email)', [
        { leave_type: 'Casual Leave', num_days: '2', from_date: '2026-03-02', principal_status: 'Approved', status: 'Approved' },
        { leave_type: 'Casual Leave', num_days: '1', from_date: '2026-11-20', principal_status: 'Pending', status: 'Pending', hod_status: 'Pending' },
        { leave_type: 'Casual Leave', num_days: '5', from_date: '2025-12-29', principal_status: 'Approved', status: 'Approved' },
        { leave_type: 'SP CL', num_days: '3', from_date: '2026-06-10', principal_status: 'Approved', status: 'Approved' },
        { leave_type: 'Academic Leave', num_days: '2', from_date: '2026-07-01', principal_status: 'Rejected', status: 'Rejected', hod_status: 'Rejected' },
        { leave_type: 'Paid Leave', num_days: '1.5', from_date: '2026-08-01', principal_status: 'Approved', status: 'Approved' },
      ]],
    ]);
    const res = await request(app).get('/faculty/leaves/balance/ramesh%40rgmcet.edu.in?year=2026').set('Authorization', ADMIN());
    expect(res.status).toBe(200);
    expect(res.body.balances).toEqual({
      'Casual Leave': { quota: 12, used: 2, in_process: 1, remaining: 9 },
      'Academic Leave': { quota: 6, used: 0, in_process: 0, remaining: 6 },
      'SP CL': { quota: 7, used: 3, in_process: 0, remaining: 4 },
      'Paid Leave': { quota: 0, used: 1.5, in_process: 0, remaining: 999 },
    });
  });

  it('faculty can only read their own balance', async () => {
    routeDb([]);
    const res = await request(app).get('/faculty/leaves/balance/other%40rgmcet.edu.in').set('Authorization', bearer('faculty', 'ramesh@rgmcet.edu.in'));
    expect(res.status).toBe(403);
  });
});

describe('Institutional duties & office orders', () => {
  const PRINCIPAL = () => bearer('principal', 'principal@rgmcet.edu.in');
  const body = { faculty_email: 'Ramesh@rgmcet.edu.in', duty_code: 'IIC', position: 'College Coordinator', effective_from: '2026-11-15' };

  it('principal appoints a faculty member and gets a numbered office order for the academic year', async () => {
    const calls = routeDb([
      ['SELECT name, department FROM faculty', [{ name: 'Dr. Ramesh', department: 'CSE (Data Science)' }]],
      ['COUNT(*)::int AS n FROM institutional_duties', [{ n: 4 }]],
      ['INSERT INTO institutional_duties', (_s, p) => [{ id: 9, order_no: p[0], academic_year: p[1], faculty_email: p[2], duty_name: p[6], position: p[7], effective_from: p[8] }]],
    ]);
    const res = await request(app).post('/duties').set('Authorization', PRINCIPAL()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.order_no).toBe('RGMCET/PRL/IIC/2026-27/005');
    expect(res.body.faculty_email).toBe('ramesh@rgmcet.edu.in');
    expect(res.body.duty_name).toBe("Institution's Innovation Council");
    const ins = calls.find(c => c.sql.includes('INSERT INTO institutional_duties'))!;
    expect(ins.params[12]).toBe('principal');
  });

  it('refuses a duplicate active appointment', async () => {
    routeDb([
      ['SELECT name, department FROM faculty', [{ name: 'Dr. Ramesh', department: 'CSE (Data Science)' }]],
      ['SELECT order_no FROM institutional_duties', [{ order_no: 'RGMCET/PRL/IIC/2026-27/001' }]],
    ]);
    const res = await request(app).post('/duties').set('Authorization', PRINCIPAL()).send(body);
    expect(res.status).toBe(409);
  });

  it('validates the body, position and date', async () => {
    routeDb([]);
    const res = await request(app).post('/duties').set('Authorization', PRINCIPAL()).send({ ...body, duty_code: 'XYZ' });
    expect(res.status).toBe(400);
    const res2 = await request(app).post('/duties').set('Authorization', PRINCIPAL()).send({ ...body, effective_to: '2026-01-01' });
    expect(res2.status).toBe(400);
  });

  it('management can view the register but cannot issue orders', async () => {
    routeDb([['FROM institutional_duties', [{ id: 1, order_no: 'X' }]]]);
    const view = await request(app).get('/duties').set('Authorization', bearer('management', 'chair@rgmcet.edu.in'));
    expect(view.status).toBe(200);
    expect(view.body).toHaveLength(1);
    const issue = await request(app).post('/duties').set('Authorization', bearer('management', 'chair@rgmcet.edu.in')).send(body);
    expect(issue.status).toBe(403);
  });

  it('faculty sees only their own orders', async () => {
    const calls = routeDb([['FROM institutional_duties WHERE LOWER(faculty_email)', [{ id: 1 }]]]);
    const res = await request(app).get('/duties/my').set('Authorization', bearer('faculty', 'Ramesh@rgmcet.edu.in'));
    expect(res.status).toBe(200);
    expect(calls.find(c => c.sql.includes('LOWER(faculty_email) = $1'))!.params[0]).toBe('ramesh@rgmcet.edu.in');
  });

  it('principal relieves an appointee with a date', async () => {
    const calls = routeDb([['UPDATE institutional_duties', (_s, p) => [{ id: p[2], status: p[0], relieved_on: p[1] }]]]);
    const res = await request(app).patch('/duties/9/status').set('Authorization', PRINCIPAL()).send({ status: 'Relieved', relieved_on: '2027-05-31' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Relieved', relieved_on: '2027-05-31' });
    expect(calls.some(c => c.sql.includes('UPDATE institutional_duties'))).toBe(true);
  });
});

describe('Oversight is read-only', () => {
  it('principal cannot verify student documents', async () => {
    routeDb([]);
    const res = await request(app).patch('/students/23091A3201/documents/5/status')
      .set('Authorization', bearer('principal', 'principal@rgmcet.edu.in')).send({ verification_status: 'Verified' });
    expect(res.status).toBe(403);
  });
});
