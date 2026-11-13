/**
 * tests/smoke/notify.test.ts — Telegram / Web Push subscriptions, outbox queueing, notifier, citations.
 */
import request from 'supertest';

const sent: any[] = [];
const s3Objects = new Map<string, string>();
jest.mock('@aws-sdk/client-s3', () => {
  class Cmd { input: any; name: string; constructor(name: string, input: any) { this.name = name; this.input = input; } }
  const mk = (name: string) => class extends Cmd { constructor(input: any) { super(name, input); } };
  return {
    S3Client: class { async send(c: any) {
      sent.push(c);
      if (c.name === 'Put') { s3Objects.set(c.input.Key, c.input.Body); return {}; }
      if (c.name === 'Get') {
        const b = s3Objects.get(c.input.Key);
        if (b == null) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        return { Body: { transformToString: async () => b } };
      }
      if (c.name === 'Delete') { s3Objects.delete(c.input.Key); return {}; }
      if (c.name === 'List') return { Contents: Array.from(s3Objects.keys()).filter(k => k.startsWith(c.input.Prefix)).map(Key => ({ Key })) };
      return {};
    } },
    PutObjectCommand: mk('Put'), GetObjectCommand: mk('Get'), DeleteObjectCommand: mk('Delete'), ListObjectsV2Command: mk('List'),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'notify-test-secret';
process.env.UPLOADS_BUCKET_NAME = 'test-bucket';
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
const STUDENT = () => bearer('student', '24091a3201@rgmcet.edu.in', '24091A3201');
const ADMIN = () => bearer('admin', 'admin@rgmcet.edu.in');
const outbox = () => Array.from(s3Objects.entries()).filter(([k]) => k.startsWith('notify/outbox/')).map(([, v]) => JSON.parse(v));

beforeEach(() => { sent.length = 0; s3Objects.clear(); delete process.env.TELEGRAM_BOT_USERNAME; });
afterAll(() => { db.query.mockReset(); db.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

describe('Notification subscriptions', () => {
  it('saves a browser push subscription under the student key', async () => {
    const calls = routeDb([['INSERT INTO notify_subscriptions', [{ id: 4 }]]]);
    const res = await request(app).post('/notify/push').set('Authorization', STUDENT())
      .send({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123xyz', keys: { p256dh: 'P', auth: 'A' } }, label: 'Chrome on Android' });
    expect(res.status).toBe(201);
    const ins = calls.find(c => c.sql.includes('INSERT INTO notify_subscriptions'))!;
    expect(ins.params[0]).toBe('S:24091A3201');
    expect(ins.params[3]).toBe('https://fcm.googleapis.com/fcm/send/abc123xyz');
  });

  it('rejects a bad push subscription', async () => {
    routeDb([]);
    const res = await request(app).post('/notify/push').set('Authorization', STUDENT()).send({ subscription: { endpoint: 'http://x', keys: {} } });
    expect(res.status).toBe(400);
  });

  it('Telegram linking: off without a bot, then link → poll → connected', async () => {
    routeDb([]);
    expect((await request(app).post('/notify/telegram/link').set('Authorization', STUDENT())).status).toBe(503);
    process.env.TELEGRAM_BOT_USERNAME = 'RgmcetAlertsBot';
    routeDb([]);
    const link = await request(app).post('/notify/telegram/link').set('Authorization', STUDENT());
    expect(link.status).toBe(200);
    expect(link.body.url).toBe(`https://t.me/RgmcetAlertsBot?start=${link.body.code}`);
    const code = link.body.code;
    const codeRow = [{ code, user_key: 'S:24091A3201', role: 'student', department: 'CSE (Data Science)' }];
    routeDb([['FROM telegram_link_codes WHERE code', codeRow]]);
    expect((await request(app).get(`/notify/telegram/link/${code}`).set('Authorization', STUDENT())).body).toEqual({ linked: false });
    // the notifier wrote this after the user pressed Start
    s3Objects.set(`notify/telegram-links/${code}.json`, JSON.stringify({ chat_id: '987654', name: 'Asha' }));
    const calls = routeDb([
      ['FROM telegram_link_codes WHERE code', codeRow],
      ['SELECT channel, address, keys FROM notify_subscriptions', [{ channel: 'telegram', address: '987654' }]],
    ]);
    const done = await request(app).get(`/notify/telegram/link/${code}`).set('Authorization', STUDENT());
    expect(done.body).toEqual({ linked: true });
    const ins = calls.find(c => c.sql.includes("VALUES ($1,$2,$3,'telegram',$4,$5)"))!;
    expect(ins.params.slice(0, 4)).toEqual(['S:24091A3201', 'student', 'CSE (Data Science)', '987654']);
    expect(s3Objects.has(`notify/telegram-links/${code}.json`)).toBe(false);
    expect(outbox()[0].msg.title).toBe('Notifications are on'); // confirmation queued
  });

  it('a link code belongs to the user who created it', async () => {
    routeDb([]); // no matching (code, user_key) row
    const res = await request(app).get('/notify/telegram/link/abcdef0123456789abcdef0123456789').set('Authorization', bearer('student', 'x@rgmcet.edu.in', '24091A3299'));
    expect(res.status).toBe(404);
  });
});

describe('Events queue notifications for subscribed devices', () => {
  it('club payment approved → the student\'s devices', async () => {
    routeDb([
      ['SELECT * FROM club_memberships WHERE id = $1', [{ id: 5, club_id: 7, roll_number: '24091A3201', status: 'payment_submitted' }]],
      ['SELECT name FROM clubs WHERE id', [{ name: 'Coding Club' }]],
      ['SELECT channel, address, keys FROM notify_subscriptions', (_s, p) => (p[0].includes('S:24091A3201')
        ? [{ channel: 'telegram', address: '111' }, { channel: 'push', address: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }] : [])],
    ]);
    const res = await request(app).patch('/clubs/memberships/5').set('Authorization', ADMIN()).send({ status: 'approved' });
    expect(res.status).toBe(200);
    const jobs = outbox();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].msg.title).toMatch(/Welcome to Coding Club/);
    expect(jobs[0].targets.map((t: any) => t.channel).sort()).toEqual(['push', 'telegram']);
  });

  it('nobody subscribed → nothing written to S3', async () => {
    routeDb([
      ['SELECT * FROM club_memberships WHERE id = $1', [{ id: 5, club_id: 7, roll_number: '24091A3201', status: 'payment_submitted' }]],
      ['SELECT name FROM clubs WHERE id', [{ name: 'Coding Club' }]],
    ]);
    await request(app).patch('/clubs/memberships/5').set('Authorization', ADMIN()).send({ status: 'approved' });
    expect(outbox()).toHaveLength(0);
  });

  it('daily job: absence alerts only for reachable parents / students, and gone subscriptions are removed', async () => {
    s3Objects.set('notify/gone/h1.json', JSON.stringify({ channel: 'push', address: 'https://dead' }));
    const calls = routeDb([
      ['SELECT DISTINCT user_key FROM notify_subscriptions', [{ user_key: 'P:24091A3201' }]],
      ['WHERE ar.is_present = false AND s.session_date = $1', [
        { roll: '24091A3201', name: 'Asha', subjects: ['DBMS', 'OS'] },
        { roll: '24091A3202', name: 'Bhavya', subjects: ['DBMS'] },
      ]],
      ['SELECT channel, address, keys FROM notify_subscriptions', (_s, p) => (p[0].includes('P:24091A3201') ? [{ channel: 'telegram', address: '222' }] : [])],
    ]);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handler } = require('../../src/handlers/api');
    const out = await handler({ job: 'daily-notify' }, {});
    const body = JSON.parse(out.body);
    expect(body.absence_alerts).toBe(1);
    expect(body.gone_removed).toBe(0); // mock DELETE returns no rows, but the file is processed
    expect(calls.some(c => c.sql.includes('DELETE FROM notify_subscriptions WHERE channel = $1 AND address = $2') && c.params[1] === 'https://dead')).toBe(true);
    expect(s3Objects.has('notify/gone/h1.json')).toBe(false);
    const job = outbox()[0];
    expect(job.msg.body).toMatch(/Asha \(24091A3201\) was marked absent.*DBMS, OS/);
  });
});

describe('Notifier Lambda', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sends Telegram messages and reports blocked chats as gone', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.NOTIFY_BUCKET = 'test-bucket';
    jest.isolateModules(() => undefined);
    const calls: any[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      const blocked = JSON.parse(init.body).chat_id === '403';
      return { ok: !blocked, status: blocked ? 403 : 200, json: async () => ({ description: 'Forbidden: bot was blocked by the user' }) } as any;
    }) as any;
    let notifier: any;
    jest.isolateModules(() => { notifier = require('../../src/handlers/notifier'); });
    const r = await notifier.deliver({ msg: { title: 'Hi <b>', body: 'x & y', url: '/clubs' }, targets: [{ channel: 'telegram', address: '1' }, { channel: 'telegram', address: '403' }] });
    expect(r.sent).toBe(1);
    expect(r.gone).toEqual([{ channel: 'telegram', address: '403' }]);
    expect(calls[0].url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    expect(calls[0].body.text).toBe('<b>Hi &lt;b&gt;</b>\nx &amp; y'); // escaped
  });

  it('webhook: wrong secret is refused; /start <code> links the chat', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.NOTIFY_BUCKET = 'test-bucket';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as any;
    let notifier: any;
    jest.isolateModules(() => { notifier = require('../../src/handlers/notifier'); });
    const ev = (secret: string, text: string) => ({ requestContext: { http: { method: 'POST' } }, headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
      body: JSON.stringify({ message: { chat: { id: 555, first_name: 'Asha' }, text } }) });
    expect((await notifier.handler(ev('nope', '/start abc'))).statusCode).toBe(401);
    const code = 'a'.repeat(32);
    const ok = await notifier.handler(ev(notifier.telegramWebhookSecret('123:ABC'), `/start ${code}`));
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(s3Objects.get(`notify/telegram-links/${code}.json`)!)).toMatchObject({ chat_id: '555', name: 'Asha' });
  });
});

describe('Citation counts', () => {
  it('saves counts into faculty profiles; HOD only for own department', async () => {
    const calls = routeDb([
      ['FROM faculty_full_profiles p JOIN faculty f', [
        { email: 'ramesh@rgmcet.edu.in', department: 'CSE (Data Science)', publications: [{ id: 'P1', title: 'A' }, { id: 'P2', title: 'B', citations: 3 }] },
        { email: 'lakshmi@rgmcet.edu.in', department: 'ECE', publications: [{ id: 'Q1', title: 'C' }] },
      ]],
      ['FROM hod_credentials', [{ department: 'CSE (Data Science)' }]],
    ]);
    const res = await request(app).post('/publications/citations').set('Authorization', bearer('hod', 'hodcseds@rgmcet.edu.in'))
      .send({ updates: [
        { faculty_email: 'Ramesh@rgmcet.edu.in', id: 'P1', citations: 12 },
        { faculty_email: 'ramesh@rgmcet.edu.in', id: 'P2', citations: 3 },
        { faculty_email: 'lakshmi@rgmcet.edu.in', id: 'Q1', citations: 9 },
        { faculty_email: 'x@y', id: 'Z', citations: -4 },
      ] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1); // P1 only: P2 unchanged, Q1 other department, Z invalid
    const upd = calls.filter(c => c.sql.startsWith('UPDATE faculty_full_profiles SET publications'));
    expect(upd).toHaveLength(1);
    expect(JSON.parse(upd[0].params[0])[0]).toEqual({ id: 'P1', title: 'A', citations: 12 });
  });

  it('students cannot write citation counts', async () => {
    routeDb([]);
    expect((await request(app).post('/publications/citations').set('Authorization', STUDENT()).send({ updates: [] })).status).toBe(403);
  });
});
