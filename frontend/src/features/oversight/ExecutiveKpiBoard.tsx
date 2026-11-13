import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, X } from 'lucide-react';
import type { ExecutiveDepartmentMetrics as Dept } from '../../types';

type Key = 'students' | 'faculty' | 'sfr' | 'attendance' | 'at_risk' | 'certs' | 'placement' | 'research' | 'phd';

interface MetricDef {
  key: Key;
  label: string;
  unit?: '%' | '';
  /** true = higher is better, false = lower is better, null = neutral (size) */
  better: boolean | null;
  benchmark?: { value: number; label: string };
  perDept: (d: Dept) => number;
  tab: string;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

const METRICS: MetricDef[] = [
  { key: 'students', label: 'Students', better: null, perDept: d => d.student_count, tab: 'students' },
  { key: 'faculty', label: 'Faculty', better: null, perDept: d => d.faculty_count, tab: 'faculty' },
  { key: 'sfr', label: 'Student : Faculty', better: false, benchmark: { value: 20, label: 'AICTE 1:20' }, perDept: d => d.faculty_count ? d.student_count / d.faculty_count : 0, tab: 'faculty' },
  { key: 'attendance', label: 'Attendance', unit: '%', better: true, benchmark: { value: 75, label: '75% rule' }, perDept: d => d.avg_attendance, tab: 'students' },
  { key: 'at_risk', label: 'Below 75% attendance', better: false, perDept: d => d.below_75_attendance_count, tab: 'students' },
  { key: 'certs', label: 'Certified students', unit: '%', better: true, benchmark: { value: 50, label: '50% target' }, perDept: d => d.student_certifications?.penetration_rate || 0, tab: 'certifications' },
  { key: 'placement', label: 'Placement rate', unit: '%', better: true, benchmark: { value: 60, label: '60% target' }, perDept: d => d.placement_rate, tab: 'placements' },
  { key: 'research', label: 'Publications', better: true, perDept: d => d.total_publications, tab: 'research' },
  { key: 'phd', label: 'Ph.D. faculty', unit: '%', better: true, benchmark: { value: 30, label: '30% target' }, perDept: d => d.doctorate_percentage, tab: 'faculty' },
];

/** Aggregate a set of departments into one value per metric (weighted where it matters). */
function aggregate(ds: Dept[]): Record<Key, number> {
  const sum = (f: (d: Dept) => number) => ds.reduce((t, d) => t + (Number(f(d)) || 0), 0);
  const students = sum(d => d.student_count);
  const faculty = sum(d => d.faculty_count);
  const attW = ds.filter(d => d.avg_attendance > 0);
  const attStudents = attW.reduce((t, d) => t + d.student_count, 0);
  const finalYear = sum(d => d.students_by_year?.year4 || 0);
  return {
    students,
    faculty,
    sfr: faculty ? students / faculty : 0,
    attendance: attStudents ? attW.reduce((t, d) => t + d.avg_attendance * d.student_count, 0) / attStudents : 0,
    at_risk: sum(d => d.below_75_attendance_count),
    certs: pct(sum(d => d.student_certifications?.certified_students || 0), students),
    placement: finalYear ? ds.reduce((t, d) => t + d.placement_rate * (d.students_by_year?.year4 || 0), 0) / finalYear
      : (ds.length ? sum(d => d.placement_rate) / ds.length : 0),
    research: sum(d => d.total_publications),
    phd: pct(sum(d => d.doctorates), faculty),
  };
}

const fmt = (m: MetricDef, v: number) => {
  if (m.key === 'sfr') return v ? `1:${v.toFixed(1)}` : '—';
  if (m.unit === '%') return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString('en-IN');
};

/** good / warning / critical against the benchmark (null when the metric has none). */
function status(m: MetricDef, v: number): 'good' | 'warning' | 'critical' | null {
  if (!m.benchmark || !v) return null;
  const b = m.benchmark.value;
  if (m.better) return v >= b ? 'good' : v >= b * 0.85 ? 'warning' : 'critical';
  return v <= b ? 'good' : v <= b * 1.25 ? 'warning' : 'critical';
}
const STATUS_STYLE = {
  good: { chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', icon: '✓', text: 'Meets' },
  warning: { chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', icon: '!', text: 'Near' },
  critical: { chip: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: '✕', text: 'Below' },
};

function Bar({ label, value, max, text, title }: { label: string; value: number; max: number; text: string; title?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]" title={title || `${label}: ${text}`}>
      <span className="w-28 shrink-0 truncate text-textSecondary font-semibold">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full rounded-r bg-brand-primary" style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
      </div>
      <span className="w-14 text-right font-black text-textPrimary">{text}</span>
    </div>
  );
}

/** What the focused metric is made of, for the current scope. */
function Composition({ focus, scope, scopeLabel }: { focus: Key; scope: Dept[]; scopeLabel: string }) {
  const s = (f: (d: Dept) => number) => scope.reduce((t, d) => t + (Number(f(d)) || 0), 0);
  let rows: { label: string; value: number; text?: string }[] = [];
  let note = '';
  switch (focus) {
    case 'students':
      rows = [1, 2, 3, 4].map(y => ({ label: `Year ${y}`, value: s(d => (d.students_by_year as any)?.[`year${y}`] || 0) }));
      break;
    case 'faculty': case 'phd': case 'sfr':
      rows = [
        { label: 'Professors', value: s(d => d.professors) },
        { label: 'Assoc. Professors', value: s(d => d.associate_professors) },
        { label: 'Asst. Professors', value: s(d => d.assistant_professors) },
        { label: 'Other', value: s(d => d.other_faculty) },
        { label: 'Ph.D. holders', value: s(d => d.doctorates) },
      ];
      note = `${s(d => d.student_count).toLocaleString('en-IN')} students · ${s(d => d.faculty_count)} faculty`;
      break;
    case 'attendance': case 'at_risk': {
      const st = s(d => d.student_count); const risk = s(d => d.below_75_attendance_count);
      rows = [
        { label: 'At or above 75%', value: Math.max(0, st - risk) },
        { label: 'Below 75%', value: risk },
      ];
      note = `${pct(risk, st).toFixed(1)}% of students are below the 75% requirement`;
      break;
    }
    case 'certs': {
      const keys: [string, keyof Dept['student_certifications']][] = [['NPTEL', 'nptel'], ['AWS', 'aws'], ['Azure', 'azure'], ['Oracle', 'oracle'], ['GCP', 'gcp'], ['Cisco', 'cisco'], ['Other', 'other']];
      rows = keys.map(([l, k]) => ({ label: l, value: s(d => Number(d.student_certifications?.[k]) || 0) })).sort((a, b) => b.value - a.value);
      note = `${s(d => d.student_certifications?.total || 0)} certificates · ${s(d => d.student_certifications?.certified_students || 0)} students certified`;
      break;
    }
    case 'placement': {
      const placed = s(d => d.placed_count);
      const ctcDepts = scope.filter(d => d.avg_ctc_lpa > 0);
      rows = [
        { label: 'Final-year students', value: s(d => d.students_by_year?.year4 || 0) },
        { label: 'Placed', value: placed },
      ];
      note = ctcDepts.length ? `Average CTC ${(ctcDepts.reduce((t, d) => t + d.avg_ctc_lpa, 0) / ctcDepts.length).toFixed(2)} LPA` : '';
      break;
    }
    case 'research':
      rows = [
        { label: 'Journals', value: s(d => d.publications_by_category?.journals || 0) },
        { label: 'Conferences', value: s(d => d.publications_by_category?.conferences || 0) },
        { label: 'Book chapters', value: s(d => d.publications_by_category?.book_chapters || 0) },
        { label: 'Patents', value: s(d => d.publications_by_category?.patents || 0) },
      ];
      break;
  }
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-black uppercase tracking-wider text-textMuted">Breakdown · {scopeLabel}</p>
      {rows.map(r => <Bar key={r.label} label={r.label} value={r.value} max={max} text={r.text || r.value.toLocaleString('en-IN')} />)}
      {note && <p className="text-[11px] text-textSecondary pt-1">{note}</p>}
    </div>
  );
}

/**
 * Executive KPI board. Click a KPI to focus it: the department ranking and the breakdown switch
 * to that metric. Click a department to cross-filter: every KPI re-computes for that department
 * and shows its gap against the institution.
 */
export const ExecutiveKpiBoard: React.FC<{
  departments: Dept[];
  /** Controlled department cross-filter (null = whole institution) */
  dept: string | null;
  onDeptChange: (dept: string | null) => void;
  onOpenTab: (tab: string) => void;
}> = ({ departments, dept, onDeptChange: setDept, onOpenTab }) => {
  const [focus, setFocus] = useState<Key>('attendance');
  const deptRow = departments.find(d => d.department === dept) || null;
  const inst = useMemo(() => aggregate(departments), [departments]);
  const scoped = useMemo(() => (deptRow ? aggregate([deptRow]) : inst), [deptRow, inst]);
  const m = METRICS.find(x => x.key === focus)!;

  const ranking = useMemo(() => {
    const list = departments.map(d => ({ d, v: m.perDept(d) })).filter(x => x.d.student_count > 0 || x.v > 0);
    list.sort((a, b) => (m.better === false ? a.v - b.v : b.v - a.v));
    return list;
  }, [departments, m]);
  const rankMax = Math.max(1, ...ranking.map(r => r.v), m.benchmark?.value || 0);
  const needsAttention = ranking.filter(r => status(m, r.v) === 'critical').map(r => r.d.department);

  if (departments.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-textPrimary">Executive KPIs</h2>
          <p className="text-[11px] text-textSecondary">Click a KPI to rank departments by it · click a department to see every KPI for that department</p>
        </div>
        {deptRow && (
          <button onClick={() => setDept(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold">
            {deptRow.department}<X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2.5">
        {METRICS.map(k => {
          const v = scoped[k.key]; const st = status(k, v); const active = k.key === focus;
          const diff = deptRow ? v - inst[k.key] : 0;
          const better = k.better === null || diff === 0 ? null : (diff > 0) === k.better;
          return (
            <button key={k.key} onClick={() => setFocus(k.key)} aria-pressed={active}
              className={`text-left p-3 rounded-2xl border transition-all bg-surface ${active ? 'border-brand-primary ring-2 ring-brand-primary/30 shadow-md' : 'border-borderLine hover:border-brand-primary/50 hover:-translate-y-0.5'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-textMuted leading-tight min-h-[24px]">{k.label}</p>
              <p className="text-xl font-black text-textPrimary mt-1">{fmt(k, v)}</p>
              <div className="flex items-center gap-1 mt-1 min-h-[18px] flex-wrap">
                {st && <span className={`px-1.5 py-px rounded text-[9px] font-black ${STATUS_STYLE[st].chip}`}>{STATUS_STYLE[st].icon} {STATUS_STYLE[st].text}</span>}
                {deptRow && k.key !== 'students' && k.key !== 'faculty' && k.key !== 'research' && k.key !== 'at_risk' && Math.abs(diff) > 0.05 && (
                  <span className={`inline-flex items-center text-[9px] font-bold ${better === null ? 'text-textMuted' : better ? 'text-emerald-600' : 'text-red-600'}`}
                    title={`Institution: ${fmt(k, inst[k.key])}`}>
                    {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {k.key === 'sfr' ? Math.abs(diff).toFixed(1) : `${Math.abs(diff).toFixed(1)}${k.unit === '%' ? ' pts' : ''}`}
                  </span>
                )}
                {deptRow && (k.key === 'students' || k.key === 'faculty' || k.key === 'research' || k.key === 'at_risk') && (
                  <span className="text-[9px] font-bold text-textMuted">{pct(v, inst[k.key]).toFixed(0)}% of institution</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black text-textPrimary">{m.label} by department {m.better === false ? '(lower is better)' : ''}</p>
            {m.benchmark && <span className="text-[10px] font-bold text-textMuted">┆ benchmark: {m.benchmark.label}</span>}
          </div>
          <div className="space-y-1">
            {ranking.map(({ d, v }, i) => {
              const st = status(m, v); const sel = d.department === dept;
              return (
                <button key={d.department} onClick={() => setDept(sel ? null : d.department)}
                  title={`${d.department} — ${m.label}: ${fmt(m, v)}${m.benchmark ? ` (benchmark ${m.benchmark.label})` : ''}`}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[11px] transition-colors ${sel ? 'bg-brand-soft/60 ring-1 ring-brand-primary/40' : dept ? 'opacity-60 hover:opacity-100 hover:bg-surface-2' : 'hover:bg-surface-2'}`}>
                  <span className="w-5 text-textMuted font-bold">{i + 1}</span>
                  <span className="w-36 shrink-0 truncate text-left font-semibold text-textPrimary">{d.department}</span>
                  <div className="flex-1 relative h-3 rounded-full bg-surface-2">
                    <div className="absolute inset-y-0 left-0 rounded-r bg-brand-primary" style={{ width: `${Math.min(100, (v / rankMax) * 100)}%` }} />
                    {m.benchmark && <div className="absolute -top-0.5 -bottom-0.5 border-l-2 border-dashed border-textPrimary/60" style={{ left: `${(m.benchmark.value / rankMax) * 100}%` }} />}
                  </div>
                  <span className="w-16 text-right font-black text-textPrimary">{fmt(m, v)}</span>
                  <span className="w-14 text-right">{st && <span className={`px-1.5 py-px rounded text-[9px] font-black ${STATUS_STYLE[st].chip}`}>{STATUS_STYLE[st].icon} {STATUS_STYLE[st].text}</span>}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-surface border border-borderLine rounded-2xl p-4 flex flex-col gap-4">
          <Composition focus={focus} scope={deptRow ? [deptRow] : departments} scopeLabel={deptRow ? deptRow.department : 'All departments'} />
          {needsAttention.length > 0 && !deptRow && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-[11px] text-red-800 dark:text-red-300">
              <b>Needs attention ({m.label}):</b> {needsAttention.join(', ')}
            </div>
          )}
          <button onClick={() => onOpenTab(m.tab)} className="mt-auto self-start inline-flex items-center gap-1 text-xs font-bold text-brand-primary">
            Open full {m.tab} analytics<ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveKpiBoard;
