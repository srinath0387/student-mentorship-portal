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
