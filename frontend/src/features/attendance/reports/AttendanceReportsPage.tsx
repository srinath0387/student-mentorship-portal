import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import * as api from '../../../lib/api';
import {
  FileBarChart, Bell, CheckCircle, XCircle, Download, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

type TabType = 'not-posted' | 'monthly-report' | 'pending-requests';

const statusColor = (s: string) =>
  s === 'Safe' ? 'text-green-600 dark:text-green-400' :
  s === 'Warning' ? 'text-amber-600 dark:text-amber-400' :
  s === 'Defaulter' ? 'text-red-600 dark:text-red-400' : 'text-muted';

const statusBadge = (s: string) => {
  const base = 'px-2 py-0.5 rounded-full text-xs font-bold';
  if (s === 'Safe') return <span className={`${base} bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400`}>✅ Safe</span>;
  if (s === 'Warning') return <span className={`${base} bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400`}>🟡 Warning</span>;
  if (s === 'Defaulter') return <span className={`${base} bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400`}>🔴 Defaulter</span>;
  return <span className={`${base} bg-surface text-muted`}>{s}</span>;
};

export const AttendanceReportsPage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7);

  const [tab, setTab] = useState<TabType>('not-posted');

  // Not-Posted state
  const [npFrom, setNpFrom] = useState(today);
  const [npTo, setNpTo] = useState(today);
  const [npDept, setNpDept] = useState('');
  const [npSem, setNpSem] = useState('');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [reminderStatus, setReminderStatus] = useState<Record<string, string>>({});
  const [noClassModal, setNoClassModal] = useState<{ slot: any; date: string } | null>(null);
  const [noClassReason, setNoClassReason] = useState('');

  // Monthly report state
  const [mrMonth, setMrMonth] = useState(thisMonth);
  const [mrDept, setMrDept] = useState('');
  const [mrSem, setMrSem] = useState('');
  const [mrFilter, setMrFilter] = useState('');

  // Queries
  const npQuery = useQuery({
    queryKey: ['notPosted', npFrom, npTo, npDept, npSem],
    queryFn: () => (api as any).getNotPostedRange({ from: npFrom, to: npTo, department: npDept || undefined, semester: npSem || undefined }),
    enabled: !!npFrom && !!npTo,
  });

  const mrQuery = useQuery({
    queryKey: ['monthlyReport', mrMonth, mrDept, mrSem],
    queryFn: () => (api as any).getMonthlyAttendanceReport({ month: mrMonth, department: mrDept || undefined, semester: mrSem || undefined }),
    enabled: tab === 'monthly-report',
  });

  const prQuery = useQuery({
    queryKey: ['noClassRequests', 'Pending'],
    queryFn: () => (api as any).getNoClassRequests('Pending'),
    enabled: tab === 'pending-requests',
  });

  // Mutations
  const approveMut = useMutation({
    mutationFn: (id: number) => (api as any).approveNoClassRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['noClassRequests'] }); qc.invalidateQueries({ queryKey: ['notPosted'] }); },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => (api as any).rejectNoClassRequest(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['noClassRequests'] }),
  });

  const noClassMut = useMutation({
    mutationFn: (data: any) => (api as any).submitNoClassRequest(data),
    onSuccess: () => { setNoClassModal(null); setNoClassReason(''); },
  });

  // Send reminder
  const sendReminder = async (slot: any, date: string) => {
    const key = `${date}-${slot.faculty_email}-${slot.period_start}`;
    setReminderStatus(s => ({ ...s, [key]: 'sending' }));
    try {
      await (api as any).sendAttendanceReminder({
        faculty_email: slot.faculty_email,
        date,
        period_start: slot.period_start,
        subject_name: slot.subject_name,
        section: slot.section,
        semester_label: slot.semester_label,
      });
      setReminderStatus(s => ({ ...s, [key]: 'sent' }));
    } catch {
      setReminderStatus(s => ({ ...s, [key]: 'error' }));
    }
  };

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  // Exports
  const exportNotPostedExcel = () => {
    const rows: any[] = [];
    for (const day of (npQuery.data?.byDate || [])) {
      if (!day.isWorkingDay) continue;
      for (const slot of (day.pendingSlots || [])) {
        rows.push({
          Date: day.date, Day: day.dayOfWeek,
          Faculty: slot.faculty_name || slot.faculty_email,
          Department: slot.department, Section: slot.section,
          Semester: slot.semester_label, Subject: slot.subject_name,
          Type: slot.subject_type, Period: slot.period_start,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Not Posted');
    XLSX.writeFile(wb, `not_posted_${npFrom}_to_${npTo}.xlsx`);
  };

  const exportMonthlyExcel = () => {
    const data = mrQuery.data?.students || [];
    const ws = XLSX.utils.json_to_sheet(data.map((s: any) => ({
      'Roll No': s.roll_number, Name: s.student_name,
      Department: s.department, Section: s.section, Year: s.semester_label,
      'Scheduled Periods': s.scheduled_periods, 'Attended Periods': s.attended_periods,
      'Attendance %': s.attendance_pct, Status: s.status,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Attendance');
    XLSX.writeFile(wb, `attendance_${mrMonth}_${mrDept || 'all'}.xlsx`);
  };

  const exportMonthlyPdf = async () => {
    const data = mrStudents;
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text(`RGMCET — Monthly Attendance Report — ${mrDept || 'All Depts'} — ${mrMonth}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Working Days: ${mrQuery.data?.working_days || 0}  |  Students: ${data.length}`, 14, 21);
    autoTable(doc, {
      startY: 26,
      head: [['Roll No', 'Name', 'Dept', 'Section', 'Year', 'Scheduled', 'Attended', 'Att%', 'Status']],
      body: data.map((s: any) => [
        s.roll_number, s.student_name, s.department, s.section,
        s.semester_label, s.scheduled_periods, s.attended_periods,
        `${s.attendance_pct}%`, s.status,
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    doc.save(`attendance_${mrMonth}_${mrDept || 'all'}.pdf`);
  };

  const npData = npQuery.data;
  const summary = npData?.summary;
  const allMrStudents: any[] = mrQuery.data?.students || [];
  const mrStudents = mrFilter ? allMrStudents.filter((s: any) => s.status === mrFilter) : allMrStudents;
  const pendingRequests: any[] = prQuery.data?.requests || [];

  const tabs: { key: TabType; label: string }[] = [
    { key: 'not-posted', label: 'Not Posted Tracker' },
    { key: 'monthly-report', label: 'Monthly Report' },
    { key: 'pending-requests', label: `Pending Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
  ];

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileBarChart className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Attendance Reports</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b-2 border-borderLine overflow-x-auto gap-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-[2px] ${
              tab === t.key
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-textSecondary hover:text-foreground hover:border-borderLine bg-transparent'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Not Posted Tracker ── */}
      {tab === 'not-posted' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted block mb-1">From</label>
              <input type="date" value={npFrom} onChange={e => setNpFrom(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">To</label>
              <input type="date" value={npTo} min={npFrom} onChange={e => setNpTo(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            </div>
            {isAdmin && (
              <input value={npDept} onChange={e => setNpDept(e.target.value)} placeholder="Department (optional)"
                className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            )}
            <input value={npSem} onChange={e => setNpSem(e.target.value)} placeholder="Semester e.g. 3-1"
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold w-36" />
            <button onClick={exportNotPostedExcel}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-borderLine bg-surface text-xs font-semibold hover:bg-muted/10">
              <Download className="h-3.5 w-3.5" /> Export Excel
            </button>
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Scheduled', value: summary.total_scheduled, color: 'text-foreground' },
                { label: 'Posted', value: summary.total_posted, color: 'text-green-600 dark:text-green-400' },
                { label: 'Not Posted', value: summary.total_pending, color: 'text-red-600 dark:text-red-400' },
              ].map(c => (
                <div key={c.label} className="p-3 rounded-2xl border border-borderLine bg-surface text-center">
                  <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                  <p className="text-xs text-muted mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
          )}

          {npQuery.isLoading && <p className="text-center text-muted text-sm py-8">Loading…</p>}

          {/* Date groups */}
          <div className="space-y-2">
            {(npData?.byDate || []).map((day: any) => {
              if (!day.isWorkingDay) return (
                <div key={day.date} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-borderLine text-xs text-muted">
                  <span className="font-semibold">{day.date}</span>
                  <span>({day.dayOfWeek})</span>
                  <span>— {day.holidayName ? `🎌 Holiday: ${day.holidayName}` : 'Non-working day'}</span>
                </div>
              );
              if (day.pendingCount === 0) return (
                <div key={day.date} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-xs">
                  <span className="font-semibold text-green-700 dark:text-green-400">✓ {day.date} ({day.dayOfWeek})</span>
                  <span className="text-green-600 dark:text-green-500">All {day.postedCount} slots posted</span>
                </div>
              );
              const isExpanded = expandedDates.has(day.date);
              return (
                <div key={day.date} className="rounded-2xl border border-red-200 dark:border-red-800 overflow-hidden">
                  <button onClick={() => toggleDate(day.date)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30">
                    <div className="flex items-center gap-2 text-xs">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-red-600" /> : <ChevronRight className="h-3.5 w-3.5 text-red-600" />}
                      <span className="font-bold text-red-700 dark:text-red-400">{day.date} ({day.dayOfWeek})</span>
                      <span className="text-red-600 dark:text-red-400">— {day.pendingCount} not posted</span>
                      <span className="text-muted">({day.postedCount} posted of {day.totalScheduled})</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-surface border-b border-borderLine">
                            <th className="text-left px-3 py-2 font-semibold text-muted">Faculty</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted">Dept</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted">Section</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted">Sem</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted">Subject</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted">Period</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.pendingSlots.map((slot: any, i: number) => {
                            const rKey = `${day.date}-${slot.faculty_email}-${slot.period_start}`;
                            const rSt = reminderStatus[rKey];
                            return (
                              <tr key={i} className="border-b border-borderLine hover:bg-muted/5">
                                <td className="px-3 py-2 font-medium">{slot.faculty_name || slot.faculty_email}</td>
                                <td className="px-3 py-2 text-muted">{slot.department}</td>
                                <td className="px-3 py-2">{slot.section}</td>
                                <td className="px-3 py-2 text-muted">{slot.semester_label}</td>
                                <td className="px-3 py-2">{slot.subject_name}</td>
                                <td className="px-3 py-2 text-center">{slot.period_start}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1.5 flex-wrap">
                                    <button onClick={() => sendReminder(slot, day.date)}
                                      disabled={rSt === 'sending' || rSt === 'sent'}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 disabled:opacity-50 text-xs font-semibold">
                                      <Bell className="h-3 w-3" />
                                      {rSt === 'sending' ? 'Sending…' : rSt === 'sent' ? '✓ Sent' : 'Remind'}
                                    </button>
                                    <button onClick={() => { setNoClassModal({ slot, date: day.date }); setNoClassReason(''); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 text-xs font-semibold">
                                      <AlertTriangle className="h-3 w-3" /> No Class
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {!npQuery.isLoading && !npData?.byDate?.length && (
              <p className="text-center text-muted text-sm py-8">No data for the selected range.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Monthly Report ── */}
      {tab === 'monthly-report' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted block mb-1">Month</label>
              <input type="month" value={mrMonth} onChange={e => setMrMonth(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            </div>
            {isAdmin && (
              <input value={mrDept} onChange={e => setMrDept(e.target.value)} placeholder="Department"
                className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" />
            )}
            <input value={mrSem} onChange={e => setMrSem(e.target.value)} placeholder="Semester e.g. 3-1"
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold w-36" />
            <select value={mrFilter} onChange={e => setMrFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
              <option value="">All Students</option>
              <option value="Defaulter">🔴 Defaulter (&lt;65%)</option>
              <option value="Warning">🟡 Warning (65–74%)</option>
              <option value="Safe">✅ Safe (≥75%)</option>
              <option value="No Data">⬜ No Data</option>
            </select>
            <button onClick={exportMonthlyExcel}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-borderLine bg-surface text-xs font-semibold hover:bg-muted/10">
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button onClick={exportMonthlyPdf}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-100">
              <Download className="h-3.5 w-3.5" /> PDF
            </button>
          </div>

          {mrQuery.data && (
            <div className="flex gap-4 text-xs text-muted flex-wrap">
              <span>Working days: <strong className="text-foreground">{mrQuery.data.working_days}</strong></span>
              <span>Total students: <strong className="text-foreground">{mrQuery.data.total_students}</strong></span>
              <span>Showing: <strong className="text-foreground">{mrStudents.length}</strong></span>
              <span>Defaulters: <strong className="text-red-600">{allMrStudents.filter((s: any) => s.status === 'Defaulter').length}</strong></span>
            </div>
          )}

          {mrQuery.isLoading && <p className="text-center text-muted text-sm py-8">Loading report…</p>}

          {mrStudents.length > 0 && (
            <div className="rounded-2xl border border-borderLine overflow-hidden bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface border-b border-borderLine">
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Roll No</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Name</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Dept</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Section</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Year</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted">Scheduled</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted">Attended</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted">Att%</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mrStudents.map((s: any, i: number) => (
                      <tr key={s.roll_number} className={`border-b border-borderLine hover:bg-muted/5 ${i % 2 === 0 ? '' : 'bg-surface/50'}`}>
                        <td className="px-3 py-2.5 font-mono">{s.roll_number}</td>
                        <td className="px-3 py-2.5 font-medium">{s.student_name}</td>
                        <td className="px-3 py-2.5 text-muted">{s.department}</td>
                        <td className="px-3 py-2.5">{s.section}</td>
                        <td className="px-3 py-2.5 text-muted">{s.semester_label}</td>
                        <td className="px-3 py-2.5 text-right">{s.scheduled_periods}</td>
                        <td className="px-3 py-2.5 text-right">{s.attended_periods}</td>
                        <td className={`px-3 py-2.5 text-right font-bold ${statusColor(s.status)}`}>{s.attendance_pct}%</td>
                        <td className="px-3 py-2.5">{statusBadge(s.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!mrQuery.isLoading && mrStudents.length === 0 && mrQuery.data && (
            <p className="text-center text-muted text-sm py-8">No students found for the selected filters.</p>
          )}
        </div>
      )}

      {/* ── Tab 3: Pending No-Class Requests ── */}
      {tab === 'pending-requests' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Faculty-submitted requests to mark a slot as "No Class Held" for a specific date. Approve to remove it from the not-posted count.</p>
          {prQuery.isLoading && <p className="text-center text-muted text-sm py-8">Loading…</p>}
          {!prQuery.isLoading && pendingRequests.length === 0 && (
            <div className="text-center py-12 text-muted text-sm">
              <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-400" />
              No pending requests.
            </div>
          )}
          {pendingRequests.length > 0 && (
            <div className="rounded-2xl border border-borderLine overflow-hidden bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface border-b border-borderLine">
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Faculty</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Date</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Dept</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Section</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Subject</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted">Period</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted">Reason</th>
                      {isAdmin && <th className="text-left px-3 py-2.5 font-semibold text-muted">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((r: any) => (
                      <tr key={r.id} className="border-b border-borderLine hover:bg-muted/5">
                        <td className="px-3 py-2.5 font-medium">{r.faculty_name || r.faculty_email}</td>
                        <td className="px-3 py-2.5 font-mono">{r.date}</td>
                        <td className="px-3 py-2.5 text-muted">{r.department}</td>
                        <td className="px-3 py-2.5">{r.section}</td>
                        <td className="px-3 py-2.5">{r.subject_name}</td>
                        <td className="px-3 py-2.5 text-center">{r.period_start}</td>
                        <td className="px-3 py-2.5 text-muted max-w-[200px] truncate">{r.reason || '—'}</td>
                        {isAdmin && (
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1.5">
                              <button onClick={() => approveMut.mutate(r.id)} disabled={approveMut.isPending}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 text-xs font-semibold disabled:opacity-50">
                                <CheckCircle className="h-3 w-3" /> Approve
                              </button>
                              <button onClick={() => rejectMut.mutate({ id: r.id, reason: 'Rejected by admin' })} disabled={rejectMut.isPending}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 text-xs font-semibold disabled:opacity-50">
                                <XCircle className="h-3 w-3" /> Reject
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No-Class Request Modal */}
      {noClassModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl border border-borderLine p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-foreground">Request No Class Held</h3>
                <p className="text-xs text-muted mt-0.5">Admin will review and approve this request.</p>
              </div>
            </div>
            <div className="space-y-1 text-xs bg-surface rounded-xl p-3 border border-borderLine">
              <p><span className="text-muted">Date:</span> <strong>{noClassModal.date}</strong></p>
              <p><span className="text-muted">Subject:</span> <strong>{noClassModal.slot.subject_name}</strong></p>
              <p><span className="text-muted">Section:</span> <strong>{noClassModal.slot.section}</strong> — Period <strong>{noClassModal.slot.period_start}</strong></p>
              <p><span className="text-muted">Faculty:</span> <strong>{noClassModal.slot.faculty_name || noClassModal.slot.faculty_email}</strong></p>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea value={noClassReason} onChange={e => setNoClassReason(e.target.value)}
                placeholder="e.g. Faculty on duty, holiday event, lab maintenance, exam…"
                rows={3}
                className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNoClassModal(null)}
                className="px-4 py-2 rounded-xl border border-borderLine text-xs font-semibold text-muted hover:bg-surface">
                Cancel
              </button>
              <button
                onClick={() => noClassMut.mutate({
                  date: noClassModal.date,
                  semester_label: noClassModal.slot.semester_label,
                  department: noClassModal.slot.department,
                  section: noClassModal.slot.section,
                  subject_name: noClassModal.slot.subject_name,
                  period_start: noClassModal.slot.period_start,
                  reason: noClassReason,
                })}
                disabled={noClassMut.isPending || !noClassReason.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50">
                {noClassMut.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceReportsPage;
