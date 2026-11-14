import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const DEFAULTS = ['hod@2026', 'admin@2026', 'coordinator@2026', 'director@2026', 'principal@2026', 'management@2026', 'chair@2026', 'cseds@2026', 'password', 'password1', '12345678', '123456789', 'rgmcet@123', 'rgmcet123'];
const input = 'w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';

/** Change password for staff logins (admin, HOD, coordinator, principal, director, management, program chair). */
export default function ChangePasswordPage() {
  const { user } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rules = [
    { ok: next.length >= 8, text: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(next) && /[0-9]/.test(next), text: 'Letters and numbers' },
    { ok: !!next && !DEFAULTS.includes(next.toLowerCase()), text: 'Not a default password' },
    { ok: !!next && next !== cur, text: 'Different from the current password' },
    { ok: !!next && next === confirm, text: 'Both new passwords match' },
  ];
  const ready = cur && rules.every(r => r.ok);
  const strength = Math.min(4, [next.length >= 10, /[A-Z]/.test(next) && /[a-z]/.test(next), /[0-9]/.test(next), /[^A-Za-z0-9]/.test(next)].filter(Boolean).length);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.changeMyPassword(cur, next);
      setCur(''); setNext(''); setConfirm('');
      setMsg({ ok: true, text: r?.message || 'Password changed.' });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'Could not change the password.' });
    } finally { setBusy(false); }
  };

  const Field = ({ label, value, set, auto }: { label: string; value: string; set: (v: string) => void; auto: string }) => (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-textSecondary">{label}</span>
      <div className="relative">
        <input type={show ? 'text' : 'password'} className={input} value={value} onChange={e => set(e.target.value)} autoComplete={auto} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </label>
  );

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-black text-textPrimary flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-primary" />Change password</h1>
        <p className="text-xs text-textSecondary">{user?.email} · after the change only the new password works, and you are signed out on every other device.</p>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-xs font-bold flex items-start gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
          {msg.ok ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}{msg.text}
        </div>
      )}

      <form onSubmit={submit} className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4 shadow-sm">
        {Field({ label: 'Current password', value: cur, set: setCur, auto: 'current-password' })}
        {Field({ label: 'New password', value: next, set: setNext, auto: 'new-password' })}
        {next && (
          <div className="flex gap-1" aria-label={`Strength ${strength} of 4`}>
            {[0, 1, 2, 3].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? (strength >= 3 ? 'bg-emerald-500' : strength === 2 ? 'bg-amber-500' : 'bg-rose-500') : 'bg-surface-2'}`} />)}
          </div>
        )}
        {Field({ label: 'Confirm new password', value: confirm, set: setConfirm, auto: 'new-password' })}
        <ul className="grid sm:grid-cols-2 gap-1">
          {rules.map(r => (
            <li key={r.text} className={`text-[11px] flex items-center gap-1.5 ${r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-textMuted'}`}>
              {r.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-borderLine inline-block" />}{r.text}
            </li>
          ))}
        </ul>
        <button type="submit" disabled={!ready || busy} className="w-full py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}Change password
        </button>
      </form>
      <p className="text-[11px] text-textMuted">Forgot your password? Ask a super admin to reset it — the old one stops working the moment it is reset.</p>
    </div>
  );
}
