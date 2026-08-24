import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Users,
  Search,
  Filter,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  Trash2,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Eye,
  Info,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  UserRole,
  SemesterLabel,
  SubjectAllotment,
  AttendanceSession,
  StudentAttendanceSummary,
  StudentDaywiseAttendanceResponse,
  SubjectAttendanceSummaryResponse,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

interface AttendanceTrackingTabProps {
  role: UserRole;
  targetRollNumber?: string;
}

const SEMESTERS: SemesterLabel[] = ['2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

export const AttendanceTrackingTab: React.FC<AttendanceTrackingTabProps> = ({ role, targetRollNumber }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Resolved roll number for Student or Parent view
  const studentRollNo = targetRollNumber || user?.rollNumber || '';

  // Faculty / HOD / Admin filter state
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel>('3-1');
  const [selectedDepartment, setSelectedDepartment] = useState<string>(
    role === 'hod' ? (user?.department || 'CSE (Data Science)') : 'All'
  );
  const [selectedAllotmentId, setSelectedAllotmentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Date Range filter for Day-wise Dot Grid
  const [dateRangeOption, setDateRangeOption] = useState<'7' | '14' | '30'>('14');
  const [customFromDate, setCustomFromDate] = useState<string>(
    new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [customToDate, setCustomToDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Inspect Student Modal (for Faculty/HOD/Admin clicking on a student in the subject roster)
  const [inspectingStudentRoll, setInspectingStudentRoll] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. DATA FETCHING FOR STUDENT & PARENT VIEW
  // ──────────────────────────────────────────────────────────────────────────
  const isStudentOrParent = role === 'student' || role === 'parent';

  // Overall & Per-Subject Attendance Summary
  const { data: studentSummary, isLoading: isLoadingStudentSummary } = useQuery<StudentAttendanceSummary>({
    queryKey: ['studentAttendanceSummary', studentRollNo],
    queryFn: () => (studentRollNo ? api.getStudentAttendance(studentRollNo) : Promise.resolve(null as any)),
    enabled: isStudentOrParent && Boolean(studentRollNo),
  });

  // Day-wise Dot Grid Attendance for Student
  const { data: studentDaywise, isLoading: isLoadingStudentDaywise } = useQuery<StudentDaywiseAttendanceResponse>({
    queryKey: ['studentDaywiseAttendance', studentRollNo, customFromDate, customToDate],
    queryFn: () =>
      studentRollNo
        ? api.getStudentDaywiseAttendance(studentRollNo, customFromDate, customToDate)
        : Promise.resolve(null as any),
    enabled: isStudentOrParent && Boolean(studentRollNo),
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. DATA FETCHING FOR FACULTY / HOD / ADMIN VIEW
  // ──────────────────────────────────────────────────────────────────────────
  // Fetch Allotments
  const { data: allotments = [], isLoading: isLoadingAllotments } = useQuery<SubjectAllotment[]>({
    queryKey: ['attendanceTrackingAllotments', selectedSemester, selectedDepartment],
    queryFn: () =>
      role === 'faculty'
        ? api.getMyAttendanceSubjects(selectedSemester)
        : api.getAllotments(selectedSemester, selectedDepartment === 'All' ? '' : selectedDepartment),
    enabled: !isStudentOrParent,
  });

  // Automatically select first allotment if none selected
  React.useEffect(() => {
    if (allotments && allotments.length > 0 && !selectedAllotmentId) {
      setSelectedAllotmentId(allotments[0].id);
    }
  }, [allotments, selectedAllotmentId]);

  // Fetch Subject Attendance Summary (Per-Student Table)
  const { data: subjectSummary, isLoading: isLoadingSubjectSummary } = useQuery<SubjectAttendanceSummaryResponse>({
    queryKey: ['subjectAttendanceSummary', selectedAllotmentId],
    queryFn: () => (selectedAllotmentId ? api.getSubjectAttendanceSummary(selectedAllotmentId) : Promise.resolve(null as any)),
    enabled: !isStudentOrParent && Boolean(selectedAllotmentId),
  });

  // Fetch Sessions History for Selected Allotment
  const { data: sessionsHistory = [], isLoading: isLoadingSessions } = useQuery<AttendanceSession[]>({
    queryKey: ['attendanceSessionsHistory', selectedAllotmentId],
    queryFn: () => (selectedAllotmentId ? api.getAttendanceSessions(selectedAllotmentId) : Promise.resolve([])),
    enabled: !isStudentOrParent && Boolean(selectedAllotmentId),
  });

  // Day-wise for Inspected Student Modal
  const { data: inspectedStudentDaywise, isLoading: isLoadingInspectedDaywise } = useQuery<StudentDaywiseAttendanceResponse>({
    queryKey: ['inspectedStudentDaywise', inspectingStudentRoll, customFromDate, customToDate],
    queryFn: () =>
      inspectingStudentRoll
        ? api.getStudentDaywiseAttendance(inspectingStudentRoll, customFromDate, customToDate)
        : Promise.resolve(null as any),
    enabled: Boolean(inspectingStudentRoll),
  });

  // Delete Session Mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.deleteAttendanceSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceSessionsHistory'] });
      queryClient.invalidateQueries({ queryKey: ['subjectAttendanceSummary'] });
      queryClient.invalidateQueries({ queryKey: ['studentAttendanceSummary'] });
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: STUDENT & PARENT DASHBOARD VIEW
  // ──────────────────────────────────────────────────────────────────────────
  if (isStudentOrParent) {
    const overallPct = studentSummary?.overall_percentage ?? 100;
    const isGood = overallPct >= 75;
    const isWarning = overallPct >= 65 && overallPct < 75;

    return (
      <div className="space-y-6">
        {/* Header & Overall Summary Card */}
        <div className="p-6 md:p-8 rounded-2xl bg-surface border border-borderLine shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-xs font-semibold">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>{role === 'parent' ? "Ward's Attendance Tracker" : 'My Attendance & Period Analytics'}</span>
            </div>
            <h2 className="text-2xl font-black text-textPrimary">
              {studentSummary?.student?.name ? `${studentSummary.student.name} (${studentSummary.student.roll_number})` : studentRollNo}
            </h2>
            <p className="text-xs text-textSecondary">
              Real-time proportional attendance tracking weighted by session length.
            </p>
          </div>

          {/* Overall Percentage Badge */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-2 border border-borderLine shrink-0">
            <div
              className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-mono font-black shadow-lg ${
                isGood
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : isWarning
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-red-500/20 text-red-400 border border-red-500/40'
              }`}
            >
              <span className="text-xl leading-none">{overallPct}%</span>
              <span className="text-[9px] uppercase tracking-wider font-bold mt-1">Total</span>
            </div>
            <div className="text-xs space-y-1">
              <p className="font-bold text-textPrimary">
                {isGood ? '✅ Eligible (≥75%)' : isWarning ? '⚠️ Low Attendance (<75%)' : '🚨 Critical Shortage (<65%)'}
              </p>
              <p className="text-textSecondary">
                Attended: <strong className="text-textPrimary">{studentSummary?.total_periods_attended || 0}</strong> /{' '}
                {studentSummary?.total_periods_held || 0} Periods Held
              </p>
            </div>
          </div>
        </div>

        {/* Per-Subject Attendance Cards */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand-primary" />
            Subject-wise Attendance Breakdown
          </h3>

          {isLoadingStudentSummary ? (
            <div className="py-8 text-center text-textMuted">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
              Loading subject attendance...
            </div>
          ) : !studentSummary?.subjects || studentSummary.subjects.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface border border-borderLine text-center text-textMuted text-xs">
              No enrolled subjects found for your roll number. Contact administration to assign subject rosters.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {studentSummary.subjects.map((sub) => {
                const subPct = sub.percentage;
                const subGood = subPct >= 75;
                const subWarn = subPct >= 65 && subPct < 75;
                return (
                  <div key={sub.allotment_id} className="p-5 rounded-2xl bg-surface border border-borderLine space-y-4 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            sub.subject_type === 'Lab'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-brand-soft text-brand-primary border border-brand-primary/30'
                          }`}
                        >
                          {sub.subject_type}
                        </span>
                        <h4 className="text-sm font-bold text-textPrimary truncate">{sub.subject_name}</h4>
                        <p className="text-[11px] text-textMuted">{sub.faculty_name}</p>
                      </div>

                      <span
                        className={`text-base font-mono font-black px-2.5 py-1 rounded-xl shrink-0 ${
                          subGood
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : subWarn
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {subPct}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-borderLine">
                        <div
                          className={`h-full rounded-full transition-all ${
                            subGood ? 'bg-emerald-500' : subWarn ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, subPct)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-textSecondary font-semibold">
                        <span>Attended: {sub.periods_attended} Periods</span>
                        <span>Held: {sub.periods_held} Periods</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            DAY-WISE 7-PERIOD DOT GRID TRACKING VIEW
           ────────────────────────────────────────────────────────────────── */}
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-primary" />
                Day-wise Hour-by-Hour Period Tracking (7 Periods / Day)
              </h3>
              <p className="text-xs text-textSecondary mt-0.5">
                🟢 Green = Present | 🔴 Red = Absent | ⚪ Grey = No class scheduled
              </p>
            </div>

            {/* Date range picker */}
            <div className="flex items-center gap-2 bg-surface-2 p-1 rounded-xl border border-borderLine">
              {(['7', '14', '30'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setDateRangeOption(opt);
                    const daysAgo = parseInt(opt);
                    setCustomFromDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                    setCustomToDate(new Date().toISOString().split('T')[0]);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    dateRangeOption === opt
                      ? 'bg-brand-primary text-white shadow-brand'
                      : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Last {opt} Days
                </button>
              ))}
            </div>
          </div>

          {/* Dot Grid */}
          {isLoadingStudentDaywise ? (
            <div className="py-8 text-center text-textMuted">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
              Loading day-wise attendance...
            </div>
          ) : !studentDaywise?.days || studentDaywise.days.length === 0 ? (
            <div className="p-8 rounded-xl bg-surface-2 border border-borderLine text-center text-textMuted text-xs">
              No attendance records logged in the selected date window ({customFromDate} to {customToDate}).
            </div>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {/* Header Periods */}
              <div className="grid grid-cols-8 gap-2 px-3 py-1.5 text-[11px] font-bold text-textMuted uppercase tracking-wider border-b border-borderLine bg-surface-2/40 rounded-lg">
                <div>Date</div>
                {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                  <div key={p} className="text-center">
                    P{p}
                  </div>
                ))}
              </div>

              {studentDaywise.days.map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-8 gap-2 items-center p-3 rounded-xl bg-surface-2/60 hover:bg-surface-2 border border-borderLine transition-all text-xs"
                >
                  <div className="font-mono font-bold text-textPrimary text-[11px] truncate">{day.date}</div>

                  {day.periods.map((slot, idx) => {
                    const periodNum = idx + 1;
                    if (!slot) {
                      return (
                        <div key={periodNum} className="flex justify-center" title={`Period ${periodNum}: No Class`}>
                          <span className="w-4 h-4 rounded-full border border-borderLine bg-surface/80 inline-block" />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={periodNum}
                        className="flex justify-center group relative cursor-pointer"
                        title={`Period ${periodNum}: ${slot.subject_name} — ${slot.is_present ? 'PRESENT' : 'ABSENT'}`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] text-white shadow-xs transition-transform group-hover:scale-125 ${
                            slot.is_present ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                          }`}
                        >
                          {slot.is_present ? '✓' : '✗'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: FACULTY / HOD / ADMIN DASHBOARD TRACKING VIEW
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="p-5 rounded-2xl bg-surface border border-borderLine flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-textPrimary flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-brand-primary" />
            {role === 'faculty' ? 'My Subject Attendance Tracker' : 'Institutional Attendance Analytics'}
          </h2>
          <p className="text-xs text-textSecondary mt-0.5">
            Monitor real-time period attendance, per-student averages, and past sessions.
          </p>
        </div>

        {role === 'faculty' && (
          <button
            onClick={() => navigate('/attendance')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 shadow-brand transition-all self-start md:self-auto"
          >
            <Plus className="w-4 h-4" /> Take Attendance Now
          </button>
        )}
      </div>

      {/* Selectors Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-borderLine grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Semester */}
        <div>
          <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1">
            Semester
          </label>
          <select
            value={selectedSemester}
            onChange={(e) => {
              setSelectedSemester(e.target.value as SemesterLabel);
              setSelectedAllotmentId('');
            }}
            className="w-full bg-surface-2 border border-borderLine rounded-xl px-3 py-2 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
          >
            {SEMESTERS.map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>
        </div>

        {/* Department (Admin/HOD) */}
        {role === 'admin' && (
          <div>
            <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full bg-surface-2 border border-borderLine rounded-xl px-3 py-2 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
            >
              <option value="All">All Departments</option>
              {VALID_DEPARTMENT_NAMES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subject Allotment Dropdown */}
        <div className={role === 'admin' ? '' : 'sm:col-span-2'}>
          <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1">
            Subject & Section
          </label>
          <select
            value={selectedAllotmentId}
            onChange={(e) => setSelectedAllotmentId(e.target.value)}
            className="w-full bg-surface-2 border border-borderLine rounded-xl px-3 py-2 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
          >
            <option value="">-- Select Subject --</option>
            {allotments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.subject_name} (Sec {a.section}) — {a.faculty_name} [{a.subject_type}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {subjectSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-surface border border-borderLine">
            <p className="text-textMuted text-xs font-semibold">Total Students</p>
            <p className="text-2xl font-black text-textPrimary font-mono mt-1">{subjectSummary.total_students}</p>
          </div>
          <div className="p-4 rounded-2xl bg-surface border border-borderLine">
            <p className="text-textMuted text-xs font-semibold">Periods Held</p>
            <p className="text-2xl font-black text-brand-primary font-mono mt-1">{subjectSummary.total_periods_held}</p>
          </div>
          <div className="p-4 rounded-2xl bg-surface border border-borderLine">
            <p className="text-textMuted text-xs font-semibold">Sessions Taken</p>
            <p className="text-2xl font-black text-textPrimary font-mono mt-1">{subjectSummary.sessions_count}</p>
          </div>
          <div className="p-4 rounded-2xl bg-surface border border-borderLine">
            <p className="text-textMuted text-xs font-semibold">Subject Type</p>
            <p className="text-2xl font-black text-amber-400 font-mono mt-1">{subjectSummary.allotment.subject_type}</p>
          </div>
        </div>
      )}

      {/* Per-Student Attendance Table */}
      <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-primary" />
              Student Attendance Register
            </h3>
            <p className="text-xs text-textSecondary mt-0.5">
              Click on any student to view their 7-period day-wise dot grid.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              placeholder="Search student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface-2 border border-borderLine rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary w-48 sm:w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-borderLine">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Sec</th>
                <th className="py-3 px-4 text-center">Periods Attended</th>
                <th className="py-3 px-4 text-center">Periods Held</th>
                <th className="py-3 px-4 text-center">Attendance %</th>
                <th className="py-3 px-4 text-right">Day-wise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoadingSubjectSummary ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-textMuted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                    Loading student register...
                  </td>
                </tr>
              ) : !subjectSummary?.students || subjectSummary.students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-textMuted">
                    No students enrolled in this subject yet.
                  </td>
                </tr>
              ) : (
                subjectSummary.students
                  .filter((s) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return s.roll_number.toLowerCase().includes(q) || s.student_name.toLowerCase().includes(q);
                  })
                  .map((student, idx) => {
                    const pct = student.percentage;
                    const isGood = pct >= 75;
                    const isWarn = pct >= 65 && pct < 75;
                    return (
                      <tr
                        key={student.roll_number}
                        onClick={() => setInspectingStudentRoll(student.roll_number)}
                        className="hover:bg-surface-2/60 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 text-textMuted font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-brand-primary">{student.roll_number}</td>
                        <td className="py-3 px-4 font-semibold text-textPrimary">{student.student_name}</td>
                        <td className="py-3 px-4 font-mono text-textSecondary">{student.section}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-textPrimary">
                          {student.periods_attended}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-textSecondary">{student.periods_held}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black inline-block ${
                              isGood
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : isWarn
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-red-500/10 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {pct}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-brand-primary hover:underline inline-flex items-center gap-1 font-semibold text-[11px]">
                            Inspect <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sessions History Table (With Delete Option) */}
      <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-primary" />
          Recorded Attendance Sessions ({sessionsHistory.length})
        </h3>

        <div className="overflow-x-auto rounded-xl border border-borderLine">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Starting Period</th>
                <th className="py-3 px-4">Sessions Held</th>
                <th className="py-3 px-4">Present / Total</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoadingSessions ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-textMuted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                    Loading sessions...
                  </td>
                </tr>
              ) : sessionsHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-textMuted">
                    No attendance sessions logged for this subject yet.
                  </td>
                </tr>
              ) : (
                sessionsHistory.map((sess) => (
                  <tr key={sess.id} className="hover:bg-surface-2/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-textPrimary">{sess.session_date}</td>
                    <td className="py-3 px-4 font-semibold text-brand-primary">Period {sess.period_start}</td>
                    <td className="py-3 px-4 font-semibold text-textPrimary">{sess.num_periods} Hour(s)</td>
                    <td className="py-3 px-4">
                      <span className="text-emerald-400 font-bold">{sess.present_count || 0}</span> /{' '}
                      {sess.total_marked || 0}
                    </td>
                    <td className="py-3 px-4 text-textSecondary font-mono text-[11px]">{sess.recorded_by}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete attendance session on ${sess.session_date} (Period ${sess.period_start})?`)) {
                            deleteSessionMutation.mutate(sess.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-textMuted hover:text-alert hover:bg-alert-soft transition-colors"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          INSPECT STUDENT DAY-WISE MODAL
         ────────────────────────────────────────────────────────────────────── */}
      {inspectingStudentRoll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-borderLine flex items-center justify-between bg-surface-2">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-primary" />
                  Day-wise 7-Period Attendance Matrix
                </h3>
                <p className="text-xs text-textSecondary mt-0.5 font-mono font-bold text-brand-primary">
                  {inspectingStudentRoll}
                </p>
              </div>
              <button
                onClick={() => setInspectingStudentRoll(null)}
                className="text-textMuted hover:text-textPrimary p-1.5 rounded-lg hover:bg-surface-3 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {isLoadingInspectedDaywise ? (
                <div className="py-12 text-center text-textMuted">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-primary" />
                  Loading student dot grid...
                </div>
              ) : !inspectedStudentDaywise?.days || inspectedStudentDaywise.days.length === 0 ? (
                <div className="py-8 text-center text-textMuted text-xs">
                  No attendance records logged for this student in the last 14 days.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-8 gap-2 px-3 py-1.5 text-[11px] font-bold text-textMuted uppercase tracking-wider border-b border-borderLine bg-surface-2/40 rounded-lg">
                    <div>Date</div>
                    {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                      <div key={p} className="text-center">
                        P{p}
                      </div>
                    ))}
                  </div>

                  {inspectedStudentDaywise.days.map((day) => (
                    <div
                      key={day.date}
                      className="grid grid-cols-8 gap-2 items-center p-3 rounded-xl bg-surface-2/60 border border-borderLine text-xs"
                    >
                      <div className="font-mono font-bold text-textPrimary text-[11px] truncate">{day.date}</div>

                      {day.periods.map((slot, idx) => {
                        const periodNum = idx + 1;
                        if (!slot) {
                          return (
                            <div key={periodNum} className="flex justify-center" title={`Period ${periodNum}: No Class`}>
                              <span className="w-4 h-4 rounded-full border border-borderLine bg-surface/80 inline-block" />
                            </div>
                          );
                        }

                        return (
                          <div
                            key={periodNum}
                            className="flex justify-center"
                            title={`Period ${periodNum}: ${slot.subject_name} — ${slot.is_present ? 'PRESENT' : 'ABSENT'}`}
                          >
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] text-white shadow-xs ${
                                slot.is_present ? 'bg-emerald-500' : 'bg-red-500'
                              }`}
                            >
                              {slot.is_present ? '✓' : '✗'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-borderLine bg-surface-2 flex justify-end">
              <button
                onClick={() => setInspectingStudentRoll(null)}
                className="px-4 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary/90 transition-all"
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
