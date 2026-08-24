import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Download,
  BookOpen,
  Users,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Search,
  FileSpreadsheet,
  RefreshCw,
  Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../../lib/api';
import { SemesterLabel, SubjectAllotment, SubjectType } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../../lib/validation/auth';

const SEMESTERS: SemesterLabel[] = ['2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

export const AttendanceManagementTab: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeSubTab, setActiveSubTab] = useState<'allotments' | 'rosters'>('allotments');
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel>('3-1');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Allotment Upload State
  const [allotmentFile, setAllotmentFile] = useState<File | null>(null);
  const [parsedAllotments, setParsedAllotments] = useState<any[]>([]);
  const [allotmentUploadStatus, setAllotmentUploadStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
    details?: any[];
  }>({ type: 'idle', message: '' });
  const [isUploadingAllotments, setIsUploadingAllotments] = useState(false);

  // Roster Upload State
  const [rosterSemester, setRosterSemester] = useState<SemesterLabel>('3-1');
  const [selectedAllotmentId, setSelectedAllotmentId] = useState<string>('');
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [parsedRoster, setParsedRoster] = useState<any[]>([]);
  const [rosterUploadStatus, setRosterUploadStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
    details?: any[];
  }>({ type: 'idle', message: '' });
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);

  // Inspect Roster Modal
  const [inspectAllotment, setInspectAllotment] = useState<SubjectAllotment | null>(null);

  // ── Fetch Allotments ──
  const { data: allotments = [], isLoading: isLoadingAllotments } = useQuery({
    queryKey: ['attendanceAllotments', selectedSemester, selectedDepartment],
    queryFn: () => api.getAllotments(selectedSemester, selectedDepartment === 'All' ? '' : selectedDepartment),
  });

  // ── Fetch Allotments for Roster dropdown ──
  const { data: rosterAllotments = [] } = useQuery({
    queryKey: ['attendanceAllotmentsForRoster', rosterSemester],
    queryFn: () => api.getAllotments(rosterSemester),
  });

  // ── Fetch Roster for Inspect Modal ──
  const { data: currentRoster = [], isLoading: isLoadingRoster } = useQuery({
    queryKey: ['attendanceRoster', inspectAllotment?.id],
    queryFn: () => (inspectAllotment?.id ? api.getRoster(inspectAllotment.id) : Promise.resolve([])),
    enabled: Boolean(inspectAllotment?.id),
  });

  // ── Delete Allotment Mutation ──
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAllotment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
    },
  });

  // ── Download Allotment Template ──
  const handleDownloadAllotmentTemplate = () => {
    const wsData = [
      ['Faculty Name', 'Faculty Email', 'Subject Allotted', 'Section', 'Subject Type', 'Department'],
      ['Dr. K. V. Subbaiah', 'kvsubbaiah@rgmcet.edu.in', 'Database Management Systems', 'A', 'Theory', 'CSE'],
      ['Dr. K. V. Subbaiah', 'kvsubbaiah@rgmcet.edu.in', 'DBMS Lab', 'A', 'Lab', 'CSE'],
      ['Prof. M. Ramesh', 'mramesh@rgmcet.edu.in', 'Microprocessors & Microcontrollers', 'B', 'Theory', 'ECE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Allotments');
    XLSX.writeFile(wb, `Faculty_Subject_Allotment_Template_${selectedSemester}.xlsx`);
  };

  // ── Download Roster Template ──
  const handleDownloadRosterTemplate = () => {
    const wsData = [
      ['Roll Number', 'Student Email'],
      ['22091A3201', '22091a3201@rgmcet.edu.in'],
      ['22091A3202', '22091a3202@rgmcet.edu.in'],
      ['22091A3203', '22091a3203@rgmcet.edu.in'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roster');
    XLSX.writeFile(wb, `Student_Roster_Template.xlsx`);
  };

  // ── Parse Allotment Excel ──
  const handleAllotmentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAllotmentFile(file);
    setAllotmentUploadStatus({ type: 'idle', message: '' });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);
        setParsedAllotments(data);
      } catch (err: any) {
        setAllotmentUploadStatus({
          type: 'error',
          message: `Failed to parse Excel file: ${err.message}`,
        });
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Submit Allotments ──
  const handleUploadAllotments = async () => {
    if (parsedAllotments.length === 0) return;
    setIsUploadingAllotments(true);
    setAllotmentUploadStatus({ type: 'idle', message: '' });

    try {
      const res = await api.uploadAllotments(selectedSemester, parsedAllotments);
      setAllotmentUploadStatus({
        type: res.errorsCount > 0 ? 'error' : 'success',
        message: res.message,
        details: res.errors,
      });
      setAllotmentFile(null);
      setParsedAllotments([]);
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
    } catch (err: any) {
      setAllotmentUploadStatus({
        type: 'error',
        message: err.message || 'Failed to upload allotments',
      });
    } finally {
      setIsUploadingAllotments(false);
    }
  };

  // ── Parse Roster Excel ──
  const handleRosterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRosterFile(file);
    setRosterUploadStatus({ type: 'idle', message: '' });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);
        setParsedRoster(data);
      } catch (err: any) {
        setRosterUploadStatus({
          type: 'error',
          message: `Failed to parse Excel file: ${err.message}`,
        });
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Submit Roster ──
  const handleUploadRoster = async () => {
    if (!selectedAllotmentId) {
      setRosterUploadStatus({
        type: 'error',
        message: 'Please select a Subject Allotment before uploading the roster.',
      });
      return;
    }
    if (parsedRoster.length === 0) return;

    setIsUploadingRoster(true);
    setRosterUploadStatus({ type: 'idle', message: '' });

    try {
      const res = await api.uploadRoster(selectedAllotmentId, parsedRoster);
      setRosterUploadStatus({
        type: res.errorsCount > 0 ? 'error' : 'success',
        message: res.message,
        details: res.errors,
      });
      setRosterFile(null);
      setParsedRoster([]);
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
    } catch (err: any) {
      setRosterUploadStatus({
        type: 'error',
        message: err.message || 'Failed to upload roster',
      });
    } finally {
      setIsUploadingRoster(false);
    }
  };

  const filteredAllotments = allotments.filter((a: SubjectAllotment) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.subject_name.toLowerCase().includes(q) ||
      a.faculty_name.toLowerCase().includes(q) ||
      a.faculty_email.toLowerCase().includes(q) ||
      a.section.toLowerCase().includes(q) ||
      a.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Sub-tab switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface border border-borderLine">
        <div>
          <h2 className="text-xl font-bold text-textPrimary flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-brand-primary" />
            Attendance Configuration & Allotments
          </h2>
          <p className="text-xs text-textSecondary mt-1">
            Manage faculty–subject allocations and enroll student rosters per semester.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-surface-2 p-1 rounded-xl border border-borderLine">
          <button
            onClick={() => setActiveSubTab('allotments')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'allotments'
                ? 'bg-brand-primary text-white shadow-brand'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            1. Faculty Allotment
          </button>
          <button
            onClick={() => setActiveSubTab('rosters')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'rosters'
                ? 'bg-brand-primary text-white shadow-brand'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            2. Student Roster
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: FACULTY ALLOTMENT */}
      {activeSubTab === 'allotments' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Upload className="w-4 h-4 text-brand-primary" />
                  Upload Faculty–Subject Allotment Sheet
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Assign subjects to faculty with Theory or Lab classification.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadAllotmentTemplate}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Excel Template
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1.5">
                  Target Semester
                </label>
                <select
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value as SemesterLabel)}
                  className="w-full bg-surface-2 border border-borderLine rounded-xl px-3.5 py-2.5 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
                >
                  {SEMESTERS.map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1.5">
                  Choose Allotment Excel Sheet (.xlsx / .xls)
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleAllotmentFileChange}
                  className="w-full text-xs text-textSecondary file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-soft file:text-brand-primary hover:file:bg-brand-primary hover:file:text-white file:transition-all cursor-pointer bg-surface-2 border border-borderLine rounded-xl p-1"
                />
              </div>
            </div>

            {parsedAllotments.length > 0 && (
              <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-textPrimary flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                    Ready to Upload: {parsedAllotments.length} Allotment Row(s) for Semester {selectedSemester}
                  </p>
                  <button
                    onClick={handleUploadAllotments}
                    disabled={isUploadingAllotments}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-50"
                  >
                    {isUploadingAllotments ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm & Import Allotments
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {allotmentUploadStatus.type !== 'idle' && (
              <div
                className={`p-4 rounded-xl border ${
                  allotmentUploadStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-alert-soft border-alert/30 text-alert'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {allotmentUploadStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div className="text-xs space-y-1 flex-1">
                    <p className="font-bold">{allotmentUploadStatus.message}</p>
                    {allotmentUploadStatus.details && allotmentUploadStatus.details.length > 0 && (
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto text-[11px] opacity-90">
                        {allotmentUploadStatus.details.map((err, idx) => (
                          <p key={idx}>
                            • Row {err.row}: {err.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Allotments Table */}
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-primary" />
                  Current Subject Allotments ({filteredAllotments.length})
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Filter by department or search faculty and subjects.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input
                    type="text"
                    placeholder="Search subject or faculty..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-surface-2 border border-borderLine rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary w-48 sm:w-60"
                  />
                </div>

                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="bg-surface-2 border border-borderLine rounded-xl px-3 py-1.5 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
                >
                  <option value="All">All Departments</option>
                  {VALID_DEPARTMENT_NAMES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-borderLine">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                  <tr>
                    <th className="py-3 px-4">Sem</th>
                    <th className="py-3 px-4">Subject Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Sec</th>
                    <th className="py-3 px-4">Faculty In-Charge</th>
                    <th className="py-3 px-4">Dept</th>
                    <th className="py-3 px-4 text-center">Enrolled</th>
                    <th className="py-3 px-4 text-center">Sessions</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {isLoadingAllotments ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-textMuted">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                        Loading subject allotments...
                      </td>
                    </tr>
                  ) : filteredAllotments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-textMuted">
                        No allotments found for Semester {selectedSemester}. Upload an allotment sheet above to get started.
                      </td>
                    </tr>
                  ) : (
                    filteredAllotments.map((a: SubjectAllotment) => (
                      <tr key={a.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-brand-primary">{a.semester_label}</td>
                        <td className="py-3 px-4 font-semibold text-textPrimary">{a.subject_name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              a.subject_type === 'Lab'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-brand-soft text-brand-primary border border-brand-primary/30'
                            }`}
                          >
                            {a.subject_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-textPrimary">{a.section}</td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-textPrimary">{a.faculty_name || a.faculty_email.split('@')[0]}</p>
                          <p className="text-[11px] text-textMuted font-mono">{a.faculty_email}</p>
                        </td>
                        <td className="py-3 px-4 text-textSecondary">{a.department || '—'}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setInspectAllotment(a)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-borderLine text-textPrimary font-semibold text-[11px] transition-all"
                          >
                            <Users className="w-3 h-3 text-brand-primary" />
                            {a.roster_count || 0}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-textSecondary">
                          {a.sessions_count || 0}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Delete allotment for "${a.subject_name}" (${a.faculty_name})?`)) {
                                deleteMutation.mutate(a.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-textMuted hover:text-alert hover:bg-alert-soft transition-colors"
                            title="Delete Allotment"
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
        </div>
      )}

      {/* SUB-TAB 2: STUDENT ROSTER */}
      {activeSubTab === 'rosters' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-primary" />
                  Upload Student Roster per Subject
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Enroll students in a specific Subject Allotment for faculty attendance taking.
                </p>
              </div>

              <button
                onClick={handleDownloadRosterTemplate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download Roster Template
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1.5">
                  Semester
                </label>
                <select
                  value={rosterSemester}
                  onChange={(e) => {
                    setRosterSemester(e.target.value as SemesterLabel);
                    setSelectedAllotmentId('');
                  }}
                  className="w-full bg-surface-2 border border-borderLine rounded-xl px-3.5 py-2.5 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
                >
                  {SEMESTERS.map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1.5">
                  Select Target Subject Allotment
                </label>
                <select
                  value={selectedAllotmentId}
                  onChange={(e) => setSelectedAllotmentId(e.target.value)}
                  className="w-full bg-surface-2 border border-borderLine rounded-xl px-3.5 py-2.5 text-xs text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
                >
                  <option value="">-- Choose Subject Allotment --</option>
                  {rosterAllotments.map((a: SubjectAllotment) => (
                    <option key={a.id} value={a.id}>
                      {a.subject_name} (Sec {a.section}) — {a.faculty_name} [{a.subject_type}]
                    </option>
                  ))}
                </select>
                {rosterAllotments.length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    ⚠️ No subject allotments exist for Semester {rosterSemester}. Please create allotments first.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-textMuted uppercase tracking-wider mb-1.5">
                Choose Roster Excel Sheet (.xlsx / .xls)
              </label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                disabled={!selectedAllotmentId}
                onChange={handleRosterFileChange}
                className="w-full text-xs text-textSecondary file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-soft file:text-brand-primary hover:file:bg-brand-primary hover:file:text-white file:transition-all cursor-pointer bg-surface-2 border border-borderLine rounded-xl p-1 disabled:opacity-50"
              />
            </div>

            {parsedRoster.length > 0 && (
              <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-textPrimary flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                    Ready to Enroll: {parsedRoster.length} Student(s) into selected subject
                  </p>
                  <button
                    onClick={handleUploadRoster}
                    disabled={isUploadingRoster || !selectedAllotmentId}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-50"
                  >
                    {isUploadingRoster ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Uploading Roster...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm & Enroll Roster
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {rosterUploadStatus.type !== 'idle' && (
              <div
                className={`p-4 rounded-xl border ${
                  rosterUploadStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-alert-soft border-alert/30 text-alert'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {rosterUploadStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div className="text-xs space-y-1 flex-1">
                    <p className="font-bold">{rosterUploadStatus.message}</p>
                    {rosterUploadStatus.details && rosterUploadStatus.details.length > 0 && (
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto text-[11px] opacity-90">
                        {rosterUploadStatus.details.map((err, idx) => (
                          <p key={idx}>
                            • Row {err.row}: {err.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSPECT ROSTER MODAL */}
      {inspectAllotment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-borderLine flex items-center justify-between bg-surface-2">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-primary" />
                  Enrolled Students Roster
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  {inspectAllotment.subject_name} (Sec {inspectAllotment.section}) — {inspectAllotment.faculty_name}
                </p>
              </div>
              <button
                onClick={() => setInspectAllotment(null)}
                className="text-textMuted hover:text-textPrimary p-1.5 rounded-lg hover:bg-surface-3 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {isLoadingRoster ? (
                <div className="py-8 text-center text-textMuted">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                  Loading student roster...
                </div>
              ) : currentRoster.length === 0 ? (
                <div className="py-8 text-center text-textMuted">
                  No students currently enrolled in this subject. Upload a roster via Tab 2 above.
                </div>
              ) : (
                <div className="rounded-xl border border-borderLine overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                      <tr>
                        <th className="py-2.5 px-3.5">#</th>
                        <th className="py-2.5 px-3.5">Roll Number</th>
                        <th className="py-2.5 px-3.5">Student Name</th>
                        <th className="py-2.5 px-3.5">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {currentRoster.map((r: any, idx: number) => (
                        <tr key={r.id || idx} className="hover:bg-surface-2/40">
                          <td className="py-2 px-3.5 text-textMuted font-mono">{idx + 1}</td>
                          <td className="py-2 px-3.5 font-bold font-mono text-brand-primary">{r.roll_number}</td>
                          <td className="py-2 px-3.5 font-semibold text-textPrimary">{r.student_name || '—'}</td>
                          <td className="py-2 px-3.5 text-textSecondary font-mono text-[11px]">{r.student_email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-borderLine bg-surface-2 flex justify-between items-center text-xs">
              <span className="text-textSecondary font-semibold">
                Total Enrolled: <strong className="text-textPrimary">{currentRoster.length}</strong> students
              </span>
              <button
                onClick={() => setInspectAllotment(null)}
                className="px-4 py-1.5 rounded-xl bg-brand-primary text-white font-semibold hover:bg-brand-primary/90 transition-all"
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
