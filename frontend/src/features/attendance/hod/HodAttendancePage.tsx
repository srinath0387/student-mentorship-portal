import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, AlertTriangle, Calendar, Download, Users, BookOpen, TrendingDown } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

type TabId = 'summary'|'defaulters'|'daily'|'reports';

export const HodAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('summary');
  const [filterSection, setFilterSection] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: rawAllotments = [] } = useQuery({
    queryKey: ['attendanceAllotments', '', user?.department],
    queryFn: () => api.getAllotments(undefined, user?.department).catch(() => [])
  });
  const allotments = Array.isArray(rawAllotments) ? rawAllotments : [];

  const { data: rawSummary = [] } = useQuery({
    queryKey: ['subjectSummary', filterSubject],
    queryFn: () => filterSubject ? api.getSubjectAttendanceSummary(filterSubject).catch(() => null) : Promise.resolve(null),
    enabled: Boolean(filterSubject)
  });

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: '📊 Department Summary', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: 'defaulters', label: '⚠️ Defaulters', icon: <TrendingDown className="w-3.5 h-3.5" /> },
    { id: 'daily', label: '📅 Daily Grid', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'reports', label: '📄 Download Reports', icon: <Download className="w-3.5 h-3.5" /> },
  ];

  const uniqueSections = useMemo(() => [...new Set(allotments.map((a: any) => a.section))].sort(), [allotments]);
  const filteredAllotments = allotments.filter((a: any) => !filterSection || a.section === filterSection);

  return (
    <div className="space-y-4">
      {/* Tab Nav */}
      <div className="flex gap-1 border-b border-borderLine overflow-x-auto pb-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all -mb-px ${tab === t.id ? 'border-brand-primary text-brand-primary bg-brand-soft' : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── SUMMARY ── */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
              <option value="">All Sections</option>
              {uniqueSections.map(s => <option key={s}>{s}</option>)}
            </select>
            <span className="text-xs text-textMuted self-center">{filteredAllotments.length} subject allotments in {user?.department || 'dept'}</span>
          </div>

          <div className="grid gap-3">
            {filteredAllotments.length === 0 ? (
              <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center text-textMuted text-xs">No subject allotments found for your department.</div>
            ) : (
              filteredAllotments.map((a: any) => (
                <div key={a.id} className="bg-surface border border-borderLine rounded-2xl p-4 flex items-center justify-between hover:border-brand-primary/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-textPrimary">{a.subject_name}</p>
                      <p className="text-[10px] text-textMuted">{a.semester_label} | Sec {a.section} | {a.faculty_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-textMuted">Avg Attendance</p>
                      <p className="text-sm font-black text-emerald-600">—%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-textMuted">Students</p>
                      <p className="text-sm font-black">—</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-textSecondary">No sessions yet</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── DEFAULTERS ── */}
      {tab === 'defaulters' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
              <option value="">All Sections</option>
              {uniqueSections.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
              <option value="">Select Subject</option>
              {filteredAllotments.map((a: any) => <option key={a.id} value={a.id}>{a.subject_name} — Sec {a.section}</option>)}
            </select>
            <button onClick={() => window.print()} className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white font-bold text-xs rounded-xl hover:bg-rose-600">
              <Download className="w-3.5 h-3.5" />Download Defaulters PDF
            </button>
          </div>

          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-borderLine bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />Students with attendance below 75%
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine">
                  <tr>
                    <th className="px-4 py-2.5 text-center">#</th>
                    <th className="px-4 py-2.5">Roll No</th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Section</th>
                    <th className="px-4 py-2.5">Subject</th>
                    <th className="px-4 py-2.5 text-center">Attendance %</th>
                    <th className="px-4 py-2.5 text-center">Hours Missed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={7} className="p-8 text-center text-textMuted">Select a subject to load defaulters.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── DAILY GRID ── */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            <span className="text-xs text-textMuted">Period-wise attendance grid for {user?.department}</span>
          </div>
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-borderLine font-bold text-xs">
              {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine">
                  <tr>
                    <th className="px-4 py-2.5">Section</th>
                    {[1, 2, 3, 4, 5, 6, 7].map(p => <th key={p} className="px-4 py-2.5 text-center">Period {p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {uniqueSections.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-textMuted">No sections found.</td></tr>
                  ) : (
                    uniqueSections.map(sec => (
                      <tr key={sec} className="border-b border-borderLine hover:bg-surface-2">
                        <td className="px-4 py-3 font-black">{user?.department} - {sec}</td>
                        {[1, 2, 3, 4, 5, 6, 7].map(p => (
                          <td key={p} className="px-4 py-3 text-center text-textMuted text-[10px]">—</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── DOWNLOAD REPORTS ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Section-wise Report */}
            <div className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-primary" />
                <h3 className="text-sm font-black text-textPrimary">Section-wise Attendance Report</h3>
              </div>
              <div className="space-y-2">
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option>Full Semester</option><option>Current Month</option>
                </select>
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option value="">All Sections</option>
                  {uniqueSections.map(s => <option key={s}>Section {s}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-primary text-white font-bold text-xs rounded-xl hover:opacity-90">
                  <Download className="w-3.5 h-3.5" />Download PDF
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-500">
                  <Download className="w-3.5 h-3.5" />Download Excel
                </button>
              </div>
            </div>

            {/* Defaulters Report */}
            <div className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-black text-textPrimary">Defaulters List (Below 75%)</h3>
              </div>
              <div className="space-y-2">
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option>Full Semester</option><option>Current Month</option>
                </select>
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option value="">All Sections</option>
                  {uniqueSections.map(s => <option key={s}>Section {s}</option>)}
                </select>
              </div>
              <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-500 text-white font-bold text-xs rounded-xl hover:bg-rose-600">
                <Download className="w-3.5 h-3.5" />Download Defaulters PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
