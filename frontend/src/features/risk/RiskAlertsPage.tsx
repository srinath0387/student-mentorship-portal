import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Search, ShieldAlert, Users, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

interface RiskReason { code: string; label: string; points: number }
interface StudentRisk {
  roll_number: string; name: string; department: string; year: string; section: string;
  cgpa: number | null; attendance_pct: number | null; score: number; level: 'high' | 'medium' | 'low';
  reasons: RiskReason[]; last_mentor_meeting: string | null;
}
interface RiskResponse {
  summary: { total: number; high: number; medium: number; low: number; by_reason?: Record<string, number> };
  students: StudentRisk[];
}

const REASON_LABELS: Record<string, string> = {
  attendance_critical: 'Attendance < 65%',
  attendance_low: 'Attendance < 75%',
  cgpa_critical: 'CGPA < 5',
  cgpa_low: 'CGPA < 6',
  gpa_drop: 'GPA dropped',
  no_mentoring: 'No recent mentoring',
  no_coding: 'No coding profile',
};
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';

export const RiskAlertsPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || '';
  const deptLocked = role === 'hod' || role === 'faculty';
  const [department, setDepartment] = useState('All');
  const [year, setYear] = useState('All');
  const [section, setSection] = useState('All');
  const [level, setLevel] = useState<'flagged' | 'high' | 'medium'>('flagged');
  const [reason, setReason] = useState('');
  const [q, setQ] = useState('');

  const { data, isLoading, isError, error } = useQuery<RiskResponse>({
    queryKey: ['riskStudents', department, year, section, level],
    queryFn: () => api.getRiskStudents({ department, year, section, level }),
    staleTime: 2 * 60 * 1000,
  });

  const students = useMemo(() => (data?.students || []).filter(s =>
    (!reason || s.reasons.some(r => r.code === reason)) &&
    (!q || s.roll_number.toLowerCase().includes(q.toLowerCase()) || (s.name || '').toLowerCase().includes(q.toLowerCase()))
  ), [data, reason, q]);

  const exportCsv = () => {
    const header = ['Roll Number', 'Name', 'Department', 'Year', 'Section', 'Risk', 'Score', 'Attendance %', 'CGPA', 'Last Mentor Meeting', 'Reasons'];
    const lines = students.map(s => [s.roll_number, s.name, s.department, s.year, s.section, s.level, s.score,
      s.attendance_pct ?? '', s.cgpa ?? '', s.last_mentor_meeting ?? '', s.reasons.map(r => r.label).join('; ')]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'at-risk-students.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-brand-primary" />At-Risk Students</h1>
          <p className="text-xs text-textMuted mt-0.5">
            {role === 'faculty' ? 'Your mentees who need attention' : 'Early warning from attendance, CGPA, GPA trend, mentoring and coding activity'}
          </p>
        </div>
        <button onClick={exportCsv} disabled={students.length === 0}
          className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5 hover:bg-surface-2 disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Students checked', value: data?.summary.total, tone: 'text-textPrimary', icon: Users },
          { label: 'High risk', value: data?.summary.high, tone: 'text-red-600', icon: AlertTriangle },
          { label: 'Medium risk', value: data?.summary.medium, tone: 'text-amber-600', icon: AlertTriangle },
          { label: 'On track', value: data?.summary.low, tone: 'text-emerald-600', icon: ShieldAlert },
        ].map(k => (
          <div key={k.label} className={`${card} p-4`}>
            <div className={`text-2xl font-black ${k.tone}`}>{isLoading ? '…' : (k.value ?? 0)}</div>
            <div className="text-[11px] font-bold text-textMuted flex items-center gap-1"><k.icon className="w-3 h-3" />{k.label}</div>
          </div>
        ))}
      </div>

      {data?.summary.by_reason && Object.keys(data.summary.by_reason).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setReason('')} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${!reason ? 'bg-brand-primary text-white' : 'bg-surface-2 text-textSecondary'}`}>All reasons</button>
          {Object.entries(data.summary.by_reason).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
            <button key={code} onClick={() => setReason(code === reason ? '' : code)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${reason === code ? 'bg-brand-primary text-white' : 'bg-surface-2 text-textSecondary'}`}>
              {REASON_LABELS[code] || code} · {n}
            </button>
          ))}
        </div>
      )}

      <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
        {!deptLocked && (
          <select value={department} onChange={e => setDepartment(e.target.value)} className={input}>
            <option value="All">All departments</option>
            {VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select value={year} onChange={e => setYear(e.target.value)} className={input}>
          <option value="All">All years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={section} onChange={e => setSection(e.target.value)} className={input}>
          <option value="All">All sections</option>
          {['A', 'B', 'C', 'D', 'E'].map(s => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <select value={level} onChange={e => setLevel(e.target.value as any)} className={input}>
          <option value="flagged">High + medium</option>
          <option value="high">High only</option>
          <option value="medium">Medium only</option>
        </select>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Roll no. or name" className={`${input} pl-8 w-full`} />
        </div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Student</th><th className="py-2.5 px-3">Class</th><th className="py-2.5 px-3 text-center">Risk</th>
                <th className="py-2.5 px-3 text-center">Attendance</th><th className="py-2.5 px-3 text-center">CGPA</th><th className="py-2.5 px-3">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={6} className="py-10 text-center text-textMuted">Checking students…</td></tr>
                : isError ? <tr><td colSpan={6} className="py-10 text-center text-red-600">{(error as Error)?.message || 'Could not load risk data.'}</td></tr>
                : students.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-textMuted">No students flagged for this selection. 🎉</td></tr>
                : students.map(s => (
                  <tr key={s.roll_number} className="hover:bg-surface-2/50 align-top">
                    <td className="py-2.5 px-4"><div className="font-mono font-bold text-textPrimary">{s.roll_number}</div><div className="text-textSecondary">{s.name}</div></td>
                    <td className="py-2.5 px-3 text-textSecondary">{s.department}<div className="text-[10px] text-textMuted">{s.year} · Sec {s.section || '—'}</div></td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${s.level === 'high' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                        {s.level.toUpperCase()} · {s.score}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-center font-bold tabular-nums ${s.attendance_pct !== null && s.attendance_pct < 75 ? 'text-red-600' : 'text-textSecondary'}`}>
                      {s.attendance_pct !== null ? `${s.attendance_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`py-2.5 px-3 text-center font-bold tabular-nums ${s.cgpa !== null && s.cgpa > 0 && s.cgpa < 6 ? 'text-red-600' : 'text-textSecondary'}`}>
                      {s.cgpa !== null && s.cgpa > 0 ? s.cgpa.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map(r => <span key={r.code} className="px-1.5 py-0.5 rounded-md bg-surface-2 text-[10px] font-semibold text-textSecondary">{r.label}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-textMuted flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Score: attendance below 65% +40, below 75% +25 · CGPA below 5 +25, below 6 +15 · semester GPA drop of 1.0 or more +15 ·
        no mentor meeting in 60 days +10 · no coding profile (2nd year onwards) +5. High ≥ 40, medium ≥ 20.
      </p>
    </div>
  );
};

/** Compact card for students and parents: their own areas needing attention. */
export const MyRiskCard: React.FC = () => {
  const { data } = useQuery({ queryKey: ['myRisk'], queryFn: () => api.getMyRisk().catch(() => null), staleTime: 5 * 60 * 1000 });
  if (!data || data.level === 'low' || !Array.isArray(data.reasons) || data.reasons.length === 0) return null;
  return (
    <div className={`${card} p-4 border-l-4 ${data.level === 'high' ? 'border-l-red-500' : 'border-l-amber-500'}`}>
      <p className="text-xs font-black text-textPrimary flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600" />Needs attention</p>
      <ul className="mt-1.5 space-y-0.5">
        {data.reasons.map((r: RiskReason) => <li key={r.code} className="text-[11px] text-textSecondary">• {r.label}</li>)}
      </ul>
    </div>
  );
};

export default RiskAlertsPage;
