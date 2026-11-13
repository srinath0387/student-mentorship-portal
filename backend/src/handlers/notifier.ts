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

async function handleOutbox(record: any) {
  const key = decodeURIComponent(String(record.s3.object.key).replace(/\+/g, ' '));
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const job: NotifyJob = JSON.parse(await obj.Body!.transformToString());
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
