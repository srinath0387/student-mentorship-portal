import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, TrendingUp, Calendar, BookOpen, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../../lib/api';

interface Props {
  rollNumber?: string;
}

export const StudentAttendanceView: React.FC<Props> = ({ rollNumber }) => {
  const [activeTab, setActiveTab] = useState<'subjects' | 'daywise'>('subjects');

  // 1. Fetch Subject Summary Attendance
  const { data: rawData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['studentAttendance', rollNumber],
    queryFn: () => (rollNumber ? api.getStudentAttendance(rollNumber) : Promise.resolve(null)).catch(() => null),
    enabled: Boolean(rollNumber),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // 2. Fetch Daywise Period Log
  const { data: daywiseData, isLoading: isDaywiseLoading } = useQuery({
    queryKey: ['studentDaywiseAttendance', rollNumber],
    queryFn: () => (rollNumber ? api.getStudentDaywiseAttendance(rollNumber) : Promise.resolve(null)).catch(() => null),
    enabled: Boolean(rollNumber),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const subjects: any[] = useMemo(() => {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    if (rawData?.subjects) return rawData.subjects;
    return [];
  }, [rawData]);

  const overall = useMemo(() => {
    if (rawData?.overall_percentage != null) return rawData.overall_percentage;
    if (subjects.length === 0) return null;
    const totalAttended = subjects.reduce((a: number, s: any) => a + (s.periods_attended ?? s.present_hours ?? 0), 0);
    const totalHeld = subjects.reduce((a: number, s: any) => a + (s.periods_held ?? s.total_hours ?? 0), 0);
    return totalHeld > 0 ? Math.round((totalAttended / totalHeld) * 1000) / 10 : 100;
  }, [rawData, subjects]);

  const totalPeriodsHeld = rawData?.total_periods_held ?? subjects.reduce((a: number, s: any) => a + (s.periods_held ?? s.total_hours ?? 0), 0);
  const totalPeriodsAttended = rawData?.total_periods_attended ?? subjects.reduce((a: number, s: any) => a + (s.periods_attended ?? s.present_hours ?? 0), 0);

  const getColor = (pct: number) => {
    if (pct >= 75) return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-800/40', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />, label: 'Eligible (≥75%)' };
    if (pct >= 65) return { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50/50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800/40', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />, label: 'Condonation Zone (65-74%)' };
    return { bar: 'bg-rose-500', text: 'text-rose-600', bg: 'bg-rose-50/50 dark:bg-rose-950/20', border: 'border-rose-200 dark:border-rose-800/40', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300', icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />, label: 'Critical Shortage (<65%)' };
  };

  if (isSummaryLoading) {
    return <div className="p-12 text-center text-textMuted text-xs animate-pulse">Loading your attendance records...</div>;
  }

  if (!rollNumber) {
    return <div className="p-12 text-center text-textMuted text-xs">Roll number not available. Please complete your profile.</div>;
  }

  return (
    <div className="space-y-5">
      {/* Student Overview Header Card */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-primary font-black text-base flex items-center justify-center border border-brand-primary/20 shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-textPrimary">Student Attendance Portal</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-surface-2 text-textSecondary border border-borderLine">
                  {rollNumber}
                </span>
              </div>
              <p className="text-xs text-textMuted">
                {rawData?.student?.name ? `${rawData.student.name} • ` : ''}
                {rawData?.student?.department ? `${rawData.student.department} • ` : ''}
                {rawData?.student?.section ? `Sec ${rawData.student.section}` : ''}
              </p>
            </div>
          </div>

          {/* Quick Overall Badge */}
          <div className="flex items-center gap-3 bg-surface-2/60 border border-borderLine rounded-2xl p-3 shrink-0">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-textMuted">Overall Attendance</div>
              <div className="text-xl font-black text-textPrimary">
                {overall != null ? `${overall}%` : '0%'}
              </div>
            </div>
            <div className="text-right border-l border-borderLine pl-3">
              <div className="text-[10px] font-bold text-textMuted">Periods</div>
              <div className="text-xs font-bold text-brand-primary">
                {totalPeriodsAttended} / {totalPeriodsHeld}
              </div>
            </div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        {overall !== null && (
          <div className="space-y-1.5 pt-2 border-t border-borderLine">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-textSecondary">Attendance Eligibility Status</span>
              <span className={overall >= 75 ? 'text-emerald-600' : overall >= 65 ? 'text-amber-600' : 'text-rose-600'}>
                {overall >= 75 ? '✓ Exam Hall Ticket Eligible (≥ 75%)' : overall >= 65 ? '⚠️ Condonation Fee Required (65% - 74%)' : '✗ Shortage / Detained (< 65%)'}
              </span>
            </div>
            <div className="w-full bg-surface-2 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${overall >= 75 ? 'bg-emerald-500' : overall >= 65 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.min(overall, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-textMuted">
              <span>0%</span>
              <span className="text-amber-600 font-bold">65% Condonation</span>
              <span className="text-emerald-600 font-bold">75% Mandatory</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </div>

      {/* Low Attendance Alert Banner */}
      {subjects.some((s: any) => (s.percentage ?? 0) < 75) && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-black text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Attendance Shortage Alert
          </div>
          <div className="space-y-1">
            {subjects.filter((s: any) => (s.percentage ?? 0) < 75).map((s: any) => {
              const held = s.periods_held ?? s.total_hours ?? 0;
              const attended = s.periods_attended ?? s.present_hours ?? 0;
              const required = Math.ceil(((0.75 * held) - attended) / (1 - 0.75));
              return (
                <p key={s.subject_name} className="text-xs text-rose-600 dark:text-rose-300">
                  • <b>{s.subject_name}</b>: {(s.percentage ?? 0).toFixed(1)}% ({attended}/{held} periods) — You need to attend <b>{required > 0 ? required : 0} consecutive classes</b> to reach 75%.
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Switcher: Subject Breakdown vs Daywise Session Logs */}
      <div className="flex items-center justify-between gap-2 border-b border-borderLine pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'subjects'
                ? 'bg-brand-primary text-white shadow-xs'
                : 'bg-surface border border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface-2'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Subject Breakdown ({subjects.length})
          </button>
          <button
            onClick={() => setActiveTab('daywise')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'daywise'
                ? 'bg-brand-primary text-white shadow-xs'
                : 'bg-surface border border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface-2'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Daywise Attendance Log
          </button>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-borderLine rounded-xl text-[11px] font-bold text-textSecondary hover:bg-surface-2 transition-colors"
        >
          <Download className="w-3 h-3" />
          Print / PDF
        </button>
      </div>

      {/* ── TAB 1: SUBJECT BREAKDOWN ── */}
      {activeTab === 'subjects' && (
        subjects.length === 0 ? (
          <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center space-y-3">
            <TrendingUp className="w-12 h-12 text-textMuted mx-auto opacity-40" />
            <p className="text-sm font-bold text-textPrimary">No Subject Attendance Records Yet</p>
            <p className="text-xs text-textMuted">Your attendance percentages will display here as faculty posts attendance sessions for your class.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((s: any) => {
              const pct = Math.round(s.percentage ?? 0);
              const colors = getColor(pct);
              const held = s.periods_held ?? s.total_hours ?? 0;
              const attended = s.periods_attended ?? s.present_hours ?? 0;

              return (
                <div key={s.subject_name || s.allotment_id} className={`rounded-2xl border p-4 space-y-3.5 transition-all ${colors.bg} ${colors.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-black text-textPrimary truncate" title={s.subject_name}>
                        {s.subject_name}
                      </h4>
                      <p className="text-[10px] text-textMuted mt-0.5">
                        {s.semester_label || 'Active Sem'} • {s.subject_type || 'Theory'}
                        {s.faculty_name ? ` • ${s.faculty_name}` : ''}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${colors.badge}`}>
                      {pct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                      <span className="text-textSecondary">{attended} / {held} Periods Attended</span>
                      <span className={colors.text}>{colors.label}</span>
                    </div>
                    <div className="w-full bg-white/70 dark:bg-black/30 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-700 ${colors.bar}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-bold pt-1 border-t border-borderLine/30">
                    {colors.icon}
                    <span className={colors.text}>
                      {pct >= 75 ? 'Good attendance progress' : pct >= 65 ? 'Attend next classes to reach 75%' : 'Critical: Shortage of attendance'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── TAB 2: DAYWISE ATTENDANCE LOG ── */}
      {activeTab === 'daywise' && (
        isDaywiseLoading ? (
          <div className="p-12 text-center text-textMuted text-xs animate-pulse">Loading daily attendance records...</div>
        ) : !daywiseData?.days || daywiseData.days.length === 0 ? (
          <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center space-y-3">
            <Clock className="w-12 h-12 text-textMuted mx-auto opacity-40" />
            <p className="text-sm font-bold text-textPrimary">No Daily Attendance Sessions Recorded Yet</p>
            <p className="text-xs text-textMuted">Session-by-session period logs will appear here once faculty records attendance.</p>
          </div>
        ) : (
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-borderLine flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-black text-textPrimary">Daily Period-wise Attendance Log</h3>
                <p className="text-[10px] text-textMuted">Showing all recorded 7-period sessions for your enrollment</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Present (P)
                </span>
                <span className="flex items-center gap-1 text-rose-600">
                  <XCircle className="w-3.5 h-3.5" /> Absent (A)
                </span>
                <span className="flex items-center gap-1 text-indigo-600">
                  <ShieldCheck className="w-3.5 h-3.5" /> On-Duty (OD)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary border-b border-borderLine">
                  <tr>
                    <th className="px-4 py-2.5 text-left w-32">Date</th>
                    {[1, 2, 3, 4, 5, 6, 7].map(p => (
                      <th key={p} className="px-2 py-2.5 text-center min-w-[70px]">
                        Period {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {daywiseData.days.map((d: any) => (
                    <tr key={d.date} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-textPrimary font-mono">
                        {d.date}
                      </td>
                      {d.periods.map((slot: any, idx: number) => (
                        <td key={idx} className="px-2 py-2 text-center">
                          {slot ? (
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                  slot.is_present
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                }`}
                                title={`${slot.subject_name || 'Class'} (P${idx + 1}): ${slot.is_present ? 'Present' : 'Absent'}`}
                              >
                                {slot.is_present ? '✓ P' : '✗ A'}
                              </span>
                              <span className="text-[9px] text-textMuted truncate max-w-[65px] mt-0.5" title={slot.subject_name}>
                                {slot.subject_name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-textMuted opacity-30 text-[10px]">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
};
