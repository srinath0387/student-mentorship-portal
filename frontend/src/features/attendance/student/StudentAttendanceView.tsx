import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, TrendingUp } from 'lucide-react';
import { api } from '../../../lib/api';

interface Props {
  rollNumber?: string; // if not provided, uses logged-in student
}

export const StudentAttendanceView: React.FC<Props> = ({ rollNumber }) => {
  const { data: rawData, isLoading } = useQuery({
    queryKey: ['studentAttendance', rollNumber],
    queryFn: () => (rollNumber ? api.getStudentAttendance(rollNumber) : Promise.resolve(null)).catch(() => null),
    enabled: Boolean(rollNumber),
  });

  const subjects: any[] = useMemo(() => {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    if (rawData?.subjects) return rawData.subjects;
    return [];
  }, [rawData]);

  const overall = useMemo(() => {
    if (subjects.length === 0) return null;
    const totalPresent = subjects.reduce((a: number, s: any) => a + (s.present_hours || 0), 0);
    const totalHours = subjects.reduce((a: number, s: any) => a + (s.total_hours || 0), 0);
    return totalHours > 0 ? Math.round((totalPresent / totalHours) * 100) : null;
  }, [subjects]);

  const getColor = (pct: number) => {
    if (pct >= 75) return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />, label: 'Good' };
    if (pct >= 65) return { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />, label: 'Low' };
    return { bar: 'bg-rose-500', text: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-800', badge: 'bg-rose-100 text-rose-700', icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />, label: 'Critical' };
  };

  if (isLoading) {
    return <div className="p-12 text-center text-textMuted text-xs">Loading attendance...</div>;
  }

  if (!rollNumber) {
    return <div className="p-12 text-center text-textMuted text-xs">Roll number not available. Please complete your profile.</div>;
  }

  if (subjects.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center space-y-3">
          <TrendingUp className="w-12 h-12 text-textMuted mx-auto opacity-40" />
          <p className="text-sm font-bold text-textPrimary">No Attendance Records Yet</p>
          <p className="text-xs text-textMuted">Your attendance will appear here once faculty starts marking attendance for your subjects.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Low Attendance Alert Banner */}
      {subjects.some((s: any) => (s.percentage || 0) < 75) && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            ⚠️ Low Attendance Warning — Action Required
          </div>
          <div className="space-y-1">
            {subjects.filter((s: any) => (s.percentage || 0) < 75).map((s: any) => {
              const required = Math.ceil(((0.75 * (s.total_hours || 0)) - (s.present_hours || 0)) / (1 - 0.75));
              return (
                <p key={s.subject_name} className="text-xs text-rose-600 dark:text-rose-300">
                  • <b>{s.subject_name}</b>: {(s.percentage || 0).toFixed(1)}% — You need <b>{required > 0 ? required : 0} more classes</b> to reach 75%
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Overall Summary Bar */}
      {overall !== null && (
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textPrimary">Overall Attendance (All Subjects)</span>
            <span className={`text-lg font-black ${overall >= 75 ? 'text-emerald-600' : overall >= 65 ? 'text-amber-600' : 'text-rose-600'}`}>{overall}%</span>
          </div>
          <div className="w-full bg-surface-2 rounded-full h-3 overflow-hidden">
            <div className={`h-3 rounded-full transition-all duration-700 ${overall >= 75 ? 'bg-emerald-500' : overall >= 65 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(overall, 100)}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-textMuted">
            <span>0%</span>
            <span className="text-amber-600 font-bold">75% threshold</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Subject Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subjects.map((s: any) => {
          const pct = Math.round(s.percentage || 0);
          const colors = getColor(pct);
          return (
            <div key={s.subject_name || s.allotment_id} className={`rounded-2xl border p-4 space-y-3 ${colors.bg} ${colors.border}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-textPrimary truncate">{s.subject_name}</p>
                  <p className="text-[10px] text-textMuted mt-0.5">{s.semester_label} • Sec {s.section}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ml-2 shrink-0 ${colors.badge}`}>{colors.label}</span>
              </div>

              {/* % Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-textSecondary">{s.present_hours || 0}/{s.total_hours || 0} hrs</span>
                  <span className={`text-base font-black ${colors.text}`}>{pct}%</span>
                </div>
                <div className="w-full bg-white/60 dark:bg-black/20 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-2.5 rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                {/* 75% marker */}
                <div className="relative h-1 mt-0.5">
                  <div className="absolute top-0 w-px h-2 bg-amber-500/60" style={{ left: '75%' }} />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                {colors.icon}
                <span className={colors.text}>{pct >= 75 ? 'Attendance on track' : pct >= 65 ? 'Needs improvement' : 'Critical — attend more classes'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Download Button */}
      <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 border border-borderLine rounded-xl text-xs font-bold text-textSecondary hover:bg-surface-2 transition-colors">
        <Download className="w-3.5 h-3.5" />
        Download Attendance Report (PDF)
      </button>
    </div>
  );
};
