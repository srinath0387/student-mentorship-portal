/**
 * handlers/notifier.ts — delivers notifications to phones / browsers.
 *
 * Runs OUTSIDE the VPC (the API Lambda has no internet access — no NAT gateway, to save cost).
 *  - S3 trigger: the API Lambda writes a job to  notify/outbox/<id>.json  in the uploads bucket
 *    (reachable for free through the S3 gateway endpoint). This function sends each target a
 *    Telegram message or a Web Push, then deletes the job. Dead targets (blocked bot, expired
 *    browser subscription) are reported back as notify/gone/<hash>.json for the API to clean up.
 *  - Function URL: Telegram webhook. "/start <code>" links a chat to an app account by writing
 *    notify/telegram-links/<code>.json, which the app picks up.
 */
import { createHash } from 'crypto';
import webpush from 'web-push';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const s3 = new S3Client({});
const BUCKET = process.env.NOTIFY_BUCKET || '';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY; const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@rgmcet.edu.in', pub, priv);
  vapidReady = true;
  return true;
}

/** Shared with deploy.sh: the webhook secret is derived from the bot token. */
export const telegramWebhookSecret = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 48);

export interface NotifyJob {
  msg: { title: string; body: string; url?: string; tag?: string };
  targets: { channel: 'push' | 'telegram'; address: string; keys?: { p256dh: string; auth: string } }[];
}

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const appLink = (url?: string) => (url && APP_URL ? `${APP_URL}/#${url.startsWith('/') ? url : '/' + url}` : APP_URL || undefined);

async function tg(method: string, body: any): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function putJson(key: string, value: any) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: JSON.stringify(value), ContentType: 'application/json' }));
}

/** Send one job. Returns the targets that are permanently unreachable. */
export async function deliver(job: NotifyJob): Promise<{ sent: number; gone: NotifyJob['targets'] }> {
  const gone: NotifyJob['targets'] = [];
  let sent = 0;
  const link = appLink(job.msg.url);
  await Promise.all(job.targets.map(async t => {
    try {
      if (t.channel === 'telegram') {
        if (!TG_TOKEN) return;
        const r = await tg('sendMessage', {
          chat_id: t.address,
          text: `<b>${esc(job.msg.title)}</b>\n${esc(job.msg.body)}`,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(link && link.startsWith('https://') ? { reply_markup: { inline_keyboard: [[{ text: 'Open in app', url: link }]] } } : {}),
        });
        if (r.ok) sent++;
        else if (r.status === 403 || (r.status === 400 && /chat not found/i.test(r.data?.description || ''))) gone.push(t);
      } else if (t.channel === 'push' && t.keys && ensureVapid()) {
        await webpush.sendNotification({ endpoint: t.address, keys: t.keys },
          JSON.stringify({ title: job.msg.title, body: job.msg.body, url: job.msg.url || '/', tag: job.msg.tag }),
          { TTL: 24 * 3600, urgency: 'normal' });
        sent++;
      }
    } catch (err: any) {
      if (t.channel === 'push' && (err?.statusCode === 404 || err?.statusCode === 410)) gone.push(t);
      else console.warn('[notifier] send failed', t.channel, err?.statusCode || err?.message);
    }
  }));
  return { sent, gone };
}

// ─── Email (Amazon SES) ────────────────────────────────────────────────────────
export interface MailJob {
  kind: 'email'; mail_id: number; chunk: number; from_name: string; reply_to?: string;
  subject: string; text: string; html: string;
  to: { email: string; name?: string }[];
  attachments: { key: string; name: string; type: string }[];
}
const MAIL_FROM = () => process.env.MAIL_FROM || '';
let ses: SESv2Client | null = null;
const b64 = (v: string | Buffer | Uint8Array) => Buffer.from(v as any).toString('base64');
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
/** RFC 2047 encoded-word for headers that are not plain ASCII */
const hdr = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const displayName = (n: string) => { const c = String(n || '').replace(/["\\\r\n]/g, '').trim(); return /^[\x20-\x7e]*$/.test(c) ? `"${c}"` : hdr(c); };
const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] || from).trim();

/** One multipart/mixed message: text + HTML alternative, then the attachments. */
export function buildMime(o: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string; files: { name: string; type: string; data: Buffer }[] }): string {
  const tag = Math.random().toString(36).slice(2);
  const mixed = `mixed_${tag}`; const alt = `alt_${tag}`;
  const out: string[] = [
    `From: ${o.from}`, `To: ${o.to}`, ...(o.replyTo ? [`Reply-To: ${o.replyTo}`] : []),
    `Subject: ${hdr(o.subject)}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`, '',
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '',
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(o.text)),
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(o.html)),
    `--${alt}--`,
  ];
  for (const f of o.files) {
    const name = hdr(f.name.replace(/["\r\n]/g, ''));
    out.push(`--${mixed}`, `Content-Type: ${f.type}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64', '', wrap76(b64(f.data)));
  }
  out.push(`--${mixed}--`, '');
  return out.join('\r\n');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function sendRaw(raw: string, to: string): Promise<void> {
  if (!ses) ses = new SESv2Client({});
  for (let attempt = 0; ; attempt++) {
    try {
      await ses.send(new SendEmailCommand({
        FromEmailAddress: addressOf(MAIL_FROM()),
        Destination: { ToAddresses: [to] },
        Content: { Raw: { Data: Buffer.from(raw) } },
      }));
      return;
    } catch (err: any) {
      const throttled = /Throttl|TooManyRequests|Maximum sending rate/i.test(`${err?.name} ${err?.message}`);
      if (!throttled || attempt >= 3) throw err;
      await sleep(800 * (attempt + 1));
    }
  }
}
const mailError = (err: any) => {
  const m = String(err?.message || err || 'Send failed');
  if (/not verified/i.test(m)) return `Address not verified in Amazon SES (sandbox). ${m}`;
  return m.slice(0, 300);
};

/** Send one email per recipient; write per-recipient results for the API to collect. */
export async function deliverMail(job: MailJob): Promise<{ email: string; status: 'sent' | 'failed'; error?: string }[]> {
  const results: { email: string; status: 'sent' | 'failed'; error?: string }[] = [];
  if (!MAIL_FROM()) return job.to.map(t => ({ email: t.email, status: 'failed' as const, error: 'Email sending is not set up (MAIL_FROM).' }));
  const files: { name: string; type: string; data: Buffer }[] = [];
  for (const a of job.attachments || []) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: a.key }));
    files.push({ name: a.name, type: a.type || 'application/octet-stream', data: Buffer.from(await obj.Body!.transformToByteArray()) });
  }
  const from = `${displayName(job.from_name)} <${addressOf(MAIL_FROM())}>`;
  const queue = [...job.to];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        const to = t.name ? `${displayName(t.name)} <${t.email}>` : t.email;
        await sendRaw(buildMime({ from, to, replyTo: job.reply_to, subject: job.subject, text: job.text, html: job.html, files }), t.email);
        results.push({ email: t.email, status: 'sent' });
      } catch (err: any) {
        results.push({ email: t.email, status: 'failed', error: mailError(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, job.to.length) }, worker)); // ~5 at a time stays under SES's rate
  return results;
}

async function handleOutbox(record: any) {
  const key = decodeURIComponent(String(record.s3.object.key).replace(/\+/g, ' '));
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const parsed = JSON.parse(await obj.Body!.transformToString());
  if (parsed?.kind === 'email') {
    const mail = parsed as MailJob;
    const results = await deliverMail(mail).catch((err: any) => mail.to.map(t => ({ email: t.email, status: 'failed' as const, error: mailError(err) })));
    await putJson(`notify/mail-status/${mail.mail_id}/${mail.chunk}.json`, { results });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`[notifier] mail ${mail.mail_id}/${mail.chunk}: ${results.filter(r => r.status === 'sent').length}/${mail.to.length} sent`);
    return;
  }
  const job = parsed as NotifyJob;
  const { sent, gone } = await deliver(job);
  for (const g of gone) {
    const h = createHash('sha1').update(`${g.channel}:${g.address}`).digest('hex');
    await putJson(`notify/gone/${h}.json`, { channel: g.channel, address: g.address });
  }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  console.log(`[notifier] ${key}: ${sent}/${job.targets.length} sent, ${gone.length} gone`);
}

async function handleTelegramWebhook(event: any) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (!TG_TOKEN || headers['x-telegram-bot-api-secret-token'] !== telegramWebhookSecret(TG_TOKEN)) {
    return { statusCode: 401, body: 'unauthorized' };
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}';
  const update = JSON.parse(raw);
  const msg = update.message;
  if (!msg?.chat?.id || typeof msg.text !== 'string') return { statusCode: 200, body: 'ok' };
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const start = text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{16,64})$/i);
  if (start) {
    await putJson(`notify/telegram-links/${start[1].toLowerCase()}.json`, { chat_id: chatId, name: msg.chat.first_name || msg.chat.title || '', at: new Date().toISOString() });
    await tg('sendMessage', { chat_id: chatId, text: '✅ Connected to RGMCET. Return to the app — it will confirm in a few seconds.\n\nYou will get attendance, club and approval alerts here. Send /stop to unsubscribe.' });
  } else if (/^\/stop\b/i.test(text)) {
    const h = createHash('sha1').update(`telegram:${chatId}`).digest('hex');
    await putJson(`notify/gone/${h}.json`, { channel: 'telegram', address: chatId });
    await tg('sendMessage', { chat_id: chatId, text: 'You are unsubscribed. Connect again any time from the app: Notifications → Telegram.' });
  } else {
    await tg('sendMessage', { chat_id: chatId, text: 'To get alerts, open the RGMCET app → Notifications → "Connect Telegram". The app gives you a personal link.' });
  }
  return { statusCode: 200, body: 'ok' };
}

export const handler = async (event: any) => {
  if (Array.isArray(event?.Records)) {
    for (const r of event.Records) {
      try { await handleOutbox(r); } catch (err: any) { console.error('[notifier] job failed', err?.message); }
    }
    return { ok: true };
  }
  if (event?.requestContext?.http) {
    try { return await handleTelegramWebhook(event); } catch (err: any) {
      console.error('[notifier] webhook error', err?.message);
      return { statusCode: 200, body: 'ok' }; // never make Telegram retry-storm
    }
  }
  return { ok: false };
};
