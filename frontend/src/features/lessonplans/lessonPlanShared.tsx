import React from 'react';
import { ReportPdf, fmtD } from '../../lib/pdfReport';

export const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
export const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
export const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
export const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
export const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;

export const STATUS: Record<string, { text: string; cls: string }> = {
  not_started: { text: 'Not started', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  draft: { text: 'Draft', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  submitted: { text: 'Awaiting HOD', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
  approved: { text: 'Approved', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  returned: { text: 'Returned', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
};
export const StatusChip = ({ s }: { s: string }) => {
  const m = STATUS[s] || STATUS.draft;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${m.cls}`}>{m.text}</span>;
};

export const todayIso = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

export interface Topic {
  id: string; unit: number; unit_title?: string | null; topic: string; planned_date?: string | null; periods: number;
  co?: string | null; method?: string | null; covered_on?: string | null; coverage_remarks?: string | null;
}

export function CoverageBar({ covered, total, behind }: { covered: number; total: number; behind: number }) {
  const pct = total ? Math.round((covered / total) * 100) : 0;
  return (
    <div className="min-w-[140px]">
      <div className="flex justify-between text-[10px] font-bold text-textSecondary">
        <span>{covered}/{total} topics · {pct}%</span>
        {behind > 0 ? <span className="text-rose-600">{behind} behind</span> : total ? <span className="text-emerald-600">on track</span> : null}
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${behind > 3 ? 'bg-rose-500' : behind > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Spread topics over the class days in the timetable (skips Sundays & holidays). */
export function autoSchedule(topics: Topic[], classDays: { day: string; periods: number }[], start: string, holidays: string[]): Topic[] {
  const perDay = new Map(classDays.map(d => [d.day.toLowerCase(), Math.max(1, d.periods || 1)]));
  if (!perDay.size) return topics;
  const hol = new Set(holidays);
  const d = new Date(start + 'T00:00:00');
  const nextClass = () => {
    for (let i = 0; i < 400; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const name = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      d.setDate(d.getDate() + 1);
      if (name !== 'sunday' && perDay.has(name) && !hol.has(iso)) return { iso, periods: perDay.get(name)! };
    }
    return null;
  };
  let cur = nextClass();
  let left = cur?.periods || 0;
  return topics.map(t => {
    if (!cur) return t;
    const planned = cur.iso;
    let need = Math.max(1, t.periods || 1);
    while (need > 0 && cur) {
      const take = Math.min(left, need);
      need -= take; left -= take;
      if (left === 0) { cur = nextClass(); left = cur?.periods || 0; }
    }
    return { ...t, planned_date: planned };
  });
}

export async function lessonPlanPdf(allot: any, plan: any) {
  const topics: Topic[] = plan?.topics || [];
  const r = await ReportPdf.create(allot.department);
  r.title('Lesson Plan', allot.subject_name);
  r.keyValues([
    ['Name of the Faculty', allot.faculty_name + (allot.co_faculty_name ? ` (with ${allot.co_faculty_name})` : '')],
    ['Course', `${allot.subject_name}${allot.subject_type ? ` (${allot.subject_type})` : ''}`],
    ['Class', `${allot.semester_label} Semester · Section ${allot.section || '—'} · ${allot.department}`],
    ['Academic Year', plan?.academic_year],
    ['Total topics / periods', `${topics.length} topics · ${topics.reduce((n, t) => n + (t.periods || 1), 0)} periods`],
    ['Status', plan?.status === 'approved' ? `Approved by HOD on ${fmtD(plan.reviewed_at)}` : (plan?.status || 'draft').replace(/^./, (c: string) => c.toUpperCase())],
  ]);
  if (plan?.objectives) { r.heading('Course Objectives'); r.para(plan.objectives); }
  if (plan?.outcomes?.length) { r.heading('Course Outcomes'); r.table(['CO', 'After completing the course, the student will be able to'], plan.outcomes.map((o: any) => [o.code, o.text]), { 0: { cellWidth: 16, fontStyle: 'bold' } }); }
  r.heading('Unit-wise Lesson Plan');
  let lastUnit = -1;
  r.table(['S.No', 'Unit', 'Topic', 'Periods', 'Planned Date', 'CO', 'Teaching Method', 'Covered On'],
    topics.map((t, i) => {
      const unitCell = t.unit !== lastUnit ? `Unit ${t.unit}${t.unit_title ? `\n${t.unit_title}` : ''}` : '';
      lastUnit = t.unit;
      return [i + 1, unitCell, t.topic, t.periods, fmtD(t.planned_date), t.co || '', t.method || '', t.covered_on ? fmtD(t.covered_on) : ''];
    }),
    { 0: { cellWidth: 11 }, 1: { cellWidth: 25, fontStyle: 'bold' }, 3: { cellWidth: 17, halign: 'center' }, 4: { cellWidth: 23 }, 5: { cellWidth: 12 }, 6: { cellWidth: 25 }, 7: { cellWidth: 23 } });
  if (plan?.text_books) { r.heading('Text Books'); r.para(plan.text_books); }
  if (plan?.references_text) { r.heading('Reference Books / Resources'); r.para(plan.references_text); }
  r.signatures([{ role: 'Faculty', name: allot.faculty_name }, { role: 'HOD', name: `Dept. of ${allot.department}` }, { role: 'Principal' }]);
  r.save(`Lesson Plan - ${allot.subject_name} - ${allot.semester_label} ${allot.section}.pdf`);
}
