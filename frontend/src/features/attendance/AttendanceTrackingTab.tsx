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
  Printer,
  FileText,
  Download,
  ShieldAlert,
  UserCheck,
  GraduationCap,
  Sparkles,
  BarChart3,
  Check,
  ChevronDown
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
import {
  VALID_DEPARTMENT_NAMES,
  DEPARTMENT_CODE_MAP,
  normalizeDepartmentName,
} from '../../lib/validation/auth';
import { AttendancePdfModal } from './AttendancePdfModal';

interface AttendanceTrackingTabProps {
  role: UserRole;
  targetRollNumber?: string;
}

const ALL_SEMESTERS: SemesterLabel[] = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

export const AttendanceTrackingTab: React.FC<AttendanceTrackingTabProps> = ({ role, targetRollNumber }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Resolved roll number for Student or Parent view
  const studentRollNo = targetRollNumber || user?.rollNumber || '';

  // Dashboard Sub-tabs for Faculty / HOD / Admin: 'analytics' | 'subject' | 'mentees'
  const [dashboardTab, setDashboardTab] = useState<'analytics' | 'subject' | 'mentees'>('analytics');

  // Faculty / HOD / Admin filter state
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel>('2-1');
  const [selectedDepartment, setSelectedDepartment] = useState<string>(
    role === 'hod' ? normalizeDepartmentName(user?.department) : 'All'
  );
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('All');
  const [selectedAllotmentId, setSelectedAllotmentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [analyticsStudentSearch, setAnalyticsStudentSearch] = useState('');
  const [menteeSearchQuery, setMenteeSearchQuery] = useState('');
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [viewingPdfDoc, setViewingPdfDoc] = useState<{ name: string; data: string } | null>(null);

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
  // Semester Overall Summary & Section Drill-Down
  const { data: semesterAnalytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['semesterAttendanceSummary', selectedSemester, selectedDepartment, selectedSectionFilter, dashboardTab === 'mentees' ? 'mentor' : 'all'],
    queryFn: () =>
      api.getSemesterAttendanceSummary({
        semester: selectedSemester,
        department: selectedDepartment === 'All' ? undefined : selectedDepartment,
        section: selectedSectionFilter === 'All' ? undefined : selectedSectionFilter,
        view_mode: dashboardTab === 'mentees' ? 'mentor' : 'all',
      }),
    enabled: !isStudentOrParent,
  });

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

  const selectedAllotment = allotments.find((a) => a.id === selectedAllotmentId);

  // Fetch Timetable PDF Document for current semester/section
  const { data: sectionTimetableDoc } = useQuery({
    queryKey: ['sectionTimetableDoc', selectedSemester, selectedAllotment?.section, selectedDepartment],
    queryFn: () => (selectedSemester ? api.getTimetableDocument({
      semester: selectedSemester,
      section: selectedAllotment?.section || 'A',
      department: selectedDepartment === 'All' ? '' : selectedDepartment,
    }) : Promise.resolve({ document: null })),
    enabled: !isStudentOrParent,
  });

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
      queryClient.invalidateQueries({ queryKey: ['semesterAttendanceSummary'] });
      queryClient.invalidateQueries({ queryKey: ['studentAttendanceSummary'] });
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: STUDENT & PARENT DASHBOARD VIEW
  // ──────────────────────────────────────────────────────────────────────────
  if (isStudentOrParent) {
    const overallPct = studentSummary?.overall_percentage ?? 100;
    const isGood = overallPct >= 75;
    const isWarn = overallPct >= 65 && overallPct < 75;
    const isCritical = overallPct < 65;

    return (
      <div className="space-y-6">
        {/* Header KPI Card */}
        <div className="p-6 rounded-2xl bg-surface border border-borderLine relative overflow-hidden shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-1.5">
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                Official Attendance Record
              </span>
              <h2 className="text-xl font-bold text-textPrimary flex items-center gap-2 mt-2">
                <CalendarCheck className="w-5 h-5 text-brand-primary" />
                Student Attendance Dashboard
              </h2>
              <p className="text-xs text-textSecondary">
                Roll Number: <strong className="text-textPrimary font-mono">{studentRollNo}</strong>
                {studentSummary?.student?.name ? ` • ${studentSummary.student.name}` : ''}
                {studentSummary?.student?.section ? ` • Section ${studentSummary.student.section}` : ''}
              </p>
            </div>

            {/* Circular Percentage Badge */}
            <div className="flex items-center gap-4 bg-surface-2 p-4 rounded-2xl border border-borderLine">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-textMuted font-bold">Overall Percentage</p>
                <p className="text-xs text-textSecondary">
                  {studentSummary?.total_periods_attended ?? 0} / {studentSummary?.total_periods_held ?? 0} Periods
                </p>
              </div>
              <div
                className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-mono font-black text-xl shadow-lg border ${
                  isGood
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : isWarn
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                }`}
              >
                <span>{overallPct}%</span>
                <span className="text-[8px] font-sans uppercase font-bold tracking-tight opacity-80">
                  {isGood ? 'Eligible' : isWarn ? 'Condonation' : 'Shortage'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Per-Subject Breakdown Cards */}
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-primary" />
              Subject-wise Attendance Progress
            </h3>
            <span className="text-xs text-textMuted font-semibold">
              {studentSummary?.subjects?.length || 0} Registered Subjects
            </span>
          </div>

          {isLoadingStudentSummary ? (
            <div className="py-8 text-center text-textMuted">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
              Loading subject attendance...
            </div>
          ) : !studentSummary?.subjects || studentSummary.subjects.length === 0 ? (
            <div className="py-8 text-center text-textMuted text-xs">
              No subject attendance records found for this student.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {studentSummary.subjects.map((sub) => {
                const pct = sub.percentage;
                const subGood = pct >= 75;
                const subWarn = pct >= 65 && pct < 75;

                return (
                  <div
                    key={sub.allotment_id}
                    className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-3 hover:border-brand-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              sub.subject_type === 'Lab'
                                ? 'bg-purple-500/10 text-purple-400'
                                : 'bg-cyan-500/10 text-cyan-400'
                            }`}
                          >
                            {sub.subject_type}
                          </span>
                          <span className="text-[10px] text-textMuted font-mono">Sem {sub.semester_label}</span>
                          {sub.joining_date && (
                            <span className="text-[9px] text-purple-400 font-semibold" title={`Joined subject on ${sub.joining_date}`}>
                              *Joined: {new Date(sub.joining_date).toLocaleDateString('en-GB')}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-textPrimary mt-1 line-clamp-1" title={sub.subject_name}>
                          {sub.subject_name}
                        </h4>
                        <p className="text-[11px] text-textSecondary mt-0.5">{sub.faculty_name}</p>
                      </div>

                      <span
                        className={`text-sm font-mono font-bold px-2 py-0.5 rounded-lg ${
                          subGood
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : subWarn
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            subGood ? 'bg-emerald-500' : subWarn ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-textMuted font-mono">
                        <span>Attended: {sub.periods_attended}</span>
                        <span>Held: {sub.periods_held} Periods</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-textMuted pt-2">
            * Note: For students who joined a subject mid-way, attendance percentage is calculated strictly from classes held on or after their verified join date.
          </p>
        </div>

        {/* Day-Wise 7-Period Attendance Dot Grid Matrix */}
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-primary" />
                Day-Wise 7-Period Attendance Matrix
              </h3>
              <p className="text-xs text-textSecondary mt-0.5">
                Horizontal dot row of each day's 7 class periods (🟢 Present, 🔴 Absent, ⚪ No Class).
              </p>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-borderLine">
              {(['7', '14', '30'] as const).map((days) => (
                <button
                  key={days}
                  onClick={() => {
                    setDateRangeOption(days);
                    setCustomFromDate(
                      new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    );
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    dateRangeOption === days
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Last {days} Days
                </button>
              ))}
            </div>
          </div>

          {isLoadingStudentDaywise ? (
            <div className="py-8 text-center text-textMuted">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
              Loading day-wise matrix...
            </div>
          ) : !studentDaywise?.days || studentDaywise.days.length === 0 ? (
            <div className="py-8 text-center text-textMuted text-xs">
              No sessions recorded in this date range.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header Columns */}
              <div className="grid grid-cols-8 gap-2 px-3 py-2 text-[10px] font-bold text-textMuted uppercase tracking-wider">
                <div>Date</div>
                <div className="text-center">Period 1</div>
                <div className="text-center">Period 2</div>
                <div className="text-center">Period 3</div>
                <div className="text-center">Period 4</div>
                <div className="text-center">Period 5</div>
                <div className="text-center">Period 6</div>
                <div className="text-center">Period 7</div>
              </div>

              {studentDaywise.days.map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-8 gap-2 items-center p-3 rounded-xl bg-surface-2/60 border border-borderLine text-xs hover:bg-surface-2 transition-colors"
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
  const summaryData = semesterAnalytics?.summary;
  const sectionsData = semesterAnalytics?.sections || [];
  const studentsData = semesterAnalytics?.students || [];
  const subjectsData = semesterAnalytics?.subjects || [];
  const menteesData = semesterAnalytics?.mentees || [];

  return (
    <div className="space-y-6">
      {/* Top Header & Action Toolbar */}
      <div className="p-5 rounded-2xl bg-surface border border-borderLine flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-textPrimary flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-brand-primary" />
            {role === 'faculty' ? 'Attendance Tracking & Analytics' : role === 'hod' ? 'Department Attendance Command' : 'Institutional Attendance Analytics'}
          </h2>
          <p className="text-xs text-textSecondary mt-0.5">
            {role === 'faculty'
              ? 'Real-time attendance summaries, section drill-downs, and mentorship tracking.'
              : role === 'hod'
              ? `Department-wide attendance tracking and section analytics for ${user?.department || 'your department'}.`
              : 'Institutional aggregate semester attendance, section drill-downs, and faculty subjects.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {sectionTimetableDoc?.document && (
            <button
              onClick={() => setViewingPdfDoc({
                name: sectionTimetableDoc.document.file_name,
                data: sectionTimetableDoc.document.file_data,
              })}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 transition-all"
            >
              <FileText className="w-4 h-4 text-purple-400" /> Timetable PDF
            </button>
          )}

          <button
            onClick={() => setShowPdfModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md transition-all"
          >
            <Printer className="w-4 h-4" /> Download PDF Report
          </button>

          {role === 'faculty' && (
            <button
              onClick={() => navigate('/attendance')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 shadow-brand transition-all"
            >
              <Plus className="w-4 h-4" /> Take Attendance Now
            </button>
          )}
        </div>
      </div>

      {/* Main View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-2 bg-surface rounded-2xl border border-borderLine">
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-surface-2 rounded-xl border border-borderLine">
          <button
            onClick={() => setDashboardTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              dashboardTab === 'analytics'
                ? 'bg-brand-primary text-white shadow-brand'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            1. Semester Analytics & Section Drill-Down
          </button>

          <button
            onClick={() => setDashboardTab('subject')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              dashboardTab === 'subject'
                ? 'bg-brand-primary text-white shadow-brand'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            2. Per-Subject Tracker & Sessions
          </button>

          <button
            onClick={() => setDashboardTab('mentees')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              dashboardTab === 'mentees'
                ? 'bg-brand-primary text-white shadow-brand'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            3. My Assigned Mentees ({menteesData.length})
          </button>
        </div>

        {/* Global Semester & Department Selectors */}
        <div className="flex items-center gap-2 px-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-textMuted uppercase">Sem:</span>
            <select
              value={selectedSemester}
              onChange={(e) => {
                setSelectedSemester(e.target.value as SemesterLabel);
                setSelectedAllotmentId('');
              }}
              className="bg-surface-2 border border-borderLine text-textPrimary text-xs rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-brand-primary"
            >
              {ALL_SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {(role === 'admin' || (role === 'hod' && !user?.department)) && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-textMuted uppercase">Dept:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="bg-surface-2 border border-borderLine text-textPrimary text-xs rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-brand-primary max-w-[140px] truncate"
              >
                <option value="All">All Depts</option>
                {VALID_DEPARTMENT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: SEMESTER OVERALL ANALYTICS & SECTION DRILL-DOWN */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {dashboardTab === 'analytics' && (
        <div className="space-y-6">
          {isLoadingAnalytics ? (
            <div className="p-12 text-center text-textMuted bg-surface rounded-2xl border border-borderLine">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-primary" />
              <p className="text-sm font-semibold">Aggregating semester attendance analytics...</p>
            </div>
          ) : (
            <>
              {/* Overall Semester Attendance Summary Card */}
              <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-brand-primary" />
                      Semester {selectedSemester} Overall Attendance Summary
                    </h3>
                    <p className="text-xs text-textSecondary mt-0.5">
                      {role === 'faculty'
                        ? 'Aggregated across all subjects you teach for this semester.'
                        : role === 'hod'
                        ? `Aggregated department-wide attendance for ${selectedDepartment === 'All' ? user?.department : selectedDepartment}.`
                        : `Aggregated institution-wide attendance for Semester ${selectedSemester}.`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-surface-2 text-textPrimary border border-borderLine">
                      {summaryData?.total_classes_held || 0} Total Classes Held
                    </span>
                  </div>
                </div>

                {/* Present % vs Absent % Visual Bar */}
                <div className="space-y-2 p-5 rounded-xl bg-surface-2/70 border border-borderLine">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      Present Rate: {summaryData?.overall_percentage || 0}% ({summaryData?.total_presentees || 0} Student-Periods)
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                      Absent Rate: {summaryData?.absent_percentage || 0}% ({summaryData?.total_absentees || 0} Student-Periods)
                    </span>
                  </div>

                  {/* Dual Segment Progress Bar */}
                  <div className="w-full h-4 bg-surface rounded-full overflow-hidden flex border border-borderLine p-0.5">
                    <div
                      style={{ width: `${summaryData?.overall_percentage || 0}%` }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-l-full transition-all duration-500"
                      title={`Present: ${summaryData?.overall_percentage || 0}%`}
                    />
                    <div
                      style={{ width: `${summaryData?.absent_percentage || 0}%` }}
                      className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-r-full transition-all duration-500"
                      title={`Absent: ${summaryData?.absent_percentage || 0}%`}
                    />
                  </div>
                </div>

                {/* KPI Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-surface-2 border border-borderLine">
                    <div className="flex items-center justify-between text-textMuted mb-1">
                      <span className="text-[11px] font-bold uppercase">Enrolled Students</span>
                      <Users className="w-4 h-4 text-brand-primary" />
                    </div>
                    <p className="text-2xl font-black text-textPrimary font-mono">
                      {summaryData?.total_students || 0}
                    </p>
                    <p className="text-[10px] text-textSecondary mt-0.5">Across active rosters</p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-2 border border-borderLine">
                    <div className="flex items-center justify-between text-textMuted mb-1">
                      <span className="text-[11px] font-bold uppercase">Presentees</span>
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-2xl font-black text-emerald-400 font-mono">
                      {summaryData?.total_presentees || 0}
                    </p>
                    <p className="text-[10px] text-emerald-500/80 mt-0.5">Total attended periods</p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-2 border border-borderLine">
                    <div className="flex items-center justify-between text-textMuted mb-1">
                      <span className="text-[11px] font-bold uppercase">Absentees</span>
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    </div>
                    <p className="text-2xl font-black text-rose-400 font-mono">
                      {summaryData?.total_absentees || 0}
                    </p>
                    <p className="text-[10px] text-rose-500/80 mt-0.5">Total missed periods</p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-2 border border-borderLine">
                    <div className="flex items-center justify-between text-textMuted mb-1">
                      <span className="text-[11px] font-bold uppercase">At-Risk (&lt;75%)</span>
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-2xl font-black text-amber-400 font-mono">
                      {summaryData?.at_risk_students_count || 0}
                    </p>
                    <p className="text-[10px] text-amber-500/80 mt-0.5">Require attendance boost</p>
                  </div>
                </div>
              </div>

              {/* Section Drill-Down & Comparison Section */}
              <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                      <Layers className="w-4 h-4 text-brand-primary" />
                      Section Comparison & Drill-Down
                    </h3>
                    <p className="text-xs text-textSecondary mt-0.5">
                      Select a section badge below to filter student-level registers and investigate low attendance.
                    </p>
                  </div>

                  {/* Section Filter Buttons */}
                  <div className="flex items-center gap-1.5 bg-surface-2 p-1.5 rounded-xl border border-borderLine overflow-x-auto">
                    <button
                      onClick={() => setSelectedSectionFilter('All')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedSectionFilter === 'All'
                          ? 'bg-brand-primary text-white shadow-xs'
                          : 'text-textSecondary hover:text-textPrimary'
                      }`}
                    >
                      All Sections
                    </button>
                    {sectionsData.map((sec: any) => (
                      <button
                        key={sec.section}
                        onClick={() => setSelectedSectionFilter(sec.section)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          selectedSectionFilter === sec.section
                            ? 'bg-brand-primary text-white shadow-xs'
                            : 'text-textSecondary hover:text-textPrimary'
                        }`}
                      >
                        Sec {sec.section} ({sec.overall_percentage}%)
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section Comparison Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {sectionsData.map((sec: any) => {
                    const isSecSelected = selectedSectionFilter === sec.section;
                    const isGood = sec.overall_percentage >= 75;

                    return (
                      <div
                        key={sec.section}
                        onClick={() => setSelectedSectionFilter(isSecSelected ? 'All' : sec.section)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          isSecSelected
                            ? 'bg-brand-primary/10 border-brand-primary ring-2 ring-brand-primary/30'
                            : 'bg-surface-2 hover:bg-surface-3 border-borderLine'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black text-textPrimary">Section {sec.section}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                              isGood
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {sec.overall_percentage}%
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px] text-textSecondary">
                          <div className="flex justify-between">
                            <span>Students:</span>
                            <strong className="text-textPrimary font-mono">{sec.total_students}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Present / Held:</span>
                            <span className="font-mono">
                              <strong className="text-emerald-400">{sec.total_presentees}</strong> / {sec.total_held}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>At-Risk (&lt;75%):</span>
                            <strong className={sec.at_risk_count > 0 ? 'text-rose-400' : 'text-textMuted'}>
                              {sec.at_risk_count}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Student-wise Drill-Down Register Table */}
                <div className="space-y-3 pt-4 border-t border-borderLine">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-brand-primary" />
                      Detailed Student Register {selectedSectionFilter !== 'All' ? `— Section ${selectedSectionFilter}` : '— All Sections'}
                    </h4>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                      <input
                        type="text"
                        placeholder="Search student roll number or name..."
                        value={analyticsStudentSearch}
                        onChange={(e) => setAnalyticsStudentSearch(e.target.value)}
                        className="bg-surface-2 border border-borderLine rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary w-56 sm:w-72"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-borderLine">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                        <tr>
                          <th className="py-2.5 px-3.5">#</th>
                          <th className="py-2.5 px-3.5">Roll Number</th>
                          <th className="py-2.5 px-3.5">Student Name</th>
                          <th className="py-2.5 px-3.5">Sec</th>
                          <th className="py-2.5 px-3.5 text-center">Attended</th>
                          <th className="py-2.5 px-3.5 text-center">Held</th>
                          <th className="py-2.5 px-3.5 text-center">Absent</th>
                          <th className="py-2.5 px-3.5 text-center">Attendance %</th>
                          <th className="py-2.5 px-3.5 text-center">Status</th>
                          <th className="py-2.5 px-3.5 text-right">Day-wise</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borderLine">
                        {studentsData.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-textMuted">
                              No student attendance data found for the current filters.
                            </td>
                          </tr>
                        ) : (
                          studentsData
                            .filter((s: any) => {
                              if (!analyticsStudentSearch) return true;
                              const q = analyticsStudentSearch.toLowerCase();
                              return (
                                s.roll_number.toLowerCase().includes(q) ||
                                s.student_name.toLowerCase().includes(q)
                              );
                            })
                            .map((student: any, idx: number) => {
                              const pct = student.percentage;
                              const isGood = pct >= 75;
                              const isWarn = pct >= 65 && pct < 75;

                              return (
                                <tr
                                  key={student.roll_number}
                                  className="hover:bg-surface-2/40 transition-colors cursor-pointer"
                                  onClick={() => setInspectingStudentRoll(student.roll_number)}
                                >
                                  <td className="py-2.5 px-3.5 text-textMuted font-mono">{idx + 1}</td>
                                  <td className="py-2.5 px-3.5 font-mono font-bold text-brand-primary">
                                    {student.roll_number}
                                  </td>
                                  <td className="py-2.5 px-3.5 font-semibold text-textPrimary">
                                    {student.student_name}
                                  </td>
                                  <td className="py-2.5 px-3.5 font-bold text-textSecondary">{student.section}</td>
                                  <td className="py-2.5 px-3.5 text-center font-mono font-bold text-emerald-400">
                                    {student.periods_attended}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-center font-mono text-textSecondary">
                                    {student.periods_held}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-center font-mono font-bold text-rose-400">
                                    {student.periods_absent}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-center font-mono font-black">
                                    <span
                                      className={`px-2 py-0.5 rounded-md ${
                                        isGood
                                          ? 'bg-emerald-500/10 text-emerald-400'
                                          : isWarn
                                          ? 'bg-amber-500/10 text-amber-400'
                                          : 'bg-red-500/10 text-red-400'
                                      }`}
                                    >
                                      {pct}%
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3.5 text-center">
                                    {isGood ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                                        <Check className="w-3 h-3" /> Eligible
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                                        <AlertCircle className="w-3 h-3" /> At Risk
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right">
                                    <button className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-textSecondary hover:text-textPrimary transition-colors inline-flex items-center gap-1 text-[11px] font-semibold">
                                      <Eye className="w-3 h-3" /> View Dots
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Subject-Wise Summary Table */}
              <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4 shadow-sm">
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-primary" />
                  Subject-Wise Semester Performance
                </h3>

                <div className="overflow-x-auto rounded-xl border border-borderLine">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                      <tr>
                        <th className="py-2.5 px-4">Subject Name</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4">Sec</th>
                        <th className="py-2.5 px-4">Faculty</th>
                        <th className="py-2.5 px-4 text-center">Classes Taken</th>
                        <th className="py-2.5 px-4 text-center">Periods Held</th>
                        <th className="py-2.5 px-4 text-center">Enrolled</th>
                        <th className="py-2.5 px-4 text-center">Average Attendance %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {subjectsData.map((sub: any) => (
                        <tr key={sub.allotment_id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-textPrimary">{sub.subject_name}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                sub.subject_type === 'Lab'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              }`}
                            >
                              {sub.subject_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-textSecondary">{sub.section}</td>
                          <td className="py-3 px-4 font-medium text-textPrimary">{sub.faculty_name}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-brand-primary">
                            {sub.sessions_count}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-textSecondary">{sub.total_periods_held}</td>
                          <td className="py-3 px-4 text-center font-mono font-semibold">{sub.enrolled_students}</td>
                          <td className="py-3 px-4 text-center font-mono font-black text-emerald-400">
                            {sub.average_attendance_percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 2: PER-SUBJECT TRACKER & RECORDED SESSIONS */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {dashboardTab === 'subject' && (
        <div className="space-y-6">
          {/* Selectors Bar */}
          <div className="p-4 rounded-2xl bg-surface border border-borderLine grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1">
                Select Subject & Section
              </label>
              <select
                value={selectedAllotmentId}
                onChange={(e) => setSelectedAllotmentId(e.target.value)}
                className="w-full bg-surface-2 border border-borderLine rounded-xl px-3 py-2 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
              >
                <option value="">-- Select Subject --</option>
                {allotments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.subject_name} ({a.department} Sec {a.section}) — {a.faculty_name} [{a.subject_type}]
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <span className="text-xs text-textSecondary">
                Found <strong>{allotments.length}</strong> allocated subjects for Semester {selectedSemester}
              </span>
            </div>
          </div>

          {/* Summary KPI Cards for Selected Subject */}
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
                  Subject Attendance Register
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Click on any student row to inspect their 7-period day-wise dot grid.
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
                        No students enrolled in this subject yet. Enroll students via Student Roster tab.
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
                            className="hover:bg-surface-2/40 transition-colors cursor-pointer"
                            onClick={() => setInspectingStudentRoll(student.roll_number)}
                          >
                            <td className="py-3 px-4 text-textMuted font-mono">{idx + 1}</td>
                            <td className="py-3 px-4 font-mono font-bold text-brand-primary">{student.roll_number}</td>
                            <td className="py-3 px-4 font-medium text-textPrimary">
                              {student.student_name}
                              {student.joining_date && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-400 font-semibold" title={`Joined on ${student.joining_date}`}>
                                  *Joined: {new Date(student.joining_date).toLocaleDateString('en-GB')}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-textSecondary">{student.section}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-textPrimary">
                              {student.periods_attended}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-textSecondary">
                              {student.periods_held}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-black">
                              <span
                                className={`px-2 py-0.5 rounded-md ${
                                  isGood
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : isWarn
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}
                              >
                                {pct}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-textSecondary hover:text-textPrimary transition-colors inline-flex items-center gap-1 text-[11px] font-semibold">
                                <Eye className="w-3 h-3" /> View Dots
                              </button>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session History & Deletion Card */}
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-primary" />
                  Recorded Sessions History
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Review and manage past attendance sessions recorded for this subject.
                </p>
              </div>
            </div>

            {isLoadingSessions ? (
              <div className="py-8 text-center text-textMuted">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                Loading session logs...
              </div>
            ) : sessionsHistory.length === 0 ? (
              <div className="py-8 text-center text-textMuted text-xs bg-surface-2/30 rounded-xl border border-dashed border-borderLine">
                No attendance sessions taken yet for this subject.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Period Start</th>
                      <th className="py-3 px-4">Session Length</th>
                      <th className="py-3 px-4 text-center">Present / Total</th>
                      <th className="py-3 px-4">Recorded By</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {sessionsHistory.map((sess) => (
                      <tr key={sess.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-textPrimary">{sess.session_date}</td>
                        <td className="py-3 px-4 font-semibold text-textSecondary">Period {sess.period_start}</td>
                        <td className="py-3 px-4 font-semibold text-brand-primary">
                          {sess.num_periods} Period{sess.num_periods > 1 ? 's' : ''}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          <span className="text-emerald-400">{sess.present_count || 0}</span> /{' '}
                          <span className="text-textSecondary">{sess.total_marked || 0}</span>
                        </td>
                        <td className="py-3 px-4 text-textMuted font-mono text-[11px]">{sess.recorded_by}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete session from ${sess.session_date}?`)) {
                                deleteSessionMutation.mutate(sess.id);
                              }
                            }}
                            className="p-1.5 text-textMuted hover:text-alert rounded-lg hover:bg-surface-3 transition-colors"
                            title="Delete Session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 3: MY ASSIGNED MENTEES (MENTORSHIP VIEW) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {dashboardTab === 'mentees' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-brand-primary" />
                  Assigned Mentees Attendance Portal
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Showing real-time attendance, subject breakdowns, and deficits for students under your mentorship.
                </p>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                <input
                  type="text"
                  placeholder="Search mentee..."
                  value={menteeSearchQuery}
                  onChange={(e) => setMenteeSearchQuery(e.target.value)}
                  className="bg-surface-2 border border-borderLine rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary w-48 sm:w-60"
                />
              </div>
            </div>

            {/* Mentee List Table / Cards */}
            {isLoadingAnalytics ? (
              <div className="py-12 text-center text-textMuted">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                Loading mentee records...
              </div>
            ) : menteesData.length === 0 ? (
              <div className="py-12 text-center text-textMuted bg-surface-2/40 rounded-xl border border-dashed border-borderLine">
                <GraduationCap className="w-8 h-8 mx-auto mb-2 text-textMuted/60" />
                <p className="text-sm font-semibold">No assigned mentees found for your account.</p>
                <p className="text-xs text-textSecondary mt-1">Mentees assigned to you in the Department Mentorship portal will appear here automatically.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {menteesData
                  .filter((m: any) => {
                    if (!menteeSearchQuery) return true;
                    const q = menteeSearchQuery.toLowerCase();
                    return m.roll_number.toLowerCase().includes(q) || m.student_name.toLowerCase().includes(q);
                  })
                  .map((mentee: any) => {
                    const isGood = mentee.percentage >= 75;
                    const isWarn = mentee.percentage >= 65 && mentee.percentage < 75;

                    return (
                      <div
                        key={mentee.roll_number}
                        className="p-4 rounded-xl bg-surface-2/60 border border-borderLine hover:border-brand-primary/40 transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold font-mono">
                              {mentee.roll_number.slice(-3)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-textPrimary">{mentee.student_name}</h4>
                                <span className="text-xs font-mono font-semibold text-brand-primary">
                                  ({mentee.roll_number})
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-3 text-textSecondary">
                                  Sec {mentee.section}
                                </span>
                              </div>
                              <p className="text-[11px] text-textSecondary font-mono mt-0.5">
                                Attended: <strong className="text-emerald-400">{mentee.periods_attended}</strong> / {mentee.periods_held} Periods Held ({mentee.periods_absent} Absences)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span
                              className={`px-3 py-1 rounded-xl font-mono text-xs font-black ${
                                isGood
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : isWarn
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {mentee.percentage}%
                            </span>

                            <button
                              onClick={() => setInspectingStudentRoll(mentee.roll_number)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-brand transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Day-wise Grid
                            </button>
                          </div>
                        </div>

                        {/* Per-Subject Breakdown Pills */}
                        {mentee.subjects && mentee.subjects.length > 0 && (
                          <div className="pt-2 border-t border-borderLine/60">
                            <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider mb-1.5">
                              Subject-wise Breakdown:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {mentee.subjects.map((sub: any, sIdx: number) => {
                                const subPct = sub.percentage || 0;
                                const isSubGood = subPct >= 75;

                                return (
                                  <div
                                    key={sIdx}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-borderLine text-[11px]"
                                  >
                                    <span className="font-semibold text-textPrimary">{sub.subject_name}</span>
                                    <span
                                      className={`font-mono font-bold ${
                                        isSubGood ? 'text-emerald-400' : 'text-amber-400'
                                      }`}
                                    >
                                      {subPct}%
                                    </span>
                                    <span className="text-[9px] text-textMuted font-mono">
                                      ({sub.periods_attended}/{sub.periods_held})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* INSPECTED STUDENT DAY-WISE MODAL */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {inspectingStudentRoll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-50">
            <div className="p-5 border-b border-borderLine flex items-center justify-between bg-surface-2">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-primary" />
                  Day-Wise Attendance Matrix
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Roll Number: <strong className="text-brand-primary font-mono">{inspectingStudentRoll}</strong>
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
                <div className="py-8 text-center text-textMuted">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                  Loading day-wise slots...
                </div>
              ) : !inspectedStudentDaywise?.days || inspectedStudentDaywise.days.length === 0 ? (
                <div className="py-8 text-center text-textMuted text-xs">
                  No attendance session records found for this student in the last 14 days.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-8 gap-2 px-3 py-1.5 text-[10px] font-bold text-textMuted uppercase">
                    <div>Date</div>
                    <div className="text-center">P1</div>
                    <div className="text-center">P2</div>
                    <div className="text-center">P3</div>
                    <div className="text-center">P4</div>
                    <div className="text-center">P5</div>
                    <div className="text-center">P6</div>
                    <div className="text-center">P7</div>
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

      {/* Official Timetable Document PDF Viewer Modal */}
      {viewingPdfDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-5xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-50">
            <div className="p-4 border-b border-borderLine flex items-center justify-between bg-surface-2">
              <div className="flex items-center gap-2.5 min-w-0 pr-4">
                <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                <h3 className="text-sm font-bold text-textPrimary font-mono truncate">{viewingPdfDoc.name}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewingPdfDoc.data}
                  download={viewingPdfDoc.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-3 hover:bg-surface text-textPrimary text-xs rounded-xl border border-borderLine transition-all font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </a>
                <button
                  onClick={() => setViewingPdfDoc(null)}
                  className="p-1.5 text-textMuted hover:text-textPrimary rounded-xl hover:bg-surface-3 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950 overflow-hidden relative">
              <iframe
                src={viewingPdfDoc.data}
                title={viewingPdfDoc.name}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Attendance PDF & Excel Report Modal */}
      <AttendancePdfModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        defaultYear="2nd Year"
        defaultDepartment={selectedDepartment === 'All' ? '' : selectedDepartment}
      />
    </div>
  );
};
