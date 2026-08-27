import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  CheckCircle2,
  Calendar,
  Clock,
  BookOpen,
  Users,
  Search,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  LayoutDashboard,
  AlertCircle,
  Sparkles,
  Zap,
  FileText,
  Download,
  Lock,
  CalendarOff,
  AlertTriangle
} from 'lucide-react';
import { api } from '../../lib/api';
import { SemesterLabel, SubjectAllotment, SubjectRosterEntry, TimetableEntry, HolidayCalendarEntry, AcademicCalendarEntry } from '../../types';
import { useAuth } from '../../context/AuthContext';

const ALL_SEMESTERS: { label: SemesterLabel; desc: string }[] = [
  { label: '1-1', desc: '1st Year — Sem 1' },
  { label: '1-2', desc: '1st Year — Sem 2' },
  { label: '2-1', desc: '2nd Year — Sem 1' },
  { label: '2-2', desc: '2nd Year — Sem 2' },
  { label: '3-1', desc: '3rd Year — Sem 1' },
  { label: '3-2', desc: '3rd Year — Sem 2' },
  { label: '4-1', desc: '4th Year — Sem 1' },
  { label: '4-2', desc: '4th Year — Sem 2' },
];

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Wizard Step: 1 = Sem, 2 = Subject, 3 = Session setup, 4 = Roster mark, 5 = Confirmation
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Semester
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel | null>(null);

  // Step 2: Subject
  const [selectedSubject, setSelectedSubject] = useState<SubjectAllotment | null>(null);

  // Step 3: Session Details
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [periodStart, setPeriodStart] = useState<number>(1);
  const [numPeriods, setNumPeriods] = useState<number>(1);

  // Step 4: Roster & Marking
  const [studentRecords, setStudentRecords] = useState<{
    roll_number: string;
    student_name?: string;
    joining_date?: string;
    is_present: boolean;
    is_exempt?: boolean;
  }[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  // Step 5: Save confirmation result
  const [saveResult, setSaveResult] = useState<{
    message: string;
    presentCount: number;
    totalCount: number;
    subjectName: string;
    numPeriods: number;
  } | null>(null);

  const [viewingPdfDoc, setViewingPdfDoc] = useState<{ name: string; data: string } | null>(null);

  // ── Fetch Faculty Allotted Subjects for selected semester ──
  const { data: mySubjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['myAttendanceSubjects', selectedSemester],
    queryFn: () => (selectedSemester ? api.getMyAttendanceSubjects(selectedSemester) : Promise.resolve([])),
    enabled: Boolean(selectedSemester),
  });

  // ── Fetch Today's Timetable Slots for auto-detection ──
  const { data: todaySlotsData } = useQuery({
    queryKey: ['todayTimetableSlots', selectedSemester, selectedSubject?.section, sessionDate, user?.email],
    queryFn: () => (selectedSemester && selectedSubject ? api.getTodayTimetableSlots({
      semester: selectedSemester,
      section: selectedSubject.section,
      date: sessionDate,
      faculty_email: user?.email,
    }) : Promise.resolve({ slots: [] })),
    enabled: Boolean(selectedSemester && selectedSubject),
  });

  // ── Fetch Uploaded Official Timetable PDF Document ──
  const { data: timetableDocRes } = useQuery({
    queryKey: ['attendancePageTimetableDoc', selectedSemester, selectedSubject?.section, selectedSubject?.department],
    queryFn: () => (selectedSemester && selectedSubject ? api.getTimetableDocument({
      semester: selectedSemester,
      section: selectedSubject.section,
      department: selectedSubject.department,
    }) : Promise.resolve({ document: null })),
    enabled: Boolean(selectedSemester && selectedSubject),
  });
  const attachedPdfDoc = timetableDocRes?.document;

  // ── Fetch Roster for selected subject ──
  const { data: roster = [], isLoading: isLoadingRoster } = useQuery({
    queryKey: ['subjectRosterForAttendance', selectedSubject?.id],
    queryFn: () => (selectedSubject?.id ? api.getRoster(selectedSubject.id) : Promise.resolve([])),
    enabled: Boolean(selectedSubject?.id),
  });

  // ── Fetch Holidays and Academic Calendar for Date Validation ──
  const { data: holidays = [] } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

  const { data: academicCalendars = [] } = useQuery<AcademicCalendarEntry[]>({
    queryKey: ['academicCalendars'],
    queryFn: () => api.getAcademicCalendars(),
  });

  // Check if chosen date is a declared Holiday
  const matchedHoliday = React.useMemo(() => {
    return holidays.find((h) => {
      const hDate = typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0];
      return hDate === sessionDate;
    });
  }, [holidays, sessionDate]);

  // Check if chosen date falls within active semester academic calendar range
  const semesterCalendarWindow = React.useMemo(() => {
    if (!selectedSemester) return null;
    return academicCalendars.find((c) => String(c.semester) === String(selectedSemester)) || null;
  }, [academicCalendars, selectedSemester]);

  const isOutsideSemesterRange = React.useMemo(() => {
    if (!semesterCalendarWindow) return false;
    const startStr = typeof semesterCalendarWindow.start_date === 'string'
      ? semesterCalendarWindow.start_date.split('T')[0]
      : new Date(semesterCalendarWindow.start_date).toISOString().split('T')[0];
    const endStr = typeof semesterCalendarWindow.end_date === 'string'
      ? semesterCalendarWindow.end_date.split('T')[0]
      : new Date(semesterCalendarWindow.end_date).toISOString().split('T')[0];
    return sessionDate < startStr || sessionDate > endStr;
  }, [semesterCalendarWindow, sessionDate]);

  const isDateLocked = Boolean(matchedHoliday || isOutsideSemesterRange);

  // Initialize student records when roster loads or sessionDate changes
  useEffect(() => {
    if (roster && roster.length > 0) {
      setStudentRecords(
        roster.map((r: SubjectRosterEntry) => {
          const joinDate = r.joining_date ? new Date(r.joining_date).toISOString().split('T')[0] : '';
          const isExempt = Boolean(joinDate && sessionDate < joinDate);

          return {
            roll_number: r.roll_number,
            student_name: r.student_name,
            joining_date: joinDate,
            is_present: true, // Default present
            is_exempt: isExempt,
          };
        })
      );
    }
  }, [roster, sessionDate]);

  // Adjust session length defaults based on Theory vs Lab
  useEffect(() => {
    if (selectedSubject) {
      if (selectedSubject.subject_type === 'Lab') {
        setNumPeriods(2);
      } else {
        setNumPeriods(1);
      }
    }
  }, [selectedSubject]);

  // Auto-apply timetable match if available
  const matchedTimetableSlot = todaySlotsData?.slots?.find((s: TimetableEntry) => 
    s.subject_name.toLowerCase().includes(selectedSubject?.subject_name.toLowerCase() || '') ||
    (selectedSubject?.subject_name.toLowerCase().includes(s.subject_name.toLowerCase()) || '')
  );

  const applyTimetableSlot = (slot: TimetableEntry) => {
    setPeriodStart(slot.period_start);
    setNumPeriods(slot.num_periods);
  };

  const isFirstOrFourthYear = selectedSemester ? ['1-1', '1-2', '4-1', '4-2'].includes(selectedSemester) : false;

  const getPeriodTimingLabel = (period: number) => {
    if (isFirstOrFourthYear) {
      const startTimes = ['', '09:00 AM', '09:50 AM', '11:00 AM', '01:00 PM', '01:50 PM', '03:00 PM', '03:50 PM'];
      const endTimes = ['', '09:50 AM', '10:40 AM', '11:50 AM', '01:50 PM', '02:40 PM', '03:50 PM', '04:40 PM'];
      return `${startTimes[period]} – ${endTimes[Math.min(7, period + numPeriods - 1)]}`;
    } else {
      const startTimes = ['', '09:00 AM', '09:50 AM', '11:00 AM', '11:50 AM', '01:50 PM', '02:40 PM', '03:30 PM'];
      const endTimes = ['', '09:50 AM', '10:40 AM', '11:50 AM', '12:40 PM', '02:40 PM', '03:30 PM', '04:20 PM'];
      return `${startTimes[period]} – ${endTimes[Math.min(7, period + numPeriods - 1)]}`;
    }
  };

  // ── Toggle All Present / Absent ──
  const handleToggleAll = (present: boolean) => {
    setStudentRecords((prev) => prev.map((s) => (s.is_exempt ? s : { ...s, is_present: present })));
  };

  // ── Toggle Individual Student ──
  const handleToggleStudent = (rollNumber: string) => {
    setStudentRecords((prev) =>
      prev.map((s) => (s.roll_number === rollNumber && !s.is_exempt ? { ...s, is_present: !s.is_present } : s))
    );
  };

  // ── Save Attendance Mutation ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubject) throw new Error('No subject selected');
      return api.saveAttendanceSession({
        allotment_id: selectedSubject.id,
        session_date: sessionDate,
        num_periods: numPeriods,
        period_start: periodStart,
        records: studentRecords.map((r) => ({
          roll_number: r.roll_number,
          is_present: r.is_exempt ? false : r.is_present,
        })),
      });
    },
    onSuccess: (res) => {
      // ── Invalidate ALL attendance-related queries so every view (student,
      //    parent, HOD, admin, faculty tracking, dashboard) updates immediately ──
      queryClient.invalidateQueries({ queryKey: ['studentAttendanceSummary'] });
      queryClient.invalidateQueries({ queryKey: ['studentDaywiseAttendance'] });
      queryClient.invalidateQueries({ queryKey: ['subjectAttendanceSummary'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceSessionsHistory'] });
      queryClient.invalidateQueries({ queryKey: ['semesterAttendanceSummary'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceTrackingAllotments'] });
      queryClient.invalidateQueries({ queryKey: ['myAttendanceSubjects'] });

      setSaveResult({
        message: res.message,
        presentCount: res.presentCount,
        totalCount: res.totalCount,
        subjectName: selectedSubject?.subject_name || '',
        numPeriods: numPeriods,
      });
      setCurrentStep(5);
    },
  });

  const presentCount = studentRecords.filter((s) => s.is_present && !s.is_exempt).length;
  const absentCount = studentRecords.filter((s) => !s.is_present && !s.is_exempt).length;

  const filteredStudents = studentRecords.filter((s) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return s.roll_number.toLowerCase().includes(q) || (s.student_name && s.student_name.toLowerCase().includes(q));
  });

  const handleReset = () => {
    setSelectedSemester(null);
    setSelectedSubject(null);
    setStudentRecords([]);
    setSaveResult(null);
    setCurrentStep(1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Wizard Progress Header */}
      <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-textPrimary flex items-center gap-2.5">
              <ClipboardCheck className="w-6 h-6 text-brand-primary" />
              Take Attendance Wizard
            </h1>
            <p className="text-xs text-textSecondary mt-0.5">
              5-Step Attendance recording for assigned faculty subjects with auto timetable matching.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 1 && currentStep < 5 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Start Over
              </button>
            )}
          </div>
        </div>

        {/* Step Indicators */}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {[
            { num: 1, label: 'Semester' },
            { num: 2, label: 'Subject' },
            { num: 3, label: 'Session' },
            { num: 4, label: 'Mark Roster' },
            { num: 5, label: 'Done' },
          ].map((s) => (
            <div
              key={s.num}
              className={`p-2 rounded-xl text-center border transition-all ${
                currentStep === s.num
                  ? 'bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-xs'
                  : currentStep > s.num
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold'
                  : 'bg-surface-2/40 border-borderLine text-textMuted'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold">Step {s.num}</div>
              <div className="text-xs font-bold truncate mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 1: SELECT SEMESTER
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5">
          <div>
            <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                1
              </span>
              Select Semester
            </h2>
            <p className="text-xs text-textSecondary mt-1">
              Choose the semester of the class you are currently holding.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {ALL_SEMESTERS.map((sem) => (
              <button
                key={sem.label}
                onClick={() => {
                  setSelectedSemester(sem.label);
                  setCurrentStep(2);
                }}
                className="group p-4 rounded-2xl bg-surface-2 hover:bg-surface-3 border border-borderLine hover:border-brand-primary/60 transition-all text-left flex flex-col justify-between hover:shadow-brand hover:-translate-y-0.5"
              >
                <span className="text-2xl font-black text-brand-primary group-hover:scale-105 transition-transform">
                  {sem.label}
                </span>
                <div className="mt-3">
                  <p className="text-xs font-bold text-textPrimary">{sem.desc}</p>
                  <p className="text-[11px] text-textMuted mt-0.5">Click to view subjects →</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 2: SELECT ALLOTTED SUBJECT
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 2 && selectedSemester && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                  2
                </span>
                Select Your Allotted Subject — Semester {selectedSemester}
              </h2>
              <p className="text-xs text-textSecondary mt-1">
                Showing only the subjects allotted to your login ({user?.email}) for this semester.
              </p>
            </div>
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          </div>

          {isLoadingSubjects ? (
            <div className="py-12 text-center text-textMuted">
              <div className="w-8 h-8 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading allotted subjects...
            </div>
          ) : mySubjects.length === 0 ? (
            <div className="p-8 rounded-xl bg-surface-2 border border-borderLine text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="text-sm font-bold text-textPrimary">No Allotted Subjects Found</h4>
              <p className="text-xs text-textSecondary max-w-md mx-auto">
                You do not have any subjects assigned for Semester {selectedSemester}. If this is an error, please contact your HOD or Admin to upload the allotment sheet.
              </p>
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 rounded-xl bg-surface-3 text-textPrimary font-semibold text-xs border border-borderLine hover:bg-surface-2 transition-all"
              >
                Choose Another Semester
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {mySubjects.map((sub: SubjectAllotment) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    setSelectedSubject(sub);
                    setCurrentStep(3);
                  }}
                  className="group p-5 rounded-2xl bg-surface-2 hover:bg-surface-3 border border-borderLine hover:border-brand-primary/60 transition-all text-left flex flex-col justify-between hover:shadow-brand hover:-translate-y-0.5"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            sub.subject_type === 'Lab'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-brand-soft text-brand-primary border border-brand-primary/30'
                          }`}
                        >
                          {sub.subject_type}
                        </span>
                        {['1-1', '1-2'].includes(selectedSemester || '') && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-pink-500/10 text-pink-400 border border-pink-500/30 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            1st Year Fresher
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-surface border border-borderLine text-textPrimary">
                        Section {sub.section}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-textPrimary group-hover:text-brand-primary transition-colors">
                      {sub.subject_name}
                    </h4>
                    <p className="text-xs text-textSecondary flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-textMuted" />
                      <span>{sub.roster_count || (['1-1', '1-2'].includes(selectedSemester || '') ? 'Section Enrolled' : 0)} Students</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-brand-primary font-bold mt-4 pt-3 border-t border-borderLine">
                    <span>Start Attendance</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 3: SESSION SETUP WITH TIMETABLE AUTO-DETECTION
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 3 && selectedSubject && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                  3
                </span>
                Session Configuration — {selectedSubject.subject_name} (Sec {selectedSubject.section})
              </h2>
              <p className="text-xs text-textSecondary mt-1">
                Configure session date, starting class period, and duration/session length.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {attachedPdfDoc && (
                <button
                  type="button"
                  onClick={() => setViewingPdfDoc({ name: attachedPdfDoc.file_name, data: attachedPdfDoc.file_data })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 transition-all"
                >
                  <FileText className="w-3.5 h-3.5 text-purple-400" /> View Timetable PDF
                </button>
              )}
              <button
                onClick={() => setCurrentStep(2)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          </div>

          {/* Timetable Auto-Match Card */}
          {matchedTimetableSlot && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-textPrimary">
                    ⚡ Auto-Detected Timetable Schedule ({todaySlotsData?.dayOfWeek})
                  </p>
                  <p className="text-[11px] text-textSecondary mt-0.5">
                    Period {matchedTimetableSlot.period_start} ({matchedTimetableSlot.timing_display}) • {matchedTimetableSlot.num_periods} Period(s) • {matchedTimetableSlot.subject_type}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => applyTimetableSlot(matchedTimetableSlot)}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold shadow hover:bg-cyan-400 transition-all self-start sm:self-auto shrink-0"
              >
                Use Scheduled Slot
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Date Picker */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-primary" /> Session Date
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full bg-surface-2 border border-borderLine rounded-xl px-3.5 py-2.5 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary font-mono"
              />
            </div>

            {/* Period Start */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-primary" /> Starting Period Slot
              </label>
              <select
                value={periodStart}
                onChange={(e) => setPeriodStart(parseInt(e.target.value))}
                className="w-full bg-surface-2 border border-borderLine rounded-xl px-3.5 py-2.5 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                  <option key={p} value={p}>
                    Period {p} ({p <= 3 ? 'Morning' : p === 4 ? 'Mid-Day' : 'Afternoon'})
                  </option>
                ))}
              </select>
            </div>

            {/* Session Length Options */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-brand-primary" /> Session Length ({selectedSubject.subject_type})
              </label>
              <div className="grid grid-cols-2 gap-2">
                {selectedSubject.subject_type === 'Theory' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setNumPeriods(1)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border ${
                        numPeriods === 1
                          ? 'bg-brand-primary text-white border-brand-primary shadow-brand'
                          : 'bg-surface-2 text-textSecondary border-borderLine hover:bg-surface-3'
                      }`}
                    >
                      1 Session (1 Period)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNumPeriods(2)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border ${
                        numPeriods === 2
                          ? 'bg-brand-primary text-white border-brand-primary shadow-brand'
                          : 'bg-surface-2 text-textSecondary border-borderLine hover:bg-surface-3'
                      }`}
                    >
                      2 Sessions (Double)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setNumPeriods(2)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border ${
                        numPeriods === 2
                          ? 'bg-brand-primary text-white border-brand-primary shadow-brand'
                          : 'bg-surface-2 text-textSecondary border-borderLine hover:bg-surface-3'
                      }`}
                    >
                      2 Sessions (Lab)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNumPeriods(3)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border ${
                        numPeriods === 3
                          ? 'bg-brand-primary text-white border-brand-primary shadow-brand'
                          : 'bg-surface-2 text-textSecondary border-borderLine hover:bg-surface-3'
                      }`}
                    >
                      3 Sessions (Extended)
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Holiday / Semester Lock Banner */}
          {matchedHoliday && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
              <CalendarOff className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-300">
                  Attendance Locked: Declared {matchedHoliday.type || 'Holiday'} ({matchedHoliday.title})
                </p>
                <p className="text-[11px] text-textSecondary mt-0.5">
                  Institutional academic activities are suspended on this date. Attendance cannot be recorded for holidays.
                </p>
              </div>
            </div>
          )}

          {!matchedHoliday && isOutsideSemesterRange && semesterCalendarWindow && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-300">
                  Attendance Locked: Date Outside Active Semester Window
                </p>
                <p className="text-[11px] text-textSecondary mt-0.5">
                  Selected date ({sessionDate}) is outside configured academic calendar dates for Sem {selectedSemester} ({typeof semesterCalendarWindow.start_date === 'string' ? semesterCalendarWindow.start_date.split('T')[0] : ''} to {typeof semesterCalendarWindow.end_date === 'string' ? semesterCalendarWindow.end_date.split('T')[0] : ''}).
                </p>
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-textPrimary">Timing Window: </span>
              <span className="text-textSecondary">
                Date: <strong className="text-brand-primary font-mono">{sessionDate}</strong> | Periods:{' '}
                <strong className="text-brand-primary font-mono">
                  {periodStart} to {Math.min(7, periodStart + numPeriods - 1)}
                </strong>{' '}
                ({getPeriodTimingLabel(periodStart)})
              </span>
            </div>
            <button
              onClick={() => setCurrentStep(4)}
              disabled={isDateLocked}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDateLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5" /> Date Locked for Attendance
                </>
              ) : (
                <>
                  Load Student Roster <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 4: MARK ATTENDANCE
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 4 && selectedSubject && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                  4
                </span>
                Mark Roster — {selectedSubject.subject_name} (Sec {selectedSubject.section})
              </h2>
              <p className="text-xs text-textSecondary mt-0.5">
                All students are marked Present by default. Uncheck absentees. Late joined students prior to their join date are exempt.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(3)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          </div>

          {/* Quick Actions & Live Counters */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-surface-2 border border-borderLine">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleToggleAll(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
              >
                <Check className="w-3.5 h-3.5" /> Mark All Present
              </button>
              <button
                onClick={() => handleToggleAll(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all"
              >
                <X className="w-3.5 h-3.5" /> Mark All Absent
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Present: {presentCount}
              </span>
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Absent: {absentCount}
              </span>
              <span className="text-textSecondary">Total Active: {studentRecords.filter(s => !s.is_exempt).length}</span>
            </div>
          </div>

          {/* Search Roll Number */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              placeholder="Search by Roll Number or Student Name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-surface-2 border border-borderLine rounded-xl pl-10 pr-4 py-2.5 text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Roster Grid / Table */}
          {isLoadingRoster ? (
            <div className="py-12 text-center text-textMuted">
              <div className="w-8 h-8 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading student roster...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 rounded-xl bg-surface-2 border border-borderLine text-center text-textMuted text-xs">
              No students found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
              {filteredStudents.map((student) => {
                const isPresent = student.is_present;
                const isExempt = student.is_exempt;

                if (isExempt) {
                  return (
                    <div
                      key={student.roll_number}
                      className="p-3 rounded-xl border border-borderLine bg-surface-2/40 opacity-60 flex items-center justify-between"
                      title={`Student joined this subject on ${student.joining_date}, after the session date.`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-mono font-bold text-xs text-textPrimary truncate">{student.roll_number}</p>
                        {student.student_name && (
                          <p className="text-[11px] text-textSecondary truncate">{student.student_name}</p>
                        )}
                        <span className="text-[9px] text-purple-400 font-semibold">Exempt (Joined {student.joining_date})</span>
                      </div>
                      <div className="px-2 py-1 bg-surface-3 text-[10px] text-textMuted font-bold rounded">
                        EXEMPT
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={student.roll_number}
                    onClick={() => handleToggleStudent(student.roll_number)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                      isPresent
                        ? 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15'
                        : 'bg-red-500/10 border-red-500/40 hover:bg-red-500/15'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-mono font-bold text-xs text-textPrimary truncate">{student.roll_number}</p>
                      {student.student_name && (
                        <p className="text-[11px] text-textSecondary truncate">{student.student_name}</p>
                      )}
                      {student.joining_date && (
                        <span className="text-[9px] text-purple-400">Joined: {student.joining_date}</span>
                      )}
                    </div>

                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                        isPresent ? 'bg-emerald-500 text-white shadow-xs' : 'bg-red-500 text-white shadow-xs'
                      }`}
                    >
                      {isPresent ? 'P' : 'A'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit Attendance */}
          <div className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-textSecondary">
              Ready to commit <strong className="text-textPrimary">{presentCount}</strong> present out of{' '}
              <strong className="text-textPrimary">{studentRecords.length}</strong> students for{' '}
              <strong className="text-brand-primary">{numPeriods} session(s)</strong>.
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || studentRecords.length === 0}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-50 w-full sm:w-auto justify-center"
            >
              {saveMutation.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving Attendance...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Save & Commit Attendance
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 5: CONFIRMATION SUMMARY
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 5 && saveResult && (
        <div className="p-8 rounded-2xl bg-surface border border-borderLine text-center space-y-6 shadow-brand">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-textPrimary">Attendance Successfully Saved!</h2>
            <p className="text-sm font-semibold text-emerald-400">{saveResult.message}</p>
          </div>

          {/* Summary Box */}
          <div className="max-w-md mx-auto p-4 rounded-xl bg-surface-2 border border-borderLine grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <p className="text-textMuted font-medium">Session Length</p>
              <p className="text-base font-black text-textPrimary font-mono mt-0.5">{saveResult.numPeriods} Period(s)</p>
            </div>
            <div>
              <p className="text-textMuted font-medium">Present</p>
              <p className="text-base font-black text-emerald-400 font-mono mt-0.5">{saveResult.presentCount}</p>
            </div>
            <div>
              <p className="text-textMuted font-medium">Total Roster</p>
              <p className="text-base font-black text-textPrimary font-mono mt-0.5">{saveResult.totalCount}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 shadow-brand transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> Take Another Attendance
            </button>
            <button
              onClick={() => navigate('/faculty/dashboard?tab=attendance')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-2 text-textPrimary text-xs font-semibold hover:bg-surface-3 border border-borderLine transition-all"
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> View Attendance Records
            </button>
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
    </div>
  );
};
