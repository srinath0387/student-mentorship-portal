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
