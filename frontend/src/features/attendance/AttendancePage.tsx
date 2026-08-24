import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
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
} from 'lucide-react';
import { api } from '../../lib/api';
import { SemesterLabel, SubjectAllotment, SubjectRosterEntry } from '../../types';
import { useAuth } from '../../context/AuthContext';

const SEMESTERS: { label: SemesterLabel; desc: string }[] = [
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
  const [studentRecords, setStudentRecords] = useState<{ roll_number: string; student_name?: string; is_present: boolean }[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  // Step 5: Save confirmation result
  const [saveResult, setSaveResult] = useState<{
    message: string;
    presentCount: number;
    totalCount: number;
    subjectName: string;
    numPeriods: number;
  } | null>(null);

  // ── Fetch Faculty Allotted Subjects for selected semester ──
  const { data: mySubjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['myAttendanceSubjects', selectedSemester],
    queryFn: () => (selectedSemester ? api.getMyAttendanceSubjects(selectedSemester) : Promise.resolve([])),
    enabled: Boolean(selectedSemester),
  });

  // ── Fetch Roster for selected subject ──
  const { data: roster = [], isLoading: isLoadingRoster } = useQuery({
    queryKey: ['subjectRosterForAttendance', selectedSubject?.id],
    queryFn: () => (selectedSubject?.id ? api.getRoster(selectedSubject.id) : Promise.resolve([])),
    enabled: Boolean(selectedSubject?.id),
  });

  // Initialize student records when roster loads
  useEffect(() => {
    if (roster && roster.length > 0) {
      setStudentRecords(
        roster.map((r: SubjectRosterEntry) => ({
          roll_number: r.roll_number,
          student_name: r.student_name,
          is_present: true, // Default all present as requested
        }))
      );
    }
  }, [roster]);

  // Adjust session length options based on Theory vs Lab
  useEffect(() => {
    if (selectedSubject) {
      if (selectedSubject.subject_type === 'Lab') {
        setNumPeriods(2); // Default 2 for lab
      } else {
        setNumPeriods(1); // Default 1 for theory
      }
    }
  }, [selectedSubject]);

  // ── Toggle All Present / Absent ──
  const handleToggleAll = (present: boolean) => {
    setStudentRecords((prev) => prev.map((s) => ({ ...s, is_present: present })));
  };

  // ── Toggle Individual Student ──
  const handleToggleStudent = (rollNumber: string) => {
    setStudentRecords((prev) =>
      prev.map((s) => (s.roll_number === rollNumber ? { ...s, is_present: !s.is_present } : s))
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
          is_present: r.is_present,
        })),
      });
    },
    onSuccess: (res) => {
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

  const presentCount = studentRecords.filter((s) => s.is_present).length;
  const absentCount = studentRecords.length - presentCount;

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
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-surface border border-borderLine shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-xs font-semibold mb-2">
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Faculty Portal</span>
          </div>
          <h1 className="text-2xl font-black text-textPrimary">Take Attendance</h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Mark hour-by-hour period attendance for your allotted subjects and sections.
          </p>
        </div>

        {currentStep > 1 && currentStep < 5 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Wizard
          </button>
        )}
      </div>

      {/* Wizard Progress Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-borderLine shadow-xs">
        <div className="grid grid-cols-5 gap-2">
          {[
            { step: 1, title: 'Semester' },
            { step: 2, title: 'Subject' },
            { step: 3, title: 'Session Details' },
            { step: 4, title: 'Mark Roster' },
            { step: 5, title: 'Complete' },
          ].map((item) => {
            const isCompleted = currentStep > item.step;
            const isCurrent = currentStep === item.step;
            return (
              <div
                key={item.step}
                className={`flex flex-col items-center text-center p-2 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-brand-soft border border-brand-primary/40 text-brand-primary font-bold'
                    : isCompleted
                    ? 'text-emerald-400 font-semibold'
                    : 'text-textMuted'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-1 font-black ${
                    isCurrent
                      ? 'bg-brand-primary text-white shadow-brand'
                      : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-surface-2 text-textMuted border border-borderLine'
                  }`}
                >
                  {isCompleted ? '✓' : item.step}
                </div>
                <span className="text-[10px] sm:text-xs truncate">{item.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 1: SELECT SEMESTER
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-6">
          <div>
            <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                1
              </span>
              Select Target Semester
            </h2>
            <p className="text-xs text-textSecondary mt-1">
              Choose the semester you wish to record class attendance for.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {SEMESTERS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setSelectedSemester(s.label);
                  setCurrentStep(2);
                }}
                className="group p-5 rounded-2xl bg-surface-2 hover:bg-surface-3 border border-borderLine hover:border-brand-primary/60 transition-all text-left flex flex-col justify-between hover:shadow-brand hover:-translate-y-0.5"
              >
                <div>
                  <span className="text-2xl font-black text-brand-primary font-mono group-hover:scale-105 transition-transform inline-block">
                    {s.label}
                  </span>
                  <p className="text-xs font-semibold text-textPrimary mt-1">{s.desc}</p>
                </div>
                <div className="flex items-center justify-between text-[11px] text-textMuted group-hover:text-brand-primary font-bold mt-4 pt-3 border-t border-borderLine">
                  <span>View Subjects</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 2: SELECT SUBJECT
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                  2
                </span>
                Select Your Allotted Subject — Semester {selectedSemester}
              </h2>
              <p className="text-xs text-textSecondary mt-1">
                Only subjects officially assigned to you for Semester {selectedSemester} are shown.
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
              Loading your allotted subjects...
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
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          sub.subject_type === 'Lab'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-brand-soft text-brand-primary border border-brand-primary/30'
                        }`}
                      >
                        {sub.subject_type}
                      </span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-surface border border-borderLine text-textPrimary">
                        Section {sub.section}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-textPrimary group-hover:text-brand-primary transition-colors">
                      {sub.subject_name}
                    </h4>
                    <p className="text-xs text-textSecondary flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-textMuted" />
                      {sub.roster_count || 0} Enrolled Students
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
          STEP 3: SESSION SETUP
         ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 3 && selectedSubject && (
        <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-black">
                  3
                </span>
                Session Configuration — {selectedSubject.subject_name}
              </h2>
              <p className="text-xs text-textSecondary mt-1">
                Configure date, starting class period, and duration/session length.
              </p>
            </div>
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          </div>

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

          <div className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-textPrimary">Coverage: </span>
              <span className="text-textSecondary">
                Date: <strong className="text-brand-primary">{sessionDate}</strong> | Periods:{' '}
                <strong className="text-brand-primary">
                  {periodStart} to {Math.min(7, periodStart + numPeriods - 1)}
                </strong>{' '}
                ({numPeriods} Hour{numPeriods > 1 ? 's' : ''})
              </span>
            </div>
            <button
              onClick={() => setCurrentStep(4)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 shadow-brand transition-all"
            >
              Load Student Roster <ArrowRight className="w-3.5 h-3.5" />
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
                All students are marked Present by default. Uncheck absentees.
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
              <span className="text-textSecondary">Total: {studentRecords.length}</span>
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
    </div>
  );
};
