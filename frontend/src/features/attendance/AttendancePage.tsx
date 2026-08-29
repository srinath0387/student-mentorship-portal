import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, CheckCircle2, Calendar, Clock, BookOpen, Users,
  Search, Check, X, ArrowRight, ArrowLeft, RotateCcw, AlertCircle,
  Sparkles, Zap, FileText, Download, Lock, CalendarOff, AlertTriangle,
  Edit, CheckSquare, Square
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
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const urlSem = searchParams.get('sem') as SemesterLabel | null;
  const urlSec = searchParams.get('sec') || '';
  const urlSubj = searchParams.get('subj') || '';
  const urlDate = searchParams.get('date') || '';
  const urlPeriod = searchParams.get('period') ? parseInt(searchParams.get('period')!) : 1;

  // ── Form Selection State (Matches dsattendance mark_attendance.php filter bar) ──
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel | ''>(urlSem || '');
  const [selectedSection, setSelectedSection] = useState<string>(urlSec || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>(urlDate || new Date().toISOString().split('T')[0]);
  const [isLoaded, setIsLoaded] = useState<boolean>(Boolean(urlSem && urlSubj));

  const [periodStart, setPeriodStart] = useState<number>(urlPeriod || 1);
  const [numPeriods, setNumPeriods] = useState<number>(1);

  // Hour enable toggles (ported from dsattendance enable_hour1, enable_hour2, enable_hour3)
  const [enableHour1, setEnableHour1] = useState<boolean>(true);
  const [enableHour2, setEnableHour2] = useState<boolean>(false);
  const [enableHour3, setEnableHour3] = useState<boolean>(false);

  // Search filter inside roster
  const [searchFilter, setSearchFilter] = useState('');
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Student Attendance Records
  const [studentRecords, setStudentRecords] = useState<{
    roll_number: string;
    student_name?: string;
    joining_date?: string;
    hour1: boolean;
    hour2: boolean;
    hour3: boolean;
    is_exempt?: boolean;
    is_on_od?: boolean;
    od_type?: string;
    od_reason?: string;
  }[]>([]);

  // Confirmation message banner
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ── Fetch Faculty Allotted Subjects for selected semester ──
  const { data: mySubjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['myAttendanceSubjects', selectedSemester],
    queryFn: () => (selectedSemester ? api.getMyAttendanceSubjects(selectedSemester) : Promise.resolve([])),
    enabled: Boolean(selectedSemester),
  });

  // Distinct sections available for this semester from my allotted subjects
  const availableSections = useMemo(() => {
    const secs = new Set<string>();
    mySubjects.forEach((s: SubjectAllotment) => {
      if (s.section) secs.add(s.section);
    });
    return Array.from(secs).sort();
  }, [mySubjects]);

  // Filter subjects matching selected section
  const filteredSubjects = useMemo(() => {
    if (!selectedSection) return mySubjects;
    return mySubjects.filter((s: SubjectAllotment) => s.section.toUpperCase() === selectedSection.toUpperCase());
  }, [mySubjects, selectedSection]);

  // Selected subject object
  const activeSubject = useMemo(() => {
    return mySubjects.find((s: SubjectAllotment) => s.id === selectedSubjectId) || null;
  }, [mySubjects, selectedSubjectId]);

  // Auto-match subject from URL params
  useEffect(() => {
    if (urlSubj && mySubjects.length > 0 && !selectedSubjectId) {
      const match = mySubjects.find(
        (s: SubjectAllotment) =>
          s.subject_name.toLowerCase().includes(urlSubj.toLowerCase()) &&
          (!urlSec || s.section.toUpperCase() === urlSec.toUpperCase())
      );
      if (match) {
        setSelectedSubjectId(match.id);
        if (match.section) setSelectedSection(match.section);
        setIsLoaded(true);
      }
    }
  }, [urlSubj, urlSec, mySubjects, selectedSubjectId]);

  // ── Fetch Today's Timetable Slots for auto-detection ──
  const { data: todaySlotsData } = useQuery({
    queryKey: ['todayTimetableSlots', selectedSemester, selectedSection, sessionDate, user?.email],
    queryFn: () => (selectedSemester && selectedSection ? api.getTodayTimetableSlots({
      semester: selectedSemester,
      section: selectedSection,
      date: sessionDate,
      faculty_email: user?.email,
    }) : Promise.resolve({ slots: [] })),
    enabled: Boolean(selectedSemester && selectedSection && isLoaded),
  });

  // Auto-apply timetable slot if found
  useEffect(() => {
    if (todaySlotsData?.slots && todaySlotsData.slots.length > 0 && isLoaded) {
      const matchedSlot = todaySlotsData.slots.find(
        (slot: any) =>
          activeSubject &&
          (slot.subject_name || '').toLowerCase() === (activeSubject.subject_name || '').toLowerCase()
      ) || todaySlotsData.slots[0];

      if (matchedSlot) {
        setPeriodStart(parseInt(matchedSlot.period_start));
        const span = parseInt(matchedSlot.num_periods || 1);
        setNumPeriods(span);
        setEnableHour1(true);
        setEnableHour2(span >= 2);
        setEnableHour3(span >= 3);
      }
    }
  }, [todaySlotsData, activeSubject, isLoaded]);

  // ── Fetch Roster for selected subject and session date ──
  const { data: roster = [], isLoading: isLoadingRoster, refetch: refetchRoster } = useQuery({
    queryKey: ['subjectRosterForAttendance', selectedSubjectId, sessionDate],
    queryFn: () => (selectedSubjectId ? api.getRoster(selectedSubjectId, sessionDate) : Promise.resolve([])),
    enabled: Boolean(selectedSubjectId && isLoaded),
  });

  // ── Fetch Existing Sessions to Check Already Posted / Same-Day Edit ──
  const { data: existingSessions = [] } = useQuery({
    queryKey: ['existingAttendanceSessions', selectedSubjectId, sessionDate],
    queryFn: () => (selectedSubjectId ? api.getAttendanceSessions(selectedSubjectId, sessionDate, sessionDate) : Promise.resolve([])),
    enabled: Boolean(selectedSubjectId && isLoaded),
  });

  const alreadyPostedSession = existingSessions.length > 0 ? existingSessions[0] : null;
  const isAlreadyPosted = Boolean(alreadyPostedSession);
  const todayStr = new Date().toISOString().split('T')[0];
  const canEditToday = isAlreadyPosted && sessionDate === todayStr;

  // ── Fetch Single Session Details if editing/already posted ──
  const { data: existingSessionDetails } = useQuery({
    queryKey: ['existingSessionDetails', alreadyPostedSession?.id],
    queryFn: () => (alreadyPostedSession?.id ? api.getSessionDetails(alreadyPostedSession.id) : Promise.resolve(null)),
    enabled: Boolean(alreadyPostedSession?.id),
  });

  // ── Fetch Holidays and Academic Calendar ──
  const { data: holidays = [] } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

  const matchedHoliday = useMemo(() => {
    return holidays.find((h) => {
      const hDate = typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0];
      return hDate === sessionDate;
    });
  }, [holidays, sessionDate]);

  // ── Fetch Pending Timetable Slots for Logged-In Faculty ──
  const { data: facultyPendingData } = useQuery({
    queryKey: ['facultyPendingAttendanceToday', user?.email],
    queryFn: () => api.getNotPostedAttendance({ faculty_email: user?.email }),
    enabled: Boolean(user?.email && user?.role === 'faculty'),
  });

  // Populate student list when roster or existing session loads
  useEffect(() => {
    if (roster && roster.length > 0) {
      const existingMap = new Map<string, boolean>();
      if (existingSessionDetails?.records) {
        existingSessionDetails.records.forEach((r: any) => {
          existingMap.set(r.roll_number.toUpperCase(), Boolean(r.is_present));
        });
      }

      setStudentRecords(
        roster.map((r: SubjectRosterEntry) => {
          const joinDate = r.joining_date ? new Date(r.joining_date).toISOString().split('T')[0] : '';
          const isExempt = Boolean(joinDate && sessionDate < joinDate);
          const isOnOD = Boolean(r.is_on_od);

          const defaultPresent = existingMap.has(r.roll_number.toUpperCase())
            ? existingMap.get(r.roll_number.toUpperCase())!
            : true;

          return {
            roll_number: r.roll_number,
            student_name: r.student_name,
            joining_date: joinDate,
            hour1: isExempt ? false : (isOnOD ? true : defaultPresent),
            hour2: isExempt ? false : (isOnOD ? true : defaultPresent),
            hour3: isExempt ? false : (isOnOD ? true : defaultPresent),
            is_exempt: isExempt,
            is_on_od: isOnOD,
            od_type: r.od_type,
            od_reason: r.od_reason,
          };
        })
      );
    }
  }, [roster, existingSessionDetails, sessionDate]);

  // ── Mark All Present ──
  const markAllPresent = () => {
    setStudentRecords(prev =>
      prev.map(s => (s.is_exempt ? s : { ...s, hour1: true, hour2: true, hour3: true }))
    );
  };

  // ── Mark All Absent ──
  const markAllAbsent = () => {
    setStudentRecords(prev =>
      prev.map(s => (s.is_exempt ? s : s.is_on_od ? s : { ...s, hour1: false, hour2: false, hour3: false }))
    );
  };

  // ── Toggle Individual Hour ──
  const toggleStudentHour = (roll: string, hourNum: 1 | 2 | 3) => {
    if (isAlreadyPosted && !editMode) return;
    setStudentRecords(prev =>
      prev.map(s => {
        if (s.roll_number === roll) {
          if (s.is_exempt || s.is_on_od) return s;
          if (hourNum === 1) return { ...s, hour1: !s.hour1 };
          if (hourNum === 2) return { ...s, hour2: !s.hour2 };
          if (hourNum === 3) return { ...s, hour3: !s.hour3 };
        }
        return s;
      })
    );
  };

  // ── Save / Update Attendance Mutation ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeSubject) throw new Error('Please select a subject');

      const activeHourCount = (enableHour1 ? 1 : 0) + (enableHour2 ? 1 : 0) + (enableHour3 ? 1 : 0);
      const totalSpan = Math.max(1, activeHourCount);

      const records = studentRecords.map(r => ({
        roll_number: r.roll_number,
        is_present: r.is_exempt ? false : (r.is_on_od || (enableHour1 && r.hour1) || (enableHour2 && r.hour2) || (enableHour3 && r.hour3)),
      }));

      if (isAlreadyPosted && editMode && alreadyPostedSession?.id) {
        return api.updateAttendanceSession(alreadyPostedSession.id, records);
      } else {
        return api.saveAttendanceSession({
          allotment_id: activeSubject.id,
          session_date: sessionDate,
          num_periods: totalSpan,
          period_start: periodStart,
          records,
        });
      }
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['existingAttendanceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['existingSessionDetails'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPeriodGrid'] });
      queryClient.invalidateQueries({ queryKey: ['notPostedAttendanceData'] });
      queryClient.invalidateQueries({ queryKey: ['studentAttendanceSummary'] });

      setShowAbsentModal(false);
      setEditMode(false);
      setFeedbackMsg({
        type: 'success',
        text: isAlreadyPosted && editMode ? 'Attendance updated successfully.' : 'Attendance saved successfully.',
      });
    },
    onError: (err: any) => {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to save attendance.',
      });
    },
  });

  // Calculate absentees
  const absentStudents = studentRecords.filter(
    s => !s.is_exempt && !s.is_on_od && (!s.hour1 || (enableHour2 && !s.hour2) || (enableHour3 && !s.hour3))
  );

  const presentCount = studentRecords.length - absentStudents.length;

  return (
    <div className="space-y-5">
      {/* ── Page Header (dsattendance style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-borderLine rounded-2xl p-5 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-1">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Attendance Management
          </div>
          <h1 className="text-xl font-black text-textPrimary">Mark Student Attendance</h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Select your class, section, and subject to mark period-wise attendance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-2 border border-borderLine text-textSecondary flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-primary" />
            Today: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── Pending Timetable Banner (Alert if classes missed) ── */}
      {Array.isArray(facultyPendingData?.pendingSlots) && facultyPendingData.pendingSlots.length > 0 && !isLoaded && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <h3 className="text-sm font-bold text-textPrimary">
                You have {facultyPendingData.pendingSlots.length} scheduled class(es) pending attendance entry today:
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
              Pending Today
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {facultyPendingData.pendingSlots.map((slot: any, idx: number) => (
              <div
                key={idx}
                onClick={() => {
                  setSelectedSemester(slot.semester_label);
                  setSelectedSection(slot.section || '');
                  setPeriodStart(parseInt(slot.period_start));
                  setNumPeriods(parseInt(slot.num_periods || 1));
                  setSessionDate(todayStr);

                  const match = mySubjects.find(
                    (s: SubjectAllotment) =>
                      s.semester_label === slot.semester_label &&
                      s.section.toUpperCase() === (slot.section || '').toUpperCase() &&
                      s.subject_name.toLowerCase().includes((slot.subject_name || '').toLowerCase())
                  );
                  if (match) {
                    setSelectedSubjectId(match.id);
                  }
                  setIsLoaded(true);
                }}
                className="bg-surface border border-rose-500/20 hover:border-rose-500/60 p-3 rounded-xl transition-all cursor-pointer hover:shadow-sm group flex items-center justify-between"
              >
                <div>
                  <div className="text-[11px] font-bold text-rose-400">
                    Period {slot.period_start} ({slot.semester_label} - Sec {slot.section})
                  </div>
                  <div className="text-xs font-semibold text-textPrimary truncate max-w-[180px]">
                    {slot.subject_name}
                  </div>
                </div>
                <span className="text-xs text-rose-400 font-bold group-hover:translate-x-1 transition-transform">
                  Load →
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Feedback Message Banner ── */}
      {feedbackMsg && (
        <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : feedbackMsg.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="opacity-70 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* ── Top Filter Bar Form (Ported 1-to-1 from dsattendance mark_attendance.php) ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Class / Semester */}
          <div>
            <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">Class / Semester</label>
            <select
              value={selectedSemester}
              onChange={e => {
                setSelectedSemester(e.target.value as SemesterLabel);
                setSelectedSubjectId('');
                setIsLoaded(false);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">Select Class</option>
              {ALL_SEMESTERS.map(sem => (
                <option key={sem.label} value={sem.label}>
                  {sem.label} ({sem.desc})
                </option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">Section</label>
            <select
              value={selectedSection}
              onChange={e => {
                setSelectedSection(e.target.value);
                setSelectedSubjectId('');
                setIsLoaded(false);
              }}
              disabled={!selectedSemester}
              className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:opacity-50"
            >
              <option value="">Select Section</option>
              {availableSections.length > 0 ? (
                availableSections.map(sec => (
                  <option key={sec} value={sec}>
                    Section {sec}
                  </option>
                ))
              ) : (
                ['A', 'B', 'C', 'D', 'E', 'F'].map(sec => (
                  <option key={sec} value={sec}>
                    Section {sec}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={e => {
                setSelectedSubjectId(e.target.value);
                setIsLoaded(false);
              }}
              disabled={!selectedSemester}
              className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:opacity-50"
            >
              <option value="">Select Subject</option>
              {filteredSubjects.map((sub: SubjectAllotment) => (
                <option key={sub.id} value={sub.id}>
                  {sub.subject_name} ({sub.subject_type})
                </option>
              ))}
            </select>
          </div>

          {/* Attendance Date */}
          <div>
            <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">Attendance Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary cursor-pointer"
            />
          </div>

          {/* Load Students Button */}
          <div className="flex items-end">
            <button
              onClick={() => {
                if (!selectedSemester || !selectedSubjectId) {
                  setFeedbackMsg({ type: 'error', text: 'Please select class and subject before loading students.' });
                  return;
                }
                setIsLoaded(true);
                setEditMode(false);
              }}
              disabled={!selectedSemester || !selectedSubjectId}
              className="w-full py-2 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Load Students</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Holiday Warning ── */}
      {matchedHoliday && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-center space-y-1">
          <CalendarOff className="w-8 h-8 text-amber-400 mx-auto" />
          <h4 className="text-sm font-bold text-textPrimary">Attendance Not Required</h4>
          <p className="text-xs text-textSecondary">
            <b>{new Date(sessionDate).toLocaleDateString('en-GB')}</b> is marked as declared holiday: <b>{matchedHoliday.title}</b> ({matchedHoliday.type}).
          </p>
        </div>
      )}

      {/* ── Loaded Session Info Box & Student Table (Matches dsattendance layout) ── */}
      {isLoaded && activeSubject && !matchedHoliday && (
        <div className="space-y-4 animate-fade-in">
          {/* Info Card Strip */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-borderLine text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold text-textPrimary">
                <span><b>Class:</b> {selectedSemester}</span>
                <span><b>Section:</b> {selectedSection || activeSubject.section || 'All'}</span>
                <span><b>Subject:</b> <span className="text-brand-primary font-bold">{activeSubject.subject_name}</span> ({activeSubject.subject_type})</span>
                <span><b>Date:</b> {new Date(sessionDate).toLocaleDateString('en-GB')}</span>
              </div>

              {/* Status Badge */}
              <div>
                {isAlreadyPosted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[11px] border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Attendance Already Posted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 font-bold text-[11px] border border-blue-500/20">
                    <Clock className="w-3.5 h-3.5" />
                    Ready for Marking
                  </span>
                )}
              </div>
            </div>

            {/* Timetable Period & Multi-Hour Checkboxes */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-textMuted uppercase">Timetable Period:</span>
                <span className="text-xs font-bold text-textPrimary bg-surface-2 px-2.5 py-1 rounded-lg border border-borderLine">
                  Period {periodStart} {numPeriods > 1 ? `to ${periodStart + numPeriods - 1}` : ''}
                </span>

                {/* Multi-Hour Enable Checkboxes (dsattendance feature) */}
                <div className="flex items-center gap-2 pl-2 border-l border-borderLine">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-textPrimary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableHour1}
                      onChange={e => setEnableHour1(e.target.checked)}
                      disabled={isAlreadyPosted && !editMode}
                      className="w-4 h-4 rounded text-brand-primary cursor-pointer"
                    />
                    <span>Hour 1</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs font-bold text-textPrimary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableHour2}
                      onChange={e => setEnableHour2(e.target.checked)}
                      disabled={isAlreadyPosted && !editMode}
                      className="w-4 h-4 rounded text-brand-primary cursor-pointer"
                    />
                    <span>Hour 2</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs font-bold text-textPrimary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableHour3}
                      onChange={e => setEnableHour3(e.target.checked)}
                      disabled={isAlreadyPosted && !editMode}
                      className="w-4 h-4 rounded text-brand-primary cursor-pointer"
                    />
                    <span>Hour 3</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons: All Present, All Absent, Edit Attendance */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={markAllPresent}
                  disabled={isAlreadyPosted && !editMode}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-40"
                >
                  All Present
                </button>

                <button
                  type="button"
                  onClick={markAllAbsent}
                  disabled={isAlreadyPosted && !editMode}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-40"
                >
                  All Absent
                </button>

                {/* Same-Day Edit Button (from dsattendance) */}
                {isAlreadyPosted && !editMode && (
                  canEditToday ? (
                    <button
                      type="button"
                      onClick={() => setEditMode(true)}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit Attendance</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="px-3 py-1.5 rounded-xl bg-surface-2 border border-borderLine text-textMuted font-bold text-xs opacity-50 cursor-not-allowed flex items-center gap-1"
                      title="Past date attendance is locked. Contact HOD/Admin for corrections."
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Past Date Locked</span>
                    </button>
                  )
                )}

                {editMode && (
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-borderLine text-textPrimary font-bold text-xs transition-all cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Student Roster Table ── */}
          {isLoadingRoster ? (
            <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center text-xs text-textMuted flex flex-col items-center gap-2">
              <span className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading student roster...</span>
            </div>
          ) : studentRecords.length === 0 ? (
            <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center text-xs text-textMuted space-y-2">
              <Users className="w-8 h-8 mx-auto text-textMuted opacity-50" />
              <p className="font-bold text-textPrimary">No students enrolled in this subject roster.</p>
              <p>Upload student roster in Attendance Management tab or contact your department admin.</p>
            </div>
          ) : (
            <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm space-y-0">
              {/* Table Search & Stats Strip */}
              <div className="p-3 bg-surface-2 border-b border-borderLine flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-textPrimary">
                    Enrolled Students: <span className="text-brand-primary">{studentRecords.length}</span>
                  </span>
                  <span className="text-emerald-400 font-bold">
                    Present: {presentCount}
                  </span>
                  <span className="text-rose-400 font-bold">
                    Absent: {absentStudents.length}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-surface px-3 py-1 rounded-xl border border-borderLine text-xs w-64">
                  <Search className="w-3.5 h-3.5 text-textMuted shrink-0" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="Search roll number or name..."
                    className="w-full bg-transparent text-textPrimary focus:outline-none"
                  />
                </div>
              </div>

              {/* Roster Table (Ported dsattendance green present-row styling) */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5 w-12 text-center">#</th>
                      <th className="px-4 py-2.5">Roll Number</th>
                      <th className="px-4 py-2.5">Student Name</th>
                      {enableHour1 && <th className="px-4 py-2.5 text-center">Hour 1</th>}
                      {enableHour2 && <th className="px-4 py-2.5 text-center">Hour 2</th>}
                      {enableHour3 && <th className="px-4 py-2.5 text-center">Hour 3</th>}
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {studentRecords
                      .filter(s => {
                        const q = searchFilter.toLowerCase();
                        return !q || s.roll_number.toLowerCase().includes(q) || (s.student_name || '').toLowerCase().includes(q);
                      })
                      .map((student, idx) => {
                        const isPresent = student.hour1 || (enableHour2 && student.hour2) || (enableHour3 && student.hour3);

                        return (
                          <tr
                            key={student.roll_number}
                            className={`transition-colors ${
                              student.is_exempt
                                ? 'opacity-40 bg-surface-2/20'
                                : student.is_on_od
                                ? 'bg-purple-500/10'
                                : isPresent
                                ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                                : 'bg-rose-500/5 hover:bg-rose-500/10'
                            }`}
                          >
                            <td className="px-4 py-2.5 text-center font-mono text-textMuted">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-mono font-bold text-textPrimary">
                              {student.roll_number}
                            </td>
                            <td className="px-4 py-2.5 text-textPrimary font-semibold">
                              {student.student_name || '—'}
                            </td>

                            {/* Hour 1 Checkbox */}
                            {enableHour1 && (
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={student.hour1}
                                  onChange={() => toggleStudentHour(student.roll_number, 1)}
                                  disabled={(isAlreadyPosted && !editMode) || student.is_exempt || student.is_on_od}
                                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                            )}

                            {/* Hour 2 Checkbox */}
                            {enableHour2 && (
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={student.hour2}
                                  onChange={() => toggleStudentHour(student.roll_number, 2)}
                                  disabled={(isAlreadyPosted && !editMode) || student.is_exempt || student.is_on_od}
                                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                            )}

                            {/* Hour 3 Checkbox */}
                            {enableHour3 && (
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={student.hour3}
                                  onChange={() => toggleStudentHour(student.roll_number, 3)}
                                  disabled={(isAlreadyPosted && !editMode) || student.is_exempt || student.is_on_od}
                                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                            )}

                            {/* Status Tag */}
                            <td className="px-4 py-2.5 text-center">
                              {student.is_exempt ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-2 text-textMuted">Exempt</span>
                              ) : student.is_on_od ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">On Duty (OD)</span>
                              ) : isPresent ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">Present</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">Absent</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Action Footer */}
              <div className="p-4 bg-surface-2 border-t border-borderLine flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-textSecondary">
                  {absentStudents.length === 0 ? (
                    <span className="text-emerald-400 font-bold">✓ All {studentRecords.length} students are marked Present.</span>
                  ) : (
                    <span className="text-rose-400 font-bold">{absentStudents.length} student(s) marked Absent.</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAbsentModal(true)}
                  disabled={isAlreadyPosted && !editMode}
                  className="px-6 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isAlreadyPosted && editMode ? 'Review & Update Attendance' : 'Review & Submit Attendance'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Absentee Review Modal (Ported from dsattendance absent-modal-box) ── */}
      {showAbsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden space-y-0 animate-scale-up">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Review Attendance Summary</h3>
                <p className="text-xs text-rose-100 mt-0.5">
                  {activeSubject?.subject_name} ({selectedSemester} - Sec {selectedSection || activeSubject?.section})
                </p>
              </div>
              <button
                onClick={() => setShowAbsentModal(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Absent Count Card */}
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-center">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Total Absent Count</span>
                <div className="text-4xl font-black text-rose-500 mt-1">{absentStudents.length}</div>
                <div className="text-xs text-textMuted mt-1">
                  Out of {studentRecords.length} enrolled students ({presentCount} Present)
                </div>
              </div>

              {/* List of Absentee Roll Numbers */}
              {absentStudents.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textPrimary">Absent Student Roll Numbers:</label>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-xl bg-surface-2 border border-borderLine">
                    {absentStudents.map(s => (
                      <span
                        key={s.roll_number}
                        className="px-2.5 py-1 rounded-lg bg-rose-500 text-white font-mono font-bold text-xs shadow-xs"
                      >
                        {s.roll_number}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-emerald-400 font-bold text-xs">
                  🎉 100% Attendance — All students marked Present!
                </div>
              )}

              <div className="bg-surface-2 p-3 rounded-xl border border-borderLine text-xs text-textSecondary">
                <b>Date:</b> {new Date(sessionDate).toLocaleDateString('en-GB')} | <b>Period:</b> Period {periodStart} ({numPeriods} hour session)
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-surface-2 border-t border-borderLine flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAbsentModal(false)}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-3 border border-borderLine text-textSecondary hover:text-textPrimary text-xs font-bold cursor-pointer"
              >
                Back to Edit
              </button>

              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="px-5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {saveMutation.isPending ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{isAlreadyPosted && editMode ? 'Confirm & Update' : 'Confirm & Save Attendance'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
