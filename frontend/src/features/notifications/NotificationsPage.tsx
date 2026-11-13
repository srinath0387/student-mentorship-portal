import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCircle2, Loader2, MonitorSmartphone, Send, Smartphone, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { currentPushSubscription, deviceLabel, isIos, isStandalone, pushSupported, subscribePush, unsubscribePush } from '../../lib/pushClient';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const btn = 'px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50';

const WHAT_YOU_GET: Record<string, string[]> = {
  student: ['Absent in a class today (6 PM summary)', 'Club sessions — new, and a reminder the day before', 'Club registration approved / rejected / seat opened', 'Announcements from your HOD, mentor and principal'],
  parent: ["Your ward was absent today (6 PM summary, with subjects)", 'Absence messages sent by the college office'],
  faculty: ['Leave approved / rejected (HOD and Principal)', 'New office orders addressed to you', 'Announcements from your HOD and principal'],
  hod: ['Leave decisions on your own leave', 'Office orders addressed to you', 'Announcements from the principal'],
};

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path fill="#fff" d="M5.4 11.8l11.6-4.5c.5-.2 1 .1.8.9l-2 9.4c-.1.7-.5.8-1.1.5l-3-2.2-1.5 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.4-.1l-6.9 4.4-3-.9c-.6-.2-.7-.6.3-1z" /></svg>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery({ queryKey: ['notifyConfig'], queryFn: () => api.getNotifyConfig() });
  const [thisDevice, setThisDevice] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tgWaiting, setTgWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifyConfig'] });
  const isAdmin = ['admin', 'hod', 'principal', 'director'].includes(user?.role || '');
  const { data: stats = [] } = useQuery<any[]>({ queryKey: ['notifyStats'], queryFn: () => api.getNotifyStats(), enabled: isAdmin });

  useEffect(() => { currentPushSubscription().then(s => setThisDevice(Boolean(s))).catch(() => setThisDevice(false)); }, []);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const enablePush = useMutation({
    mutationFn: async () => {
      const sub = await subscribePush(cfg!.push.public_key!);
      await api.savePushSubscription(sub, deviceLabel());
    },
    onSuccess: () => { setThisDevice(true); refresh(); setMsg({ ok: true, text: 'Notifications are on for this device.' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Could not turn on notifications' }),
  });
  const disablePush = useMutation({
    mutationFn: async () => { const ep = await unsubscribePush(); if (ep) await api.removePushSubscription(ep); },
    onSuccess: () => { setThisDevice(false); refresh(); setMsg({ ok: true, text: 'Notifications turned off for this device.' }); },
  });
  const removeSub = useMutation({ mutationFn: (id: number) => api.removeNotifySubscription(id), onSuccess: refresh });
  const test = useMutation({
    mutationFn: () => api.sendTestNotification(),
    onSuccess: () => setMsg({ ok: true, text: 'Test sent — it should arrive within a few seconds.' }),
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });

  const connectTelegram = async () => {
    setMsg(null);
    // open the tab synchronously so pop-up blockers allow it, then point it at the bot link
    const tab = window.open('about:blank', '_blank');
    try {
      const { code, url } = await api.createTelegramLink();
      if (tab) tab.location.href = url; else window.location.href = url;
      setTgWaiting(true);
      let tries = 0;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        tries++;
        try {
          const r = await api.checkTelegramLink(code);
          if (r.linked) {
            window.clearInterval(pollRef.current!); setTgWaiting(false); refresh();
            setMsg({ ok: true, text: 'Telegram connected — you will receive a confirmation message there.' });
          }
        } catch { /* keep waiting */ }
        if (tries > 60) { window.clearInterval(pollRef.current!); setTgWaiting(false); setMsg({ ok: false, text: 'Did not hear back from Telegram. Press “Start” in the bot, then try again.' }); }
      }, 3000);
    } catch (e: any) {
      tab?.close();
      setMsg({ ok: false, text: e.message || 'Could not create the Telegram link' });
    }
  };

  const subs: any[] = cfg?.subscriptions || [];
  const tgSubs = subs.filter(s => s.channel === 'telegram');
  const pushSubs = subs.filter(s => s.channel === 'push');
  const roleList = WHAT_YOU_GET[user?.role || ''] || WHAT_YOU_GET.faculty;

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-textMuted" /></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-black text-textPrimary">Notifications</h1>
        <p className="text-xs text-textSecondary">Get alerts on your phone — free, no SMS charges. Use Telegram, browser notifications, or both.</p>
      </div>

      {msg && <div className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Telegram */}
        <div className={`${card} p-5 space-y-3`}>
          <div className="flex items-center gap-2"><TelegramIcon /><p className="text-sm font-black text-textPrimary">Telegram</p>
            {tgSubs.length > 0 && <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Connected</span>}</div>
          <p className="text-xs text-textSecondary">Best for phones. Works even when the app is closed. Free and unlimited.</p>
          {!cfg?.telegram.available ? (
            <p className="text-[11px] font-bold text-amber-600">Telegram alerts are not switched on by the college yet.</p>
          ) : tgWaiting ? (
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 p-3 text-xs text-sky-800 dark:text-sky-200 space-y-1">
              <p className="font-bold flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Waiting for Telegram…</p>
              <p>In Telegram, open <b>@{cfg.telegram.bot}</b> and press <b>Start</b>. This page updates by itself.</p>
            </div>
          ) : (
            <button className={`${btn} bg-[#229ED9] text-white`} onClick={connectTelegram}>{tgSubs.length ? 'Connect another Telegram account' : 'Connect Telegram'}</button>
          )}
          {cfg?.telegram.available && <p className="text-[10px] text-textMuted">Don't have Telegram? Install it free from the Play Store / App Store first.</p>}
        </div>

        {/* Browser push */}
        <div className={`${card} p-5 space-y-3`}>
          <div className="flex items-center gap-2"><BellRing className="w-5 h-5 text-brand-primary" /><p className="text-sm font-black text-textPrimary">This device</p>
            {thisDevice && <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">On</span>}</div>
          <p className="text-xs text-textSecondary">Pop-up notifications from this browser ({deviceLabel()}).</p>
          {!cfg?.push.available ? (
            <p className="text-[11px] font-bold text-amber-600">Browser notifications are not switched on by the college yet.</p>
          ) : !pushSupported() ? (
            isIos() && !isStandalone()
              ? <p className="text-[11px] text-textSecondary"><b>iPhone / iPad:</b> tap <b>Share → Add to Home Screen</b>, open the app from that icon, then come back here. (Or use Telegram.)</p>
              : <p className="text-[11px] text-textSecondary">This browser can’t show notifications. Use Chrome / Edge / Firefox, or Telegram.</p>
          ) : thisDevice ? (
            <button className={`${btn} border border-borderLine text-textSecondary`} disabled={disablePush.isPending} onClick={() => disablePush.mutate()}>Turn off on this device</button>
          ) : (
            <button className={`${btn} bg-brand-primary text-white`} disabled={enablePush.isPending} onClick={() => enablePush.mutate()}>
              {enablePush.isPending ? 'Turning on…' : 'Turn on notifications'}
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${card} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-textPrimary">Connected ({subs.length})</p>
            <button className={`${btn} border border-borderLine text-textSecondary`} disabled={!subs.length || test.isPending} onClick={() => test.mutate()}>
              <Send className="w-3.5 h-3.5 inline mr-1" />Send a test
            </button>
          </div>
          {subs.length === 0 ? <p className="text-xs text-textMuted">Nothing connected yet.</p> : (
            <div className="divide-y divide-borderLine">
              {[...tgSubs, ...pushSubs].map(s => (
                <div key={s.id} className="flex items-center gap-3 py-2 text-xs">
                  {s.channel === 'telegram' ? <TelegramIcon /> : /Android|iPhone/.test(s.label || '') ? <Smartphone className="w-4 h-4 text-textMuted" /> : <MonitorSmartphone className="w-4 h-4 text-textMuted" />}
                  <span className="flex-1"><b className="text-textPrimary">{s.label || s.channel}</b><br /><span className="text-[10px] text-textMuted">since {new Date(s.created_at).toLocaleDateString('en-IN')}</span></span>
                  <button onClick={() => removeSub.mutate(s.id)} className="p-1.5 text-textMuted hover:text-rose-600" aria-label="Disconnect"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={`${card} p-5 space-y-2`}>
          <p className="text-sm font-black text-textPrimary">What you'll get</p>
          <ul className="space-y-1.5">
            {roleList.map(t => <li key={t} className="text-xs text-textSecondary flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />{t}</li>)}
          </ul>
          {isAdmin && stats.length > 0 && (
            <div className="pt-3 mt-2 border-t border-borderLine">
              <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Reachable people (whole college)</p>
              <div className="grid grid-cols-3 gap-2">
                {['student', 'parent', 'staff'].map(a => {
                  const rows = stats.filter(r => r.audience === a);
                  return (
                    <div key={a} className="rounded-xl bg-surface-2 p-2">
                      <p className="text-[10px] font-bold text-textMuted">{a === 'staff' ? 'Staff' : a === 'parent' ? 'Parents' : 'Students'}</p>
                      <p className="text-lg font-black text-textPrimary">{rows.reduce((n, r) => n + r.people, 0)}</p>
                      <p className="text-[10px] text-textMuted">{rows.map(r => `${r.channel === 'telegram' ? 'TG' : 'Push'} ${r.people}`).join(' · ') || '—'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
