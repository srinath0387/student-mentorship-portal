import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, AlertTriangle, Users, Download, RefreshCw, Check, X } from 'lucide-react';
import { api } from '../../../lib/api';

type TabId = 'overview' | 'not_posted' | 'setup' | 'reports';

export const CoordinatorAttendancePage: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('overview');
  const [sem, setSem] = useState<'1-1' | '1-2'>('1-1');
  const [dept, setDept] = useState('');
  const [section, setSection] = useState('');

  // Fetch 1st year allotments
  const { data: rawAllotments = [] } = useQuery({
    queryKey: ['coordinatorAllotments', sem, dept],
    queryFn: () => api.getAllotments(sem, dept || undefined).catch(() => [])
  });
  const allotments = Array.isArray(rawAllotments) ? rawAllotments : [];

  // Filter by section
  const filteredAllotments = allotments.filter((a: any) => !section || a.section === section);
  const uniqueSections = useMemo(() => [...new Set(allotments.map((a: any) => a.section))].sort(), [allotments]);
  const uniqueDepts = useMemo(() => [...new Set(allotments.map((a: any) => a.department))].sort(), [allotments]);

  // Not posted
  const { data: rawNotPosted = [], refetch: refetchNP } = useQuery({
    queryKey: ['coordinatorNotPosted', sem, dept],
    queryFn: () => api.getNotPostedAttendance({ semester: sem, department: dept || undefined }).catch(() => []),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const notPosted = Array.isArray(rawNotPosted) ? rawNotPosted : [];

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: '📊 Section Overview' },
    { id: 'not_posted', label: `⚠️ Not Posted${notPosted.length > 0 ? ` (${notPosted.length})` : ''}` },
    { id: 'setup', label: '👥 Section Setup' },
    { id: 'reports', label: '📄 Reports' },
  ];

  // Group allotments by section for overview
  const sectionGroups = useMemo(() => {
    const groups: Record<string, { dept: string; section: string; subjects: any[] }> = {};
    filteredAllotments.forEach((a: any) => {
      const key = `${a.department}-${a.section}`;
      if (!groups[key]) groups[key] = { dept: a.department, section: a.section, subjects: [] };
      groups[key].subjects.push(a);
    });
    return Object.values(groups);
  }, [filteredAllotments]);

  return (
    <div className="space-y-4">
      {/* Tab Nav */}
      <div className="flex gap-1 border-b border-borderLine overflow-x-auto pb-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all -mb-px ${tab === t.id ? 'border-brand-primary text-brand-primary bg-brand-soft' : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Shared Filter Bar */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex rounded-xl border border-borderLine overflow-hidden">
          <button onClick={() => setSem('1-1')} className={`px-4 py-2 text-xs font-black ${sem === '1-1' ? 'bg-brand-primary text-white' : 'bg-surface text-textSecondary hover:bg-surface-2'}`}>Semester 1-1</button>
          <button onClick={() => setSem('1-2')} className={`px-4 py-2 text-xs font-black ${sem === '1-2' ? 'bg-brand-primary text-white' : 'bg-surface text-textSecondary hover:bg-surface-2'}`}>Semester 1-2</button>
        </div>
        {uniqueDepts.length > 0 && (
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
            <option value="">All Departments</option>
            {uniqueDepts.map(d => <option key={d}>{d}</option>)}
          </select>
        )}
        <select value={section} onChange={e => setSection(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
          <option value="">All Sections</option>
          {uniqueSections.map(s => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <span className="text-xs text-textMuted">{filteredAllotments.length} allotments | {sectionGroups.length} sections</span>
      </div>

      {/* ── SECTION OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {sectionGroups.length === 0 ? (
            <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center text-textMuted text-xs">
              No subject allotments found for 1st year ({sem}). Admin needs to set up subjects and allotments first.
            </div>
          ) : (
            sectionGroups.map(group => (
              <div key={`${group.dept}-${group.section}`} className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
                {/* Section Header */}
                <div className="p-3.5 bg-surface-2 border-b border-borderLine flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-brand-primary text-white font-black text-xs flex items-center justify-center">{group.section}</span>
                    <div>
                      <p className="text-xs font-black text-textPrimary">{group.dept} — Section {group.section}</p>
                      <p className="text-[10px] text-textMuted">{group.subjects.length} subjects allotted</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-textSecondary">Avg: —%</span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700">0 defaulters</span>
                  </div>
                </div>
                {/* Subject List */}
                <div className="divide-y divide-borderLine">
                  {group.subjects.map((s: any) => (
                    <div key={s.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-surface-2">
                      <div>
                        <span className="text-xs font-bold text-textPrimary">{s.subject_name}</span>
                        <span className="ml-2 text-[10px] text-textMuted">{s.faculty_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.subject_type === 'Lab' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{s.subject_type}</span>
                        <span className="text-xs font-black text-textMuted">—%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── NOT POSTED ── */}
      {tab === 'not_posted' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-textPrimary">Timetable Slots Without Attendance</h3>
            </div>
            <button onClick={() => refetchNP()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-textSecondary border border-borderLine rounded-xl hover:bg-surface-2">
              <RefreshCw className="w-3.5 h-3.5" />Refresh
            </button>
          </div>
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Dept</th>
                    <th className="px-4 py-2.5">Section</th>
                    <th className="px-4 py-2.5">Period</th>
                    <th className="px-4 py-2.5">Subject</th>
                    <th className="px-4 py-2.5">Faculty</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {notPosted.length === 0 ? (
                    <tr><td colSpan={7} className="p-10 text-center text-emerald-600 font-bold">🎉 All 1st-year attendance is up to date for Semester {sem}!</td></tr>
                  ) : (
                    notPosted.map((slot: any, i: number) => (
                      <tr key={i} className="hover:bg-surface-2">
                        <td className="px-4 py-3 font-bold">{slot.date}</td>
                        <td className="px-4 py-3">{slot.department}</td>
                        <td className="px-4 py-3 font-bold">{slot.section}</td>
                        <td className="px-4 py-3">Period {slot.period_start}</td>
                        <td className="px-4 py-3 font-bold text-brand-primary">{slot.subject_name}</td>
                        <td className="px-4 py-3 text-textSecondary">{slot.faculty_email}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-black rounded-lg">Pending</span>
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

      {/* ── SECTION SETUP ── */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-xl text-xs font-bold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Subject allotments and rosters are managed by Admin. Use <b>Sync Section Roster</b> to auto-enroll all freshers from the student directory into each subject roster.</span>
          </div>
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine">
                  <tr>
                    <th className="px-4 py-2.5">Class</th>
                    <th className="px-4 py-2.5">Dept</th>
                    <th className="px-4 py-2.5">Section</th>
                    <th className="px-4 py-2.5">Subject</th>
                    <th className="px-4 py-2.5">Faculty</th>
                    <th className="px-4 py-2.5 text-center">Roster</th>
                    <th className="px-4 py-2.5 text-center">Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {allotments.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-textMuted">No allotments for Semester {sem}.</td></tr>
                  ) : (
                    allotments.map((a: any) => (
                      <tr key={a.id} className="hover:bg-surface-2">
                        <td className="px-4 py-3 font-bold">{a.semester_label}</td>
                        <td className="px-4 py-3">{a.department}</td>
                        <td className="px-4 py-3 font-bold">{a.section}</td>
                        <td className="px-4 py-3 font-bold text-brand-primary">{a.subject_name}</td>
                        <td className="px-4 py-3 text-textSecondary">{a.faculty_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-textMuted text-[10px] font-black rounded-lg">— students</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={async () => {
                              try {
                                await api.fresherSectionSync({ semester: a.semester_label, department: a.department, section: a.section });
                                qc.invalidateQueries({ queryKey: ['attendanceRoster'] });
                                alert('Section roster synced successfully!');
                              } catch (err: any) {
                                alert(err.message || 'Sync failed');
                              }
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-primary text-white text-[10px] font-bold rounded-lg hover:opacity-90">
                            <RefreshCw className="w-3 h-3" />Sync Roster
                          </button>
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

      {/* ── REPORTS ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4 text-brand-primary" />Section-wise Attendance Report</h3>
              <div className="space-y-2">
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option value="">All Sections</option>
                  {uniqueSections.map(s => <option key={s} value={s}>Section {s}</option>)}
                </select>
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option>Full Semester</option><option>Current Month</option>
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

            <div className="bg-surface border border-borderLine rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-500" />All 1st Year Defaulters (Below 75%)</h3>
              <div className="space-y-2">
                <select className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                  <option value="">All Departments</option>
                  {uniqueDepts.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-500 text-white font-bold text-xs rounded-xl hover:bg-rose-600">
                <Download className="w-3.5 h-3.5" />Download Defaulters List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
