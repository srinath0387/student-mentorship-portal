import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Upload,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  Award,
  RefreshCw,
  Download,
  AlertTriangle,
  GraduationCap,
  Trash2,
  Plus,
  BookOpen,
  BarChart3,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { PillButton } from '../../components/common/PillButton';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';
import { FresherStudent, ClassIncharge } from '../../types';

export const CoordinatorDashboardPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'freshers' | 'subjects' | 'attendance' | 'incharge' | 'promotion'>('freshers');

  // Directory Filters
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedSection, setSelectedSection] = useState<string>('All');
  const [selectedStage, setSelectedStage] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedRoster, setParsedRoster] = useState<any[]>([]);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  // Assign Incharge Modal State
  const [showInchargeModal, setShowInchargeModal] = useState(false);
  const [inchargeSem, setInchargeSem] = useState<'1-1' | '1-2'>('1-1');
  const [inchargeDept, setInchargeDept] = useState<string>('CSE');
  const [inchargeSection, setInchargeSection] = useState<string>('A');
  const [inchargeFacultyEmail, setInchargeFacultyEmail] = useState('');
  const [inchargeFacultyName, setInchargeFacultyName] = useState('');

  // Promotion State
  const [promoDept, setPromoDept] = useState<string>('CSE');
  const [promoSection, setPromoSection] = useState<string>('All');
  const [promoStatus, setPromoStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  // Subject Assignment State
  const [subjSem, setSubjSem] = useState<'1-1' | '1-2'>('1-1');
  const [subjDept, setSubjDept] = useState<string>('CSE');
  const [subjSection, setSubjSection] = useState<string>('A');
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjType, setNewSubjType] = useState<'Theory' | 'Lab'>('Theory');
  const [newSubjFacultyEmail, setNewSubjFacultyEmail] = useState('');
  const [newSubjFacultyName, setNewSubjFacultyName] = useState('');
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  // Attendance Overview State
  const [attSem, setAttSem] = useState<'1-1' | '1-2'>('1-1');
  const [attDept, setAttDept] = useState<string>('All');
  const [attSection, setAttSection] = useState<string>('All');

  // ── Queries ──
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['coordinator-stats'],
    queryFn: () => api.getCoordinatorFresherStats(),
  });

  const { data: freshers = [], isLoading: freshersLoading, refetch: refetchFreshers } = useQuery({
    queryKey: ['coordinator-freshers', selectedDept, selectedSection, selectedStage, searchQuery],
    queryFn: () =>
      api.getCoordinatorFreshers({
        department: selectedDept,
        section: selectedSection,
        stage: selectedStage,
        search: searchQuery,
      }),
  });

  const { data: incharges = [], isLoading: inchargesLoading, refetch: refetchIncharges } = useQuery({
    queryKey: ['coordinator-incharges'],
    queryFn: () => api.getClassIncharges(),
  });

  const { data: facultyList = [] } = useQuery({
    queryKey: ['all-faculty-for-incharge'],
    queryFn: () => api.getAllFaculty('All'),
  });

  // Query 1st-Year Subjects
  const { data: sectionSubjects = [], isLoading: subjectsLoading, refetch: refetchSubjects } = useQuery({
    queryKey: ['coordinator-subjects', subjSem, subjDept, subjSection],
    queryFn: () => api.getAllotments(subjSem, subjDept),
  });

  // Query 1st-Year Attendance Summaries
  const { data: fresherAttendanceData, isLoading: attLoading, refetch: refetchFresherAtt } = useQuery({
    queryKey: ['coordinator-fresher-attendance', attSem, attDept, attSection],
    queryFn: () => api.getCoordinatorFresherAttendance({ semester: attSem, department: attDept, section: attSection }),
  });

  // ── Excel Parser for Admission Roster ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadStatus({ type: 'idle', message: '' });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        // Skip any leading non-data rows (instruction rows) by finding the real header row
        // The header row has 'Admission ID' or 'Full Name'. Parse from that row onward.
        const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        const headerRowIdx = allRows.findIndex(
          (row) =>
            row.some((cell) =>
              String(cell).toLowerCase().includes('admission') ||
              String(cell).toLowerCase().includes('full name')
            )
        );
        let data: any[] = [];
        if (headerRowIdx >= 0) {
          const headers = allRows[headerRowIdx].map((h) => String(h).trim());
          data = allRows.slice(headerRowIdx + 1).reduce((acc: any[], row) => {
            const obj: any = {};
            headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
            if (Object.values(obj).some((v) => String(v).trim())) acc.push(obj);
            return acc;
          }, []);
        } else {
          data = XLSX.utils.sheet_to_json(ws);
        }
        setParsedRoster(data);
      } catch {
        setUploadStatus({ type: 'error', message: 'Failed to parse Excel sheet. Ensure valid .xlsx/.csv format.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const uploadRosterMutation = useMutation({
    mutationFn: (students: any[]) => api.uploadFresherRoster(students),
    onSuccess: (data: any) => {
      setUploadStatus({
        type: 'success',
        message: data.message || `Successfully processed ${data.inserted} new freshers and updated ${data.updated} records.`,
      });
      queryClient.invalidateQueries({ queryKey: ['coordinator-freshers'] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-stats'] });
      setUploadFile(null);
      setParsedRoster([]);
    },
    onError: (err: any) => {
      setUploadStatus({ type: 'error', message: err.message || 'Failed to upload admission roster.' });
    },
  });

  const assignInchargeMutation = useMutation({
    mutationFn: (data: { semester_label: '1-1' | '1-2'; department: string; section: string; faculty_email: string; faculty_name?: string }) =>
      api.assignClassIncharge(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coordinator-incharges'] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-stats'] });
      setShowInchargeModal(false);
      setInchargeFacultyEmail('');
      setInchargeFacultyName('');
    },
  });

  const deleteInchargeMutation = useMutation({
    mutationFn: (id: string) => api.deleteClassIncharge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coordinator-incharges'] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-stats'] });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (data: { department: string; section?: string }) => api.promoteSection(data.department, data.section),
    onSuccess: (res: any) => {
      setPromoStatus({ type: 'success', message: res.message || 'Section promoted successfully.' });
      queryClient.invalidateQueries({ queryKey: ['coordinator-freshers'] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-stats'] });
    },
    onError: (err: any) => {
      setPromoStatus({ type: 'error', message: err.message || 'Promotion failed.' });
    },
  });

  const addSubjectMutation = useMutation({
    mutationFn: (data: {
      semester: string;
      department: string;
      section: string;
      subject_name: string;
      subject_type: 'Theory' | 'Lab';
      faculty_email: string;
      faculty_name?: string;
    }) =>
      api.createSingleAllotment({
        semester: data.semester,
        department: data.department,
        section: data.section,
        subject_name: data.subject_name,
        subject_type: data.subject_type,
        faculty_email: data.faculty_email,
        faculty_name: data.faculty_name || '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coordinator-subjects'] });
      setShowAddSubjectModal(false);
      setNewSubjName('');
      setNewSubjFacultyEmail('');
      setNewSubjFacultyName('');
    },
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: (id: string) => api.deleteAllotment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coordinator-subjects'] });
    },
  });

  const syncRosterMutation = useMutation({
    mutationFn: (data: { semester: string; department: string; section: string }) =>
      api.fresherSectionSync(data),
    onSuccess: (res: any) => {
      setSyncStatus({ type: 'success', message: res.message || 'Roster synchronized.' });
      queryClient.invalidateQueries({ queryKey: ['coordinator-subjects'] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-fresher-attendance'] });
    },
    onError: (err: any) => {
      setSyncStatus({ type: 'error', message: err.message || 'Sync failed.' });
    },
  });

  const downloadAdmissionTemplate = () => {
    const wsData = [
      // Row 1: Instructions
      ['⚠ LOGIN CREDENTIALS: Username = Personal Mobile | Initial Password = Date of Birth (YYYY-MM-DD)', '', '', '', '', '', ''],
      // Row 2: Column headers
      ['Admission ID', 'Full Name', 'Date of Birth (YYYY-MM-DD) [= Initial Password]', 'Personal Mobile [= Username]', 'Personal Email', 'Department', 'Section'],
      // Sample rows
      ['ADM2025001', 'Rahul Kumar', '2007-05-14', '9876543210', 'rahul.personal@gmail.com', 'CSE', 'A'],
      ['ADM2025002', 'Pooja Reddy', '2007-08-22', '9876543211', 'pooja.personal@gmail.com', 'CSE (Data Science)', 'A'],
      ['ADM2025003', 'Sai Teja', '2007-02-10', '9876543212', 'saiteja@gmail.com', 'ECE', 'B'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Merge instruction row across columns A-G
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fresher_Admissions');
    XLSX.writeFile(wb, 'Fresher_Admission_Roster_Template.xlsx');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Hero Header ── */}
      <div className="bg-gradient-to-r from-pink-950/40 via-surface to-surface border border-pink-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              1st Year Oversight Command Center
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-textPrimary tracking-tight">
              1st Year Coordinator Dashboard
            </h1>
            <p className="text-xs md:text-sm text-textSecondary mt-1">
              Complete oversight across all 1st-year (1-1 & 1-2) fresher admissions, email migrations, attendance tracking, and class incharges across all departments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                refetchStats();
                refetchFreshers();
                refetchIncharges();
              }}
              className="p-2.5 rounded-xl border border-borderLine bg-surface-2 hover:bg-surface-3 text-textSecondary hover:text-textPrimary transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <PillButton
              variant="primary"
              size="md"
              onClick={() => setShowUploadModal(true)}
              className="bg-pink-600 hover:bg-pink-700 shadow-pink-600/30 flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Admission Roster</span>
            </PillButton>
          </div>
        </div>
      </div>

      {/* ── KPI Stats Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Freshers */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm hover:border-pink-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Total 1st-Year Freshers</span>
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-textPrimary">{stats?.totalFreshers || 0}</span>
            <span className="text-xs text-textSecondary">Enrolled</span>
          </div>
        </div>

        {/* Card 2: Stage 0 (Admission ID Login) */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Stage 0 (Admission ID)</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{stats?.stage0AdmissionCount || 0}</span>
            <span className="text-xs text-textSecondary">Awaiting College Email</span>
          </div>
        </div>

        {/* Card 3: Stage 1 (College Email Linked) */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Stage 1 (Email Linked)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{stats?.stage1EmailLinkedCount || 0}</span>
            <span className="text-xs text-textSecondary">Migrated</span>
          </div>
        </div>

        {/* Card 4: Class Incharges */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Class Incharges</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-400">{stats?.activeClassInchargesCount || 0}</span>
            <span className="text-xs text-textSecondary">1st-Year Sections</span>
          </div>
        </div>
      </div>

      {/* ── Main Tab Navigation ── */}
      <div className="flex flex-wrap bg-surface-2 p-1 rounded-2xl border border-borderLine max-w-3xl gap-1">
        <button
          onClick={() => setActiveTab('freshers')}
          className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'freshers'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Freshers</span>
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'subjects'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Section Subjects</span>
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Attendance Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('incharge')}
          className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'incharge'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Class Incharges</span>
        </button>

        <button
          onClick={() => setActiveTab('promotion')}
          className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'promotion'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Promotion</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: FRESHER ADMISSIONS & MIGRATION DIRECTORY */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'freshers' && (
        <div className="space-y-4">
          {/* Controls & Filters Bar */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-textSecondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name, admission ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              {/* Department Dropdown */}
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                <option value="All">All Departments</option>
                {VALID_DEPARTMENT_NAMES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Section Dropdown */}
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                <option value="All">All Sections</option>
                {['A', 'B', 'C', 'D', 'E', 'F'].map((s) => (
                  <option key={s} value={s}>Section {s}</option>
                ))}
              </select>

              {/* Migration Stage Filter */}
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                <option value="All">All Stages</option>
                <option value="0">Stage 0 (Admission ID)</option>
                <option value="1">Stage 1 (Email Linked)</option>
              </select>
            </div>

            <div className="text-xs text-textSecondary">
              Showing <strong className="text-textPrimary">{freshers.length}</strong> 1st-year students
            </div>
          </div>

          {/* Directory Table */}
          <div className="bg-surface border border-borderLine rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                  <tr>
                    <th className="py-3 px-4">Admission ID</th>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Dept / Sec</th>
                    <th className="py-3 px-4">DOB</th>
                    <th className="py-3 px-4">Personal Contact</th>
                    <th className="py-3 px-4">Active Login Email / User</th>
                    <th className="py-3 px-4">Migration Stage</th>
                    <th className="py-3 px-4 text-center">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {freshersLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-textMuted">
                        Loading 1st-year freshers directory...
                      </td>
                    </tr>
                  ) : freshers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-textMuted">
                        No 1st-year freshers found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    freshers.map((st: FresherStudent) => (
                      <tr key={st.roll_number} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-pink-400">
                          {st.admission_id || st.roll_number}
                        </td>
                        <td className="py-3 px-4 font-bold text-textPrimary">
                          {st.name}
                        </td>
                        <td className="py-3 px-4 text-textSecondary">
                          <span className="px-2 py-0.5 rounded-md bg-surface-2 border border-borderLine font-semibold">
                            {st.department} • Sec {st.section || 'A'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-textSecondary">
                          {st.dob ? new Date(st.dob).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="py-3 px-4 text-textSecondary">
                          <div>{st.personal_mobile || '—'}</div>
                          <div className="text-[10px] text-textMuted">{st.personal_email || ''}</div>
                        </td>
                        <td className="py-3 px-4 text-textSecondary font-mono">
                          {st.migration_stage === 1 ? (
                            <span className="text-emerald-400 font-semibold">{st.email}</span>
                          ) : (
                            <span className="text-amber-400 font-semibold">
                              {st.username ? `@${st.username}` : 'Admission ID Login'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {st.migration_stage === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px]">
                              <CheckCircle2 className="w-3 h-3" />
                              Stage 1 (Email Linked)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px]">
                              <Clock className="w-3 h-3" />
                              Stage 0 (Admission ID)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-bold ${
                              Number(st.attendance_pct || 100) < 75 ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {st.attendance_pct !== undefined ? `${st.attendance_pct}%` : '100%'}
                          </span>
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
      {/* TAB 2: CLASS INCHARGE MANAGEMENT (1ST YEAR ONLY) */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'incharge' && (
        <div className="space-y-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Award className="w-5 h-5 text-pink-400" />
                1st-Year Class Incharge Assignments
              </h2>
              <p className="text-xs text-textSecondary mt-0.5">
                Assign one Class Incharge per 1st-year section (1-1 and 1-2). Class Incharges have section-wide view access to attendance intelligence & student records.
              </p>
            </div>

            <PillButton
              variant="primary"
              size="sm"
              onClick={() => setShowInchargeModal(true)}
              className="bg-pink-600 hover:bg-pink-700 shadow-pink-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Class Incharge</span>
            </PillButton>
          </div>

          {/* Incharges List */}
          <div className="bg-surface border border-borderLine rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                <tr>
                  <th className="py-3 px-4">Semester</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Assigned Class Incharge</th>
                  <th className="py-3 px-4">Faculty Email</th>
                  <th className="py-3 px-4">Assigned On</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {inchargesLoading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-textMuted">
                      Loading Class Incharges...
                    </td>
                  </tr>
                ) : incharges.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-textMuted">
                      No Class Incharges assigned yet. Click "Assign Class Incharge" above.
                    </td>
                  </tr>
                ) : (
                  incharges.map((inc: ClassIncharge) => (
                    <tr key={inc.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-brand-primary">
                        Sem {inc.semester_label}
                      </td>
                      <td className="py-3 px-4 font-semibold text-textPrimary">
                        {inc.department}
                      </td>
                      <td className="py-3 px-4 font-bold text-textPrimary">
                        Section {inc.section}
                      </td>
                      <td className="py-3 px-4 font-bold text-textPrimary">
                        {inc.faculty_name || inc.faculty_email.split('@')[0]}
                      </td>
                      <td className="py-3 px-4 font-mono text-textSecondary">
                        {inc.faculty_email}
                      </td>
                      <td className="py-3 px-4 text-textSecondary">
                        {new Date(inc.created_at).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove Class Incharge for ${inc.department} Sem ${inc.semester_label} Sec ${inc.section}?`)) {
                              deleteInchargeMutation.mutate(inc.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remove Assignment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB: SECTION SUBJECT ASSIGNMENTS (1ST YEAR) */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Semester Toggle */}
              <div className="flex bg-surface-2 p-1 rounded-xl border border-borderLine">
                <button
                  type="button"
                  onClick={() => setSubjSem('1-1')}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    subjSem === '1-1' ? 'bg-pink-600 text-white shadow' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Sem 1-1
                </button>
                <button
                  type="button"
                  onClick={() => setSubjSem('1-2')}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    subjSem === '1-2' ? 'bg-pink-600 text-white shadow' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Sem 1-2
                </button>
              </div>

              {/* Department Dropdown */}
              <select
                value={subjDept}
                onChange={(e) => setSubjDept(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                {VALID_DEPARTMENT_NAMES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Section Dropdown */}
              <select
                value={subjSection}
                onChange={(e) => setSubjSection(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                {['A', 'B', 'C', 'D', 'E', 'F'].map((s) => (
                  <option key={s} value={s}>Section {s}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <PillButton
                variant="primary"
                size="sm"
                onClick={() => {
                  setSyncStatus({ type: 'idle', message: '' });
                  syncRosterMutation.mutate({
                    semester: subjSem,
                    department: subjDept,
                    section: subjSection,
                  });
                }}
                disabled={syncRosterMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncRosterMutation.isPending ? 'animate-spin' : ''}`} />
                <span>{syncRosterMutation.isPending ? 'Syncing...' : 'Sync Section Roster'}</span>
              </PillButton>

              <PillButton
                variant="primary"
                size="sm"
                onClick={() => setShowAddSubjectModal(true)}
                className="bg-pink-600 hover:bg-pink-700 shadow-pink-600/30 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Subject</span>
              </PillButton>
            </div>
          </div>

          {syncStatus.message && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold ${
                syncStatus.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-950/60 border-red-500/50 text-red-300'
              }`}
            >
              {syncStatus.message}
            </div>
          )}

          {/* Subjects Table */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-borderLine flex items-center justify-between bg-surface-2">
              <div>
                <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-pink-400" />
                  <span>Assigned Subjects — {subjDept} (Section {subjSection}) • Sem {subjSem}</span>
                </h3>
                <p className="text-[11px] text-textSecondary mt-0.5">
                  Subjects allotted to this 1st-year section. Faculty can mark attendance directly. Click "Sync Section Roster" to auto-enroll newly admitted freshers.
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                {(sectionSubjects.filter((s: any) => s.section === subjSection || s.section === 'All') || []).length} Subject(s)
              </span>
            </div>

            {subjectsLoading ? (
              <div className="py-12 text-center text-xs text-textSecondary flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-pink-400" />
                <span>Loading assigned subjects...</span>
              </div>
            ) : sectionSubjects.filter((s: any) => s.section === subjSection || s.section === 'All').length === 0 ? (
              <div className="py-12 text-center text-textSecondary text-xs space-y-2">
                <p>No subjects assigned for {subjDept} Section {subjSection} in Semester {subjSem}.</p>
                <button
                  type="button"
                  onClick={() => setShowAddSubjectModal(true)}
                  className="text-xs font-bold text-pink-400 hover:underline"
                >
                  + Add First Subject
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textSecondary uppercase font-bold border-b border-borderLine text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Subject Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Section</th>
                      <th className="py-3 px-4">Assigned Faculty</th>
                      <th className="py-3 px-4">Faculty Email</th>
                      <th className="py-3 px-4 text-center">Enrolled</th>
                      <th className="py-3 px-4 text-center">Sessions</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine font-medium text-textPrimary">
                    {sectionSubjects
                      .filter((s: any) => s.section === subjSection || s.section === 'All')
                      .map((subj: any) => (
                        <tr key={subj.id} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-3 px-4 font-bold text-textPrimary flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                            {subj.subject_name}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              subj.subject_type === 'Lab'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {subj.subject_type || 'Theory'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-textSecondary">Section {subj.section}</td>
                          <td className="py-3 px-4 font-semibold text-textPrimary">{subj.faculty_name || '—'}</td>
                          <td className="py-3 px-4 text-textSecondary font-mono text-[11px]">{subj.faculty_email}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-surface-2 text-textSecondary font-bold text-[10px] border border-borderLine">
                              {subj.roster_count || 0} students
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-pink-400">
                            {subj.sessions_count || 0}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete subject "${subj.subject_name}" from Section ${subj.section}?`)) {
                                  deleteSubjectMutation.mutate(subj.id);
                                }
                              }}
                              className="p-1 text-textSecondary hover:text-red-400 transition-colors cursor-pointer"
                              title="Delete Subject Allotment"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ATTENDANCE OVERVIEW (1ST YEAR) */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex bg-surface-2 p-1 rounded-xl border border-borderLine">
                <button
                  type="button"
                  onClick={() => setAttSem('1-1')}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    attSem === '1-1' ? 'bg-pink-600 text-white shadow' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Sem 1-1
                </button>
                <button
                  type="button"
                  onClick={() => setAttSem('1-2')}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    attSem === '1-2' ? 'bg-pink-600 text-white shadow' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Sem 1-2
                </button>
              </div>

              <select
                value={attDept}
                onChange={(e) => setAttDept(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                <option value="All">All Departments</option>
                {VALID_DEPARTMENT_NAMES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={attSection}
                onChange={(e) => setAttSection(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                <option value="All">All Sections</option>
                {['A', 'B', 'C', 'D', 'E', 'F'].map((s) => (
                  <option key={s} value={s}>Section {s}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => refetchFresherAtt()}
              className="p-2 rounded-xl border border-borderLine bg-surface-2 hover:bg-surface-3 text-textSecondary hover:text-textPrimary transition-all cursor-pointer"
              title="Refresh Attendance Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Summary Table */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-borderLine flex items-center justify-between bg-surface-2">
              <div>
                <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-pink-400" />
                  <span>1st-Year Section Attendance Intelligence — Sem {attSem}</span>
                </h3>
                <p className="text-[11px] text-textSecondary mt-0.5">
                  Real-time attendance summaries posted by subject faculty across all 1st-year sections.
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                {fresherAttendanceData?.summaries?.length || 0} Subject Allotment(s)
              </span>
            </div>

            {attLoading ? (
              <div className="py-12 text-center text-xs text-textSecondary flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-pink-400" />
                <span>Aggregating section attendance records...</span>
              </div>
            ) : !fresherAttendanceData?.summaries || fresherAttendanceData.summaries.length === 0 ? (
              <div className="py-12 text-center text-textSecondary text-xs">
                No attendance sessions recorded yet for {attDept === 'All' ? 'any department' : attDept} in Semester {attSem}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textSecondary uppercase font-bold border-b border-borderLine text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Section</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Faculty</th>
                      <th className="py-3 px-4 text-center">Sessions Held</th>
                      <th className="py-3 px-4 text-center">Enrolled</th>
                      <th className="py-3 px-4 text-center">Avg Attendance</th>
                      <th className="py-3 px-4 text-center">At Risk (&lt;75%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine font-medium text-textPrimary">
                    {fresherAttendanceData.summaries.map((s: any) => (
                      <tr key={s.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-textPrimary">{s.department}</td>
                        <td className="py-3 px-4 font-bold text-textSecondary">Section {s.section}</td>
                        <td className="py-3 px-4 font-bold text-textPrimary">
                          <div className="flex items-center gap-2">
                            <span>{s.subject_name}</span>
                            <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-surface-2 text-textSecondary border border-borderLine">
                              {s.subject_type}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-textSecondary">{s.faculty_name || s.faculty_email}</td>
                        <td className="py-3 px-4 text-center font-bold text-pink-400">{s.total_sessions} ({s.total_periods_held} hrs)</td>
                        <td className="py-3 px-4 text-center text-textSecondary">{s.enrolled_students}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${
                            s.avg_percentage >= 75
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {s.avg_percentage}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.at_risk_count > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-bold text-[11px] border border-red-500/20">
                              {s.at_risk_count} student(s)
                            </span>
                          ) : (
                            <span className="text-emerald-400 text-xs font-semibold">✓ None</span>
                          )}
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

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: SEMESTER PROMOTION (1-2 → 2-1) */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'promotion' && (
        <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-sm max-w-2xl mx-auto space-y-6">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-400 flex items-center justify-center mb-3">
              <GraduationCap className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-textPrimary">
              Promote 1st-Year Batch to 2nd Year (2-1)
            </h2>
            <p className="text-xs text-textSecondary mt-1 leading-relaxed">
              When 1st-year students complete Semester 1-2, advancing their records automatically transfers active dashboard visibility and supervision from the <strong>1st Year Coordinator</strong> to the respective <strong>Department HOD</strong>.
            </p>
          </div>

          <div className="bg-surface-2 p-4 rounded-xl border border-borderLine text-xs space-y-2 text-textSecondary">
            <div className="font-bold text-textPrimary flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Promotion Impact Rules:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Student status advances to <strong>2nd Year</strong>.</li>
              <li>Host Department HOD gains active oversight in their HOD portal.</li>
              <li>Historical 1-1 and 1-2 attendance records remain permanently archived for Coordinator audit.</li>
            </ul>
          </div>

          {promoStatus.message && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold ${
                promoStatus.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-950/60 border-red-500/50 text-red-300'
              }`}
            >
              {promoStatus.message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-textPrimary mb-1">Select Department *</label>
              <select
                value={promoDept}
                onChange={(e) => setPromoDept(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                {VALID_DEPARTMENT_NAMES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textPrimary mb-1">Section</label>
              <select
                value={promoSection}
                onChange={(e) => setPromoSection(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-pink-500 font-semibold"
              >
                <option value="All">All Sections</option>
                {['A', 'B', 'C', 'D', 'E', 'F'].map((s) => (
                  <option key={s} value={s}>Section {s}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={promoteMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to promote ${promoDept} (Section ${promoSection}) from 1st Year to 2nd Year (2-1)? Active visibility will shift to the ${promoDept} HOD.`
                )
              ) {
                promoteMutation.mutate({ department: promoDept, section: promoSection });
              }
            }}
            className="w-full py-3 px-4 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <GraduationCap className="w-4 h-4" />
            <span>{promoteMutation.isPending ? 'Advancing Batch...' : `Promote ${promoDept} to 2nd Year`}</span>
          </button>
        </div>
      )}

      {/* ── Modal: Upload Admission Roster ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-borderLine">
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Upload className="w-5 h-5 text-pink-400" />
                Upload 1st-Year Admission Roster
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-textSecondary hover:text-textPrimary text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-textSecondary leading-relaxed">
              Upload the official Excel sheet of newly admitted 1st-year freshers. Required columns: <strong>Admission ID, Full Name, Date of Birth (YYYY-MM-DD), Personal Mobile, Personal Email, Department, Section</strong>.
            </p>

            <div className="flex justify-between items-center bg-surface-2 p-3 rounded-xl border border-borderLine">
              <span className="text-xs text-textSecondary font-semibold">Need standard format?</span>
              <button
                type="button"
                onClick={downloadAdmissionTemplate}
                className="text-xs font-bold text-pink-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel Template</span>
              </button>
            </div>

            {uploadStatus.message && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold ${
                  uploadStatus.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                    : 'bg-red-950/60 border-red-500/50 text-red-300'
                }`}
              >
                {uploadStatus.message}
              </div>
            )}

            <div className="border-2 border-dashed border-borderLine hover:border-pink-500/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-surface-2/30">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="fresher-file-input"
              />
              <label htmlFor="fresher-file-input" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 text-pink-400 mx-auto" />
                <p className="text-xs font-bold text-textPrimary">
                  {uploadFile ? uploadFile.name : 'Click to select Excel admission sheet (.xlsx, .csv)'}
                </p>
                {parsedRoster.length > 0 && (
                  <p className="text-[11px] text-emerald-400 font-semibold">
                    ✓ Parsed {parsedRoster.length} student rows ready for processing
                  </p>
                )}
              </label>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="flex-1 py-2 text-xs font-semibold rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={parsedRoster.length === 0 || uploadRosterMutation.isPending}
                onClick={() => uploadRosterMutation.mutate(parsedRoster)}
                className="flex-1 py-2 text-xs font-bold rounded-xl bg-pink-600 hover:bg-pink-700 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {uploadRosterMutation.isPending ? 'Uploading Roster...' : `Upload ${parsedRoster.length} Freshers`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Assign Class Incharge ── */}
      {showInchargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-borderLine">
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Award className="w-5 h-5 text-pink-400" />
                Assign Class Incharge (1st Year)
              </h2>
              <button
                onClick={() => setShowInchargeModal(false)}
                className="text-textSecondary hover:text-textPrimary text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inchargeFacultyEmail) return;
                assignInchargeMutation.mutate({
                  semester_label: inchargeSem,
                  department: inchargeDept,
                  section: inchargeSection,
                  faculty_email: inchargeFacultyEmail,
                  faculty_name: inchargeFacultyName,
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Semester *</label>
                  <select
                    value={inchargeSem}
                    onChange={(e) => setInchargeSem(e.target.value as '1-1' | '1-2')}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold"
                  >
                    <option value="1-1">Semester 1-1</option>
                    <option value="1-2">Semester 1-2</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Section *</label>
                  <select
                    value={inchargeSection}
                    onChange={(e) => setInchargeSection(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold"
                  >
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((s) => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Host Department *</label>
                <select
                  value={inchargeDept}
                  onChange={(e) => setInchargeDept(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold"
                >
                  {VALID_DEPARTMENT_NAMES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Select Faculty Member *</label>
                <select
                  value={inchargeFacultyEmail}
                  onChange={(e) => {
                    const email = e.target.value;
                    setInchargeFacultyEmail(email);
                    const matched = facultyList.find((f: any) => f.email?.toLowerCase() === email.toLowerCase());
                    if (matched) setInchargeFacultyName(matched.name);
                  }}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold"
                >
                  <option value="">-- Choose Faculty (All Departments) --</option>
                  {/* Group faculty by department */}
                  {Array.from(new Set(facultyList.map((f: any) => f.department || 'General'))).sort().map((deptName) => (
                    <optgroup key={deptName} label={`Department: ${deptName}`}>
                      {facultyList
                        .filter((f: any) => (f.department || 'General') === deptName)
                        .map((f: any) => (
                          <option key={f.faculty_id || f.email} value={f.email}>
                            {f.name} • {f.email}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowInchargeModal(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inchargeFacultyEmail || assignInchargeMutation.isPending}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-pink-600 hover:bg-pink-700 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {assignInchargeMutation.isPending ? 'Assigning...' : 'Assign Class Incharge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Add 1st-Year Subject Allotment ── */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-borderLine">
              <h2 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-pink-400" />
                Add Subject — {subjDept} (Section {subjSection})
              </h2>
              <button
                onClick={() => setShowAddSubjectModal(false)}
                className="text-textSecondary hover:text-textPrimary text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newSubjName.trim() || !newSubjFacultyEmail.trim()) return;
                addSubjectMutation.mutate({
                  semester: subjSem,
                  department: subjDept,
                  section: subjSection,
                  subject_name: newSubjName.trim(),
                  subject_type: newSubjType,
                  faculty_email: newSubjFacultyEmail.trim(),
                  faculty_name: newSubjFacultyName.trim() || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Subject Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics - I / C Programming"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Subject Type</label>
                  <select
                    value={newSubjType}
                    onChange={(e) => setNewSubjType(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold"
                  >
                    <option value="Theory">Theory (1 Period)</option>
                    <option value="Lab">Lab (2 Periods)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Section</label>
                  <input
                    type="text"
                    value={`Section ${subjSection}`}
                    disabled
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-surface-2 text-textSecondary font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Assigned Faculty Member *</label>
                <select
                  value={newSubjFacultyEmail}
                  onChange={(e) => {
                    const email = e.target.value;
                    setNewSubjFacultyEmail(email);
                    const matched = facultyList.find((f: any) => f.email?.toLowerCase() === email.toLowerCase());
                    if (matched) setNewSubjFacultyName(matched.name);
                  }}
                  required
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-borderLine bg-background text-textPrimary font-semibold"
                >
                  <option value="">-- Choose Faculty (All Departments) --</option>
                  {/* Group faculty by department */}
                  {Array.from(new Set(facultyList.map((f: any) => f.department || 'General'))).sort().map((deptName) => (
                    <optgroup key={deptName} label={`Department: ${deptName}`}>
                      {facultyList
                        .filter((f: any) => (f.department || 'General') === deptName)
                        .map((f: any) => (
                          <option key={f.faculty_id || f.email} value={f.email}>
                            {f.name} • {f.email}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddSubjectModal(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSubjName.trim() || !newSubjFacultyEmail || addSubjectMutation.isPending}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-pink-600 hover:bg-pink-700 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {addSubjectMutation.isPending ? 'Saving...' : 'Add Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default CoordinatorDashboardPage;
