import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, CheckCircle2, Clock, AlertTriangle, Users,
  Filter, Download, RefreshCw, Eye, Sparkles, BookOpen, User,
  ChevronRight, ArrowRight
} from 'lucide-react';
import { api } from '../../lib/api';
import * as XLSX from 'xlsx';

interface PeriodInfo {
  period: number;
  has_class: boolean;
  subject_name: string;
  subject_type: string;
  faculty_name: string;
  faculty_email: string;
  room_no?: string;
  status: 'Posted' | 'Pending' | 'Free';
  session_id?: string | null;
}

interface SectionGridRow {
  semester_label: string;
  department: string;
  section: string;
  sectionKey: string;
  periods: PeriodInfo[];
}

interface PeriodAttendanceGridProps {
  defaultSemester?: string;
  defaultDepartment?: string;
  isCoordinator?: boolean;
}

export const PeriodAttendanceGrid: React.FC<PeriodAttendanceGridProps> = ({
  defaultSemester = '',
  defaultDepartment = '',
  isCoordinator = false,
}) => {
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [filterSem, setFilterSem] = useState<string>(defaultSemester);
  const [filterDept, setFilterDept] = useState<string>(defaultDepartment);
  const [filterPendingOnly, setFilterPendingOnly] = useState<boolean>(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  // ── Fetch Daily Period Grid Data ──
  const { data: gridData, isLoading, refetch } = useQuery({
    queryKey: ['dailyPeriodGrid', selectedDate, filterSem, filterDept],
    queryFn: () => api.getDailyPeriodGrid({
      date: selectedDate,
      semester: filterSem,
      department: filterDept,
    }),
  });

  // ── Fetch Unposted Compliance Report ──
  const { data: notPostedData } = useQuery({
    queryKey: ['notPostedAttendance', selectedDate, filterSem, filterDept],
    queryFn: () => api.getNotPostedAttendance({
      date: selectedDate,
      semester: filterSem,
      department: filterDept,
    }),
  });

  // ── Session Inspection Modal Query ──
  const { data: sessionDetails, isLoading: isLoadingSession } = useQuery({
    queryKey: ['attendanceSessionDetails', viewingSessionId],
    queryFn: () => (viewingSessionId ? api.getSessionDetails(viewingSessionId) : Promise.resolve(null)),
    enabled: Boolean(viewingSessionId),
  });

  const gridRows: SectionGridRow[] = Array.isArray(gridData?.grid) ? gridData.grid : [];

  // Filter rows based on "Only Pending"
  const filteredRows = gridRows.filter(row => {
    if (!filterPendingOnly) return true;
    return row.periods.some(p => p.has_class && p.status === 'Pending');
  });

  // Calculate totals
  let totalClassSlots = 0;
  let postedCount = 0;
  let pendingCount = 0;

  gridRows.forEach(row => {
    row.periods.forEach(p => {
      if (p.has_class) {
        totalClassSlots++;
        if (p.status === 'Posted') postedCount++;
        else if (p.status === 'Pending') pendingCount++;
      }
    });
  });

  const compliancePct = totalClassSlots > 0 ? Math.round((postedCount / totalClassSlots) * 100) : 100;

  // ── Download Excel Report ──
  const downloadExcel = () => {
    const rows: any[] = [];
    gridRows.forEach(row => {
      const rowObj: any = {
        'Semester': row.semester_label,
        'Department': row.department,
        'Section': row.section,
      };
      row.periods.forEach(p => {
        if (!p.has_class) {
          rowObj[`Period ${p.period}`] = 'Free';
        } else {
          rowObj[`Period ${p.period}`] = `${p.subject_name} (${p.faculty_name || 'No Faculty'}) - [${p.status}]`;
        }
      });
      rows.push(rowObj);
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${selectedDate}`);
    XLSX.writeFile(wb, `Daily_Attendance_Status_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* ── Top Controls & Stats ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Live Period Monitoring Grid
            </div>
            <h2 className="text-lg font-black text-textPrimary">
              Today's Period-by-Period Attendance Status (Periods 1–7)
            </h2>
            <p className="text-xs text-textSecondary mt-0.5">
              Real-time audit across all sections — see exactly which classes have posted attendance vs pending.
            </p>
          </div>

          {/* Date & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface-2 border border-borderLine rounded-xl px-3 py-1.5 text-xs">
              <Calendar className="w-4 h-4 text-textSecondary" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-textPrimary font-semibold focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl border border-borderLine bg-surface-2 hover:bg-surface-3 text-textSecondary hover:text-textPrimary transition-all cursor-pointer"
              title="Refresh Grid"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={downloadExcel}
              disabled={gridRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-borderLine text-xs font-bold text-textSecondary hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-borderLine">
          <div className="bg-surface-2/60 rounded-xl p-3 border border-borderLine">
            <span className="text-[10px] font-bold text-textMuted uppercase">Scheduled Classes</span>
            <div className="text-xl font-black text-textPrimary mt-0.5">{totalClassSlots}</div>
          </div>

          <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <span className="text-[10px] font-bold text-emerald-400 uppercase">Posted on Time</span>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{postedCount}</div>
          </div>

          <div className="bg-rose-500/10 rounded-xl p-3 border border-rose-500/20">
            <span className="text-[10px] font-bold text-rose-400 uppercase">Pending / Missed</span>
            <div className="text-xl font-black text-rose-400 mt-0.5">{pendingCount}</div>
          </div>

          <div className="bg-brand-primary/10 rounded-xl p-3 border border-brand-primary/20">
            <span className="text-[10px] font-bold text-brand-primary uppercase">Posting Rate</span>
            <div className="text-xl font-black text-brand-primary mt-0.5">{compliancePct}%</div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar: Quick Toggles ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterPendingOnly(false)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              !filterPendingOnly
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-surface border border-borderLine text-textSecondary hover:text-textPrimary'
            }`}
          >
            All Sections ({gridRows.length})
          </button>
          <button
            onClick={() => setFilterPendingOnly(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterPendingOnly
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-surface border border-borderLine text-rose-400 hover:bg-rose-500/10'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Sections with Pending Classes ({gridRows.filter(r => r.periods.some(p => p.has_class && p.status === 'Pending')).length})</span>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-semibold text-textSecondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Posted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span> Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-surface-3"></span> Free Slot
          </span>
        </div>
      </div>

      {/* ── Main Monitoring Matrix Grid ── */}
      {isLoading ? (
        <div className="py-16 text-center text-textMuted text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-primary" />
          <span>Loading period timetable and posting status...</span>
        </div>
      ) : !gridData?.isWorkingDay ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-2">
          <Calendar className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="text-sm font-bold text-textPrimary">{gridData?.message || 'Non-working day / Holiday'}</h3>
          <p className="text-xs text-textMuted">No scheduled timetable periods for {selectedDate} ({gridData?.dayOfWeek}).</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center text-textMuted text-xs space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="font-bold text-textPrimary">
            {filterPendingOnly ? 'All scheduled classes have posted attendance!' : 'No timetable entries found for this selection.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold">
                <tr>
                  <th className="px-4 py-3 min-w-[200px]">Class / Section</th>
                  {[1, 2, 3, 4, 5, 6, 7].map(p => (
                    <th key={p} className="px-3 py-3 min-w-[130px] text-center border-l border-borderLine/50">
                      <div>Period {p}</div>
                      <div className="text-[10px] font-normal text-textMuted">
                        {p === 1 && '09:00 - 09:50'}
                        {p === 2 && '09:50 - 10:40'}
                        {p === 3 && '11:00 - 11:50'}
                        {p === 4 && '11:50 / 01:00'}
                        {p === 5 && '01:50 - 02:40'}
                        {p === 6 && '02:40 / 03:00'}
                        {p === 7 && '03:30 / 03:50'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {filteredRows.map((row) => (
                  <tr key={row.sectionKey} className="hover:bg-surface-2/40 transition-colors">
                    <td className="px-4 py-3 bg-surface-2/20">
                      <div className="font-bold text-textPrimary text-xs">{row.semester_label} — {row.department}</div>
                      <div className="text-[11px] text-brand-primary font-semibold">Section {row.section}</div>
                    </td>

                    {row.periods.map((p) => {
                      if (!p.has_class) {
                        return (
                          <td key={p.period} className="px-2 py-3 text-center border-l border-borderLine/40 bg-surface/30">
                            <span className="text-[10px] text-textMuted font-mono">— Free —</span>
                          </td>
                        );
                      }

                      const isPosted = p.status === 'Posted';

                      return (
                        <td key={p.period} className={`px-2.5 py-3 border-l border-borderLine/40 ${
                          isPosted ? 'bg-emerald-500/5' : 'bg-rose-500/5'
                        }`}>
                          <div className="space-y-1.5">
                            {/* Subject */}
                            <div className="font-bold text-[11px] text-textPrimary line-clamp-1" title={p.subject_name}>
                              {p.subject_name}
                            </div>

                            {/* Faculty */}
                            <div className="text-[10px] text-textSecondary flex items-center gap-1 line-clamp-1" title={p.faculty_name}>
                              <User className="w-2.5 h-2.5 shrink-0 text-textMuted" />
                              <span className="truncate">{p.faculty_name || p.faculty_email || 'Unassigned'}</span>
                            </div>

                            {/* Status Badge */}
                            <div className="flex items-center justify-between pt-1">
                              {isPosted ? (
                                <button
                                  onClick={() => p.session_id && setViewingSessionId(p.session_id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10px] hover:bg-emerald-500/30 transition-colors cursor-pointer"
                                  title="Click to view recorded attendance"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Posted</span>
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold text-[10px] animate-pulse">
                                  <Clock className="w-3 h-3 text-rose-400" />
                                  <span>Pending</span>
                                </span>
                              )}

                              {p.room_no && (
                                <span className="text-[9px] text-textMuted font-mono">Rm {p.room_no}</span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Inspect Session Details ── */}
      {viewingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-borderLine">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Recorded Attendance Session
                </h3>
                <p className="text-xs text-textMuted">
                  {sessionDetails?.session?.subject_name} ({sessionDetails?.session?.semester_label} - Sec {sessionDetails?.session?.section})
                </p>
              </div>
              <button
                onClick={() => setViewingSessionId(null)}
                className="text-textSecondary hover:text-textPrimary text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {isLoadingSession ? (
              <div className="py-12 text-center text-textMuted text-xs flex justify-center items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
                <span>Loading session details...</span>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                {/* Session Meta */}
                <div className="grid grid-cols-3 gap-2 bg-surface-2 p-3 rounded-xl border border-borderLine text-xs">
                  <div>
                    <span className="text-[10px] text-textMuted uppercase font-bold">Conducted By</span>
                    <div className="font-semibold text-textPrimary truncate">{sessionDetails?.session?.faculty_name || sessionDetails?.session?.recorded_by}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-textMuted uppercase font-bold">Date & Period</span>
                    <div className="font-semibold text-textPrimary">
                      {sessionDetails?.session?.session_date?.split('T')[0]} (P{sessionDetails?.session?.period_start})
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-textMuted uppercase font-bold">Present / Total</span>
                    <div className="font-bold text-emerald-400">
                      {sessionDetails?.records?.filter((r: any) => r.is_present).length} / {sessionDetails?.records?.length}
                    </div>
                  </div>
                </div>

                {/* Student Attendance List */}
                <div className="border border-borderLine rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold">
                      <tr>
                        <th className="px-3 py-2">Roll Number</th>
                        <th className="px-3 py-2">Student Name</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {sessionDetails?.records?.map((r: any) => (
                        <tr key={r.roll_number} className="hover:bg-surface-2/30">
                          <td className="px-3 py-2 font-mono font-bold text-textPrimary">{r.roll_number}</td>
                          <td className="px-3 py-2 text-textSecondary">{r.student_name || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            {r.is_present ? (
                              <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded">Present</span>
                            ) : (
                              <span className="text-rose-400 font-bold text-[10px] bg-rose-500/10 px-2 py-0.5 rounded">Absent</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-borderLine flex justify-end">
              <button
                onClick={() => setViewingSessionId(null)}
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-xs font-bold text-textPrimary cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
