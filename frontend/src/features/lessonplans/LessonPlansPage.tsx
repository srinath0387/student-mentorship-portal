import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpenCheck, ChevronRight, Download, Loader2, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { LessonPlanEditor } from './LessonPlanEditor';
import { CoverageBar, StatusChip, btnGhost, card, input } from './lessonPlanShared';

const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];

/** Faculty: "My Lesson Plans" — every subject allotted to me, with plan status and coverage. */
export default function LessonPlansPage() {
  const loc = useLocation(); const nav = useNavigate();
  const open = new URLSearchParams(loc.search).get('allotment');
  const { data: rows = [], isLoading } = useQuery<any[]>({ queryKey: ['myLessonPlans'], queryFn: () => api.getMyLessonPlans() });
  if (open) return <LessonPlanEditor allotmentId={open} onBack={() => nav('/lesson-plans')} />;
  const pending = rows.filter(r => ['not_started', 'draft', 'returned'].includes(r.status)).length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-textPrimary">My Lesson Plans</h1>
        <p className="text-xs text-textSecondary">One plan per allotted subject. Prepare it, submit it to the HOD, then tick topics as you teach them.</p>
      </div>
      {pending > 0 && <div className="rounded-xl px-4 py-2.5 text-xs font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{pending} subject{pending === 1 ? '' : 's'} still need a lesson plan.</div>}
      {isLoading ? <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-textMuted" /></div>
        : rows.length === 0 ? <div className={`${card} p-10 text-center text-xs text-textMuted`}>No subjects are allotted to you yet. Lesson plans appear here once the HOD allots subjects.</div>
        : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map(r => (
              <button key={r.allotment_id} onClick={() => nav(`/lesson-plans?allotment=${r.allotment_id}`)} className={`${card} p-4 text-left hover:ring-2 hover:ring-brand-primary/30 space-y-3`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft grid place-items-center text-brand-primary shrink-0"><BookOpenCheck className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-textPrimary truncate">{r.subject_name}</p>
                    <p className="text-[11px] text-textSecondary">{r.semester_label} · Section {r.section || '—'} · {r.department}{r.is_co_faculty ? ' · co-faculty' : ''}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-textMuted" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <StatusChip s={r.status} />
                  {r.total > 0 && <CoverageBar covered={r.covered} total={r.total} behind={r.behind} />}
                </div>
                {r.status === 'returned' && r.hod_remarks && <p className="text-[11px] text-rose-600 line-clamp-2">HOD: {r.hod_remarks}</p>}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

/** HOD / principal: lesson plan register for the department with approval queue and coverage. */
export function LessonPlanReviewPage() {
  const { user } = useAuth();
  const loc = useLocation(); const nav = useNavigate();
  const open = new URLSearchParams(loc.search).get('allotment');
  const locked = user?.role === 'hod';
  const [dept, setDept] = useState('All');
  const [filter, setFilter] = useState<'all' | 'submitted' | 'missing' | 'behind'>('all');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['deptLessonPlans', locked ? 'own' : dept], queryFn: () => api.getDepartmentLessonPlans(locked ? undefined : dept) });
  const rows: any[] = data?.rows || [];
  const shown = useMemo(() => rows.filter(r =>
    (filter === 'all' || (filter === 'submitted' && r.status === 'submitted') || (filter === 'missing' && ['not_started', 'draft', 'returned'].includes(r.status)) || (filter === 'behind' && r.behind > 0)) &&
    (!q.trim() || `${r.subject_name} ${r.faculty_name} ${r.section} ${r.semester_label}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, filter, q]);
  if (open) return <LessonPlanEditor allotmentId={open} onBack={() => nav('/lesson-plans/review')} />;
  const k = {
    total: rows.length,
    approved: rows.filter(r => r.status === 'approved').length,
    submitted: rows.filter(r => r.status === 'submitted').length,
    missing: rows.filter(r => ['not_started', 'draft', 'returned'].includes(r.status)).length,
    behind: rows.filter(r => r.behind > 0).length,
    coverage: (() => { const t = rows.reduce((n, r) => n + r.total, 0); return t ? Math.round((rows.reduce((n, r) => n + r.covered, 0) / t) * 100) : 0; })(),
  };
  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Semester', 'Section', 'Subject', 'Faculty', 'Status', 'Topics', 'Covered', 'Coverage %', 'Behind'], ...shown.map(r => [r.semester_label, r.section, r.subject_name, r.faculty_name, r.status, r.total, r.covered, r.coverage_pct, r.behind])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.map(l => l.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `lesson-plans-${data?.department || 'all'}.csv`; a.click();
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Lesson Plans &amp; Syllabus Coverage</h1>
          <p className="text-xs text-textSecondary">{data?.department || '…'} · approve plans and see which classes are behind schedule</p>
        </div>
        {!locked && (
          <select className={input} value={dept} onChange={e => setDept(e.target.value)}>
            <option value="All">All departments</option>{DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[['Subjects', k.total, ''], ['Approved', k.approved, 'text-emerald-600'], ['To approve', k.submitted, 'text-sky-600'], ['No plan yet', k.missing, 'text-amber-600'], ['Behind schedule', k.behind, 'text-rose-600'], ['Syllabus covered', `${k.coverage}%`, '']].map(([l, v, c]) => (
          <div key={String(l)} className={`${card} p-3`}><p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{l}</p><p className={`text-2xl font-black ${c || 'text-textPrimary'}`}>{v}</p></div>
        ))}
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="p-3 border-b border-borderLine flex flex-wrap items-center gap-2">
          {([['all', 'All'], ['submitted', `To approve (${k.submitted})`], ['missing', `No plan (${k.missing})`], ['behind', `Behind (${k.behind})`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${filter === key ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{label}</button>
          ))}
          <div className="relative ml-auto"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input className={`${input} pl-8 w-52`} placeholder="Subject or faculty" value={q} onChange={e => setQ(e.target.value)} /></div>
          <button className={btnGhost} onClick={exportCsv}><Download className="w-3.5 h-3.5 inline mr-1" />CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
              <tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Faculty</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Coverage</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="w-4 h-4 animate-spin inline text-textMuted" /></td></tr>
                : shown.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-textMuted">Nothing here.</td></tr>
                : shown.map(r => (
                  <tr key={r.allotment_id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => nav(`/lesson-plans/review?allotment=${r.allotment_id}`)}>
                    <td className="px-3 py-2 font-bold text-textPrimary">{r.subject_name}</td>
                    <td className="px-3 py-2 text-textSecondary">{r.semester_label} · {r.section || '—'}{locked ? '' : ` · ${r.department}`}</td>
                    <td className="px-3 py-2 text-textSecondary">{r.faculty_name}</td>
                    <td className="px-3 py-2"><StatusChip s={r.status} /></td>
                    <td className="px-3 py-2">{r.total ? <CoverageBar covered={r.covered} total={r.total} behind={r.behind} /> : <span className="text-textMuted">—</span>}</td>
                    <td className="px-3 py-2 text-right"><ChevronRight className="w-4 h-4 inline text-textMuted" /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
