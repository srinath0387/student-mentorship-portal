/**
 * tests/smoke/mail-syllabus.test.ts — HOD email to faculty (queueing, scope, attachments, delivery
 * results), the notifier's SES sending, subject syllabus access, and event "organized / attended"
 * with expected / achieved outcomes.
 */
import request from 'supertest';

const s3Objects = new Map<string, any>();
jest.mock('@aws-sdk/client-s3', () => {
  class Cmd { input: any; name: string; constructor(name: string, input: any) { this.name = name; this.input = input; } }
  const mk = (name: string) => class extends Cmd { constructor(input: any) { super(name, input); } };
  return {
    S3Client: class { async send(c: any) {
      if (c.name === 'Put') { s3Objects.set(c.input.Key, c.input.Body); return {}; }
      if (c.name === 'Head') {
        const v = s3Objects.get(c.input.Key);
        if (v == null) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
        return { ContentLength: typeof v === 'string' ? v.length : v.length, ContentType: 'application/pdf' };
      }
      if (c.name === 'Get') {
        const v = s3Objects.get(c.input.Key);
        if (v == null) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        return { Body: { transformToString: async () => String(v), transformToByteArray: async () => Buffer.from(v) } };
      }
      if (c.name === 'Delete') { s3Objects.delete(c.input.Key); return {}; }
      if (c.name === 'List') return { Contents: Array.from(s3Objects.keys()).filter(k => k.startsWith(c.input.Prefix)).map(Key => ({ Key })) };
      return {};
    } },
    PutObjectCommand: mk('Put'), GetObjectCommand: mk('Get'), DeleteObjectCommand: mk('Delete'), ListObjectsV2Command: mk('List'), HeadObjectCommand: mk('Head'),
  };
});
const sesCalls: any[] = [];
let sesFail: ((to: string, n: number) => Error | null) = () => null;
jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class { async send(c: any) {
    const to = c.input.Destination.ToAddresses[0];
    const n = sesCalls.filter(x => x.to === to).length;
    sesCalls.push({ to, raw: Buffer.from(c.input.Content.Raw.Data).toString(), from: c.input.FromEmailAddress });
    const err = sesFail(to, n);
    if (err) throw err;
    return { MessageId: `m-${sesCalls.length}` };
  } },
  SendEmailCommand: class { input: any; constructor(i: any) { this.input = i; } },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'mail-test-secret';
process.env.UPLOADS_BUCKET_NAME = 'test-bucket';
process.env.NOTIFY_BUCKET = 'test-bucket';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const notifier = require('../../src/handlers/notifier');

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
const bearer = (role: string, email: string) => `Bearer ${signSessionToken({ role, email })}`;
const HOD = () => bearer('hod', 'hodcse@rgmcet.edu.in');
const FAC = () => bearer('faculty', 'ramesh@rgmcet.edu.in');
const HOD_ROW: Route = ['FROM hod_credentials', [{ email: 'hodcse@rgmcet.edu.in', department: 'CSE' }]];
const CSE_FACULTY = Array.from({ length: 60 }, (_, i) => ({ name: `Faculty ${i + 1}`, email: `f${i + 1}@rgmcet.edu.in`, department: 'CSE' }));
const outbox = () => Array.from(s3Objects.entries()).filter(([k]) => k.startsWith('notify/outbox/')).map(([, v]) => JSON.parse(v));

beforeEach(() => { s3Objects.clear(); sesCalls.length = 0; sesFail = () => null; process.env.MAIL_FROM = 'RGMCET Portal <noreply@rgmcet.edu.in>'; });
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); delete process.env.MAIL_FROM; });

describe('Email to faculty — API', () => {
  it('says plainly when sending is not set up', async () => {
    delete process.env.MAIL_FROM;
    routeDb([HOD_ROW]);
    const res = await request(app).post('/mail/send').set('Authorization', HOD()).send({ subject: 'Hi', body: 'Hello', recipients: 'all' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not set up/);
  });

  it('HOD → all faculty of their department: one email job per 50 faculty, replies go to the HOD', async () => {
    s3Objects.set('notify/mail-files/2026-11/ab_circular.pdf', '%PDF-1.4 test');
    const calls = routeDb([
      HOD_ROW,
      [/FROM faculty f WHERE/, CSE_FACULTY],
      ['INSERT INTO staff_mails', (_s, p) => [{ id: 77, recipients: JSON.parse(p[6]) }]],
    ]);
    const res = await request(app).post('/mail/send').set('Authorization', HOD())
      .send({ subject: 'Lesson plans due', body: 'Dear Faculty,\nSubmit by Friday.', recipients: 'all', attachments: [{ key: 'notify/mail-files/2026-11/ab_circular.pdf', name: 'circular.pdf' }] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 77, recipients: 60, attachments: 1 });
    const facultyQuery = calls.find(c => /FROM faculty f WHERE/.test(c.sql))!;
    expect(facultyQuery.params).toEqual(['cse']);            // HOD is locked to their own department
    const jobs = outbox().filter(j => j.kind === 'email');
    expect(jobs.map(j => j.to.length).sort()).toEqual([10, 50]);
    expect(jobs[0]).toMatchObject({ mail_id: 77, reply_to: 'hodcse@rgmcet.edu.in', subject: 'Lesson plans due', from_name: 'HOD, CSE via RGMCET' });
    expect(jobs[0].html).toContain('Dear Faculty,<br>Submit by Friday.');
    expect(jobs[0].attachments).toEqual([{ key: 'notify/mail-files/2026-11/ab_circular.pdf', name: 'circular.pdf', type: 'application/pdf' }]);
  });

  it('selected faculty must be faculty the sender may email', async () => {
    routeDb([HOD_ROW, [/FROM faculty f WHERE/, CSE_FACULTY.slice(0, 3)]]);
    const res = await request(app).post('/mail/send').set('Authorization', HOD())
      .send({ subject: 'S', body: 'B', recipients: ['f1@rgmcet.edu.in', 'someone@ece.rgmcet.edu.in'] });
    expect(res.status).toBe(403);
  });

  it('rejects attachments that were not uploaded through the portal', async () => {
    routeDb([HOD_ROW, [/FROM faculty f WHERE/, CSE_FACULTY.slice(0, 3)]]);
    const res = await request(app).post('/mail/send').set('Authorization', HOD())
      .send({ subject: 'S', body: 'B', recipients: 'all', attachments: [{ key: 'academic/events/x.pdf', name: 'x.pdf' }] });
    expect(res.status).toBe(400);
  });

  it('faculty cannot send', async () => {
    routeDb([]);
    expect((await request(app).post('/mail/send').set('Authorization', FAC()).send({ subject: 'S', body: 'B', recipients: 'all' })).status).toBe(403);
  });

  it('Sent list merges delivery results reported by the notifier', async () => {
    s3Objects.set('notify/mail-status/77/0.json', JSON.stringify({ results: [{ email: 'f1@rgmcet.edu.in', status: 'sent' }, { email: 'f2@rgmcet.edu.in', status: 'failed', error: 'Mailbox full' }] }));
    let saved: any = null;
    routeDb([
      HOD_ROW,
      [/SELECT id FROM staff_mails WHERE .* status = 'sending'/, [{ id: 77 }]],
      ['SELECT recipients, chunks, chunks_done FROM staff_mails', [{ chunks: 1, chunks_done: 0, recipients: [{ email: 'f1@rgmcet.edu.in', status: 'queued' }, { email: 'f2@rgmcet.edu.in', status: 'queued' }] }]],
      ['UPDATE staff_mails SET recipients', (_s, p) => { saved = p; return []; }],
    ]);
    const res = await request(app).get('/mail/sent').set('Authorization', HOD());
    expect(res.status).toBe(200);
    expect(saved[3]).toBe('partial');
    expect(JSON.parse(saved[1])).toEqual([{ email: 'f1@rgmcet.edu.in', status: 'sent', error: null }, { email: 'f2@rgmcet.edu.in', status: 'failed', error: 'Mailbox full' }]);
    expect(s3Objects.has('notify/mail-status/77/0.json')).toBe(false);
  });
});

describe('Email to faculty — notifier (Amazon SES)', () => {
  const job = (to: string[]) => ({
    kind: 'email', mail_id: 5, chunk: 0, from_name: 'HOD, CSE via RGMCET', reply_to: 'hodcse@rgmcet.edu.in',
    subject: 'Lesson plans — due Friday', text: 'Hello', html: '<p>Hello</p>',
    to: to.map(e => ({ email: e, name: e.split('@')[0] })), attachments: [{ key: 'notify/mail-files/a.pdf', name: 'Circular.pdf', type: 'application/pdf' }],
  });

  it('sends one email per faculty with the attachment, from the verified address, reply-to the HOD', async () => {
    s3Objects.set('notify/mail-files/a.pdf', 'PDFDATA');
    const results = await notifier.deliverMail(job(['a@rgmcet.edu.in', 'b@rgmcet.edu.in']));
    expect(results.map((r: any) => r.status)).toEqual(['sent', 'sent']);
    expect(sesCalls).toHaveLength(2);
    const raw = sesCalls[0].raw;
    expect(sesCalls[0].from).toBe('noreply@rgmcet.edu.in');
    expect(raw).toMatch(/^From: "HOD, CSE via RGMCET" <noreply@rgmcet\.edu\.in>/m);
    expect(raw).toMatch(/^Reply-To: hodcse@rgmcet\.edu\.in/m);
    expect(raw).toMatch(/^Subject: =\?UTF-8\?B\?/m);          // "—" is not ASCII → encoded
    expect(raw).toContain('Content-Disposition: attachment; filename="Circular.pdf"');
    expect(raw).toContain(Buffer.from('PDFDATA').toString('base64'));
    expect(raw.match(/^To: .*$/gm)).toHaveLength(1);         // nobody sees the other recipients
  });

  it('retries when SES throttles and reports addresses that fail', async () => {
    s3Objects.set('notify/mail-files/a.pdf', 'PDFDATA');
    sesFail = (to, n) => (to.startsWith('slow') && n === 0 ? Object.assign(new Error('Maximum sending rate exceeded'), { name: 'TooManyRequestsException' })
      : to.startsWith('bad') ? new Error('Email address is not verified. The following identities failed the check: bad@x.com') : null);
    const results = await notifier.deliverMail(job(['slow@rgmcet.edu.in', 'bad@x.com']));
    const by = Object.fromEntries(results.map((r: any) => [r.email, r]));
    expect(by['slow@rgmcet.edu.in'].status).toBe('sent');
    expect(by['bad@x.com']).toMatchObject({ status: 'failed' });
    expect(by['bad@x.com'].error).toMatch(/sandbox/);
  });

  it('an email job from the outbox writes per-recipient results back for the API', async () => {
    s3Objects.set('notify/mail-files/a.pdf', 'PDFDATA');
    s3Objects.set('notify/outbox/1-mail-5-0.json', JSON.stringify(job(['a@rgmcet.edu.in'])));
    await notifier.handler({ Records: [{ s3: { object: { key: 'notify/outbox/1-mail-5-0.json' } } }] });
    expect(JSON.parse(s3Objects.get('notify/mail-status/5/0.json'))).toEqual({ results: [{ email: 'a@rgmcet.edu.in', status: 'sent' }] });
    expect(s3Objects.has('notify/outbox/1-mail-5-0.json')).toBe(false);
  });
});

describe('Subject syllabus', () => {
  const allot = { id: 'a1', subject_name: 'Deep Learning', semester_label: '4-1', section: 'A', department: 'CSE', faculty_email: 'ramesh@rgmcet.edu.in', co_faculty_email: null };
  it('the subject faculty saves it; it is shared by department + semester + subject', async () => {
    const calls = routeDb([
      ['SELECT * FROM subject_allotments WHERE id', [allot]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE', name: 'Dr. K. Ramesh' }]],
      ['INSERT INTO subject_syllabi', (_s, p) => [{ id: 1, units: JSON.parse(p[9]) }]],
    ]);
    const res = await request(app).put('/syllabus/a1').set('Authorization', FAC()).send({
      subject_code: 'A0532', units: [
        { title: 'Introduction', hours: 10, topics: ['What is DL', '  ', 'Perceptron'] },
        { title: '', hours: null, topics: [] },
      ], outcomes: [{ code: 'CO1', text: 'Explain DL' }, { code: 'CO2', text: '' }],
    });
    expect(res.status).toBe(200);
    const ins = calls.find(c => c.sql.includes('INSERT INTO subject_syllabi'))!;
    expect(ins.params.slice(0, 4)).toEqual(['CSE', 'cse', '4-1', 'Deep Learning']);
    expect(JSON.parse(ins.params[9])).toEqual([{ unit: 1, title: 'Introduction', hours: 10, topics: ['What is DL', 'Perceptron'] }]);
    expect(JSON.parse(ins.params[8])).toEqual([{ code: 'CO1', text: 'Explain DL' }]);
    expect(ins.sql).toMatch(/ON CONFLICT \(dept_key, semester_label, LOWER\(subject_name\)\)/);
  });

  it('faculty who do not teach the subject cannot edit it', async () => {
    routeDb([
      ['SELECT * FROM subject_allotments WHERE id', [{ ...allot, faculty_email: 'someone@rgmcet.edu.in' }]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE' }]],
    ]);
    const res = await request(app).put('/syllabus/a1').set('Authorization', FAC()).send({ units: [{ title: 'X', topics: ['a'] }] });
    expect(res.status).toBe(403);
  });
});

describe('Event reports — organized / attended, expected and achieved outcomes', () => {
  it('saves participation and expected outcomes', async () => {
    const calls = routeDb([
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE', name: 'Dr. K. Ramesh' }]],
      ['INSERT INTO dept_events', (_s, p) => [{ id: 9, participation: p[26], expected_outcomes: p[27] }]],
    ]);
    const res = await request(app).post('/events').set('Authorization', FAC()).send({
      event_type: 'Faculty Development Programme (FDP)', participation: 'attended', title: 'FDP on GenAI', organized_by: 'NIT Warangal',
      start_date: '2026-11-10', end_date: '2026-11-14', expected_outcomes: '1. Build LLM apps\n2. Teach RAG', outcomes: '1. Built a RAG demo',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 9, participation: 'attended', expected_outcomes: '1. Build LLM apps\n2. Teach RAG' });
    const ins = calls.find(c => c.sql.includes('INSERT INTO dept_events'))!;
    expect(ins.params[19]).toBe('1. Built a RAG demo');   // achieved outcomes keep the existing column
  });

  it('anything other than "attended" is stored as organized', async () => {
    const calls = routeDb([
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE', name: 'R' }]],
      ['INSERT INTO dept_events', [{ id: 10 }]],
    ]);
    await request(app).post('/events').set('Authorization', FAC()).send({ event_type: 'Workshop', participation: 'bogus', title: 'W', start_date: '2026-11-10', end_date: '2026-11-10' });
    expect(calls.find(c => c.sql.includes('INSERT INTO dept_events'))!.params[26]).toBe('organized');
  });
});

describe('College-format session plan', () => {
  const allot = { id: '11111111-2222-3333-4444-555555555555', subject_name: 'Introduction to Data Science', semester_label: '2-1', section: '2', department: 'CSE (Data Science)', faculty_email: 'ramesh@rgmcet.edu.in', co_faculty_email: null };
  it('the subject faculty saves session rows without touching the approval status', async () => {
    const calls = routeDb([
      ['FROM subject_allotments', [allot]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE (Data Science)', name: 'G. Vikram Chandra' }]],
      ['UPDATE lesson_plans SET session_plan', [{ id: 1 }]],
    ]);
    const res = await request(app).put('/lesson-plans/allotment/11111111-2222-3333-4444-555555555555/sessions').set('Authorization', FAC()).send({
      rows: [{ kind: 'session', unit: 1, text: 'Introduction to Data science, Benefits and uses' }, { kind: 'bogus', unit: 99, text: 'Why…?' }, { kind: 'session', unit: 1, text: '' }],
      settings: { periods_per_session: 9, discussion_every: 2, topics_key: '40-abc' },
    });
    expect(res.status).toBe(200);
    const upd = calls.find(c => c.sql.includes('UPDATE lesson_plans SET session_plan'))!;
    expect(upd.sql).not.toMatch(/status/);
    expect(JSON.parse(upd.params[1])).toEqual([
      { kind: 'session', unit: 1, text: 'Introduction to Data science, Benefits and uses' },
      { kind: 'session', unit: 20, text: 'Why…?' },
    ]);
    expect(JSON.parse(upd.params[2])).toEqual({ periods_per_session: 4, discussion_every: 2, topics_key: '40-abc' });
  });

  it('other faculty cannot save it', async () => {
    routeDb([
      ['FROM subject_allotments', [{ ...allot, faculty_email: 'someone@rgmcet.edu.in' }]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE (Data Science)' }]],
    ]);
    expect((await request(app).put('/lesson-plans/allotment/11111111-2222-3333-4444-555555555555/sessions').set('Authorization', FAC()).send({ rows: [] })).status).toBe(403);
  });
});

describe('Course Execution Plan', () => {
  const AID = '11111111-2222-3333-4444-555555555555';
  const allot = { id: AID, subject_name: 'Operating Systems', semester_label: '2-2', section: 'A', department: 'CSE', faculty_email: 'ramesh@rgmcet.edu.in', faculty_name: 'Ramesh', co_faculty_email: null };
  const HOD_CSE = () => `Bearer ${signSessionToken({ role: 'hod', email: 'hodcse@rgmcet.edu.in', department: 'CSE' })}`;
  const HOD_ECE = () => `Bearer ${signSessionToken({ role: 'hod', email: 'hodece@rgmcet.edu.in', department: 'ECE' })}`;
  const HODS: Route = ['FROM hod_credentials', (_s, p) => [{ email: p.find((x: any) => /hod/.test(String(x))), department: /hodece/i.test(JSON.stringify(p)) ? 'ECE' : 'CSE' }]];

  it('the subject faculty saves it; only known fields are kept and progress is worked out on the server', async () => {
    const calls = routeDb([
      ['FROM subject_allotments', [allot]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE', name: 'Ramesh' }]],
      ['INSERT INTO course_exec_plans', (_s, p) => [{ progress: p[8], updated_at: '2026-11-27T10:00:00Z' }]],
    ]);
    const res = await request(app).put(`/exec-plans/allotment/${AID}`).set('Authorization', FAC()).send({
      data: {
        initial: { faculty_name: 'Ramesh', short_code: 'OS', teaching_weeks: 13, hacked: 'x', vision: 'v'.repeat(5000) },
        brief: [{ unit: 'Unit 1', heading: 'Intro', topics: 'a, b', hours: '10', evil: '<script>' }],
        weekly: Array.from({ length: 40 }, (_, i) => ({ week: String(i + 1), topic: 'T' })),
        experts: [{ name: 'S. Rao' }, { name: 'B' }, { name: 'third one is dropped' }],
        teams: [{ week: '1', s1: 'Ravi' }],
        extra_sheet: [{ a: 1 }],
      },
    });
    expect(res.status).toBe(200);
    const ins = calls.find(c => c.sql.includes('INSERT INTO course_exec_plans'))!;
    const data = JSON.parse(ins.params[7]);
    expect(Object.keys(data).sort()).toEqual(['brief', 'experts', 'initial', 'teams', 'weekly']);
    expect(data.initial.hacked).toBeUndefined();
    expect(data.initial.teaching_weeks).toBe('13');
    expect(data.initial.vision.length).toBe(3000);
    expect(data.brief[0].evil).toBeUndefined();
    expect(data.weekly).toHaveLength(30);
    expect(data.experts).toHaveLength(2);
    expect(ins.params[8]).toBeGreaterThan(0);
    expect(ins.params[8]).toBeLessThan(100);
    expect(res.body.progress).toBe(ins.params[8]);
  });

  it('other faculty cannot save it', async () => {
    routeDb([
      ['FROM subject_allotments', [{ ...allot, faculty_email: 'someone@rgmcet.edu.in' }]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE' }]],
    ]);
    expect((await request(app).put(`/exec-plans/allotment/${AID}`).set('Authorization', FAC()).send({ data: {} })).status).toBe(403);
  });

  it('loads the saved plan with class strength, student names and the department catalog', async () => {
    routeDb([
      ['FROM subject_allotments', [allot]],
      [/FROM faculty WHERE LOWER\(email\)/, [{ department: 'CSE' }]],
      ['FROM course_exec_plans WHERE allotment_id', [{ data: { initial: { short_code: 'OS' } }, progress: 40, updated_at: '2026-11-27' }]],
      ['FROM subject_rosters r', [{ roll_number: '23091A0501', name: 'Ravi Kumar' }, { roll_number: '23091A0502', name: 'Sita Devi' }]],
      ['FROM course_exec_settings', [{ catalog: [{ semester: 'II-II', short_code: 'OS', subject: 'Operating Systems' }], due_date: '2026-11-30' }]],
    ]);
    const res = await request(app).get(`/exec-plans/allotment/${AID}`).set('Authorization', FAC());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ can_edit: true, strength: 2, due_date: '2026-11-30', plan: { progress: 40 } });
    expect(res.body.students.map((s: any) => s.name)).toEqual(['Ravi Kumar', 'Sita Devi']);
    expect(res.body.catalog[0].short_code).toBe('OS');
  });

  it('the HOD of the department can view it but not edit; another department’s HOD cannot see it', async () => {
    routeDb([HODS, ['FROM subject_allotments', [allot]]]);
    const own = await request(app).get(`/exec-plans/allotment/${AID}`).set('Authorization', HOD_CSE());
    expect(own.status).toBe(200);
    expect(own.body.can_edit).toBe(false);
    expect((await request(app).put(`/exec-plans/allotment/${AID}`).set('Authorization', HOD_CSE()).send({ data: {} })).status).toBe(403);
    expect((await request(app).get(`/exec-plans/allotment/${AID}`).set('Authorization', HOD_ECE())).status).toBe(403);
  });

  it('the HOD saves the subject catalog and due date for their own department only', async () => {
    const calls = routeDb([HODS]);
    const res = await request(app).put('/exec-plans/settings').set('Authorization', HOD_CSE()).send({
      department: 'ECE', due_date: '2026-11-30',
      catalog: [{ semester: 'II-II', short_code: 'OS', subject: 'Operating Systems', tools: 'Linux; VirtualBox', junk: 1 }, { semester: '', short_code: '', subject: '' }],
    });
    expect(res.status).toBe(200);
    const ins = calls.find(c => c.sql.includes('INSERT INTO course_exec_settings'))!;
    expect(ins.params[0]).toBe('cse');
    expect(JSON.parse(ins.params[2])).toEqual([{ semester: 'II-II', short_code: 'OS', subject: 'Operating Systems', syllabus_code: '', key_topics: '', tools: 'Linux; VirtualBox' }]);
    expect(ins.params[3]).toBe('2026-11-30');
    expect((await request(app).put('/exec-plans/settings').set('Authorization', FAC()).send({ catalog: [] })).status).toBe(403);
  });

  it('the department list is scoped to the HOD’s department; full=1 returns only saved plans with their data', async () => {
    const calls = routeDb([HODS, ['FROM subject_allotments a LEFT JOIN course_exec_plans', [{ allotment_id: AID, subject_name: 'Operating Systems', progress: 55, data: {} }]]]);
    const res = await request(app).get('/exec-plans/department?department=ECE&full=1').set('Authorization', HOD_CSE());
    expect(res.status).toBe(200);
    expect(res.body.department).toBe('CSE');
    const q = calls.find(c => c.sql.includes('LEFT JOIN course_exec_plans'))!;
    expect(q.params[0]).toBe('cse');
    expect(q.sql).toMatch(/p\.data/);
    expect(q.sql).toMatch(/p\.allotment_id IS NOT NULL/);
    expect((await request(app).get('/exec-plans/department').set('Authorization', FAC())).status).toBe(403);
  });
});
