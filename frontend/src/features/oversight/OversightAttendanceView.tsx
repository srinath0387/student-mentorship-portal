import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, AlertTriangle, Users, Building2, Search, Download, Eye } from 'lucide-react';
import { api } from '../../lib/api';

/**
 * Read-only attendance view for oversight roles (director, principal, management, program chair).
 * Department-wise current-semester attendance and every student below the 75% threshold.
 * No roster, timetable, or subject-allocation tools — those are for admin/HOD/coordinator.
 */

export interface DeptAttendance {
  department: string;
  students_tracked: number;
  periods_held: number;
  periods_attended: number;
  overall_percentage: number;
  at_risk_count: number;
  critical_count: number;
  by_year: { year: string; students_tracked: number; overall_percentage: number; at_risk_count: number }[];
}

export interface AtRiskStudent {
  roll_number: string;
  name: string;
  department: string;
  year: string;
  section: string;
  semester: string;
  held: number;
  attended: number;
  percentage: number;
}

export interface AttendanceOverview {
  threshold: number;
  critical_threshold: number;
  allowed_departments: string[];
  totals: { students_tracked: number; overall_percentage: number; at_risk_count: number; critical_count: number };
  departments: DeptAttendance[];
  at_risk_students: AtRiskStudent[];
}

function pctTone(pct: number, threshold: number, critical: number) {
  if (pct < critical) return { bar: 'bg-red-500', text: 'text-red-600' };
  if (pct < threshold) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
}

function Kpi({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-4 flex items-start gap-3 shadow-xs">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xl font-black text-textPrimary truncate">{value}</div>
        <div className="text-[11px] font-bold text-textMuted leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-textMuted mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function PctBar({ pct, threshold, critical }: { pct: number; threshold: number; critical: number }) {
  const tone = pctTone(pct, threshold, critical);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden relative">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-textMuted/50" style={{ left: `${threshold}%` }} title={`${threshold}% threshold`} />
      </div>
      <span className={`text-[11px] font-black tabular-nums w-11 text-right ${tone.text}`}>{pct.toFixed(1)}%</span>
    </div>
  );
}

export const OversightAttendanceView: React.FC = () => {
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery<AttendanceOverview>({
    queryKey: ['oversightAttendanceOverview'],
    queryFn: () => api.getOversightAttendanceOverview(),
    staleTime: 2 * 60 * 1000,
  });

  const threshold = data?.threshold ?? 75;
  const critical = data?.critical_threshold ?? 65;
  const departments = data?.departments ?? [];

  const atRisk = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.at_risk_students ?? []).filter(s =>
      (selectedDept === 'All' || s.department === selectedDept) &&
      (yearFilter === 'All' || s.year === yearFilter) &&
      (!q || s.roll_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    );
  }, [data, selectedDept, yearFilter, search]);

  const years = useMemo(
    () => Array.from(new Set((data?.at_risk_students ?? []).map(s => s.year).filter(Boolean))).sort(),
    [data]
  );

  const selected = selectedDept === 'All' ? null : departments.find(d => d.department === selectedDept) || null;

  const exportCsv = () => {
    const header = ['Roll Number', 'Name', 'Department', 'Year', 'Section', 'Semester', 'Periods Held', 'Periods Attended', 'Attendance %'];
    const lines = atRisk.map(s => [s.roll_number, s.name, s.department, s.year, s.section, s.semester, s.held, s.attended, s.percentage]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `at-risk-attendance-${selectedDept === 'All' ? 'all-departments' : selectedDept}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isError) {
    return (
      <div className="bg-surface border border-borderLine rounded-2xl p-8 text-center text-sm text-textMuted">
        Couldn't load attendance data. Please refresh, or log in again if your session has expired.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-brand-primary" /> Attendance Overview
          </h1>
          <p className="text-xs text-textMuted mt-0.5 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> View only · current semester · students below {threshold}% are at risk
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Overall Attendance" value={isLoading ? '…' : `${(data?.totals.overall_percentage ?? 0).toFixed(1)}%`}
          sub="all tracked students" icon={CalendarCheck} accent="bg-indigo-500/10 text-indigo-600" />
        <Kpi label="Students Tracked" value={isLoading ? '…' : (data?.totals.students_tracked ?? 0)}
          sub={`${departments.length} departments`} icon={Users} accent="bg-sky-500/10 text-sky-600" />
        <Kpi label={`At Risk (< ${threshold}%)`} value={isLoading ? '…' : (data?.totals.at_risk_count ?? 0)}
          sub="need attention" icon={AlertTriangle} accent="bg-amber-500/10 text-amber-600" />
        <Kpi label={`Critical (< ${critical}%)`} value={isLoading ? '…' : (data?.totals.critical_count ?? 0)}
          sub="detention risk" icon={AlertTriangle} accent="bg-red-500/10 text-red-600" />
      </div>

      {/* Department-wise attendance */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLine flex items-center justify-between gap-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-textSecondary flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-brand-primary" /> Department-wise Attendance
          </h2>
          <span className="text-[10px] text-textMuted">Click a department to see its at-risk students</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-3 text-center">Students</th>
                <th className="py-3 px-3">Attendance</th>
                <th className="py-3 px-3 text-center">At Risk</th>
                <th className="py-3 px-3 text-center">Critical</th>
                <th className="py-3 px-3">By Year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {departments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-textMuted">
                  {isLoading ? 'Loading attendance…' : 'No attendance has been recorded for the current semester yet.'}
                </td></tr>
              ) : departments.map(d => {
                const active = selectedDept === d.department;
                return (
                  <tr key={d.department}
                    onClick={() => setSelectedDept(active ? 'All' : d.department)}
                    className={`cursor-pointer transition-colors ${active ? 'bg-brand-primary/5' : 'hover:bg-surface-2/60'}`}>
                    <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary tabular-nums">{d.students_tracked}</td>
                    <td className="py-2.5 px-3"><PctBar pct={d.overall_percentage} threshold={threshold} critical={critical} /></td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`font-black tabular-nums ${d.at_risk_count > 0 ? 'text-amber-600' : 'text-textMuted'}`}>{d.at_risk_count}</span>
                      {d.students_tracked > 0 && (
                        <span className="text-[10px] text-textMuted ml-1">({Math.round((d.at_risk_count / d.students_tracked) * 100)}%)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`font-black tabular-nums ${d.critical_count > 0 ? 'text-red-600' : 'text-textMuted'}`}>{d.critical_count}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {d.by_year.map(y => (
                          <span key={y.year} title={`${y.students_tracked} students · ${y.at_risk_count} at risk`}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-borderLine ${pctTone(y.overall_percentage, threshold, critical).text}`}>
                            {y.year.replace(' Year', '')}: {y.overall_percentage.toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* At-risk students */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLine flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-textSecondary flex items-center gap-1.5 mr-auto">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            At-Risk Students {selected ? `· ${selected.department}` : '· All Departments'}
            <span className="ml-1 text-textMuted normal-case font-bold">({atRisk.length})</span>
          </h2>
          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background font-semibold">
            <option value="All">All departments</option>
            {departments.map(d => <option key={d.department} value={d.department}>{d.department}</option>)}
          </select>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background font-semibold">
            <option value="All">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Roll no. or name"
              className="pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background w-40" />
          </div>
          <button onClick={exportCsv} disabled={atRisk.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-borderLine hover:bg-surface-2 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Roll No.</th>
                <th className="py-3 px-3">Name</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3 text-center">Year / Sec</th>
                <th className="py-3 px-3 text-center">Periods</th>
                <th className="py-3 px-3">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {atRisk.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-textMuted">
                  {isLoading ? 'Loading…' : `No students below ${threshold}% for this selection.`}
                </td></tr>
              ) : atRisk.map(s => (
                <tr key={s.roll_number} className="hover:bg-surface-2/60">
                  <td className="py-2 px-4 font-mono font-bold text-textPrimary">{s.roll_number}</td>
                  <td className="py-2 px-3 text-textPrimary">{s.name}</td>
                  <td className="py-2 px-3 text-textSecondary">{s.department}</td>
                  <td className="py-2 px-3 text-center text-textSecondary">{s.year || '—'}{s.section ? ` · ${s.section}` : ''}</td>
                  <td className="py-2 px-3 text-center text-textSecondary tabular-nums">{s.attended}/{s.held}</td>
                  <td className="py-2 px-3"><PctBar pct={s.percentage} threshold={threshold} critical={critical} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OversightAttendanceView;
