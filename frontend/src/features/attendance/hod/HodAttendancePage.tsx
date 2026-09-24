import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, AlertTriangle, Calendar, Download, Users, BookOpen, TrendingDown, Settings, CheckCircle2, RotateCcw, Printer, FileSpreadsheet } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { AttendanceSetupPage } from '../admin/AttendanceSetupPage';

type TabId = 'setup' | 'summary' | 'defaulters' | 'daily' | 'reports';

export const HodAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('summary');
  const [filterSem, setFilterSem] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedAllotmentModal, setSelectedAllotmentModal] = useState<any|null>(null);

  // Allotments for HOD department
  const { data: rawAllotments = [], refetch: refetchAllotments, isLoading: isAllotLoading } = useQuery({
    queryKey: ['attendanceAllotments', filterSem, user?.department],
    queryFn: () => api.getAllotments(filterSem || undefined, user?.department || undefined).catch(() => []),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const allotments = Array.isArray(rawAllotments) ? rawAllotments : [];

  // Subject summary for selected subject
  const { data: subjectSummary, isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['subjectSummary', filterSubject],
    queryFn: () => filterSubject ? api.getSubjectSummary(filterSubject).catch(() => null) : Promise.resolve(null),
    enabled: Boolean(filterSubject),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Daily Period Grid
  const { data: rawDailyGrid = [] } = useQuery({
    queryKey: ['dailyPeriodGrid', selectedDate, filterSem, user?.department],
    queryFn: () => api.getDailyPeriodGrid({ date: selectedDate, semester: filterSem || undefined, department: user?.department || undefined }).catch(() => [])
  });
  const dailyGrid = Array.isArray(rawDailyGrid) ? rawDailyGrid : [];

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: '📊 Department Overview', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: 'defaulters', label: '⚠️ Defaulters List', icon: <TrendingDown className="w-3.5 h-3.5" /> },
    { id: 'daily', label: '📅 Daily Period Grid', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'reports', label: '📄 Download Reports', icon: <Download className="w-3.5 h-3.5" /> },
    { id: 'setup', label: '⚙️ Master Allocation & Setup', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  const uniqueSections = useMemo(() => [...new Set(allotments.map((a: any) => a.section))].filter(Boolean).sort(), [allotments]);
  const uniqueSemesters = useMemo(() => [...new Set(allotments.map((a: any) => a.semester_label))].filter(Boolean).sort(), [allotments]);
  
  const filteredAllotments = allotments.filter((a: any) => 
    (!filterSem || a.semester_label === filterSem) &&
    (!filterSection || a.section === filterSection)
  );

  const totalSessionsTaken = allotments.reduce((acc: number, a: any) => acc + parseInt(a.sessions_count || '0'), 0);
  const totalStudentsEnrolled = allotments.reduce((acc: number, a: any) => acc + parseInt(a.roster_count || '0'), 0);

  // Defaulters (< 75%)
  const defaultersList = useMemo(() => {
    if (!subjectSummary?.students) return [];
    return subjectSummary.students.filter((s: any) => s.percentage < 75);
  }, [subjectSummary]);

  const handleExportCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      alert('No data available to export.');
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Attendance Intelligence & Setup</span>
          </div>
          <h2 className="text-lg font-black text-textPrimary">{user?.department || 'Department'} Attendance Control</h2>
          <p className="text-xs text-textMuted mt-0.5">Real-time attendance tracking, subject allocation, timetables, and defaulters analysis.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { refetchAllotments(); refetchSummary(); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-borderLine hover:bg-surface-2 text-textSecondary font-bold text-xs">
            <RotateCcw className={`w-3.5 h-3.5 ${isAllotLoading ? 'animate-spin text-brand-primary' : ''}`} /> Refresh Data
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-borderLine overflow-x-auto pb-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all -mb-px ${tab === t.id ? 'border-brand-primary text-brand-primary bg-brand-soft' : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: SUMMARY ── */}
      {tab === 'summary' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold text-textMuted uppercase">Active Allotments</p>
              <h3 className="text-2xl font-black text-brand-primary mt-1">{allotments.length}</h3>
              <p className="text-[10px] text-textMuted mt-1">{uniqueSections.length} Sections · {uniqueSemesters.length} Semesters</p>
            </div>
            <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold text-textMuted uppercase">Total Sessions Held</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">{totalSessionsTaken}</h3>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1">Logged by faculty</p>
            </div>
            <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold text-textMuted uppercase">Enrolled Students</p>
              <h3 className="text-2xl font-black text-indigo-600 mt-1">{totalStudentsEnrolled}</h3>
              <p className="text-[10px] text-textMuted mt-1">Across all rosters</p>
            </div>
            <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold text-textMuted uppercase">Department</p>
              <h3 className="text-sm font-black text-textPrimary mt-2 truncate">{user?.department || 'All'}</h3>
              <p className="text-[10px] text-textMuted mt-1">Active Academic Term</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4 flex gap-3 flex-wrap items-center">
            <select value={filterSem} onChange={e => setFilterSem(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
              <option value="">All Semesters / Classes</option>
              {['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
              <option value="">All Sections</option>
              {['A','B','C','D','E'].map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
            <span className="text-xs text-textMuted ml-auto">{filteredAllotments.length} subject allotments shown</span>
          </div>

          {/* Subject Allotments Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isAllotLoading ? (
              <div className="col-span-full bg-surface border border-borderLine rounded-2xl p-12 text-center text-textMuted text-xs animate-pulse">
                Loading subject allotments...
              </div>
            ) : filteredAllotments.length === 0 ? (
              <div className="col-span-full bg-surface border border-borderLine rounded-2xl p-12 text-center text-textMuted text-xs">
                No subject allotments found for the selected criteria.
              </div>
            ) : (
              filteredAllotments.map((a: any) => (
                <div key={a.id} className="bg-surface border border-borderLine rounded-2xl p-5 hover:border-brand-primary/40 transition-all shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-brand-soft text-brand-primary uppercase">{a.semester_label} - Sec {a.section}</span>
                      <h4 className="text-sm font-black text-textPrimary mt-1.5 line-clamp-1">{a.subject_name}</h4>
                      <p className="text-[11px] text-textSecondary">{a.subject_type} · {a.department}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-borderLine flex items-center justify-between text-xs">
                    <div>
                      <p className="text-[10px] text-textMuted">Assigned Faculty</p>
                      <p className="font-bold text-textPrimary truncate max-w-[140px]">{a.faculty_name || a.faculty_email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-textMuted">Sessions / Students</p>
                      <p className="font-black text-emerald-600">{a.sessions_count || 0} / {a.roster_count || 0}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: DEFAULTERS ── */}
      {tab === 'defaulters' && (
        <div className="space-y-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-4 flex gap-3 flex-wrap items-center">
            <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold min-w-[240px]">
              <option value="">— Select Subject to Inspect Defaulters —</option>
              {allotments.map((a: any) => (
                <option key={a.id} value={a.id}>{a.semester_label} | Sec {a.section} | {a.subject_name} ({a.faculty_name})</option>
              ))}
            </select>
            {defaultersList.length > 0 && (
              <button onClick={() => handleExportCSV(defaultersList, `Defaulters_${user?.department || 'dept'}`)} className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white font-bold text-xs rounded-xl hover:bg-rose-600 shadow-sm">
                <Download className="w-3.5 h-3.5" />Export Defaulters CSV
              </button>
            )}
          </div>

          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-borderLine bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-between">
              <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Students with attendance below 75%</span>
              <span>{defaultersList.length} Defaulters</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#343a40] text-white font-bold text-[10px] uppercase">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">#</th>
                    <th className="px-4 py-3">Roll No</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3 text-center">Section</th>
                    <th className="px-4 py-3 text-center">Total Periods</th>
                    <th className="px-4 py-3 text-center">Attended</th>
                    <th className="px-4 py-3 text-center">Percentage</th>
                    <th className="px-4 py-3 text-center">Shortage Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {!filterSubject ? (
                    <tr><td colSpan={8} className="p-8 text-center text-textMuted">Select a subject above to view the defaulters list.</td></tr>
                  ) : isSummaryLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-textMuted animate-pulse">Analyzing student attendance...</td></tr>
                  ) : defaultersList.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-emerald-600 font-bold">✨ No defaulters! All students are at or above 75% attendance.</td></tr>
                  ) : (
                    defaultersList.map((s: any, idx: number) => (
                      <tr key={s.roll_number} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3 text-center text-textMuted font-bold">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-black">{s.roll_number}</td>
                        <td className="px-4 py-3 font-bold uppercase">{s.student_name}</td>
                        <td className="px-4 py-3 text-center">{s.section}</td>
                        <td className="px-4 py-3 text-center font-semibold">{s.periods_held}</td>
                        <td className="px-4 py-3 text-center font-bold text-rose-600">{s.periods_attended}</td>
                        <td className="px-4 py-3 text-center font-black text-rose-600">{s.percentage}%</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.percentage < 65 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {s.percentage < 65 ? 'Critical Shortage' : 'Condonation Level'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: DAILY GRID ── */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-4 flex gap-3 items-center flex-wrap">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            <select value={filterSem} onChange={e => setFilterSem(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
              <option value="">All Semesters</option>
              {['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-textMuted ml-auto">Period-wise live attendance status</span>
          </div>

          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-borderLine font-bold text-xs flex items-center justify-between">
              <span>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <span className="text-textMuted font-normal">Department: <strong>{user?.department}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#343a40] text-white font-bold text-[10px] uppercase border-b border-borderLine">
                  <tr>
                    <th className="px-4 py-3 w-36">Class & Section</th>
                    {[1, 2, 3, 4, 5, 6, 7].map(p => <th key={p} className="px-3 py-3 text-center">Period {p}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {uniqueSections.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-textMuted">No classes found for this department.</td></tr>
                  ) : (
                    uniqueSections.map(sec => (
                      <tr key={sec} className="hover:bg-surface-2">
                        <td className="px-4 py-3 font-black text-textPrimary">{user?.department} - Sec {sec}</td>
                        {[1, 2, 3, 4, 5, 6, 7].map(p => {
                          const slot = dailyGrid.find((g: any) => g.section === sec && g.period_start === p);
                          return (
                            <td key={p} className="px-3 py-3 text-center">
                              {slot ? (
                                <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold rounded-lg text-[10px] block truncate" title={slot.subject_name}>
                                  ✓ {slot.subject_name}
                                </span>
                              ) : (
                                <span className="text-textMuted text-[10px] opacity-40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: DOWNLOAD REPORTS ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-primary" />
                <h3 className="text-sm font-black text-textPrimary">Section-wise Attendance Report</h3>
              </div>
              <div className="space-y-2">
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                  <option>Full Academic Semester</option>
                  <option>Current Month</option>
                </select>
                <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                  <option value="">All Sections</option>
                  {uniqueSections.map(s => <option key={s} value={s}>Section {s}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-primary text-white font-bold text-xs rounded-xl hover:opacity-90">
                  <Printer className="w-3.5 h-3.5" />Print / PDF
                </button>
                <button onClick={() => handleExportCSV(allotments, `Section_Attendance_${user?.department || 'dept'}`)} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-500">
                  <FileSpreadsheet className="w-3.5 h-3.5" />Export Excel
                </button>
              </div>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-black text-textPrimary">Department Defaulters Report</h3>
              </div>
              <div className="space-y-2">
                <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                  <option value="">— Select Subject for Defaulters —</option>
                  {allotments.map((a: any) => <option key={a.id} value={a.id}>{a.subject_name} (Sec {a.section})</option>)}
                </select>
              </div>
              <button onClick={() => handleExportCSV(defaultersList, `Defaulters_${user?.department || 'dept'}`)} disabled={defaultersList.length === 0} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-500 text-white font-bold text-xs rounded-xl hover:bg-rose-600 disabled:opacity-50">
                <Download className="w-3.5 h-3.5" />Download Defaulters CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: MASTER ALLOCATION & SETUP ── */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="p-3 bg-brand-soft border border-brand-primary/20 rounded-2xl text-xs font-bold text-brand-primary">
            ℹ️ Manage Subject Catalog, Faculty Allotments, Student Rosters, and Timetable slots for {user?.department || 'your department'}.
          </div>
          <AttendanceSetupPage />
        </div>
      )}
    </div>
  );
};

