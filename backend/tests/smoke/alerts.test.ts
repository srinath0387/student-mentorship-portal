/**
 * tests/smoke/alerts.test.ts — phone alerts for documents, internships, on-duty decisions, placement
 * drives and offers, exam seats / invigilation, faculty selection, and the weekly low-attendance warning.
 * Every subscription lookup answers with one Telegram target per user key, so each queued job's
 * target addresses are exactly the user keys that were alerted.
 */
import request from 'supertest';

const s3Objects = new Map<string, string>();
jest.mock('@aws-sdk/client-s3', () => {
  class Cmd { input: any; name: string; constructor(name: string, input: any) { this.name = name; this.input = input; } }
  const mk = (name: string) => class extends Cmd { constructor(input: any) { super(name, input); } };
  return {
    S3Client: class { async send(c: any) {
      if (c.name === 'Put') s3Objects.set(c.input.Key, c.input.Body);
      if (c.name === 'List') return { Contents: [] };
      return {};
    } },
    PutObjectCommand: mk('Put'), GetObjectCommand: mk('Get'), DeleteObjectCommand: mk('Delete'), ListObjectsV2Command: mk('List'),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'alerts-test-secret';
process.env.UPLOADS_BUCKET_NAME = 'test-bucket';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

type Route = [RegExp | string, any[] | ((sql: string, params: any[]) => any[])];
function routeDb(routes: Route[]) {
  const all: Route[] = [
    ...routes,
    ['SELECT channel, address, keys FROM notify_subscriptions', (_s, p) => (p[0] as string[]).map(k => ({ channel: 'telegram', address: k }))],
    ['FROM super_admin_credentials', [{ '?column?': 1 }]],
  ];
  db.query.mockReset();
  db.query.mockImplementation(async (sql: string, params: any[] = []) => {
    for (const [m, rows] of all) {
      if (typeof m === 'string' ? sql.includes(m) : m.test(sql)) {
        const r = typeof rows === 'function' ? rows(sql, params) : rows;
        return { rows: r, rowCount: r.length };
      }
    }
    return { rows: [], rowCount: 0 };
  });
}
const bearer = (role: string, email: string, reg?: string) => `Bearer ${signSessionToken({ role, email, reg })}`;
const ADMIN = () => bearer('admin', 'admin@rgmcet.edu.in');
const HOD = () => bearer('hod', 'hodcse@rgmcet.edu.in');
/** All alerts queued so far: [{ to: user keys, title, body }] */
const alerts = () => Array.from(s3Objects.entries()).filter(([k]) => k.startsWith('notify/outbox/'))
  .map(([, v]) => JSON.parse(v)).map(j => ({ to: j.targets.map((t: any) => t.address), title: j.msg.title, body: j.msg.body }));
const flush = () => new Promise(r => setTimeout(r, 20)); // fire-and-forget alerts in the faculty-selection router

beforeEach(() => { s3Objects.clear(); });
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); jest.restoreAllMocks(); });

describe('Approvals → the student', () => {
  it('document rejected: student told why', async () => {
    routeDb([['UPDATE student_documents SET verification_status', [{ id: 7, roll_number: '22091A0501', title: 'Aadhaar card' }]]]);
    const res = await request(app).patch('/students/22091A0501/documents/7/status').set('Authorization', ADMIN())
      .send({ verification_status: 'Rejected', admin_note: 'Photo is blurred' });
    expect(res.status).toBe(200);
    expect(alerts()).toEqual([{ to: ['S:22091A0501'], title: 'Document rejected', body: 'Aadhaar card was rejected: Photo is blurred. Upload a corrected copy.' }]);
  });

  it('internship verified', async () => {
    routeDb([['UPDATE student_internships', [{ id: 'i1', roll_number: '22091A0501', role: 'ML Intern', company_name: 'Infosys' }]]]);
    await request(app).put('/internships/i1/verify').set('Authorization', ADMIN()).send({ verification_status: 'verified' });
    expect(alerts()).toEqual([{ to: ['S:22091A0501'], title: 'Internship verified ✓', body: 'ML Intern at Infosys was verified.' }]);
  });

  it('on-duty approved: student and parent both alerted', async () => {
    routeDb([['UPDATE student_permissions', [{ id: 3, roll_number: '22091A0501', permission_type: 'On-Duty', from_date: '2026-11-20', to_date: '2026-11-21' }]]]);
    const res = await request(app).put('/hod/permissions/students/3/status').set('Authorization', ADMIN()).send({ status: 'Approved' });
    expect(res.status).toBe(200);
    const a = alerts();
    expect(a.map(x => x.to[0]).sort()).toEqual(['P:22091A0501', 'S:22091A0501']);
    expect(a.find(x => x.to[0] === 'S:22091A0501')!.body).toBe('Your on-duty request (2026-11-20 to 2026-11-21) was approved.');
  });
});

describe('Placements', () => {
  it('new drive: every eligible student is alerted', async () => {
    routeDb([
      ['INSERT INTO placement_drives', [{ id: 9, company_name: 'TCS', role_title: 'Digital', package_lpa: 7, last_date: '2026-11-30', min_cgpa: 7, max_backlogs: 0, departments: [], batches: [] }]],
      [/SELECT st\.roll_number, st\.name, st\.email/, [{ roll_number: '22091A0501' }, { roll_number: '22091A0502' }]],
    ]);
    const res = await request(app).post('/placement/drives').set('Authorization', ADMIN()).send({ company_name: 'TCS' });
    expect(res.status).toBe(200);
    const a = alerts();
    expect(a).toHaveLength(1);
    expect(a[0].to).toEqual(['S:22091A0501', 'S:22091A0502']);
    expect(a[0]).toMatchObject({ title: 'New placement drive: TCS', body: 'Digital · 7 LPA. You are eligible — apply by 2026-11-30.' });
  });

  it('selected: congratulations to the student', async () => {
    routeDb([
      ['SELECT * FROM placement_drives WHERE id', [{ id: 9, company_name: 'TCS', role_title: 'Digital', min_cgpa: 0, max_backlogs: 0, departments: [], batches: [] }]],
      [/SELECT st\.roll_number, st\.name, st\.email/, [{ roll_number: '22091A0501', name: 'Asha' }]],
    ]);
    await request(app).put('/placement/drives/9/applications/22091A0501').set('Authorization', ADMIN()).send({ status: 'Selected' });
    expect(alerts()).toEqual([{ to: ['S:22091A0501'], title: 'TCS: Selected', body: 'Congratulations! You are selected at TCS as Digital.' }]);
  });
});

describe('Exams', () => {
  it('seats to students and duties to invigilators', async () => {
    routeDb([
      ['SELECT * FROM exam_rooms WHERE id', [{ id: 1, name: 'A101', capacity: 2 }]],
      [/FROM students/, [{ roll_number: '22091A0501' }, { roll_number: '22091A0502' }]],
      ['INSERT INTO exam_sessions', [{ id: 5, title: 'Mid-1 DBMS' }]],
      [/SELECT f\.email, f\.name/, [{ email: 'ramesh@rgmcet.edu.in', name: 'Ramesh', duties: 0 }]],
    ]);
    const res = await request(app).post('/exams/sessions').set('Authorization', ADMIN())
      .send({ title: 'Mid-1 DBMS', exam_date: '2026-11-25', slot: 'FN', groups: [{ department: 'CSE', year: '4th Year' }], room_ids: [1] });
    expect(res.status).toBe(200);
    const a = alerts();
    expect(a.find(x => x.title === 'Exam seat allotted: Mid-1 DBMS')!.to).toEqual(['S:22091A0501', 'S:22091A0502']);
    expect(a.find(x => x.title === 'Invigilation duty: Mid-1 DBMS')!.to).toEqual(['E:ramesh@rgmcet.edu.in']);
  });
});

describe('Faculty selection', () => {
  const RID = '11111111-1111-4111-8111-111111111111';
  const round = { id: RID, department: 'CSE', semester_label: '4-1', title: '4-1 Electives', status: 'draft', starts_at: new Date(Date.now() - 60e3).toISOString(), ends_at: new Date(Date.now() + 3600e3).toISOString() };

  it('opening a round alerts every eligible student', async () => {
    routeDb([
      ['FROM hod_credentials', [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }]],
      ['SELECT * FROM fs_rounds WHERE id', [round]],
      [/COUNT\(\*\)::int AS eligible/, [{ eligible: 2, sections: ['A'] }]],
      [/FROM fs_offerings o JOIN fs_groups g ON g\.id = o\.group_id\s+WHERE o\.round_id = \$1 ORDER BY/, [{ id: 'o1', subject_id: 's1' }]],
      [/FROM fs_subjects WHERE round_id = \$1 ORDER BY/, [{ id: 's1', subject_name: 'DL' }]],
      ['UPDATE fs_rounds SET status', [{ ...round, status: 'open' }]],
      ['SELECT roll_number FROM fs_eligible_students', [{ roll_number: '22091A0501' }, { roll_number: '22091A0502' }]],
    ]);
    const res = await request(app).post(`/faculty-selection/rounds/${RID}/status`).set('Authorization', HOD()).send({ status: 'open' });
    expect(res.status).toBe(200);
    await flush();
    const a = alerts();
    expect(a).toHaveLength(1);
    expect(a[0].to).toEqual(['S:22091A0501', 'S:22091A0502']);
    expect(a[0].title).toBe('Faculty selection is open: 4-1 Electives');
  });

  it('release tells the student the admin will assign', async () => {
    routeDb([
      ['FROM hod_credentials', [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }]],
      ['SELECT round_id FROM fs_selections', [{ round_id: RID }]],
      ['SELECT * FROM fs_rounds WHERE id', [{ ...round, status: 'open' }]],
      [/FROM fs_selections sel\s+JOIN fs_subjects s ON s\.id = sel\.subject_id\s+LEFT JOIN fs_offerings o ON o\.id = sel\.offering_id\s+WHERE sel\.id = \$1 FOR UPDATE/, [{ id: 'sel1', round_id: RID, status: 'active', roll_number: '22091A0501', subject_name: 'Deep Learning', offering_id: 'o1' }]],
    ]);
    const res = await request(app).post('/faculty-selection/selections/sel1/release').set('Authorization', HOD()).send({});
    expect(res.status).toBe(200);
    await flush();
    expect(alerts()).toEqual([{ to: ['S:22091A0501'], title: 'Faculty choice released: Deep Learning', body: 'Your choice for Deep Learning was released by the admin. The admin will assign your faculty.' }]);
  });
});

describe('Daily job', () => {
  const run = async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handler } = require('../../src/handlers/api');
    return JSON.parse((await handler({ job: 'daily-notify' }, {})).body);
  };
  const lowRow = { roll: '22091A0501', name: 'Asha', held: 40, attended: 26 };

  it('Monday: students below 75% (and their parents) get a warning', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-16T12:30:00Z').getTime()); // Monday 6 PM IST
    routeDb([
      ['SELECT DISTINCT user_key FROM notify_subscriptions', [{ user_key: 'S:22091A0501' }, { user_key: 'P:22091A0501' }]],
      ['HAVING SUM(s.num_periods) >= 10', [lowRow]],
    ]);
    const out = await run();
    expect(out.low_attendance).toBe(2);
    const a = alerts();
    expect(a.find(x => x.to[0] === 'S:22091A0501')).toMatchObject({ title: 'Attendance 65% — below 75%', body: 'You have attended 26 of 40 periods. Attend regularly to stay eligible for exams.' });
    expect(a.find(x => x.to[0] === 'P:22091A0501')!.title).toBe('Attendance 65% — Asha');
  });

  it('other days: no low-attendance warning; faculty-selection closing reminder goes to pending students', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-17T12:30:00Z').getTime()); // Tuesday
    routeDb([
      ['SELECT DISTINCT user_key FROM notify_subscriptions', [{ user_key: 'S:22091A0501' }]],
      ['HAVING SUM(s.num_periods) >= 10', [lowRow]],
      [/FROM fs_rounds r WHERE r\.status = 'open'/, [{ id: 'r1', title: '4-1 Electives', ends_at: '2026-11-18T11:30:00Z', subjects: 2, pending: ['22091A0502'] }]],
    ]);
    const out = await run();
    expect(out.low_attendance).toBe(0);
    expect(out.selection_reminders).toBe(1);
    expect(alerts()).toEqual([{ to: ['S:22091A0502'], title: 'Faculty selection closes soon', body: '4-1 Electives closes 18 Nov, 05:00 pm. You have not chosen all your faculty yet.' }]);
  });
});
