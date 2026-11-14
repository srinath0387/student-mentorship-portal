/**
 * Small shared pieces for the Faculty Selection pages (same classes as the rest of the site).
 */
import React from 'react';
import { card, input, label, btnPrimary, btnGhost, DEPARTMENTS } from '../clubs/clubUi';
import { fmtTime, type FsRound } from './fsApi';

export { card, input, label, btnPrimary, btnGhost, DEPARTMENTS };

export const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

export const chip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap';
export const chipOk = `${chip} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300`;
export const chipWarn = `${chip} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300`;
export const chipBad = `${chip} bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300`;
export const chipMuted = `${chip} bg-surface-2 text-textSecondary`;
export const chipBrand = `${chip} bg-brand-soft text-brand-primary dark:bg-brand-primary/15`;

export function RoundStatus({ round }: { round: FsRound }) {
  const now = Date.now();
  if (round.status === 'draft') return <span className={chipMuted}>Draft</span>;
  if (round.status === 'closed') return <span className={chipMuted}>Closed</span>;
  if (now < new Date(round.starts_at).getTime()) return <span className={chipWarn}>Opens {fmtTime(round.starts_at)}</span>;
  if (now >= new Date(round.ends_at).getTime()) return <span className={chipMuted}>Window ended {fmtTime(round.ends_at)}</span>;
  return <span className={chipOk}>Open · closes {fmtTime(round.ends_at)}</span>;
}

/** Filled / capacity bar; turns red when full */
export function SeatMeter({ filled, capacity }: { filled: number; capacity: number }) {
  const pct = Math.min(100, (filled / Math.max(1, capacity)) * 100);
  const full = filled >= capacity;
  return (
    <div className="h-2 min-w-[70px] rounded-full bg-surface-2 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={filled}
      aria-label={`${filled} of ${capacity} seats filled`}>
      <div className={`h-full rounded-full ${full ? 'bg-rose-500' : 'bg-brand-primary'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
      {msg.text}
    </div>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className={`${card} p-8 text-center space-y-1`}>
      <p className="text-sm font-black text-textPrimary">{title}</p>
      {text && <p className="text-xs text-textSecondary">{text}</p>}
    </div>
  );
}

export const th = 'px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-textMuted whitespace-nowrap';
export const td = 'px-3 py-2 text-xs text-textPrimary whitespace-nowrap';

export const errText = (e: any) => (e?.message || 'Something went wrong').replace(/^Permission denied\..*/, 'You do not have access to this. Only your own department\'s rounds can be managed.');
