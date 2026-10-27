import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart2, ChevronDown, ChevronRight, Download, Search, Settings, Users, AlertTriangle, CheckCircle, TrendingDown, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../../lib/validation/auth';

const DEPARTMENTS = ['All', ...VALID_DEPARTMENT_NAMES];
const SEMESTERS = ['', '1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'];
const SECTIONS = ['', 'A','B','C','D','E'];
const STATUS_OPTIONS = ['all','underloaded','optimal','overloaded','no_data'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  underloaded: { label: 'Underloaded', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <TrendingDown className="w-3 h-3" /> },
  optimal:     { label: 'Optimal',     color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle className="w-3 h-3" /> },
  overloaded:  { label: 'Overloaded',  color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', icon: <AlertTriangle className="w-3 h-3" /> },
  no_data:     { label: 'No Timetable', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', icon: <BarChart2 className="w-3 h-3" /> },
};

const PERIOD_TIMES: Record<number, string> = {
  1:'09:00–09:50', 2:'09:50–10:40', 3:'10:55–11:45',
  4:'11:45–12:35', 5:'01:50–02:40', 6:'02:40–03:30', 7:'03:30–04:20',
};

export const FacultyWorkloadPage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || '';
  const isReadOnly = ['director','principal','management','program_chair'].includes(role);
  const isFaculty = role === 'faculty';

  const [dept, setDept] = useState(
    role === 'hod' ? (user?.department || 'All') :
    role === 'program_chair' ? 'CSE' : 'All'
  );
  const [sem, setSem] = useState('');
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<{ designation: string; min: number; max: number }>({ designation: 'default', min: 12, max: 20 });

  const { data: raw, isLoading } = useQuery({
    queryKey: ['facultyWorkload', dept, sem, section, search, statusFilter],
    queryFn: () => api.getWorkload({ department: dept === 'All' ? undefined : dept, semester: sem || undefined, section: section || undefined, search: search || undefined, status: statusFilter === 'all' ? undefined : statusFilter }),
    staleTime: 30000,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['workloadSettings'],
    queryFn: () => api.getWorkloadSettings(),
    enabled: !isReadOnly && !isFaculty,
  });

  const saveMutation = useMutation({
    mutationFn: (s: { designation: string; min: number; max: number }) =>
      api.saveWorkloadSettings(s.designation, s.min, s.max),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facultyWorkload'] }); qc.invalidateQueries({ queryKey: ['workloadSettings'] }); setShowSettings(false); },
  });

  const workload: any[] = Array.isArray(raw?.workload) ? raw.workload : [];
  const deptAverages: any[] = Array.isArray(raw?.dept_averages) ? raw.dept_averages : [];

  const scopeLabel = useMemo(() => {
    if (role === 'program_chair') return 'CSE & Allied Branches';
    if (role === 'hod') return user?.department || 'Your Department';
    if (role === 'faculty') return 'My Workload';
    return dept === 'All' ? 'All Departments' : dept;
  }, [role, dept, user?.department]);

  const toggleRow = (email: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const exportExcel = () => {
    const rows = workload.map(w => ({
      'Faculty Name': w.faculty_name,
      'Department': w.department,
      'Designation': w.designation,
      'Total Subjects': w.subject_count,
      'Total Sections': w.section_count,
      'Theory Hrs/Week': w.theory_hours_week,
      'Lab Hrs/Week': w.lab_hours_week,
      'Total Hrs/Week': w.total_hours_week,
      'Mentees': w.mentee_count,
      'Status': STATUS_CONFIG[w.status]?.label || w.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Faculty Workload');
    XLSX.writeFile(wb, `faculty_workload_${dept}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const overloadedCount = workload.filter(w => w.status === 'overloaded').length;
  const underloadedCount = workload.filter(w => w.status === 'underloaded').length;
  const optimalCount = workload.filter(w => w.status === 'optimal').length;

  return (
    <div className="space-y-5 pb-10">
      {/* Scope banner */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-5 h-5 text-brand-primary" />
            <h2 className="text-base font-bold text-textPrimary">Faculty Workload</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-soft text-brand-primary font-semibold border border-brand-primary/20">
              {scopeLabel}
            </span>
            {isReadOnly && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-semibold">Read-only</span>}
          </div>
          <p className="text-xs text-textSecondary">Live from timetable & subject allocations. Updates automatically.</p>
        </div>
        <div className="flex gap-2">
          {!isReadOnly && !isFaculty && (
            <button onClick={() => setShowSettings(s => !s)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-borderLine text-xs font-semibold text-textSecondary hover:text-textPrimary transition-colors">
              <Settings className="w-3.5 h-3.5" /> Thresholds
            </button>
          )}
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:opacity-90 transition-opacity">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && !isReadOnly && (
        <div className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-textPrimary">Workload Thresholds</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-textSecondary border-b border-borderLine">
                <th className="text-left py-2 pr-4">Designation</th>
                <th className="text-left py-2 pr-4">Min Hrs/Week</th>
                <th className="text-left py-2 pr-4">Max Hrs/Week</th>
                <th></th>
              </tr></thead>
              <tbody>
                {(Array.isArray(settings) ? settings : []).map((s: any) => (
                  <tr key={s.designation} className="border-b border-borderLine/50">
                    <td className="py-2 pr-4 font-semibold text-textPrimary">{s.designation}</td>
                    <td className="py-2 pr-4 text-textSecondary">{s.min_hours_week}</td>
                    <td className="py-2 pr-4 text-textSecondary">{s.max_hours_week}</td>
                    <td className="py-2">
                      <button onClick={() => setSettingsForm({ designation: s.designation, min: s.min_hours_week, max: s.max_hours_week })}
                        className="text-brand-primary text-xs hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {settingsForm.designation && (
            <div className="flex gap-3 items-end flex-wrap border-t border-borderLine pt-3">
              <div>
                <label className="text-xs text-textSecondary block mb-1">Designation</label>
                <input value={settingsForm.designation} readOnly className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textSecondary w-48" />
              </div>
              <div>
                <label className="text-xs text-textSecondary block mb-1">Min Hrs/Week</label>
                <input type="number" value={settingsForm.min} onChange={e => setSettingsForm(f => ({ ...f, min: parseInt(e.target.value) }))}
                  className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary w-24 focus:outline-none focus:border-brand-primary/60" />
              </div>
              <div>
                <label className="text-xs text-textSecondary block mb-1">Max Hrs/Week</label>
                <input type="number" value={settingsForm.max} onChange={e => setSettingsForm(f => ({ ...f, max: parseInt(e.target.value) }))}
                  className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary w-24 focus:outline-none focus:border-brand-primary/60" />
              </div>
              <button onClick={() => saveMutation.mutate(settingsForm)} disabled={saveMutation.isPending}
                className="px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {!isFaculty && (
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-48 px-3 py-2 rounded-xl border border-borderLine bg-background">
              <Search className="w-3.5 h-3.5 text-textSecondary shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search faculty…"
                className="w-full bg-transparent text-xs text-textPrimary focus:outline-none placeholder:text-textMuted" />
            </div>
            {!['hod','program_chair'].includes(role) && (
              <select value={dept} onChange={e => setDept(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-medium">
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select value={sem} onChange={e => setSem(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-medium">
              <option value="">All Semesters</option>
              {SEMESTERS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={section} onChange={e => setSection(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-medium">
              <option value="">All Sections</option>
              {SECTIONS.filter(Boolean).map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-medium">
              <option value="all">All Status</option>
              {STATUS_OPTIONS.filter(s => s !== 'all').map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Summary KPI chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Faculty', value: workload.length, color: 'text-textPrimary', bg: 'bg-surface' },
          { label: 'Optimal', value: optimalCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Overloaded', value: overloadedCount, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Underloaded', value: underloadedCount, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(kpi => (
          <div key={kpi.label} className={`${kpi.bg} border border-borderLine rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-textSecondary mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Dept average chart (simple bar) */}
      {deptAverages.length > 1 && (
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <h3 className="text-sm font-bold text-textPrimary mb-3">Department Average Workload (hrs/week)</h3>
          <div className="space-y-2">
            {deptAverages.sort((a, b) => b.avg_hours - a.avg_hours).map((d: any) => (
              <div key={d.department} className="flex items-center gap-3">
                <span className="text-xs text-textSecondary w-40 shrink-0 truncate">{d.department}</span>
                <div className="flex-1 bg-surface-2 rounded-full h-3 overflow-hidden">
                  <div className="h-full bg-brand-primary/70 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (d.avg_hours / 25) * 100)}%` }} />
                </div>
                <span className="text-xs font-bold text-textPrimary w-12 text-right">{d.avg_hours}h</span>
                <span className="text-xs text-textMuted w-16">({d.faculty_count} faculty)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Faculty Workload Table */}
      <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : workload.length === 0 ? (
          <div className="text-center py-12 text-textMuted text-sm">
            <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No workload data found. Add timetable entries first.</p>
          </div>
        ) : (
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textSecondary">
                <th className="text-left py-3 px-4 w-6"></th>
                <th className="text-left py-3 px-3">Faculty</th>
                <th className="text-left py-3 px-3">Dept</th>
                <th className="text-left py-3 px-3">Designation</th>
                <th className="text-center py-3 px-3">Subjects</th>
                <th className="text-center py-3 px-3">Sections</th>
                <th className="text-center py-3 px-3">Theory h/w</th>
                <th className="text-center py-3 px-3">Lab h/w</th>
                <th className="text-center py-3 px-3">Total h/w</th>
                <th className="text-center py-3 px-3">Mentees</th>
                <th className="text-center py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w: any) => {
                const expanded = expandedRows.has(w.faculty_email);
                const cfg = STATUS_CONFIG[w.status] || STATUS_CONFIG.no_data;
                return (
                  <React.Fragment key={w.faculty_email}>
                    <tr className="border-b border-borderLine/50 hover:bg-surface-2/50 cursor-pointer transition-colors"
                      onClick={() => toggleRow(w.faculty_email)}>
                      <td className="py-3 px-4">
                        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-textSecondary" /> : <ChevronRight className="w-3.5 h-3.5 text-textSecondary" />}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-textPrimary">{w.faculty_name}</div>
                        <div className="text-textMuted text-[10px]">{w.faculty_email}</div>
                      </td>
                      <td className="py-3 px-3 text-textSecondary">{w.department}</td>
                      <td className="py-3 px-3 text-textSecondary">{w.designation}</td>
                      <td className="py-3 px-3 text-center font-bold text-textPrimary">{w.subject_count}</td>
                      <td className="py-3 px-3 text-center font-bold text-textPrimary">{w.section_count}</td>
                      <td className="py-3 px-3 text-center text-textPrimary">{w.theory_hours_week}</td>
                      <td className="py-3 px-3 text-center text-textPrimary">{w.lab_hours_week}</td>
                      <td className="py-3 px-3 text-center font-black text-textPrimary text-sm">{w.total_hours_week}</td>
                      <td className="py-3 px-3 text-center text-textSecondary">{w.mentee_count}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.color} ${cfg.bg}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-surface-2/30">
                        <td colSpan={11} className="px-8 py-3">
                          <div className="text-xs font-bold text-textSecondary mb-2 flex items-center gap-2">
                            <Filter className="w-3 h-3" /> Detailed Schedule
                          </div>
                          {w.slots && w.slots.length > 0 ? (
                            <table className="w-full text-xs border border-borderLine/50 rounded-xl overflow-hidden">
                              <thead>
                                <tr className="bg-surface border-b border-borderLine text-textSecondary">
                                  <th className="text-left py-2 px-3">Semester</th>
                                  <th className="text-left py-2 px-3">Dept</th>
                                  <th className="text-left py-2 px-3">Section</th>
                                  <th className="text-left py-2 px-3">Subject</th>
                                  <th className="text-left py-2 px-3">Type</th>
                                  <th className="text-left py-2 px-3">Day</th>
                                  <th className="text-left py-2 px-3">Period</th>
                                  <th className="text-left py-2 px-3">Duration</th>
                                  <th className="text-left py-2 px-3">Room</th>
                                </tr>
                              </thead>
                              <tbody>
                                {w.slots.map((s: any, i: number) => (
                                  <tr key={i} className="border-b border-borderLine/30 hover:bg-surface/50">
                                    <td className="py-2 px-3 text-textPrimary font-mono">{s.semester_label}</td>
                                    <td className="py-2 px-3 text-textSecondary">{s.department}</td>
                                    <td className="py-2 px-3 text-textSecondary">{s.section}</td>
                                    <td className="py-2 px-3 text-textPrimary font-semibold">{s.subject_name}</td>
                                    <td className="py-2 px-3">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.subject_type === 'Lab' ? 'bg-purple-50 text-purple-600 border border-purple-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                                        {s.subject_type}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-textSecondary">{s.day_of_week}</td>
                                    <td className="py-2 px-3 text-textSecondary">P{s.period_start} {PERIOD_TIMES[s.period_start] ? `(${PERIOD_TIMES[s.period_start]})` : ''}</td>
                                    <td className="py-2 px-3 text-textSecondary">{s.num_periods}h</td>
                                    <td className="py-2 px-3 text-textMuted">{s.room_no || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-textMuted text-xs">No timetable slots found for this faculty.</p>
                          )}
                          <div className="mt-2 flex gap-4 text-xs text-textSecondary">
                            <span>📚 {w.subject_count} subjects · {w.section_count} sections</span>
                            <span>👨‍🎓 {w.mentee_count} mentees</span>
                            <span>📅 {w.theory_hours_week}h theory + {w.lab_hours_week}h lab = <strong>{w.total_hours_week}h/week</strong></span>
                            <span>Threshold: {w.threshold?.min}–{w.threshold?.max}h</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
