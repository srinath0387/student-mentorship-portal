import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Users, Clock, Plus, Trash2, Edit2, Search, Download,
  Upload, CheckCircle2, AlertCircle, Check, X, Filter, Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../../lib/api';
import { SemesterLabel, SubjectAllotment, SubjectRosterEntry, TimetableEntry } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES, normalizeDepartmentName } from '../../../lib/validation/auth';

const ALL_SEMESTERS: SemesterLabel[] = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AttendanceManagementTab: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const validUserDept = normalizeDepartmentName(user?.department);
  const defaultFilterDept =
    user?.department && user.department !== 'All' && user.department !== '*'
      ? normalizeDepartmentName(user.department)
      : 'All';

  // 4 Core Sub-tabs matching dsattendance
  const [activeTab, setActiveTab] = useState<'subjects' | 'allotments' | 'rosters' | 'timetable'>('subjects');

  // Shared Filters
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel>('2-1');
  const [selectedDepartment, setSelectedDepartment] = useState<string>(defaultFilterDept);
  const [selectedSection, setSelectedSection] = useState<string>('A');

  // ─── TAB 1: SUBJECT MASTER STATE (admin/subjects.php) ──────────────────────
  const [subjectForm, setSubjectForm] = useState({
    id: '',
    semester_label: '' as SemesterLabel | '',
    subject_code: '',
    subject_name: '',
    short_name: '',
    subject_type: 'Theory' as 'Theory' | 'Lab',
    department: defaultFilterDept === 'All' ? 'CSE' : defaultFilterDept,
    regulation: 'R20',
  });
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectFilterSem, setSubjectFilterSem] = useState<SemesterLabel | 'All'>('All');
  const [subjectStatus, setSubjectStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({ type: 'idle', message: '' });

  // ─── TAB 2: FACULTY ALLOTMENT STATE (admin/allot_subjects.php) ─────────────
  const [allotMode, setAllotMode] = useState<'single' | 'upload'>('single');
  const [singleAllotSubjectId, setSingleAllotSubjectId] = useState<string>('');
  const [singleAllotSubjectName, setSingleAllotSubjectName] = useState<string>('');
  const [singleAllotSubjectType, setSingleAllotSubjectType] = useState<'Theory' | 'Lab'>('Theory');
  const [singleAllotFacultyEmail, setSingleAllotFacultyEmail] = useState<string>('');
  const [singleAllotFacultyName, setSingleAllotFacultyName] = useState<string>('');
  const [allotStatus, setAllotStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({ type: 'idle', message: '' });

  // ─── TAB 3: STUDENT ROSTER STATE (admin/allot_students.php) ────────────────
  const [selectedAllotmentId, setSelectedAllotmentId] = useState<string>('');
  const [rosterMode, setRosterMode] = useState<'single' | 'upload'>('single');
  const [singleRollNo, setSingleRollNo] = useState<string>('');
  const [singleStudentName, setSingleStudentName] = useState<string>('');
  const [singleJoiningDate, setSingleJoiningDate] = useState<string>('');
  const [rosterStatus, setRosterStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({ type: 'idle', message: '' });

  // ─── TAB 4: TIMETABLE STATE (admin/timetable.php) ──────────────────────────
  const [ttDay, setTtDay] = useState<string>('Monday');
  const [ttPeriod, setTtPeriod] = useState<number>(1);
  const [ttNumPeriods, setTtNumPeriods] = useState<number>(1);
  const [ttSubjectName, setTtSubjectName] = useState<string>('');
  const [ttSubjectType, setTtSubjectType] = useState<'Theory' | 'Lab'>('Theory');
  const [ttFacultyEmail, setTtFacultyEmail] = useState<string>('');
  const [ttRoom, setTtRoom] = useState<string>('');
  const [ttStatus, setTtStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({ type: 'idle', message: '' });

  // ── QUERIES ───────────────────────────────────────────────────────────────
  const { data: rawMasterSubjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ['masterSubjectList'],
    queryFn: () => api.getMasterSubjects().catch(() => []),
  });
  const masterSubjects = Array.isArray(rawMasterSubjects) ? rawMasterSubjects : [];

  const { data: rawFaculty = [] } = useQuery({
    queryKey: ['allFacultyForAllocation'],
    queryFn: () => api.getAllFaculty().catch(() => []),
  });
  const facultyList = Array.isArray(rawFaculty) ? rawFaculty : [];

  const { data: rawAllotments = [], isLoading: isLoadingAllotments } = useQuery({
    queryKey: ['attendanceAllotments', selectedSemester, selectedDepartment],
    queryFn: () => api.getAllotments(selectedSemester, selectedDepartment === 'All' ? '' : selectedDepartment).catch(() => []),
  });
  const allotments = Array.isArray(rawAllotments) ? rawAllotments : [];

  const { data: rawRoster = [], isLoading: isLoadingRoster } = useQuery({
    queryKey: ['attendanceRoster', selectedAllotmentId],
    queryFn: () => (selectedAllotmentId ? api.getRoster(selectedAllotmentId).catch(() => []) : Promise.resolve([])),
    enabled: Boolean(selectedAllotmentId),
  });
  const currentRoster = Array.isArray(rawRoster) ? rawRoster : [];

  const { data: rawTimetable = [], isLoading: isLoadingTimetable } = useQuery({
    queryKey: ['attendanceTimetable', selectedSemester, selectedSection, selectedDepartment],
    queryFn: () => api.getTimetable({
      semester: selectedSemester,
      section: selectedSection,
      department: selectedDepartment,
    }).catch(() => []),
  });
  const timetableEntries = Array.isArray(rawTimetable) ? rawTimetable : [];

  // ── TAB 1 ACTIONS: SUBJECT MASTER ──────────────────────────────────────────
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.semester_label || !subjectForm.subject_code || !subjectForm.subject_name) {
      setSubjectStatus({ type: 'error', message: 'Class, Subject Code, and Subject Title are required.' });
      return;
    }
    try {
      if (subjectForm.id) {
        await api.updateMasterSubject(subjectForm.id, subjectForm);
        setSubjectStatus({ type: 'success', message: 'Subject updated successfully.' });
      } else {
        await api.createMasterSubject(subjectForm);
        setSubjectStatus({ type: 'success', message: 'Subject created successfully.' });
      }
      queryClient.invalidateQueries({ queryKey: ['masterSubjectList'] });
      setSubjectForm({
        id: '',
        semester_label: '',
        subject_code: '',
        subject_name: '',
        short_name: '',
        subject_type: 'Theory',
        department: defaultFilterDept === 'All' ? 'CSE' : defaultFilterDept,
        regulation: 'R20',
      });
    } catch (err: any) {
      setSubjectStatus({ type: 'error', message: err.message || 'Failed to save subject.' });
    }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    try {
      await api.deleteMasterSubject(id);
      queryClient.invalidateQueries({ queryKey: ['masterSubjectList'] });
      setSubjectStatus({ type: 'success', message: 'Subject deleted successfully.' });
    } catch (err: any) {
      setSubjectStatus({ type: 'error', message: err.message || 'Failed to delete subject.' });
    }
  };

  // ── TAB 2 ACTIONS: FACULTY ALLOTMENT ───────────────────────────────────────
  const handleSingleAllotment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleAllotSubjectName || !singleAllotFacultyEmail) {
      setAllotStatus({ type: 'error', message: 'Please select a subject and faculty.' });
      return;
    }
    try {
      await api.createSingleAllotment({
        semester: selectedSemester,
        department: selectedDepartment === 'All' ? 'CSE' : selectedDepartment,
        section: selectedSection,
        subject_name: singleAllotSubjectName,
        subject_type: singleAllotSubjectType,
        faculty_name: singleAllotFacultyName || singleAllotFacultyEmail.split('@')[0],
        faculty_email: singleAllotFacultyEmail,
      });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
      setAllotStatus({ type: 'success', message: 'Subject allotted to faculty successfully.' });
      setSingleAllotSubjectName('');
      setSingleAllotSubjectId('');
      setSingleAllotFacultyEmail('');
      setSingleAllotFacultyName('');
    } catch (err: any) {
      setAllotStatus({ type: 'error', message: err.message || 'Failed to allot subject.' });
    }
  };

  const handleDeleteAllotment = async (id: string) => {
    if (!window.confirm('Delete this faculty allotment?')) return;
    try {
      await api.deleteAllotment(id);
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
      setAllotStatus({ type: 'success', message: 'Allotment removed successfully.' });
    } catch (err: any) {
      setAllotStatus({ type: 'error', message: err.message || 'Failed to delete allotment.' });
    }
  };

  const handleBulkAllotmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) {
          setAllotStatus({ type: 'error', message: 'Uploaded Excel file is empty.' });
          return;
        }
        await api.uploadAllotments(
          selectedSemester,
          rows.map(r => ({
            subject_name: r['Subject Name'] || r['subject_name'] || r['Subject'] || '',
            subject_type: (r['Subject Type'] || r['subject_type'] || 'Theory').toLowerCase().includes('lab') ? 'Lab' : 'Theory',
            faculty_email: r['Faculty Email'] || r['faculty_email'] || '',
            faculty_name: r['Faculty Name'] || r['faculty_name'] || '',
            section: r['Section'] || r['section'] || selectedSection,
            department: selectedDepartment === 'All' ? 'CSE' : selectedDepartment,
          }))
        );
        queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
        setAllotStatus({ type: 'success', message: `Successfully imported ${rows.length} allotments.` });
      } catch (err: any) {
        setAllotStatus({ type: 'error', message: err.message || 'Failed to parse Excel file.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── TAB 3 ACTIONS: STUDENT ROSTER ──────────────────────────────────────────
  const handleSingleRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAllotmentId || !singleRollNo) {
      setRosterStatus({ type: 'error', message: 'Subject and Roll Number are required.' });
      return;
    }
    try {
      await api.createSingleRosterStudent({
        allotment_id: selectedAllotmentId,
        roll_number: singleRollNo.trim().toUpperCase(),
        student_name: singleStudentName.trim(),
        joining_date: singleJoiningDate || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
      setRosterStatus({ type: 'success', message: `Student ${singleRollNo} enrolled in roster.` });
      setSingleRollNo('');
      setSingleStudentName('');
      setSingleJoiningDate('');
    } catch (err: any) {
      setRosterStatus({ type: 'error', message: err.message || 'Failed to enroll student.' });
    }
  };

  const handleDeleteRosterStudent = async (rosterId: string) => {
    if (!window.confirm('Remove this student from the subject roster?')) return;
    try {
      await api.deleteRosterStudent(rosterId);
      queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
      setRosterStatus({ type: 'success', message: 'Student removed from roster.' });
    } catch (err: any) {
      setRosterStatus({ type: 'error', message: err.message || 'Failed to remove student.' });
    }
  };

  const handleBulkRosterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAllotmentId) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) {
          setRosterStatus({ type: 'error', message: 'Uploaded Excel file is empty.' });
          return;
        }
        await api.uploadRoster(
          selectedAllotmentId,
          rows.map(r => ({
            roll_number: String(r['Roll Number'] || r['roll_number'] || r['Roll No'] || '').trim().toUpperCase(),
            student_name: r['Student Name'] || r['student_name'] || r['Name'] || '',
            joining_date: r['Joining Date'] || r['joining_date'] || undefined,
          }))
        );
        queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
        setRosterStatus({ type: 'success', message: `Successfully enrolled ${rows.length} students in roster.` });
      } catch (err: any) {
        setRosterStatus({ type: 'error', message: err.message || 'Failed to upload roster.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── TAB 4 ACTIONS: TIMETABLE ───────────────────────────────────────────────
  const handleSaveTimetableSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttSubjectName || !ttFacultyEmail) {
      setTtStatus({ type: 'error', message: 'Subject and Faculty are required.' });
      return;
    }
    try {
      await api.uploadTimetable(
        selectedSemester,
        selectedSection,
        selectedDepartment === 'All' ? 'CSE' : selectedDepartment,
        [{
          day_of_week: ttDay,
          period_start: ttPeriod,
          num_periods: ttNumPeriods,
          subject_name: ttSubjectName,
          subject_type: ttSubjectType,
          faculty_email: ttFacultyEmail,
          room_no: ttRoom,
        }]
      );
      queryClient.invalidateQueries({ queryKey: ['attendanceTimetable'] });
      setTtStatus({ type: 'success', message: `Timetable slot saved for ${ttDay} Period ${ttPeriod}.` });
      setTtSubjectName('');
      setTtFacultyEmail('');
    } catch (err: any) {
      setTtStatus({ type: 'error', message: err.message || 'Failed to save timetable slot.' });
    }
  };

  const handleDeleteTimetableSlot = async (id: string) => {
    if (!window.confirm('Delete this timetable slot?')) return;
    try {
      await api.deleteTimetableEntry(id);
      queryClient.invalidateQueries({ queryKey: ['attendanceTimetable'] });
      setTtStatus({ type: 'success', message: 'Slot deleted.' });
    } catch (err: any) {
      setTtStatus({ type: 'error', message: err.message || 'Failed to delete slot.' });
    }
  };

  // Filtered Master Subjects
  const filteredSubjects = useMemo(() => {
    return masterSubjects.filter((s: any) => {
      const q = subjectSearch.toLowerCase();
      const semMatch = subjectFilterSem === 'All' || s.semester_label === subjectFilterSem;
      const textMatch = !q || s.subject_name?.toLowerCase().includes(q) || s.subject_code?.toLowerCase().includes(q);
      return semMatch && textMatch;
    });
  }, [masterSubjects, subjectFilterSem, subjectSearch]);

  return (
    <div className="space-y-6">
      {/* ── Page Header & Top Nav Tabs (Ported from dsattendance includes/admin_sidebar) ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-1">
              <BookOpen className="w-3.5 h-3.5" />
              Attendance Administration
            </div>
            <h2 className="text-xl font-black text-textPrimary">Attendance & Academic Management</h2>
            <p className="text-xs text-textSecondary mt-0.5">
              Manage subject master catalogs, faculty allocations, student rosters, and section timetables.
            </p>
          </div>

          {/* Sub-Tabs (Clean dsattendance structure) */}
          <div className="flex items-center gap-1 bg-surface-2 p-1.5 rounded-xl border border-borderLine overflow-x-auto">
            <button
              onClick={() => setActiveTab('subjects')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'subjects' ? 'bg-brand-primary text-white shadow-sm' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              1. Subjects Master
            </button>

            <button
              onClick={() => setActiveTab('allotments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'allotments' ? 'bg-brand-primary text-white shadow-sm' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              2. Faculty Allotment
            </button>

            <button
              onClick={() => setActiveTab('rosters')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'rosters' ? 'bg-brand-primary text-white shadow-sm' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              3. Student Rosters
            </button>

            <button
              onClick={() => setActiveTab('timetable')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'timetable' ? 'bg-brand-primary text-white shadow-sm' : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              4. Timetable Matrix
            </button>
          </div>
        </div>

        {/* Global Scope Filter Bar (For Tabs 2, 3, 4) */}
        {activeTab !== 'subjects' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-borderLine text-xs">
            <span className="font-bold text-textMuted uppercase flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Scope:
            </span>

            {/* Semester */}
            <div className="flex items-center gap-1 bg-surface-2 px-2.5 py-1 rounded-xl border border-borderLine">
              <span className="text-textMuted">Class:</span>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value as SemesterLabel)}
                className="bg-transparent font-bold text-textPrimary focus:outline-none"
              >
                {ALL_SEMESTERS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Department */}
            <div className="flex items-center gap-1 bg-surface-2 px-2.5 py-1 rounded-xl border border-borderLine">
              <span className="text-textMuted">Dept:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="bg-transparent font-bold text-textPrimary focus:outline-none"
              >
                <option value="All">All Departments</option>
                {VALID_DEPARTMENT_NAMES.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="S&H">S&H (1st Year)</option>
              </select>
            </div>

            {/* Section */}
            <div className="flex items-center gap-1 bg-surface-2 px-2.5 py-1 rounded-xl border border-borderLine">
              <span className="text-textMuted">Section:</span>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="bg-transparent font-bold text-textPrimary focus:outline-none"
              >
                {['A', 'B', 'C', 'D', 'E', 'F'].map(sec => (
                  <option key={sec} value={sec}>Section {sec}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 1. SUBJECTS MASTER (admin/subjects.php) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'subjects' && (
        <div className="space-y-5">
          {/* Add / Edit Subject Card Form */}
          <form onSubmit={handleSaveSubject} className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-primary" />
                {subjectForm.id ? 'Edit Subject' : 'Add New Subject'}
              </h3>
              {subjectForm.id && (
                <button
                  type="button"
                  onClick={() => setSubjectForm({
                    id: '', semester_label: '', subject_code: '', subject_name: '', short_name: '', subject_type: 'Theory', department: 'CSE', regulation: 'R20'
                  })}
                  className="text-xs text-textMuted hover:text-textPrimary"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {subjectStatus.type !== 'idle' && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                subjectStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                <span>{subjectStatus.message}</span>
                <button type="button" onClick={() => setSubjectStatus({ type: 'idle', message: '' })}>✕</button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Class *</label>
                <select
                  value={subjectForm.semester_label}
                  onChange={(e) => setSubjectForm({ ...subjectForm, semester_label: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  required
                >
                  <option value="">Select Class</option>
                  {ALL_SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Department</label>
                <select
                  value={subjectForm.department}
                  onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  {VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
                  <option value="S&H">S&H (1st Year)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Subject Code *</label>
                <input
                  type="text"
                  placeholder="e.g. CS401"
                  value={subjectForm.subject_code}
                  onChange={(e) => setSubjectForm({ ...subjectForm, subject_code: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary font-mono font-bold"
                  required
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Subject Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Data Structures & Algorithms"
                  value={subjectForm.subject_name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, subject_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Short Name / Type</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="DS"
                    value={subjectForm.short_name}
                    onChange={(e) => setSubjectForm({ ...subjectForm, short_name: e.target.value })}
                    className="w-1/2 px-2 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary uppercase"
                  />
                  <select
                    value={subjectForm.subject_type}
                    onChange={(e) => setSubjectForm({ ...subjectForm, subject_type: e.target.value as any })}
                    className="w-1/2 px-2 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="Theory">Theory</option>
                    <option value="Lab">Lab</option>
                  </select>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{subjectForm.id ? 'Update' : 'Save Subject'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Subjects Table */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3.5 bg-surface-2 border-b border-borderLine flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-bold text-textPrimary">
                Master Subjects Catalog ({filteredSubjects.length})
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={subjectFilterSem}
                  onChange={(e) => setSubjectFilterSem(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-borderLine bg-surface text-textPrimary font-semibold focus:outline-none"
                >
                  <option value="All">All Classes</option>
                  {ALL_SEMESTERS.map(s => <option key={s} value={s}>Class {s}</option>)}
                </select>

                <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-borderLine w-48 text-xs">
                  <Search className="w-3.5 h-3.5 text-textMuted shrink-0" />
                  <input
                    type="text"
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    placeholder="Search subject..."
                    className="w-full bg-transparent text-textPrimary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {isLoadingSubjects ? (
              <div className="p-8 text-center text-xs text-textMuted">Loading subjects...</div>
            ) : filteredSubjects.length === 0 ? (
              <div className="p-8 text-center text-xs text-textMuted">No subjects found. Add a subject using the form above.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase text-[10px] border-b border-borderLine">
                    <tr>
                      <th className="px-4 py-2.5 w-12 text-center">#</th>
                      <th className="px-4 py-2.5">Class</th>
                      <th className="px-4 py-2.5">Dept</th>
                      <th className="px-4 py-2.5">Subject Code</th>
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5">Short Name</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Reg</th>
                      <th className="px-4 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {filteredSubjects.map((s: any, idx: number) => (
                      <tr key={s.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="px-4 py-2.5 text-center text-textMuted">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-textPrimary">{s.semester_label}</td>
                        <td className="px-4 py-2.5 text-textSecondary">{s.department || '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-brand-primary">{s.subject_code}</td>
                        <td className="px-4 py-2.5 font-semibold text-textPrimary">{s.subject_name}</td>
                        <td className="px-4 py-2.5 font-bold text-textPrimary">{s.short_name || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.subject_type === 'Lab' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {s.subject_type || 'Theory'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-textMuted">{s.regulation || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSubjectForm({
                                id: s.id,
                                semester_label: s.semester_label,
                                subject_code: s.subject_code,
                                subject_name: s.subject_name,
                                short_name: s.short_name || '',
                                subject_type: s.subject_type || 'Theory',
                                department: s.department || 'CSE',
                                regulation: s.regulation || 'R20',
                              })}
                              className="p-1 rounded-lg hover:bg-amber-500/10 text-amber-400 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(s.id)}
                              className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
      {/* 2. FACULTY ALLOTMENT (admin/allot_subjects.php) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'allotments' && (
        <div className="space-y-5">
          {/* Top Form: Single Allotment or Bulk Upload */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-primary" />
                Allot Subjects to Faculty
              </h3>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-borderLine text-xs">
                <button
                  onClick={() => setAllotMode('single')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${allotMode === 'single' ? 'bg-brand-primary text-white' : 'text-textMuted'}`}
                >
                  Single Allotment
                </button>
                <button
                  onClick={() => setAllotMode('upload')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${allotMode === 'upload' ? 'bg-brand-primary text-white' : 'text-textMuted'}`}
                >
                  Bulk Excel Upload
                </button>
              </div>
            </div>

            {allotStatus.type !== 'idle' && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                allotStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                <span>{allotStatus.message}</span>
                <button type="button" onClick={() => setAllotStatus({ type: 'idle', message: '' })}>✕</button>
              </div>
            )}

            {allotMode === 'single' ? (
              <form onSubmit={handleSingleAllotment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {/* Select Subject from Master List */}
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Subject (Master Catalog) *</label>
                  <select
                    value={singleAllotSubjectId}
                    onChange={(e) => {
                      setSingleAllotSubjectId(e.target.value);
                      const found = masterSubjects.find((s: any) => s.id === e.target.value);
                      if (found) {
                        setSingleAllotSubjectName(found.subject_name);
                        setSingleAllotSubjectType(found.subject_type === 'Lab' ? 'Lab' : 'Theory');
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    required
                  >
                    <option value="">Select Subject</option>
                    {masterSubjects
                      .filter((s: any) => !selectedSemester || s.semester_label === selectedSemester)
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.subject_code} - {s.subject_name} ({s.subject_type})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Faculty Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Faculty Member *</label>
                  <select
                    value={singleAllotFacultyEmail}
                    onChange={(e) => {
                      setSingleAllotFacultyEmail(e.target.value);
                      const found = facultyList.find((f: any) => f.email === e.target.value);
                      if (found) setSingleAllotFacultyName(found.name);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    required
                  >
                    <option value="">Select Faculty</option>
                    {facultyList.map((f: any) => (
                      <option key={f.email} value={f.email}>
                        {f.name} ({f.department || 'Faculty'}) - {f.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Type */}
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Type</label>
                  <select
                    value={singleAllotSubjectType}
                    onChange={(e) => setSingleAllotSubjectType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none"
                  >
                    <option value="Theory">Theory</option>
                    <option value="Lab">Lab</option>
                  </select>
                </div>

                {/* Submit */}
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Allot to Faculty</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs">
                  <p className="font-bold text-textPrimary">Upload Subject Allotments Excel</p>
                  <p className="text-textSecondary">Columns: <code>Subject Name</code>, <code>Subject Type</code>, <code>Faculty Email</code>, <code>Section</code></p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleBulkAllotmentUpload}
                  className="text-xs text-textSecondary file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Allotments Table */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3.5 bg-surface-2 border-b border-borderLine flex items-center justify-between">
              <span className="text-xs font-bold text-textPrimary">
                Current Allotments for {selectedSemester} ({selectedDepartment === 'All' ? 'All Depts' : selectedDepartment} - Sec {selectedSection})
              </span>
              <span className="text-xs text-textMuted font-bold">{allotments.length} Allotments</span>
            </div>

            {isLoadingAllotments ? (
              <div className="p-8 text-center text-xs text-textMuted">Loading allotments...</div>
            ) : allotments.length === 0 ? (
              <div className="p-8 text-center text-xs text-textMuted">No faculty allotments for this scope. Allot a subject using the form above.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase text-[10px] border-b border-borderLine">
                    <tr>
                      <th className="px-4 py-2.5 w-12 text-center">#</th>
                      <th className="px-4 py-2.5">Class</th>
                      <th className="px-4 py-2.5">Sec</th>
                      <th className="px-4 py-2.5">Subject Name</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Faculty Name</th>
                      <th className="px-4 py-2.5">Faculty Email</th>
                      <th className="px-4 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {allotments.map((a: SubjectAllotment, idx: number) => (
                      <tr key={a.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="px-4 py-2.5 text-center text-textMuted">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-textPrimary">{a.semester_label}</td>
                        <td className="px-4 py-2.5 font-bold text-textPrimary">{a.section}</td>
                        <td className="px-4 py-2.5 font-bold text-brand-primary">{a.subject_name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            a.subject_type === 'Lab' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {a.subject_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-textPrimary">{a.faculty_name}</td>
                        <td className="px-4 py-2.5 font-mono text-textSecondary">{a.faculty_email}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleDeleteAllotment(a.id)}
                            className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors"
                            title="Delete Allotment"
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
      {/* 3. STUDENT ROSTERS (admin/allot_students.php) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'rosters' && (
        <div className="space-y-5">
          {/* Pick Allotment & Enroll Students */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-primary" />
                  Allot Students to Subject Roster
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">Select an allotted subject to enroll or manage students.</p>
              </div>

              {/* Allotment Selector */}
              <div className="w-full sm:w-72">
                <select
                  value={selectedAllotmentId}
                  onChange={(e) => setSelectedAllotmentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-bold focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="">-- Choose Subject Allotment --</option>
                  {allotments.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.semester_label} (Sec {a.section}) - {a.subject_name} ({a.faculty_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {rosterStatus.type !== 'idle' && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                rosterStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                <span>{rosterStatus.message}</span>
                <button type="button" onClick={() => setRosterStatus({ type: 'idle', message: '' })}>✕</button>
              </div>
            )}

            {selectedAllotmentId && (
              <div className="pt-2 space-y-3">
                {/* Mode Selector */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRosterMode('single')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg ${rosterMode === 'single' ? 'bg-brand-primary text-white' : 'bg-surface-2 text-textSecondary'}`}
                  >
                    + Add Single Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterMode('upload')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg ${rosterMode === 'upload' ? 'bg-brand-primary text-white' : 'bg-surface-2 text-textSecondary'}`}
                  >
                    Bulk Excel Roster Upload
                  </button>
                </div>

                {rosterMode === 'single' ? (
                  <form onSubmit={handleSingleRoster} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Roll Number *</label>
                      <input
                        type="text"
                        placeholder="e.g. 23091A3201"
                        value={singleRollNo}
                        onChange={(e) => setSingleRollNo(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary uppercase font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Student Name</label>
                      <input
                        type="text"
                        placeholder="Student Name"
                        value={singleStudentName}
                        onChange={(e) => setSingleStudentName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Joining Date (Optional)</label>
                      <input
                        type="date"
                        value={singleJoiningDate}
                        onChange={(e) => setSingleJoiningDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full py-2 px-4 rounded-xl bg-brand-primary text-white font-bold text-xs shadow-sm hover:bg-brand-primary/90 transition-all cursor-pointer"
                      >
                        Enroll Student
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs">
                      <p className="font-bold text-textPrimary">Upload Student Roll Numbers Excel</p>
                      <p className="text-textSecondary">Columns: <code>Roll Number</code>, <code>Student Name</code></p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleBulkRosterUpload}
                      className="text-xs text-textSecondary file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Roster Table */}
          {selectedAllotmentId && (
            <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
              <div className="p-3.5 bg-surface-2 border-b border-borderLine flex items-center justify-between">
                <span className="text-xs font-bold text-textPrimary">Enrolled Students ({currentRoster.length})</span>
              </div>

              {isLoadingRoster ? (
                <div className="p-8 text-center text-xs text-textMuted">Loading student roster...</div>
              ) : currentRoster.length === 0 ? (
                <div className="p-8 text-center text-xs text-textMuted">No students enrolled in this roster yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-textMuted font-bold uppercase text-[10px] border-b border-borderLine">
                      <tr>
                        <th className="px-4 py-2.5 w-12 text-center">#</th>
                        <th className="px-4 py-2.5">Roll Number</th>
                        <th className="px-4 py-2.5">Student Name</th>
                        <th className="px-4 py-2.5">Joining Date</th>
                        <th className="px-4 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {currentRoster.map((r: SubjectRosterEntry, idx: number) => (
                        <tr key={r.id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="px-4 py-2.5 text-center text-textMuted">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-brand-primary">{r.roll_number}</td>
                          <td className="px-4 py-2.5 font-semibold text-textPrimary">{r.student_name || '—'}</td>
                          <td className="px-4 py-2.5 text-textSecondary">{r.joining_date ? new Date(r.joining_date).toLocaleDateString('en-GB') : 'Regular'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleDeleteRosterStudent(r.id)}
                              className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors"
                              title="Remove Student"
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
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 4. TIMETABLE MATRIX (admin/timetable.php) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'timetable' && (
        <div className="space-y-5">
          {/* Add Slot Form */}
          <form onSubmit={handleSaveTimetableSlot} className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-primary" />
              Schedule Timetable Period ({selectedSemester} - Sec {selectedSection})
            </h3>

            {ttStatus.type !== 'idle' && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                ttStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                <span>{ttStatus.message}</span>
                <button type="button" onClick={() => setTtStatus({ type: 'idle', message: '' })}>✕</button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Day of Week *</label>
                <select
                  value={ttDay}
                  onChange={(e) => setTtDay(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none"
                >
                  {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Period (1–7) *</label>
                <select
                  value={ttPeriod}
                  onChange={(e) => setTtPeriod(parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none font-bold"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>Period {p}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Subject Name *</label>
                <select
                  value={ttSubjectName}
                  onChange={(e) => {
                    setTtSubjectName(e.target.value);
                    const matchedAllot = allotments.find(a => a.subject_name === e.target.value);
                    if (matchedAllot) {
                      setTtFacultyEmail(matchedAllot.faculty_email);
                      setTtSubjectType(matchedAllot.subject_type);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary focus:outline-none"
                  required
                >
                  <option value="">Select Allotted Subject</option>
                  {allotments.map(a => (
                    <option key={a.id} value={a.subject_name}>
                      {a.subject_name} ({a.faculty_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Faculty Email *</label>
                <input
                  type="email"
                  placeholder="faculty@rgmcet.edu.in"
                  value={ttFacultyEmail}
                  onChange={(e) => setTtFacultyEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface-2 text-textPrimary font-mono"
                  required
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-xl bg-brand-primary text-white font-bold text-xs shadow-sm hover:bg-brand-primary/90 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign Slot</span>
                </button>
              </div>
            </div>
          </form>

          {/* Timetable Weekly Matrix */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3.5 bg-surface-2 border-b border-borderLine flex items-center justify-between">
              <span className="text-xs font-bold text-textPrimary">
                Weekly Timetable Matrix ({selectedSemester} - Sec {selectedSection})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-2 text-textMuted font-bold uppercase text-[10px] border-b border-borderLine">
                  <tr>
                    <th className="px-3 py-2.5 w-24 border-r border-borderLine">Day</th>
                    {[1, 2, 3, 4, 5, 6, 7].map(p => (
                      <th key={p} className="px-3 py-2.5 text-center border-r border-borderLine">
                        Period {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {DAYS_OF_WEEK.map(day => (
                    <tr key={day} className="hover:bg-surface-2/30">
                      <td className="px-3 py-3 font-bold text-textPrimary bg-surface-2/40 border-r border-borderLine">{day}</td>
                      {[1, 2, 3, 4, 5, 6, 7].map(period => {
                        const slot = timetableEntries.find((t: TimetableEntry) => t.day_of_week === day && t.period_start === period);
                        return (
                          <td key={period} className="px-2 py-2 border-r border-borderLine text-center align-top min-w-[120px]">
                            {slot ? (
                              <div className="p-2 rounded-xl bg-surface-2 border border-brand-primary/30 space-y-1 relative group">
                                <div className="font-bold text-[11px] text-brand-primary leading-tight">{slot.subject_name}</div>
                                <div className="text-[10px] text-textMuted truncate">{slot.faculty_email.split('@')[0]}</div>
                                <button
                                  onClick={() => handleDeleteTimetableSlot(slot.id)}
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs"
                                  title="Delete Slot"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-textMuted opacity-30">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
