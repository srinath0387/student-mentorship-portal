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
  Calendar,
  Clock,
  Printer,
  CalendarDays,
  Check,
  Edit2,
  FileText,
  Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../../lib/api';
import { SemesterLabel, SubjectAllotment, SubjectType, TimetableEntry } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES, normalizeDepartmentName } from '../../../lib/validation/auth';
import { AttendancePdfModal } from '../../attendance/AttendancePdfModal';

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

  const [activeSubTab, setActiveSubTab] = useState<'allotments' | 'rosters' | 'timetable'>('allotments');
  const [selectedSemester, setSelectedSemester] = useState<SemesterLabel>('2-1');
  const [selectedDepartment, setSelectedDepartment] = useState<string>(defaultFilterDept);
  const [selectedSection, setSelectedSection] = useState<string>('A');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPdfModal, setShowPdfModal] = useState(false);

  // ── Allotment Mode & Single Entry State ──
  const [allotmentMode, setAllotmentMode] = useState<'upload' | 'single'>('upload');
  const [singleAllotSemester, setSingleAllotSemester] = useState<SemesterLabel>('2-1');
  const [singleAllotDept, setSingleAllotDept] = useState<string>(validUserDept);
  const [singleAllotSection, setSingleAllotSection] = useState<string>('A');
  const [singleAllotSubjectName, setSingleAllotSubjectName] = useState<string>('');
  const [singleAllotSubjectType, setSingleAllotSubjectType] = useState<'Theory' | 'Lab'>('Theory');
  const [singleAllotFacultyEmail, setSingleAllotFacultyEmail] = useState<string>('');
  const [singleAllotFacultyName, setSingleAllotFacultyName] = useState<string>('');
  const [isSubmittingSingleAllot, setIsSubmittingSingleAllot] = useState<boolean>(false);
  const [singleAllotStatus, setSingleAllotStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
  }>({ type: 'idle', message: '' });
  const [deletingAllotment, setDeletingAllotment] = useState<SubjectAllotment | null>(null);

  // ── Roster Mode & Single Entry State ──
  const [rosterMode, setRosterMode] = useState<'upload' | 'single'>('upload');
  const [singleRosterRollNo, setSingleRosterRollNo] = useState<string>('');
  const [singleRosterStudentName, setSingleRosterStudentName] = useState<string>('');
  const [singleRosterJoiningDate, setSingleRosterJoiningDate] = useState<string>('');
  const [isSubmittingSingleRoster, setIsSubmittingSingleRoster] = useState<boolean>(false);
  const [singleRosterStatus, setSingleRosterStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
  }>({ type: 'idle', message: '' });
  const [deletingRosterStudent, setDeletingRosterStudent] = useState<{ id: string; roll_number: string; student_name?: string } | null>(null);

  // ── Timetable Upload State ──
  const [timetableDepartment, setTimetableDepartment] = useState<string>(validUserDept);
  const [timetableSemester, setTimetableSemester] = useState<SemesterLabel>('2-1');
  const [timetableSection, setTimetableSection] = useState<string>('A');
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [parsedTimetable, setParsedTimetable] = useState<any[]>([]);
  const [timetableUploadStatus, setTimetableUploadStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
    details?: any[];
  }>({ type: 'idle', message: '' });
  const [isUploadingTimetable, setIsUploadingTimetable] = useState(false);
  const [viewingPdfDoc, setViewingPdfDoc] = useState<{ name: string; data: string } | null>(null);

  // ── Allotment Upload State ──
  const [allotmentDepartment, setAllotmentDepartment] = useState<string>(defaultFilterDept);
  const [allotmentFile, setAllotmentFile] = useState<File | null>(null);
  const [parsedAllotments, setParsedAllotments] = useState<any[]>([]);
  const [allotmentUploadStatus, setAllotmentUploadStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
    details?: any[];
  }>({ type: 'idle', message: '' });
  const [isUploadingAllotments, setIsUploadingAllotments] = useState(false);

  // ── Roster Upload State ──
  const [rosterDepartment, setRosterDepartment] = useState<string>(user?.department && user.department !== 'All' ? user.department : 'All');
  const [rosterSemester, setRosterSemester] = useState<SemesterLabel>('2-1');
  const [selectedAllotmentId, setSelectedAllotmentId] = useState<string>('');
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [parsedRoster, setParsedRoster] = useState<any[]>([]);
  const [rosterUploadStatus, setRosterUploadStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
    details?: any[];
  }>({ type: 'idle', message: '' });
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);

  // ── Inspect Roster & Late Joining Edit State ──
  const [inspectAllotment, setInspectAllotment] = useState<SubjectAllotment | null>(null);
  const [editingJoiningDateRosterId, setEditingJoiningDateRosterId] = useState<string | null>(null);
  const [newJoiningDate, setNewJoiningDate] = useState<string>('');

  // ── Fetch Registered Faculty List for autocomplete ──
  const { data: facultyList = [] } = useQuery({
    queryKey: ['allFacultyForAllocation'],
    queryFn: () => api.getAllFaculty().catch(() => []),
  });

  // ── Fetch Timetable ──
  const { data: timetableEntries = [], isLoading: isLoadingTimetable } = useQuery({
    queryKey: ['attendanceTimetable', timetableSemester, timetableSection, timetableDepartment],
    queryFn: () => api.getTimetable({
      semester: timetableSemester,
      section: timetableSection,
      department: timetableDepartment,
    }),
  });

  // ── Fetch Uploaded Official PDF Timetable Document ──
  const { data: timetableDocRes, isLoading: isLoadingTimetableDoc } = useQuery({
    queryKey: ['timetableDocument', timetableSemester, timetableSection, timetableDepartment],
    queryFn: () => api.getTimetableDocument({
      semester: timetableSemester,
      section: timetableSection,
      department: timetableDepartment,
    }),
  });
  const attachedPdfDoc = timetableDocRes?.document;

  // ── Fetch Allotments ──
  const { data: allotments = [], isLoading: isLoadingAllotments } = useQuery({
    queryKey: ['attendanceAllotments', selectedSemester, allotmentDepartment],
    queryFn: () => api.getAllotments(selectedSemester, allotmentDepartment === 'All' ? '' : allotmentDepartment),
  });

  // ── Fetch Allotments for Roster dropdown ──
  const { data: rosterAllotments = [] } = useQuery({
    queryKey: ['attendanceAllotmentsForRoster', rosterSemester, rosterDepartment],
    queryFn: () => api.getAllotments(rosterSemester, rosterDepartment === 'All' ? '' : rosterDepartment),
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
      setDeletingAllotment(null);
    },
  });

  // ── Delete / Unassign Student from Roster Mutation ──
  const deleteRosterStudentMutation = useMutation({
    mutationFn: (rosterId: string) => api.deleteRosterStudent(rosterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
      setDeletingRosterStudent(null);
    },
  });

  // ── Delete Timetable Slot Mutation ──
  const deleteTimetableSlotMutation = useMutation({
    mutationFn: (id: string) => api.deleteTimetableEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceTimetable'] });
    },
  });

  // ── Update Joining Date Mutation ──
  const updateJoiningDateMutation = useMutation({
    mutationFn: ({ rosterId, date }: { rosterId: string; date: string }) => api.updateStudentJoiningDate(rosterId, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
      setEditingJoiningDateRosterId(null);
    },
  });

  // ── Period Timing Guide Info ──
  const isFirstOrFourthYear = ['1-1', '1-2', '4-1', '4-2'].includes(timetableSemester);

  const getPeriodDisplayTiming = (period: number, is1or4: boolean) => {
    if (is1or4) {
      const timings = [
        '',
        'P1: 09:00 - 09:50 AM',
        'P2: 09:50 - 10:40 AM',
        'P3: 11:00 - 11:50 AM',
        'P4: 01:00 - 01:50 PM',
        'P5: 01:50 - 02:40 PM',
        'P6: 03:00 - 03:50 PM',
        'P7: 03:50 - 04:40 PM',
      ];
      return timings[period] || `P${period}`;
    } else {
      const timings = [
        '',
        'P1: 09:00 - 09:50 AM',
        'P2: 09:50 - 10:40 AM',
        'P3: 11:00 - 11:50 AM',
        'P4: 11:50 - 12:40 PM',
        'P5: 01:50 - 02:40 PM',
        'P6: 02:40 - 03:30 PM',
        'P7: 03:30 - 04:20 PM',
      ];
      return timings[period] || `P${period}`;
    }
  };

  // ── Download Timetable Template ──
  const handleDownloadTimetableTemplate = () => {
    const wsData = [
      ['Day of Week', 'Period Start (1-7)', 'Number of Periods (1-3)', 'Subject Name', 'Subject Type (Theory/Lab)', 'Faculty Email', 'Faculty Name', 'Room No', 'Section'],
      ['Monday', 1, 2, 'Data Structures & Algorithms', 'Theory', 'facultyds@rgmcet.edu.in', 'Dr. Ramesh Kumar', 'Room-302', timetableSection],
      ['Monday', 3, 1, 'Computer Organization', 'Theory', 'facultyco@rgmcet.edu.in', 'Prof. Sunitha Rao', 'Room-302', timetableSection],
      ['Monday', 5, 3, 'Data Structures Lab', 'Lab', 'facultyds@rgmcet.edu.in', 'Dr. Ramesh Kumar', 'Lab-3', timetableSection],
      ['Tuesday', 1, 1, 'Discrete Mathematics', 'Theory', 'facultymath@rgmcet.edu.in', 'Dr. S. Reddy', 'Room-302', timetableSection],
      ['Tuesday', 2, 1, 'Operating Systems', 'Theory', 'facultyos@rgmcet.edu.in', 'Prof. V. Sharma', 'Room-302', timetableSection],
      ['Tuesday', 3, 2, 'Database Management Systems', 'Theory', 'facultydbms@rgmcet.edu.in', 'Dr. Subbaiah', 'Room-302', timetableSection],
      ['Wednesday', 1, 2, 'Web Development Lab', 'Lab', 'facultyweb@rgmcet.edu.in', 'Prof. Anitha', 'Lab-1', timetableSection],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    XLSX.writeFile(wb, `Timetable_Template_${timetableDepartment}_${timetableSemester}_Sec_${timetableSection}.xlsx`);
  };

  // ── Download Allotment Template ──
  const handleDownloadAllotmentTemplate = () => {
    const defaultDept = allotmentDepartment === 'All' ? 'CSE' : allotmentDepartment;
    const wsData = [
      ['Faculty Name', 'Faculty Email', 'Subject Allotted', 'Section', 'Subject Type', 'Department'],
      ['Dr. K. V. Subbaiah', 'kvsubbaiah@rgmcet.edu.in', 'Database Management Systems', 'A', 'Theory', defaultDept],
      ['Dr. K. V. Subbaiah', 'kvsubbaiah@rgmcet.edu.in', 'DBMS Lab', 'A', 'Lab', defaultDept],
      ['Prof. M. Ramesh', 'mramesh@rgmcet.edu.in', 'Microprocessors & Microcontrollers', 'B', 'Theory', 'ECE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Allotments');
    XLSX.writeFile(wb, `Faculty_Subject_Allotment_Template_${selectedSemester}_${defaultDept}.xlsx`);
  };

  // ── Download Roster Template ──
  const handleDownloadRosterTemplate = () => {
    const wsData = [
      ['Roll Number', 'Student Email', 'Date of Joining (Optional YYYY-MM-DD)'],
      ['22091A3201', '22091a3201@rgmcet.edu.in', '2025-08-01'],
      ['22091A3202', '22091a3202@rgmcet.edu.in', '2025-08-01'],
      ['22091A3203', '22091a3203@rgmcet.edu.in', '2025-08-20'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roster');
    XLSX.writeFile(wb, `Student_Roster_Template_With_JoiningDate.xlsx`);
  };

  // ── Handle Single Allotment Submit ──
  const handleSingleAllotmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleAllotSubjectName.trim() || !singleAllotFacultyEmail.trim()) {
      setSingleAllotStatus({ type: 'error', message: 'Subject Name and Faculty Email are required.' });
      return;
    }
    setIsSubmittingSingleAllot(true);
    setSingleAllotStatus({ type: 'idle', message: '' });
    try {
      const res = await api.createSingleAllotment({
        semester: singleAllotSemester,
        department: singleAllotDept,
        section: singleAllotSection.trim().toUpperCase() || 'A',
        subject_name: singleAllotSubjectName.trim(),
        subject_type: singleAllotSubjectType,
        faculty_name: singleAllotFacultyName.trim() || singleAllotFacultyEmail.split('@')[0],
        faculty_email: singleAllotFacultyEmail.trim().toLowerCase(),
      });
      setSingleAllotStatus({ type: 'success', message: res.message || 'Allotment created successfully!' });
      setSingleAllotSubjectName('');
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotmentsForRoster'] });
    } catch (err: any) {
      setSingleAllotStatus({ type: 'error', message: err.message || 'Failed to create allotment.' });
    } finally {
      setIsSubmittingSingleAllot(false);
    }
  };

  // ── Handle Single Student Roster Submit ──
  const handleSingleRosterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAllotmentId) {
      setSingleRosterStatus({ type: 'error', message: 'Please select a Subject Allotment first.' });
      return;
    }
    if (!singleRosterRollNo.trim()) {
      setSingleRosterStatus({ type: 'error', message: 'Student Roll Number is required.' });
      return;
    }
    setIsSubmittingSingleRoster(true);
    setSingleRosterStatus({ type: 'idle', message: '' });
    try {
      const res = await api.createSingleRosterStudent({
        allotment_id: selectedAllotmentId,
        roll_number: singleRosterRollNo.trim().toUpperCase(),
        student_name: singleRosterStudentName.trim() || undefined,
        joining_date: singleRosterJoiningDate || undefined,
      });
      setSingleRosterStatus({ type: 'success', message: res.message || 'Student enrolled successfully!' });
      setSingleRosterRollNo('');
      setSingleRosterStudentName('');
      queryClient.invalidateQueries({ queryKey: ['attendanceRoster'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllotments'] });
    } catch (err: any) {
      setSingleRosterStatus({ type: 'error', message: err.message || 'Failed to enroll student.' });
    } finally {
      setIsSubmittingSingleRoster(false);
    }
  };

  // ── Parse Timetable Excel or Upload PDF ──
  const handleTimetableFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTimetableFile(file);
    setTimetableUploadStatus({ type: 'idle', message: '' });

    // Handle PDF Upload directly
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      if (file.size > 5 * 1024 * 1024) {
        setTimetableUploadStatus({
          type: 'error',
          message: `PDF file size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit. Please upload a compressed PDF under 5 MB.`,
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const base64Data = evt.target?.result as string;
          setIsUploadingTimetable(true);
          const res = await api.uploadTimetableDocument({
            semester: timetableSemester,
            section: timetableSection,
            department: timetableDepartment,
            file_name: file.name,
            file_data: base64Data,
            file_size: file.size,
          });
          setTimetableUploadStatus({
            type: 'success',
            message: res.message || `Official Timetable PDF "${file.name}" uploaded successfully for ${timetableDepartment} - Sem ${timetableSemester} (Sec ${timetableSection})!`,
          });
          queryClient.invalidateQueries({ queryKey: ['timetableDocument'] });
        } catch (err: any) {
          setTimetableUploadStatus({
            type: 'error',
            message: `Failed to upload PDF timetable: ${err.message}`,
          });
        } finally {
          setIsUploadingTimetable(false);
          setTimetableFile(null);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    // Handle Excel Timetable (.xlsx, .xls, .csv)
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);
        setParsedTimetable(data);
      } catch (err: any) {
        setTimetableUploadStatus({
          type: 'error',
          message: `Failed to parse Excel file: ${err.message}`,
        });
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Submit Timetable ──
  const handleUploadTimetable = async () => {
    if (parsedTimetable.length === 0) return;
    setIsUploadingTimetable(true);
    setTimetableUploadStatus({ type: 'idle', message: '' });

    try {
      const res = await api.uploadTimetable(
        timetableSemester,
        timetableSection,
        timetableDepartment,
        parsedTimetable
      );
      setTimetableUploadStatus({
        type: res.errorsCount > 0 ? 'error' : 'success',
        message: res.message,
        details: res.errors,
      });
      setTimetableFile(null);
      setParsedTimetable([]);
      queryClient.invalidateQueries({ queryKey: ['attendanceTimetable'] });
    } catch (err: any) {
      setTimetableUploadStatus({
        type: 'error',
        message: err.message || 'Failed to upload timetable',
      });
    } finally {
      setIsUploadingTimetable(false);
    }
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
            Attendance System Management & Allotments
          </h2>
          <p className="text-xs text-textSecondary mt-1">
            Configure section timetables, assign faculty allotments, and enroll student rosters with late-joining adjustments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPdfModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md transition-all"
          >
            <Printer className="w-4 h-4" />
            Download Attendance Sheet (PDF)
          </button>

          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-borderLine">
            <button
              onClick={() => setActiveSubTab('allotments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'allotments'
                  ? 'bg-brand-primary text-white shadow-brand'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              1. Faculty Subject Allocation
            </button>
            <button
              onClick={() => setActiveSubTab('rosters')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'rosters'
                  ? 'bg-brand-primary text-white shadow-brand'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              2. Student Roster
            </button>
            <button
              onClick={() => setActiveSubTab('timetable')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'timetable'
                  ? 'bg-brand-primary text-white shadow-brand'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              3. Timetable Matrix
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: TIMETABLE SCHEDULE & UPLOAD */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'timetable' && (
        <div className="space-y-6">
          
          {/* Timetable Timing Structure Banner */}
          <div className="p-4 rounded-2xl bg-surface-2 border border-borderLine flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-primary/10 text-brand-primary rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-textPrimary">
                  {isFirstOrFourthYear ? '1st & 4th Year Period Structure' : '2nd & 3rd Year Period Structure'}
                </p>
                <p className="text-[11px] text-textSecondary mt-0.5">
                  {isFirstOrFourthYear
                    ? 'P1-P2 (09:00–10:40) • Break (10:40–11:00) • P3 (11:00–11:50) • Lunch (11:50–01:00) • P4-P5 (01:00–02:40) • Break (02:40–03:00) • P6-P7 (03:00–04:40)'
                    : 'P1-P2 (09:00–10:40) • Break (10:40–11:00) • P3-P4 (11:00–12:40) • Lunch (12:40–01:50) • P5-P7 (01:50–04:20)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadTimetableTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface hover:bg-surface-3 border border-borderLine transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download Timetable Template
              </button>
            </div>
          </div>

          {/* Timetable Excel Upload Card */}
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <Upload className="w-4 h-4 text-brand-primary" />
                  Upload Section Timetable (Auto-Generates Daily Session Slots)
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Maps subjects to specific day/time slots with 1, 2, or 3 period spans. Breaks and lunch are excluded automatically.
                </p>
              </div>
            </div>

            {/* Department, Semester & Section Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                  Department
                </label>
                <select
                  value={timetableDepartment}
                  onChange={(e) => setTimetableDepartment(e.target.value)}
                  className="w-full bg-surface-2 border border-borderLine text-textPrimary text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-brand-primary font-medium"
                >
                  {VALID_DEPARTMENT_NAMES.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                  Select Semester
                </label>
                <div className="grid grid-cols-4 gap-1.5 bg-surface-2 p-1.5 rounded-xl border border-borderLine">
                  {ALL_SEMESTERS.map((sem) => (
                    <button
                      key={sem}
                      onClick={() => setTimetableSemester(sem)}
                      className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                        timetableSemester === sem
                          ? 'bg-brand-primary text-white shadow-brand'
                          : 'text-textSecondary hover:text-textPrimary hover:bg-surface-3'
                      }`}
                    >
                      {sem}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                  Section
                </label>
                <select
                  value={timetableSection}
                  onChange={(e) => setTimetableSection(e.target.value)}
                  className="w-full bg-surface-2 border border-borderLine text-textPrimary text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-brand-primary font-medium"
                >
                  {['A', 'B', 'C', 'D', 'DS', 'AIML'].map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                  Upload Timetable (.xlsx or .pdf)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={handleTimetableFileChange}
                  className="w-full text-xs text-textSecondary file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-primary file:text-white hover:file:bg-brand-primary/90 cursor-pointer bg-surface-2 p-1 rounded-xl border border-borderLine"
                />
              </div>
            </div>

            {/* Uploaded Official PDF Timetable Banner */}
            {attachedPdfDoc && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-brand-primary/10 border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-textPrimary flex items-center gap-2">
                      Official Timetable Document (PDF)
                      <span className="text-[10px] font-mono text-textMuted bg-surface px-2 py-0.5 rounded border border-borderLine">
                        {(attachedPdfDoc.file_size / 1024).toFixed(1)} KB
                      </span>
                      <span className="text-[10px] font-semibold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                        {attachedPdfDoc.department || timetableDepartment}
                      </span>
                    </p>
                    <p className="text-[11px] text-textSecondary mt-0.5 font-mono">
                      {attachedPdfDoc.file_name} • Uploaded by {attachedPdfDoc.uploaded_by} on {new Date(attachedPdfDoc.created_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    onClick={() => setViewingPdfDoc({ name: attachedPdfDoc.file_name, data: attachedPdfDoc.file_data })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-bold shadow hover:bg-brand-primary/90 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" /> View PDF
                  </button>
                  <a
                    href={attachedPdfDoc.file_data}
                    download={attachedPdfDoc.file_name}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 text-textPrimary hover:bg-surface-3 border border-borderLine text-xs font-bold transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove official PDF "${attachedPdfDoc.file_name}" for ${timetableDepartment} Sem ${timetableSemester} Sec ${timetableSection}?`)) {
                        await api.deleteTimetableDocument(attachedPdfDoc.id);
                        queryClient.invalidateQueries({ queryKey: ['timetableDocument'] });
                      }
                    }}
                    className="p-1.5 text-textMuted hover:text-alert rounded-lg hover:bg-surface-3 transition-colors"
                    title="Delete PDF document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {parsedTimetable.length > 0 && (
              <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-textPrimary flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                    Parsed {parsedTimetable.length} Timetable Slot(s) for {timetableDepartment} — Sem {timetableSemester} (Sec {timetableSection})
                  </p>
                  <button
                    onClick={handleUploadTimetable}
                    disabled={isUploadingTimetable}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-50"
                  >
                    {isUploadingTimetable ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Uploading Timetable...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm & Save Timetable
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {timetableUploadStatus.type !== 'idle' && (
              <div
                className={`p-4 rounded-xl border ${
                  timetableUploadStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-alert-soft border-alert/30 text-alert'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {timetableUploadStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div className="text-xs space-y-1">
                    <p className="font-bold">{timetableUploadStatus.message}</p>
                    {timetableUploadStatus.details && timetableUploadStatus.details.length > 0 && (
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto text-[11px] opacity-90">
                        {timetableUploadStatus.details.map((err, idx) => (
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

          {/* Visual Timetable Grid View */}
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-cyan-400" />
                  Weekly Timetable Matrix — {timetableDepartment} • Semester {timetableSemester} (Section {timetableSection})
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  7 Class periods per day. Multi-period sessions occupy continuous blocks.
                </p>
              </div>
            </div>

            {isLoadingTimetable ? (
              <div className="py-12 text-center text-textMuted">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                Loading {timetableDepartment} section timetable...
              </div>
            ) : timetableEntries.length === 0 ? (
              <div className="py-10 px-6 text-center text-textMuted bg-surface-2/60 rounded-xl border border-dashed border-borderLine space-y-2">
                <Calendar className="w-8 h-8 mx-auto text-textMuted/60" />
                <p className="text-sm font-bold text-textPrimary">
                  No period-by-period slot entries saved for {timetableDepartment} — Sem {timetableSemester} (Section {timetableSection}).
                </p>
                {attachedPdfDoc ? (
                  <p className="text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Official PDF Timetable is uploaded and available above. To generate automated period slots for daily attendance marking, upload the matching Excel (.xlsx) schedule.
                  </p>
                ) : (
                  <p className="text-xs text-textSecondary">
                    Upload an Excel timetable schedule (.xlsx) or official PDF document using the form above.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-3 px-3 text-center w-24 border-r border-borderLine">Day</th>
                      {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                        <th key={p} className="py-2.5 px-2 text-center border-r border-borderLine min-w-[130px]">
                          <div>P{p}</div>
                          <div className="text-[10px] font-normal text-textSecondary lowercase">
                            {getPeriodDisplayTiming(p, isFirstOrFourthYear).split(': ')[1]}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {DAYS_OF_WEEK.map((day) => {
                      const daySlots = timetableEntries.filter((e: TimetableEntry) => e.day_of_week.toLowerCase() === day.toLowerCase());
                      
                      // Map 7 periods
                      const periodMap: (TimetableEntry | null)[] = [null, null, null, null, null, null, null];
                      daySlots.forEach((e: TimetableEntry) => {
                        const start = Math.max(0, Math.min(6, e.period_start - 1));
                        const span = Math.min(e.num_periods || 1, 7 - start);
                        for (let i = 0; i < span; i++) {
                          periodMap[start + i] = e;
                        }
                      });

                      return (
                        <tr key={day} className="hover:bg-surface-2/30">
                          <td className="py-3 px-3 text-center font-bold text-textPrimary bg-surface-2/40 border-r border-borderLine">
                            {day}
                          </td>
                          {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
                            const entry = periodMap[idx];
                            if (!entry) {
                              return (
                                <td key={idx} className="py-2 px-2 text-center text-textMuted/40 border-r border-borderLine">
                                  —
                                </td>
                              );
                            }

                            // Show only if this is the start period of the slot, or render cell
                            const isStart = (entry.period_start - 1) === idx;
                            return (
                              <td
                                key={idx}
                                className={`py-2 px-2 text-center border-r border-borderLine ${
                                  entry.subject_type === 'Lab'
                                    ? 'bg-purple-500/10 text-purple-300'
                                    : 'bg-cyan-500/10 text-cyan-300'
                                }`}
                              >
                                <div className="font-bold truncate max-w-[120px] mx-auto" title={entry.subject_name}>
                                  {entry.subject_name}
                                </div>
                                <div className="text-[10px] opacity-80 mt-0.5">
                                  {entry.subject_type} {entry.num_periods > 1 ? `(${entry.num_periods}P)` : ''}
                                </div>
                                {entry.room_no && (
                                  <div className="text-[9px] opacity-60">{entry.room_no}</div>
                                )}
                                {entry.id && (
                                  <button
                                    onClick={() => entry.id && deleteTimetableSlotMutation.mutate(entry.id)}
                                    className="text-alert/60 hover:text-alert text-[10px] mt-1 inline-block"
                                    title="Delete slot"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: FACULTY SUBJECT ALLOCATION */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'allotments' && (
        <div className="space-y-6">
          {/* Top Configuration & Entry Form Card */}
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-primary" />
                  Faculty Subject Allocation Management
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Flow: Semester → Department → Section → Allocation. Add allocations via bulk Excel upload or single manual entry.
                </p>
              </div>

              {/* Mode Toggle: Bulk Upload vs Single Manual Entry */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-borderLine">
                  <button
                    onClick={() => setAllotmentMode('upload')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      allotmentMode === 'upload'
                        ? 'bg-brand-primary text-white shadow-brand'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    Bulk Upload (Excel)
                  </button>
                  <button
                    onClick={() => setAllotmentMode('single')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      allotmentMode === 'single'
                        ? 'bg-brand-primary text-white shadow-brand'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    + Single Manual Entry
                  </button>
                </div>

                {allotmentMode === 'upload' && (
                  <button
                    onClick={handleDownloadAllotmentTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Template
                  </button>
                )}
              </div>
            </div>

            {/* ── MODE 1: BULK EXCEL UPLOAD ── */}
            {allotmentMode === 'upload' && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                      Department
                    </label>
                    <select
                      value={allotmentDepartment}
                      onChange={(e) => setAllotmentDepartment(e.target.value)}
                      className="w-full bg-surface-2 border border-borderLine text-textPrimary text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-brand-primary font-medium"
                    >
                      <option value="All">All Departments</option>
                      {VALID_DEPARTMENT_NAMES.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                      Select Semester
                    </label>
                    <div className="grid grid-cols-4 gap-1.5 bg-surface-2 p-1.5 rounded-xl border border-borderLine">
                      {ALL_SEMESTERS.map((sem) => (
                        <button
                          key={sem}
                          onClick={() => setSelectedSemester(sem)}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                            selectedSemester === sem
                              ? 'bg-brand-primary text-white shadow-brand'
                              : 'text-textSecondary hover:text-textPrimary hover:bg-surface-3'
                          }`}
                        >
                          {sem}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">
                      Upload Excel File (.xlsx)
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleAllotmentFileChange}
                      className="w-full text-xs text-textSecondary file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-primary file:text-white hover:file:bg-brand-primary/90 cursor-pointer bg-surface-2 p-1 rounded-xl border border-borderLine"
                    />
                  </div>
                </div>

                {parsedAllotments.length > 0 && (
                  <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-textPrimary flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                        Parsed {parsedAllotments.length} Allotment Row(s) for Semester {selectedSemester}
                      </p>
                      <button
                        onClick={handleUploadAllotments}
                        disabled={isUploadingAllotments}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-50"
                      >
                        {isUploadingAllotments ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Uploading Allotments...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm & Save Allotments
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
                      <div className="text-xs space-y-1">
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
            )}

            {/* ── MODE 2: SINGLE MANUAL ENTRY FORM ── */}
            {allotmentMode === 'single' && (
              <form onSubmit={handleSingleAllotmentSubmit} className="space-y-4 pt-2">
                <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-4">
                  <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-2">
                    <Edit2 className="w-3.5 h-3.5 text-brand-primary" />
                    Add Single Faculty–Subject Allocation
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Semester */}
                    <div>
                      <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">
                        Semester *
                      </label>
                      <select
                        value={singleAllotSemester}
                        onChange={(e) => setSingleAllotSemester(e.target.value as SemesterLabel)}
                        className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-primary font-medium"
                      >
                        {ALL_SEMESTERS.map((s) => (
                          <option key={s} value={s}>
                            Semester {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Department */}
                    <div>
                      <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">
                        Department *
                      </label>
                      <select
                        value={singleAllotDept}
                        onChange={(e) => setSingleAllotDept(e.target.value)}
                        className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-primary font-medium"
                      >
                        {VALID_DEPARTMENT_NAMES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Section */}
                    <div>
                      <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">
                        Section *
                      </label>
                      <select
                        value={singleAllotSection}
                        onChange={(e) => setSingleAllotSection(e.target.value)}
                        className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-primary font-medium"
                      >
                        {['A', 'B', 'C', 'D', 'E', 'F'].map((sec) => (
                          <option key={sec} value={sec}>
                            Section {sec}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Subject Type */}
                    <div>
                      <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">
                        Subject Type *
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-surface p-1 rounded-xl border border-borderLine">
                        <button
                          type="button"
                          onClick={() => setSingleAllotSubjectType('Theory')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                            singleAllotSubjectType === 'Theory'
                              ? 'bg-brand-primary text-white shadow-xs'
                              : 'text-textSecondary hover:text-textPrimary'
                          }`}
                        >
                          Theory
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleAllotSubjectType('Lab')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                            singleAllotSubjectType === 'Lab'
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'text-textSecondary hover:text-textPrimary'
                          }`}
                        >
                          Lab
                        </button>
                      </div>
                    </div>

                    {/* Subject Name */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">
                        Subject Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Data Structures & Algorithms"
                        value={singleAllotSubjectName}
                        onChange={(e) => setSingleAllotSubjectName(e.target.value)}
                        className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-brand-primary"
                        required
                      />
                    </div>

                    {/* Faculty Selection / Autocomplete */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-textMuted uppercase mb-1.5">
                        Select Registered Faculty or Enter Custom Email *
                      </label>
                      <select
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const found = facultyList.find((f: any) => f.email === val);
                          if (found) {
                            setSingleAllotFacultyEmail(found.email);
                            setSingleAllotFacultyName(found.name);
                          }
                        }}
                        className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:border-brand-primary mb-2"
                      >
                        <option value="">-- Quick Pick from Registered Faculty --</option>
                        {facultyList.map((fac: any) => (
                          <option key={fac.email} value={fac.email}>
                            {fac.name} ({fac.department || 'General'}) — {fac.email}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="email"
                          placeholder="Faculty Email (@rgmcet.edu.in) *"
                          value={singleAllotFacultyEmail}
                          onChange={(e) => setSingleAllotFacultyEmail(e.target.value)}
                          className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-primary font-mono"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Faculty Name (e.g. Dr. Ramesh)"
                          value={singleAllotFacultyName}
                          onChange={(e) => setSingleAllotFacultyName(e.target.value)}
                          className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-borderLine">
                    <div className="text-xs">
                      {singleAllotStatus.type === 'error' && (
                        <p className="text-alert font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {singleAllotStatus.message}
                        </p>
                      )}
                      {singleAllotStatus.type === 'success' && (
                        <p className="text-emerald-400 font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          {singleAllotStatus.message}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingSingleAllot}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-brand transition-all disabled:opacity-50 shrink-0"
                    >
                      {isSubmittingSingleAllot ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Saving Allocation...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Save Allocation Record
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Allotments Directory */}
          <div className="p-6 rounded-2xl bg-surface border border-borderLine space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-primary" />
                  Allotted Subjects Directory — Semester {selectedSemester}
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Showing {filteredAllotments.length} allocated subjects for this semester. Feeds directly into student roster enrollment.
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
                    className="pl-8 pr-3 py-1.5 text-xs bg-surface-2 border border-borderLine rounded-xl text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>

            {isLoadingAllotments ? (
              <div className="py-12 text-center text-textMuted">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                Loading allotments...
              </div>
            ) : filteredAllotments.length === 0 ? (
              <div className="py-12 text-center text-textMuted bg-surface-2 rounded-xl border border-dashed border-borderLine">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-textMuted/60" />
                <p className="text-sm font-semibold">No subject allotments found for {selectedSemester}.</p>
                <p className="text-xs text-textSecondary mt-1">Upload an allotment sheet or add a single entry above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-3 px-4">Subject Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Dept</th>
                      <th className="py-3 px-4">Sec</th>
                      <th className="py-3 px-4">Faculty Name</th>
                      <th className="py-3 px-4">Faculty Email</th>
                      <th className="py-3 px-4 text-center">Enrolled Roster</th>
                      <th className="py-3 px-4 text-center">Sessions Held</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {filteredAllotments.map((a: SubjectAllotment) => (
                      <tr key={a.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-3 px-4 font-bold text-textPrimary">{a.subject_name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              a.subject_type === 'Lab'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            }`}
                          >
                            {a.subject_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-textSecondary">{a.department || 'General'}</td>
                        <td className="py-3 px-4 font-bold text-textSecondary">{a.section || 'A'}</td>
                        <td className="py-3 px-4 font-medium text-textPrimary">{a.faculty_name}</td>
                        <td className="py-3 px-4 font-mono text-textSecondary text-[11px]">{a.faculty_email}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setInspectAllotment(a)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-borderLine text-textPrimary font-semibold transition-all"
                          >
                            <Users className="w-3 h-3 text-brand-primary" />
                            {a.roster_count || 0} Students
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-brand-primary">
                          {a.sessions_count || 0}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setDeletingAllotment(a)}
                            className="p-1.5 text-textMuted hover:text-alert rounded-lg hover:bg-surface-3 transition-colors"
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
      {/* INSPECT ROSTER & LATE JOINING EDITOR MODAL */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {inspectAllotment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-50">
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
                  No students currently enrolled in this subject. Upload a roster or add single entries via Student Roster tab above.
                </div>
              ) : (
                <div className="rounded-xl border border-borderLine overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                      <tr>
                        <th className="py-2.5 px-3.5">#</th>
                        <th className="py-2.5 px-3.5">Roll Number</th>
                        <th className="py-2.5 px-3.5">Student Name</th>
                        <th className="py-2.5 px-3.5">Date of Joining</th>
                        <th className="py-2.5 px-3.5">Email</th>
                        <th className="py-2.5 px-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {currentRoster.map((r: any, idx: number) => {
                        const isEditing = editingJoiningDateRosterId === r.id;
                        const joinDateStr = r.joining_date ? new Date(r.joining_date).toISOString().split('T')[0] : '';

                        return (
                          <tr key={r.id || idx} className="hover:bg-surface-2/40 transition-colors">
                            <td className="py-2 px-3.5 text-textMuted font-mono">{idx + 1}</td>
                            <td className="py-2 px-3.5 font-bold font-mono text-brand-primary">{r.roll_number}</td>
                            <td className="py-2 px-3.5 font-semibold text-textPrimary">{r.student_name || '—'}</td>
                            <td className="py-2 px-3.5">
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="date"
                                    value={newJoiningDate}
                                    onChange={(e) => setNewJoiningDate(e.target.value)}
                                    className="bg-surface-2 border border-brand-primary text-textPrimary text-xs px-2 py-0.5 rounded-lg"
                                  />
                                  <button
                                    onClick={() => {
                                      if (newJoiningDate) {
                                        updateJoiningDateMutation.mutate({ rosterId: r.id, date: newJoiningDate });
                                      }
                                    }}
                                    className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-500"
                                    title="Save Date"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingJoiningDateRosterId(null)}
                                    className="p-1 bg-surface-3 text-textMuted rounded hover:text-textPrimary"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-textSecondary font-mono text-[11px]">
                                    {joinDateStr || 'Default (Start)'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingJoiningDateRosterId(r.id);
                                      setNewJoiningDate(joinDateStr || new Date().toISOString().split('T')[0]);
                                    }}
                                    className="p-1 text-textMuted hover:text-brand-primary rounded"
                                    title="Edit joining date for late-joining student"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3.5 text-textSecondary font-mono text-[11px]">
                              {r.student_email}
                            </td>
                            <td className="py-2 px-3.5 text-right">
                              <button
                                onClick={() => setDeletingRosterStudent({ id: r.id, roll_number: r.roll_number, student_name: r.student_name })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[11px] font-bold transition-all"
                                title="Unassign student from this subject"
                              >
                                <Trash2 className="w-3 h-3" />
                                Unassign
                              </button>
                            </td>
                          </tr>
                        );
                      })}
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

      {/* ── CONFIRMATION MODAL: DELETE ALLOTMENT ── */}
      {deletingAllotment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in-50">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-500/10 text-red-400 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-textPrimary">Delete Subject Allocation?</h3>
                <p className="text-xs text-textSecondary">
                  Are you sure you want to delete the allocation for <strong className="text-textPrimary">{deletingAllotment.subject_name}</strong> (Section {deletingAllotment.section}) assigned to <strong className="text-textPrimary">{deletingAllotment.faculty_name}</strong>?
                </p>
                <p className="text-[11px] text-amber-400 font-semibold pt-1">
                  ⚠️ This will permanently remove all associated student rosters and attendance session records for this subject.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-borderLine">
              <button
                onClick={() => setDeletingAllotment(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => deletingAllotment && deleteMutation.mutate(deletingAllotment.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 shadow-md transition-all disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Yes, Delete Allocation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL: UNASSIGN STUDENT FROM ROSTER ── */}
      {deletingRosterStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in-50">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-500/10 text-red-400 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-textPrimary">Unassign Student from Subject?</h3>
                <p className="text-xs text-textSecondary">
                  Are you sure you want to unassign student <strong className="text-textPrimary font-mono">{deletingRosterStudent.roll_number}</strong> {deletingRosterStudent.student_name ? `(${deletingRosterStudent.student_name})` : ''} from this subject roster?
                </p>
                <p className="text-[11px] text-textMuted pt-1">
                  This will only remove the student from this specific subject without affecting their enrolment in any other subjects.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-borderLine">
              <button
                onClick={() => setDeletingRosterStudent(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-textSecondary bg-surface-2 hover:bg-surface-3 border border-borderLine transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => deletingRosterStudent && deleteRosterStudentMutation.mutate(deletingRosterStudent.id)}
                disabled={deleteRosterStudentMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 shadow-md transition-all disabled:opacity-50"
              >
                {deleteRosterStudentMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Unassigning...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Yes, Unassign Student
                  </>
                )}
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

      {/* PDF Modal */}
      <AttendancePdfModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        defaultYear="2nd Year"
        defaultDepartment={selectedDepartment === 'All' ? '' : selectedDepartment}
        defaultSection={selectedSection}
      />
    </div>
  );
};
