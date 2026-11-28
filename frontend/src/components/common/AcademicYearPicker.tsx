/**
 * Academic-year picker for pages that list subjects (allotments, attendance, lesson plans, execution plans, CO attainment,
 * Department Progress), and the banner that says another year than the current one is being shown.
 */
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { api } from '../../lib/api';
import { setViewAY, useViewAY } from '../../lib/academicYear';

export function AcademicYearPicker({ years: only, value, onPick, className = '' }: {
  years?: string[];          // a fixed list (e.g. the years a student has records in); otherwise every year with allotments
  value?: string;            // the year this page is showing, when it chose one itself
  onPick?: (ay: string) => void;
  className?: string;
}) {
  const { ay, current } = useViewAY();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['academicYears'], queryFn: api.getAcademicYears, staleTime: 10 * 60_000, enabled: !only });
  const shown = value || ay;
  const list = Array.from(new Set([...(only || data?.years || []), shown, ...(only ? [] : [current])])).filter(Boolean).sort().reverse();
  // reset (not just refresh) so no page shows the other year's numbers while it reloads
  const pick = (v: string) => { setViewAY(v); onPick?.(v); void qc.resetQueries(); };
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <CalendarRange className="w-3.5 h-3.5 text-textMuted" aria-hidden />
      <span className="font-bold text-textSecondary whitespace-nowrap">Academic year</span>
      <select aria-label="Academic year" value={shown} onChange={e => pick(e.target.value)}
        className="px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
        {list.map(y => <option key={y} value={y}>{y}{y === current ? ' (current)' : y > current ? ' (next)' : ''}</option>)}
      </select>
    </label>
  );
}

/** Shown on every page while another academic year than the current one is picked */
export function OtherYearBanner() {
  const { ay, current, isCurrent } = useViewAY();
  const qc = useQueryClient();
  if (isCurrent) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <span><strong className="tabular-nums">Showing {ay}</strong> {ay > current ? '(next academic year)' : '(a past academic year)'} on the subject, attendance and plan pages.</span>
      <button type="button" onClick={() => { setViewAY(null); void qc.resetQueries(); }}
        className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-700">Back to {current}</button>
    </div>
  );
}
