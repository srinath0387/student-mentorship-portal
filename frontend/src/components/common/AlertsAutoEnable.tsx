/**
 * AlertsAutoEnable — makes sure every signed-in person gets phone alerts with as little effort
 * as browsers allow:
 *  • Permission already given on this device → silently (re)connects this device to the current
 *    login, once per session (also moves a shared phone to whoever is signed in now).
 *  • Not asked yet → a small card offers "Turn on" (browsers require one tap to allow).
 *    "Not now" hides it for 7 days.
 *  • Blocked, unsupported, or iPhone not opened from the Home Screen → shows nothing here
 *    (the Phone Alerts page explains those cases).
 */
import React, { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { api } from '../../lib/api';
import { currentPushSubscription, deviceLabel, isIos, isStandalone, pushSupported, subscribePush } from '../../lib/pushClient';
import { BouncingDots } from './BouncingDots';

const SNOOZE_KEY = 'advitiyans_alerts_prompt_snoozed_until';
const SYNCED_KEY = 'advitiyans_alerts_synced';
const read = (k: string, s: Storage) => { try { return s.getItem(k); } catch { return null; } };
const write = (k: string, v: string, s: Storage) => { try { s.setItem(k, v); } catch { /* ignore */ } };

export function AlertsAutoEnable({ userKey }: { userKey: string }) {
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userKey || !pushSupported() || (isIos() && !isStandalone())) return;
      const cfg = await api.getNotifyConfig().catch(() => null);
      const key = cfg?.push?.public_key;
      if (!key || cancelled) return;
      if (Notification.permission === 'granted') {
        if (read(SYNCED_KEY, sessionStorage) === userKey) return;
        try {
          const sub = (await currentPushSubscription())?.toJSON() || (await subscribePush(key));
          await api.savePushSubscription(sub, deviceLabel());
          write(SYNCED_KEY, userKey, sessionStorage);
        } catch { /* try again next session */ }
        return;
      }
      if (Notification.permission === 'default') {
        const until = Number(read(SNOOZE_KEY, localStorage) || 0);
        if (Date.now() > until) setOffer(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userKey]);

  if (!offer) return null;

  const turnOn = async () => {
    setBusy(true); setMsg(null);
    try {
      const cfg = await api.getNotifyConfig();
      if (!cfg?.push?.public_key) throw new Error('Phone alerts are not set up on the server yet.');
      const sub = await subscribePush(cfg.push.public_key);
      await api.savePushSubscription(sub, deviceLabel());
      write(SYNCED_KEY, userKey, sessionStorage);
      setMsg('Alerts are on for this device.');
      setTimeout(() => setOffer(false), 1800);
    } catch (e: any) {
      setMsg(e?.message || 'Could not turn on alerts.');
    } finally { setBusy(false); }
  };
  const later = () => { write(SNOOZE_KEY, String(Date.now() + 7 * 864e5), localStorage); setOffer(false); };

  return (
    <div className="fixed inset-x-0 z-[55] flex justify-center px-4 print:hidden" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <div role="dialog" aria-label="Turn on alerts" className="w-full max-w-md rounded-2xl border border-borderLine bg-surface p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-soft p-2 text-brand-primary dark:bg-brand-primary/15"><BellRing className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-textPrimary">Get alerts on this device</p>
            <p className="text-xs text-textSecondary">Announcements from your HOD, principal and admin, approvals, attendance and more — even when the app is closed.</p>
            {msg && <p className="mt-1 text-xs font-bold text-brand-primary">{msg}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={turnOn} disabled={busy}
                className="rounded-xl bg-brand-primary px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60">
                {busy ? <BouncingDots size="xs" label="" /> : 'Turn on'}
              </button>
              <button type="button" onClick={later} className="rounded-xl border border-borderLine px-3 py-2 text-xs font-bold text-textSecondary hover:bg-surface-2">Not now</button>
            </div>
          </div>
          <button type="button" onClick={later} aria-label="Close" className="p-1 text-textMuted hover:text-textPrimary"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
