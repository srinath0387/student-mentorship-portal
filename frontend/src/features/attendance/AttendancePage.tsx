import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Users, Calendar, CheckCircle2, Clock, FileText, Check,
  X, AlertCircle, AlertTriangle, Printer, Search, Lock, Edit2, Plus,
  ChevronRight, LogOut, LayoutDashboard, CheckSquare, Square
} from 'lucide-react';
import { api } from '../../lib/api';
import { SemesterLabel, SubjectAllotment, SubjectRosterEntry, TimetableEntry } from '../../types';
import { useAuth } from '../../context/AuthContext';

const ALL_SEMESTERS: SemesterLabel[] = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
const PERIOD_TIMINGS: Record<number, string> = {
  1: '09:00 AM - 09:50 AM',
  2: '09:50 AM - 10:40 AM',
  3: '10:55 AM - 11:45 AM',
  4: '11:45 AM - 12:35 PM',
  5: '01:50 PM - 02:40 PM',
  6: '02:40 PM - 03:30 PM',
  7: '03:30 PM - 04:20 PM',
};

export const AttendancePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Active view in the portal (matching dsattendance sidebar navigation)
  const [activeNav, setActiveNav] = useState<'dashboard' | 'mark' | 'not_posted' | 'reports' | 'timetable'>('dashboard');

  // ── Mark Attendance State ──
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel | ''>('2-1');
  const [selectedSection, setSelectedSection] = useState<string>('B');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [enableHour1, setEnableHour1] = useState(true);
  const [enableHour2, setEnableHour2] = useState(true);
  const [enableHour3, setEnableHour3] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showAbsentModal, setShowAbsentModal] = useState(false);

  // Student Attendance Records
  const [studentRecords, setStudentRecords] = useState<{
    roll_number: string;
    student_name?: string;
    hour1: boolean;
    hour2: boolean;
    hour3: boolean;
    is_on_od?: boolean;
    od_reason?: string;
  }[]>([]);

  // ── Reports Tab State ──
  const [reportSubjectId, setReportSubjectId] = useState<string>('All');
  const [reportSection, setReportSection] = useState<string>('All');
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');

  // ── QUERIES ──
  // Fetch All Allotted Subjects for this faculty
  const { data: rawMySubjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['myAttendanceSubjectsAll'],
    queryFn: () => api.getMyAttendanceSubjects().catch(() => []),
  });
  const mySubjects: SubjectAllotment[] = Array.isArray(rawMySubjects) ? rawMySubjects : [];

  // Filtered sections for selected semester in Mark Attendance
  const availableSections = useMemo(() => {
    const secs = new Set<string>();
    mySubjects.forEach(s => {
      if (!selectedSemester || s.semester_label === selectedSemester) {
        if (s.section) secs.add(s.section);
      }
    });
    return Array.from(secs).sort();
  }, [mySubjects, selectedSemester]);

  // Filtered subjects for semester + section
  const availableSubjects = useMemo(() => {
    return mySubjects.filter(s => {
      const semMatch = !selectedSemester || s.semester_label === selectedSemester;
      const secMatch = !selectedSection || s.section.toUpperCase() === selectedSection.toUpperCase();
      return semMatch && secMatch;
    });
  }, [mySubjects, selectedSemester, selectedSection]);

  const activeSubject = useMemo(() => {
    return mySubjects.find(s => s.id === selectedSubjectId) || null;
  }, [mySubjects, selectedSubjectId]);

  // Fetch Roster for Mark Attendance
  const { data: rawRoster = [], isLoading: isLoadingRoster } = useQuery({
    queryKey: ['attendanceRoster', selectedSubjectId, sessionDate],
    queryFn: () => (selectedSubjectId ? api.getRoster(selectedSubjectId, sessionDate).catch(() => []) : Promise.resolve([])),
    enabled: Boolean(selectedSubjectId && isLoaded),
  });
  const currentRoster: SubjectRosterEntry[] = Array.isArray(rawRoster) ? rawRoster : [];

  // Fetch Existing Sessions for Today / Subject to check if already posted
  const { data: rawSessions = [] } = useQuery({
    queryKey: ['attendanceSessions', selectedSubjectId, sessionDate],
    queryFn: () => (selectedSubjectId && sessionDate ? api.getAttendanceSessions(selectedSubjectId, sessionDate, sessionDate).catch(() => []) : Promise.resolve([])),
    enabled: Boolean(selectedSubjectId && sessionDate && isLoaded),
  });
  const existingSessions = Array.isArray(rawSessions) ? rawSessions : [];
  const existingSession = existingSessions.length > 0 ? existingSessions[0] : null;
  const isAlreadyPosted = Boolean(existingSession);

  // Fetch Session Details for Edit Mode
  const { data: sessionDetails } = useQuery({
    queryKey: ['attendanceSessionDetails', existingSession?.id],
    queryFn: () => (existingSession?.id ? api.getSessionDetails(existingSession.id).catch(() => null) : Promise.resolve(null)),
    enabled: Boolean(existingSession?.id && isAlreadyPosted),
  });

  // Fetch Faculty's Timetable Today
  const todayDayName = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  }, []);

  const { data: rawTodaySlots = [] } = useQuery({
    queryKey: ['facultyTodayTimetable', user?.email, todayDayName],
    queryFn: () => (user?.email ? api.getTimetable({ day: todayDayName }).catch(() => []) : Promise.resolve([])),
  });
  const facultyTodaySlots = useMemo(() => {
    if (!Array.isArray(rawTodaySlots)) return [];
    return rawTodaySlots.filter((t: TimetableEntry) => t.faculty_email?.toLowerCase() === user?.email?.toLowerCase());
  }, [rawTodaySlots, user?.email]);

  // Fetch Missing / Not Posted Attendance
  const { data: rawNotPosted = [] } = useQuery({
    queryKey: ['facultyNotPostedAttendance', user?.email],
    queryFn: () => api.getNotPostedAttendance({ faculty_email: user?.email }).catch(() => []),
  });
  const notPostedSlots = Array.isArray(rawNotPosted) ? rawNotPosted : [];

  // Initialize Student Records Table when Roster or Session Details change
  useEffect(() => {
    if (!isLoaded) return;
    if (isAlreadyPosted && sessionDetails?.records && sessionDetails.records.length > 0) {
      const recordsMap = new Map<string, boolean>();
      sessionDetails.records.forEach((r: any) => recordsMap.set(r.roll_number, r.is_present));
      const initial = currentRoster.map(s => {
        const isPres = recordsMap.has(s.roll_number) ? Boolean(recordsMap.get(s.roll_number)) : true;
        return {
          roll_number: s.roll_number,
          student_name: s.student_name,
          hour1: isPres,
          hour2: isPres,
          hour3: isPres,
        };
      });
      setStudentRecords(initial);
    } else if (currentRoster.length > 0) {
      const initial = currentRoster.map(s => ({
        roll_number: s.roll_number,
        student_name: s.student_name,
        hour1: true,
        hour2: true,
        hour3: true,
      }));
      setStudentRecords(initial);
    }
  }, [currentRoster, isAlreadyPosted, sessionDetails, isLoaded]);

  // ── SAVE ATTENDANCE MUTATION ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubjectId) throw new Error('No subject selected');
      const payload = {
        allotment_id: selectedSubjectId,
        session_date: sessionDate,
        num_periods: (enableHour1 ? 1 : 0) + (enableHour2 ? 1 : 0) + (enableHour3 ? 1 : 0) || 1,
        period_start: 1,
        records: studentRecords.map(r => ({
          roll_number: r.roll_number,
          is_present: Boolean(r.hour1),
        })),
      };
      if (isAlreadyPosted && existingSession?.id) {
        return api.updateAttendanceSession(existingSession.id, payload.records);
      } else {
        return api.saveAttendanceSession(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['facultyNotPostedAttendance'] });
      setShowAbsentModal(false);
      setEditMode(false);
      alert('Attendance saved successfully!');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to save attendance');
    },
  });

  // Calculate totals
  const totalAllottedStudents = useMemo(() => {
    return mySubjects.length * 60; // Approximate or from roster
  }, [mySubjects]);

  const absentList = useMemo(() => {
    return studentRecords.filter(r => !r.hour1);
  }, [studentRecords]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col md:flex-row text-slate-800 dark:text-slate-100 font-sans">
      {/* ── LEFT SIDEBAR (Ported from dsattendance includes/admin_sidebar.php) ── */}
      <aside className="w-full md:w-64 bg-[#1e293b] text-slate-300 flex flex-col shrink-0 border-r border-slate-700">
        {/* Brand Banner */}
        <div className="p-4 bg-[#0f172a] border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white text-sm">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span>Attendance Portal (V1)</span>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="p-3 space-y-4 flex-1">
          <div>
            <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Main</p>
            <button
              onClick={() => setActiveNav('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                activeNav === 'dashboard'
                  ? 'bg-[#6366f1] text-white shadow-md'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Faculty Dashboard</span>
            </button>
          </div>

          <div>
            <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Attendance</p>
            <div className="space-y-1">
              <button
                onClick={() => setActiveNav('mark')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                  activeNav === 'mark'
                    ? 'bg-[#6366f1] text-white shadow-md'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Mark Attendance</span>
              </button>

              <button
                onClick={() => setActiveNav('not_posted')}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                  activeNav === 'not_posted'
                    ? 'bg-[#6366f1] text-white shadow-md'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>Attendance Not Posted</span>
                </div>
                {notPostedSlots.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-black">
                    {notPostedSlots.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveNav('reports')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                  activeNav === 'reports'
                    ? 'bg-[#6366f1] text-white shadow-md'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>My Reports</span>
              </button>

              <button
                onClick={() => setActiveNav('timetable')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                  activeNav === 'timetable'
                    ? 'bg-[#6366f1] text-white shadow-md'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <Clock className="w-4 h-4 text-purple-400" />
                <span>View Timetable</span>
              </button>
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Account</p>
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition-all text-left"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto max-w-7xl">
        {/* Welcome Top Banner (Matching dsattendance alert-info) */}
        <div className="bg-[#e0f7fa] dark:bg-cyan-950/40 border border-[#b2ebf2] dark:border-cyan-800 text-[#006064] dark:text-cyan-200 px-4 py-3 rounded-xl text-xs font-bold shadow-xs flex items-center justify-between">
          <span>Welcome, {user?.name || user?.email}</span>
          <span className="text-[11px] opacity-75">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════ */}
        {/* 1. FACULTY DASHBOARD (faculty/dashboard.php - Matching Image 1)         */}
        {/* ════════════════════════════════════════════════════════════════════════ */}
        {activeNav === 'dashboard' && (
          <div className="space-y-5">
            {/* 4 Vibrant KPI Cards (Matching Image 1) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Allotted Subjects (Blue) */}
              <div className="bg-[#007bff] text-white p-5 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase opacity-90">Allotted Subjects</p>
                  <h3 className="text-3xl font-black mt-1">{mySubjects.length}</h3>
                </div>
                <BookOpen className="w-10 h-10 opacity-80" />
              </div>

              {/* Card 2: Allotted Students (Green) */}
              <div className="bg-[#28a745] text-white p-5 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase opacity-90">Allotted Students</p>
                  <h3 className="text-3xl font-black mt-1">{totalAllottedStudents}</h3>
                </div>
                <Users className="w-10 h-10 opacity-80" />
              </div>

              {/* Card 3: Today Classes (Yellow/Amber) */}
              <div className="bg-[#ffc107] text-slate-900 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase opacity-90">Today Classes</p>
                  <h3 className="text-3xl font-black mt-1">{facultyTodaySlots.length}</h3>
                </div>
                <Calendar className="w-10 h-10 opacity-80 text-slate-900" />
              </div>

              {/* Card 4: Posted Today (Red/Pink) */}
              <div className="bg-[#dc3545] text-white p-5 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase opacity-90">Posted Today</p>
                  <h3 className="text-3xl font-black mt-1">{facultyTodaySlots.length - notPostedSlots.length > 0 ? facultyTodaySlots.length - notPostedSlots.length : 0}</h3>
                </div>
                <CheckCircle2 className="w-10 h-10 opacity-80" />
              </div>
            </div>

            {/* 3 Columns Row (Matching Image 1) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Column 1: Allotted Subjects */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="bg-[#007bff] text-white p-3 font-bold text-xs flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Allotted Subjects</span>
                </div>
                <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {mySubjects.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-400">No subjects allotted yet.</p>
                  ) : (
                    mySubjects.map(s => (
                      <div key={s.id} className="py-2.5 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400">{s.semester_label}</p>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{s.subject_name}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-blue-500 text-white rounded text-[10px] font-black">
                          Subject
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Column 2: Allotted Students */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="bg-[#28a745] text-white p-3 font-bold text-xs flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Allotted Students</span>
                </div>
                <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {mySubjects.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-400">No sections assigned.</p>
                  ) : (
                    mySubjects.map(s => (
                      <div key={s.id} className="py-2.5 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {s.semester_label} - {s.section}
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-black">
                          60
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Column 3: Attendance Activity */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="bg-[#dc3545] text-white p-3 font-bold text-xs flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Attendance Activity</span>
                </div>
                <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  <div className="py-2.5 px-2 space-y-1">
                    <p className="text-[11px] font-bold text-slate-400">{sessionDate}</p>
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>2-1 - B : DS Lab</span>
                      <div className="flex gap-1.5">
                        <span className="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px]">P: 56</span>
                        <span className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-[10px]">A: 4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Today's Timetable (Matching Image 1) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="bg-[#212529] text-white p-3.5 font-bold text-xs flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Today's Timetable</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#343a40] text-slate-200 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Class</th>
                      <th className="px-4 py-2.5">Period</th>
                      <th className="px-4 py-2.5">Time</th>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5 text-center">Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {facultyTodaySlots.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-rose-500 font-bold text-xs bg-slate-50 dark:bg-slate-900">
                          No timetable assigned for today
                        </td>
                      </tr>
                    ) : (
                      facultyTodaySlots.map((slot: TimetableEntry) => (
                        <tr key={slot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-bold">{slot.semester_label} - Sec {slot.section}</td>
                          <td className="px-4 py-3 font-bold">Period {slot.period_start}</td>
                          <td className="px-4 py-3 text-slate-500">{PERIOD_TIMINGS[slot.period_start] || '—'}</td>
                          <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">{slot.subject_name}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                setSelectedSemester(slot.semester_label as any);
                                setSelectedSection(slot.section);
                                const match = mySubjects.find(s => s.subject_name === slot.subject_name && s.section === slot.section);
                                if (match) setSelectedSubjectId(match.id);
                                setIsLoaded(true);
                                setActiveNav('mark');
                              }}
                              className="px-3 py-1.5 bg-[#007bff] hover:bg-blue-600 text-white rounded-lg font-bold text-xs transition-colors"
                            >
                              Mark Attendance
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

        {/* ════════════════════════════════════════════════════════════════════════ */}
        {/* 2. MARK ATTENDANCE (faculty/mark_attendance.php - Matching Image 2 & 3) */}
        {/* ════════════════════════════════════════════════════════════════════════ */}
        {activeNav === 'mark' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Mark Attendance</h2>

            {/* Filter Bar (Matching Image 2) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {/* Select Class */}
                <div>
                  <select
                    value={selectedSemester}
                    onChange={(e) => {
                      setSelectedSemester(e.target.value as any);
                      setIsLoaded(false);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-blue-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Class</option>
                    {ALL_SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Select Section */}
                <div>
                  <select
                    value={selectedSection}
                    onChange={(e) => {
                      setSelectedSection(e.target.value);
                      setIsLoaded(false);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="">Select Section</option>
                    {availableSections.map(sec => <option key={sec} value={sec}>Section {sec}</option>)}
                  </select>
                </div>

                {/* Select Subject */}
                <div>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => {
                      setSelectedSubjectId(e.target.value);
                      setIsLoaded(false);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="">Select Subject</option>
                    {availableSubjects.map(s => (
                      <option key={s.id} value={s.id}>{s.subject_name}</option>
                    ))}
                  </select>
                </div>

                {/* Date Picker */}
                <div>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none"
                  />
                </div>

                {/* Load Students Button (Blue) */}
                <div>
                  <button
                    onClick={() => {
                      if (!selectedSubjectId) {
                        alert('Please select class, section, and subject');
                        return;
                      }
                      setIsLoaded(true);
                    }}
                    className="w-full py-2 px-4 rounded-xl bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    Load Students
                  </button>
                </div>
              </div>
            </div>

            {/* Info Strip & Student Roster Table (Matching Image 3) */}
            {isLoaded && activeSubject && (
              <div className="space-y-4">
                {/* Cyan / Blue Info Alert Banner */}
                <div className="bg-[#e0f7fa] dark:bg-cyan-950/40 border border-[#b2ebf2] dark:border-cyan-800 text-[#006064] dark:text-cyan-200 p-4 rounded-2xl shadow-xs space-y-2">
                  <div className="text-xs font-bold flex flex-wrap gap-x-4 gap-y-1">
                    <span><b>Class:</b> {activeSubject.semester_label}</span>
                    <span>|</span>
                    <span><b>Section:</b> {activeSubject.section}</span>
                    <span>|</span>
                    <span><b>Subject:</b> {activeSubject.subject_name}</span>
                    <span>|</span>
                    <span><b>Date:</b> {sessionDate}</span>
                  </div>
                  <div className="text-[11px] text-[#00838f] dark:text-cyan-300">
                    <b>Timetable:</b> Period 5 (01:50 PM - 02:40 PM) Period 6 (02:40 PM - 03:30 PM) Period 7 (03:30 PM - 04:20 PM)
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setStudentRecords(prev => prev.map(s => ({ ...s, hour1: true, hour2: true, hour3: true })));
                      }}
                      className="px-3 py-1 bg-[#28a745] hover:bg-green-600 text-white rounded-lg font-bold text-xs shadow-xs"
                    >
                      All Present
                    </button>
                    <button
                      onClick={() => {
                        setStudentRecords(prev => prev.map(s => ({ ...s, hour1: false, hour2: false, hour3: false })));
                      }}
                      className="px-3 py-1 bg-[#dc3545] hover:bg-red-600 text-white rounded-lg font-bold text-xs shadow-xs"
                    >
                      All Absent
                    </button>
                    {isAlreadyPosted && (
                      <span className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-300">
                        Attendance Already Posted for this Session
                      </span>
                    )}
                  </div>
                </div>

                {/* Student Roster Table (Matching Image 3) */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#343a40] text-white font-bold text-xs">
                        <tr>
                          <th className="px-4 py-3 w-12 text-center">S.No</th>
                          <th className="px-4 py-3 w-32">Roll No</th>
                          <th className="px-4 py-3">Name of the Student</th>
                          <th className="px-4 py-3 text-center w-24">
                            <label className="flex items-center justify-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={enableHour1}
                                onChange={(e) => setEnableHour1(e.target.checked)}
                                className="rounded"
                              />
                              <span>Hour-1</span>
                            </label>
                          </th>
                          <th className="px-4 py-3 text-center w-24">
                            <label className="flex items-center justify-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={enableHour2}
                                onChange={(e) => setEnableHour2(e.target.checked)}
                                className="rounded"
                              />
                              <span>Hour-2</span>
                            </label>
                          </th>
                          <th className="px-4 py-3 text-center w-24">
                            <label className="flex items-center justify-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={enableHour3}
                                onChange={(e) => setEnableHour3(e.target.checked)}
                                className="rounded"
                              />
                              <span>Hour-3</span>
                            </label>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {studentRecords.map((r, idx) => (
                          <tr
                            key={r.roll_number}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                              !r.hour1 ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                            <td className="px-4 py-3 font-mono font-black text-slate-900 dark:text-white">{r.roll_number}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 uppercase">{r.student_name || '—'}</td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={r.hour1}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setStudentRecords(prev => prev.map(s => s.roll_number === r.roll_number ? { ...s, hour1: checked } : s));
                                }}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={r.hour2}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setStudentRecords(prev => prev.map(s => s.roll_number === r.roll_number ? { ...s, hour2: checked } : s));
                                }}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={r.hour3}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setStudentRecords(prev => prev.map(s => s.roll_number === r.roll_number ? { ...s, hour3: checked } : s));
                                }}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Save Button Bar */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Total Students: {studentRecords.length} | Present: {studentRecords.filter(r => r.hour1).length} | Absent: {absentList.length}
                    </div>
                    <button
                      onClick={() => setShowAbsentModal(true)}
                      className="px-6 py-2.5 bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      Review & Submit Attendance
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════ */}
        {/* 3. ATTENDANCE NOT POSTED (faculty/not_posted_attendance.php)             */}
        {/* ════════════════════════════════════════════════════════════════════════ */}
        {activeNav === 'not_posted' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Attendance Not Posted</h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-[#343a40] text-white font-bold text-xs flex items-center justify-between">
                <span>Pending Timetable Slots ({notPostedSlots.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Class</th>
                      <th className="px-4 py-2.5">Section</th>
                      <th className="px-4 py-2.5">Period</th>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {notPostedSlots.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-emerald-600 font-bold">
                          🎉 All attendance sessions are up to date!
                        </td>
                      </tr>
                    ) : (
                      notPostedSlots.map((slot: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-bold">{slot.date}</td>
                          <td className="px-4 py-3 font-bold">{slot.semester_label}</td>
                          <td className="px-4 py-3 font-bold">{slot.section}</td>
                          <td className="px-4 py-3">Period {slot.period_start}</td>
                          <td className="px-4 py-3 font-bold text-blue-600">{slot.subject_name}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                setSelectedSemester(slot.semester_label);
                                setSelectedSection(slot.section);
                                setSessionDate(slot.date);
                                const match = mySubjects.find(s => s.subject_name === slot.subject_name && s.section === slot.section);
                                if (match) setSelectedSubjectId(match.id);
                                setIsLoaded(true);
                                setActiveNav('mark');
                              }}
                              className="px-3 py-1.5 bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs rounded-lg"
                            >
                              Mark Now
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

        {/* ════════════════════════════════════════════════════════════════════════ */}
        {/* 4. MY REPORTS (faculty/my_report.php - Matching Image 4)                */}
        {/* ════════════════════════════════════════════════════════════════════════ */}
        {activeNav === 'reports' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Attendance Reports</h2>

            {/* Filter Bar (Matching Image 4) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {/* Subject Selector */}
                <div>
                  <select
                    value={reportSubjectId}
                    onChange={(e) => setReportSubjectId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="All">All My Allotted Subjects</option>
                    {mySubjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
                  </select>
                </div>

                {/* Section Selector */}
                <div>
                  <select
                    value={reportSection}
                    onChange={(e) => setReportSection(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="All">All Sections</option>
                    {['A', 'B', 'C', 'D'].map(sec => <option key={sec} value={sec}>Section {sec}</option>)}
                  </select>
                </div>

                {/* Type */}
                <div>
                  <select className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold focus:outline-none">
                    <option>Total Attendance</option>
                    <option>Daywise Attendance</option>
                  </select>
                </div>

                {/* Search Button (Blue) */}
                <div>
                  <button className="w-full py-2 px-4 rounded-xl bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs shadow-sm">
                    Search
                  </button>
                </div>

                {/* Print Button (Grey) */}
                <div>
                  <button
                    onClick={() => window.print()}
                    className="w-full py-2 px-4 rounded-xl bg-[#6c757d] hover:bg-slate-600 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Info Strip (Matching Image 4) */}
            <div className="bg-[#e0f7fa] dark:bg-cyan-950/40 border border-[#b2ebf2] dark:border-cyan-800 text-[#006064] dark:text-cyan-200 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between">
              <span><b>Class:</b> All Classes</span>
              <span><b>Subject:</b> All My Allotted Subjects</span>
              <span><b>Section:</b> All Sections</span>
            </div>

            {/* Table (Matching Image 4) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 font-bold text-xs">
                Total Attendance
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#343a40] text-white font-bold text-xs">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">S.No</th>
                      <th className="px-4 py-3 w-32">Roll No</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3 text-center">Total Hours</th>
                      <th className="px-4 py-3 text-center">Present Hours</th>
                      <th className="px-4 py-3 text-center">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                    {currentRoster.slice(0, 15).map((r, idx) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 text-center text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-mono font-black text-slate-900 dark:text-white">{r.roll_number}</td>
                        <td className="px-4 py-2.5 font-bold uppercase">{r.student_name || 'STUDENT'}</td>
                        <td className="px-4 py-2.5 font-bold">B</td>
                        <td className="px-4 py-2.5 text-center font-bold">3</td>
                        <td className="px-4 py-2.5 text-center font-bold">3</td>
                        <td className="px-4 py-2.5 text-center font-black text-emerald-600">100.00%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════ */}
        {/* 5. VIEW TIMETABLE (faculty/view_timetable.php)                          */}
        {/* ════════════════════════════════════════════════════════════════════════ */}
        {activeNav === 'timetable' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Weekly Timetable</h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#343a40] text-white font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3 w-28 border-r border-slate-700">Day</th>
                      {[1, 2, 3, 4, 5, 6, 7].map(p => (
                        <th key={p} className="px-3 py-3 text-center border-r border-slate-700">
                          Period {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                      <tr key={day} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-bold bg-slate-100 dark:bg-slate-800/60 border-r border-slate-200 dark:border-slate-800">{day}</td>
                        {[1, 2, 3, 4, 5, 6, 7].map(period => (
                          <td key={period} className="px-2 py-2 border-r border-slate-200 dark:border-slate-800 text-center align-top min-w-[110px]">
                            <span className="text-[10px] text-slate-400 opacity-40">—</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── ABSENTEE REVIEW MODAL (absent-modal-box) ── */}
      {showAbsentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Review Absentees Before Saving
              </h3>
              <button onClick={() => setShowAbsentModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Red Card Total Absentees */}
            <div className="p-4 rounded-2xl bg-rose-500 text-white text-center shadow-md">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Total Absent Students</p>
              <h2 className="text-4xl font-black mt-1">{absentList.length}</h2>
            </div>

            {/* Absent Student Roll Badges */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Absent Roll Numbers:</p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
                {absentList.length === 0 ? (
                  <p className="text-xs font-bold text-emerald-600">✨ No students absent! All present.</p>
                ) : (
                  absentList.map(s => (
                    <span key={s.roll_number} className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-mono font-black text-xs border border-rose-300">
                      {s.roll_number}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowAbsentModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
              >
                Go Back & Adjust
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                {saveMutation.isPending ? 'Saving...' : 'Confirm & Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
