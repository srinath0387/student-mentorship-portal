/** Attendance percentage as a coloured chip: below 65% red, below 75% amber, otherwise green; "No classes" when none held */
import React from 'react';

export type AttendanceSummary = { held: number; attended: number; pct: number | null; held_30: number; attended_30: number; pct_30: number | null; absent_today: number; last_absent: string | null } | null | undefined;

export function attendanceTone(pct: number | null | undefined) {
  if (pct == null) return 'bg-surface-2 text-textMuted';
  if (pct < 65) return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
  if (pct < 75) return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
}

export function AttendanceChip({ a, recent = false }: { a: AttendanceSummary; recent?: boolean }) {
  const pct = recent ? a?.pct_30 : a?.pct;
  const held = recent ? a?.held_30 : a?.held;
  const attended = recent ? a?.attended_30 : a?.attended;
  if (pct == null) return <span className="text-[11px] text-textMuted">No classes</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-black tabular-nums ${attendanceTone(pct)}`}>{pct}%</span>
      <span className="text-[10px] text-textMuted tabular-nums">{attended}/{held}</span>
      {!recent && (a?.absent_today || 0) > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">Absent today</span>}
    </span>
  );
}
