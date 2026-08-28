import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CalendarCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  Plus,
  Trash2,
  Printer,
  FileText,
  Building,
  Briefcase,
  HelpCircle,
  X,
  Search,
  Check,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  FacultyLeaveRecord,
  FacultyLeaveType,
  FacultyLeaveAdjustment,
  FacultyLeaveSummaryResponse,
  HolidayCalendarEntry,
} from '../../types';
import { LeaveLetterModal } from './LeaveLetterModal';

const AVAILABLE_PERIODS = [
  { id: 'Period 1', label: 'Period 1 (09:00 - 09:50 AM)' },
  { id: 'Period 2', label: 'Period 2 (09:50 - 10:40 AM)' },
  { id: 'Period 3', label: 'Period 3 (11:00 - 11:50 AM)' },
  { id: 'Period 4', label: 'Period 4 (11:50 - 12:40 PM)' },
  { id: 'Period 5', label: 'Period 5 (01:40 - 02:30 PM)' },
  { id: 'Period 6', label: 'Period 6 (02:30 - 03:20 PM)' },
  { id: 'Period 7', label: 'Period 7 (03:20 - 04:10 PM)' },
];

export const FacultyLeaveTab: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const email = user?.email || '';

  const [activeSubTab, setActiveSubTab] = useState<'my-leaves' | 'reassigned-duties'>('my-leaves');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [viewingLeave, setViewingLeave] = useState<FacultyLeaveRecord | null>(null);

  // Form State
  const [formLeaveType, setFormLeaveType] = useState<FacultyLeaveType>('Casual Leave');
  const [formFromDate, setFormFromDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formToDate, setFormToDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formReason, setFormReason] = useState<string>('');
  const [formAdjustments, setFormAdjustments] = useState<FacultyLeaveAdjustment[]>([]);

  // Adjustment Inputs
  const [adjType, setAdjType] = useState<'classwork' | 'exam_duty'>('classwork');
  const [adjDate, setAdjDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adjSubject, setAdjSubject] = useState<string>('');
  const [adjPeriods, setAdjPeriods] = useState<string[]>(['Period 1']);
  const [adjFacultyEmail, setAdjFacultyEmail] = useState<string>('');
  const [adjFacultyName, setAdjFacultyName] = useState<string>('');
  const [colleagueSearch, setColleagueSearch] = useState<string>('');

  // Reassign Modal State
  const [reassignModal, setReassignModal] = useState<{
    adjId: string;
    originalDuty: string;
    date: string;
  } | null>(null);
  const [reassignNewEmail, setReassignNewEmail] = useState<string>('');
  const [reassignNewName, setReassignNewName] = useState<string>('');
  const [reassignColleagueSearch, setReassignColleagueSearch] = useState<string>('');

  // Queries
  const { data: summary, isLoading: isLoadingSummary } = useQuery<FacultyLeaveSummaryResponse>({
    queryKey: ['facultyLeaveSummary', email],
    queryFn: () => api.getMyFacultyLeaveSummary(),
    enabled: Boolean(email),
  });

  const { data: holidays = [] } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

  const { data: reassignedDuties = [], isLoading: isLoadingDuties } = useQuery<FacultyLeaveAdjustment[]>({
    queryKey: ['facultyReassignedDuties', email],
    queryFn: () => api.getReassignedDuties(),
    enabled: Boolean(email),
  });

  const { data: facultyDirectory = [], isLoading: isLoadingFaculty } = useQuery({
    queryKey: ['facultyDirectoryForAdjustments'],
    queryFn: () => (api.getAllFaculty ? api.getAllFaculty('All') : Promise.resolve([])),
  });

  // Filtered Faculty Directory for Searchable Dropdowns
  const filteredFacultyForDuty = useMemo(() => {
    const q = colleagueSearch.toLowerCase().trim();
    return facultyDirectory
      .filter((f: any) => f.email && f.email.toLowerCase() !== email.toLowerCase())
      .filter((f: any) => {
        if (!q) return true;
        return (
          f.name?.toLowerCase().includes(q) ||
          f.email?.toLowerCase().includes(q) ||
          f.department?.toLowerCase().includes(q)
        );
      });
  }, [facultyDirectory, email, colleagueSearch]);

  const filteredFacultyForReassign = useMemo(() => {
    const q = reassignColleagueSearch.toLowerCase().trim();
    return facultyDirectory
      .filter((f: any) => f.email && f.email.toLowerCase() !== email.toLowerCase())
      .filter((f: any) => {
        if (!q) return true;
        return (
          f.name?.toLowerCase().includes(q) ||
          f.email?.toLowerCase().includes(q) ||
          f.department?.toLowerCase().includes(q)
        );
      });
  }, [facultyDirectory, email, reassignColleagueSearch]);

  const holidaySet = useMemo(() => {
    return new Set(
      holidays.map((h) => {
        return typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0];
      })
    );
  }, [holidays]);

  // Calculate working days between from_date and to_date (excluding Sundays & declared Holidays)
  const calculatedDays = useMemo(() => {
    const start = new Date(formFromDate);
    const end = new Date(formToDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dayOfWeek = cur.getDay(); // 0 is Sunday
      const iso = cur.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && !holidaySet.has(iso)) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [formFromDate, formToDate, holidaySet]);

  const currentRemaining = summary?.balances?.[formLeaveType]?.remaining ?? 0;
  const isInsufficient = formLeaveType !== 'Paid Leave' && calculatedDays > currentRemaining;

  const applyMutation = useMutation({
    mutationFn: (payload: any) => api.applyFacultyLeave(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      setShowApplyModal(false);
      resetForm();
      alert(res.message || 'Leave application submitted successfully! Reassigned colleagues will receive notifications.');
    },
    onError: (err: any) => {
      alert(`Failed to apply: ${err.message}`);
    },
  });

  const dutyResponseMutation = useMutation({
    mutationFn: ({ adjId, status, rejected_reason }: { adjId: string; status: 'Accepted' | 'Rejected'; rejected_reason?: string }) =>
      api.respondToAdjustment(adjId, status, rejected_reason),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyReassignedDuties', email] });
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary'] });
      queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
      alert(res.message || 'Response recorded successfully.');
    },
    onError: (err: any) => {
      alert(`Failed to record response: ${err.message}`);
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({ adjId, email, name }: { adjId: string; email: string; name?: string }) =>
      api.reassignDutyColleague(adjId, email, name),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
      setReassignModal(null);
      setReassignNewEmail('');
      setReassignNewName('');
      alert(res.message || 'Reassigned successfully.');
    },
    onError: (err: any) => {
      alert(`Failed to reassign: ${err.message}`);
    },
  });

  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => api.deleteFacultyLeave(leaveId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
      alert(res.message || 'Leave cancelled.');
    },
    onError: (err: any) => {
      alert(`Failed to cancel leave: ${err.message}`);
    },
  });

  const resetForm = () => {
    setFormLeaveType('Casual Leave');
    setFormFromDate(new Date().toISOString().split('T')[0]);
    setFormToDate(new Date().toISOString().split('T')[0]);
    setAdjDate(new Date().toISOString().split('T')[0]);
    setFormReason('');
    setFormAdjustments([]);
    setAdjPeriods(['Period 1']);
    setAdjSubject('');
    setAdjFacultyEmail('');
    setAdjFacultyName('');
    setColleagueSearch('');
  };

  const togglePeriod = (pId: string) => {
    setAdjPeriods((prev) =>
      prev.includes(pId) ? (prev.length > 1 ? prev.filter((p) => p !== pId) : prev) : [...prev, pId].sort()
    );
  };

  const handleAddAdjustment = () => {
    if (!adjSubject.trim()) {
      alert('Please enter the Subject or Duty name (e.g. Data Structures Lab, Mid Exam).');
      return;
    }
    if (!adjFacultyEmail.trim()) {
      alert('Please select a reassigned colleague faculty.');
      return;
    }
    if (adjPeriods.length === 0) {
      alert('Please select at least one Period.');
      return;
    }

    const facultyObj = facultyDirectory.find((f: any) => f.email?.toLowerCase() === adjFacultyEmail.toLowerCase());
    const facultyName = facultyObj?.name || adjFacultyName || adjFacultyEmail;

    setFormAdjustments((prev) => [
      ...prev,
      {
        adjustment_type: adjType,
        date: adjDate || formFromDate,
        subject_or_duty: adjSubject.trim(),
        periods: [...adjPeriods],
        timing_slot: adjPeriods.join(', '),
        reassigned_faculty_email: adjFacultyEmail.toLowerCase().trim(),
        reassigned_faculty_name: facultyName,
        acceptance_status: 'Pending',
      },
    ]);

    setAdjSubject('');
    setAdjFacultyEmail('');
    setAdjFacultyName('');
    setColleagueSearch('');
  };

  const handleRemoveAdjustment = (idx: number) => {
    setFormAdjustments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReason.trim()) {
      alert('Please enter a reason for applying leave.');
      return;
    }
    if (calculatedDays <= 0) {
      alert('Selected date range has 0 working days (falls on Sunday or declared holiday).');
      return;
    }
    if (isInsufficient) {
      alert(`Insufficient balance for ${formLeaveType}. Please switch to 'Paid Leave'.`);
      return;
    }

    let finalAdjustments = [...formAdjustments];
    if (adjSubject.trim() && adjFacultyEmail.trim() && adjPeriods.length > 0) {
      const facultyObj = facultyDirectory.find((f: any) => f.email?.toLowerCase() === adjFacultyEmail.toLowerCase());
      finalAdjustments.push({
        adjustment_type: adjType,
        date: adjDate || formFromDate,
        subject_or_duty: adjSubject.trim(),
        periods: [...adjPeriods],
        timing_slot: adjPeriods.join(', '),
        reassigned_faculty_email: adjFacultyEmail.toLowerCase().trim(),
        reassigned_faculty_name: facultyObj?.name || adjFacultyName || adjFacultyEmail,
        acceptance_status: 'Pending',
      });
    }

    applyMutation.mutate({
      leave_type: formLeaveType,
      from_date: formFromDate,
      to_date: formToDate,
      reason: formReason.trim(),
      adjustments: finalAdjustments,
    });
  };

  const balances = summary?.balances || {
    'Casual Leave': { quota: 15, used: 0, in_process: 0, remaining: 15 },
    'Academic Leave': { quota: 6, used: 0, in_process: 0, remaining: 6 },
    'SP CL': { quota: 7, used: 0, in_process: 0, remaining: 7 },
    'Paid Leave': { quota: 0, used: 0, in_process: 0, remaining: 999 },
  };

  const pendingCoveringDutiesCount = reassignedDuties.filter((d: any) => d.acceptance_status === 'Pending').length;

  return (
    <div className="space-y-6">
      {/* ── Quota Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Casual Leave (CL)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-soft text-brand-primary font-bold">Quota: {balances['Casual Leave'].quota}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-brand-primary">{balances['Casual Leave'].remaining}</span>
            <span className="text-xs text-textSecondary">days remaining</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Used: {balances['Casual Leave'].used} | In-Process: {balances['Casual Leave'].in_process || 0}</p>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Academic Leave (AL)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-bold">Quota: {balances['Academic Leave'].quota}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-400">{balances['Academic Leave'].remaining}</span>
            <span className="text-xs text-textSecondary">days remaining</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Used: {balances['Academic Leave'].used} | In-Process: {balances['Academic Leave'].in_process || 0}</p>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Special CL (SP CL)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold">Quota: {balances['SP CL'].quota}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{balances['SP CL'].remaining}</span>
            <span className="text-xs text-textSecondary">days remaining</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Used: {balances['SP CL'].used} | In-Process: {balances['SP CL'].in_process || 0}</p>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Covering Duties</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold">Assigned</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{reassignedDuties.length}</span>
            <span className="text-xs text-textSecondary">duties assigned</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">{pendingCoveringDutiesCount} pending response</p>
        </div>
      </div>

      {/* ── Main Container ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-borderLine pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('my-leaves')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'my-leaves'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>My Leave Applications ({summary?.leaves?.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('reassigned-duties')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'reassigned-duties'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Duties Reassigned to You</span>
              {pendingCoveringDutiesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black animate-pulse">
                  {pendingCoveringDutiesCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => {
              resetForm();
              setShowApplyModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Apply for Leave</span>
          </button>
        </div>

        {/* ── SUB-TAB 1: My Leaves ── */}
        {activeSubTab === 'my-leaves' && (
          <div>
            {isLoadingSummary ? (
              <div className="py-12 text-center text-xs text-textMuted">Loading leave records...</div>
            ) : !summary?.leaves || summary.leaves.length === 0 ? (
              <div className="py-12 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-1">
                <Calendar className="w-8 h-8 text-textMuted mx-auto" />
                <p className="font-bold text-textPrimary">No Leave Records</p>
                <p className="text-[11px] text-textSecondary">You have not applied for any leaves in this academic year.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-2.5 px-3.5">Leave Type</th>
                      <th className="py-2.5 px-3.5">Date Range</th>
                      <th className="py-2.5 px-3.5 text-center">Days</th>
                      <th className="py-2.5 px-3.5">Reason</th>
                      <th className="py-2.5 px-3.5">Adjustments &amp; Colleagues</th>
                      <th className="py-2.5 px-3.5">Approval Flow</th>
                      <th className="py-2.5 px-3.5 text-right">Sanction Order / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {summary.leaves.map((l) => {
                      // Sanction Order is ONLY available after BOTH HOD and Principal have approved
                      const isFullyApproved = l.hod_status === 'Approved' && l.principal_status === 'Approved';

                      return (
                        <tr key={l.id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="py-2.5 px-3.5 font-bold text-textPrimary whitespace-nowrap">{l.leave_type}</td>
                          <td className="py-2.5 px-3.5 text-textSecondary whitespace-nowrap font-mono">
                            {l.from_date} to {l.to_date}
                          </td>
                          <td className="py-2.5 px-3.5 text-center font-mono font-bold">{l.num_days}</td>
                          <td className="py-2.5 px-3.5 text-textSecondary max-w-xs truncate">{l.reason}</td>
                          <td className="py-2.5 px-3.5">
                            {l.adjustments && l.adjustments.length > 0 ? (
                              <div className="space-y-1">
                                {l.adjustments.map((a, i) => (
                                  <div key={a.id || i} className="flex items-center gap-1.5 text-[11px]">
                                    <span className="font-semibold text-textPrimary">{a.subject_or_duty} ({a.date}):</span>
                                    <span className="text-textSecondary">{a.reassigned_faculty_name}</span>
                                    {a.acceptance_status === 'Accepted' ? (
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold inline-flex items-center gap-0.5 border border-emerald-500/20">
                                        <Check className="w-2.5 h-2.5" /> Accepted
                                      </span>
                                    ) : a.acceptance_status === 'Rejected' ? (
                                      <div className="inline-flex items-center gap-1">
                                        <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/20">
                                          ✕ Declined
                                        </span>
                                        <button
                                          onClick={() =>
                                            setReassignModal({
                                              adjId: a.id || '',
                                              originalDuty: a.subject_or_duty,
                                              date: a.date,
                                            })
                                          }
                                          className="text-[10px] text-brand-primary underline font-bold hover:text-brand-primary/80 cursor-pointer"
                                        >
                                          Reassign
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">
                                        ⏳ Colleague Pending
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-textMuted">No Adjustments</span>
                            )}
                          </td>

                          {/* Multi-Tier Approval Flow Stepper */}
                          <td className="py-2.5 px-3.5">
                            <div className="flex flex-col gap-1 text-[10px] font-semibold">
                              <div className="flex items-center gap-1">
                                <span className="text-textMuted">1. Colleague:</span>
                                {l.adjustments && l.adjustments.length > 0 ? (
                                  l.adjustments.every((a) => a.acceptance_status === 'Accepted') ? (
                                    <span className="text-emerald-400 font-bold">✓ Accepted</span>
                                  ) : l.adjustments.some((a) => a.acceptance_status === 'Rejected') ? (
                                    <span className="text-rose-400 font-bold">✕ Rejected</span>
                                  ) : (
                                    <span className="text-amber-400">⏳ Pending</span>
                                  )
                                ) : (
                                  <span className="text-textMuted">N/A</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-textMuted">2. HOD:</span>
                                {l.hod_status === 'Approved' ? (
                                  <span className="text-emerald-400 font-bold">✓ Approved</span>
                                ) : l.hod_status === 'Rejected' ? (
                                  <span className="text-rose-400 font-bold">✕ Rejected</span>
                                ) : (
                                  <span className="text-amber-400">⏳ Pending HOD</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-textMuted">3. Principal:</span>
                                {l.principal_status === 'Approved' ? (
                                  <span className="text-emerald-400 font-bold">✓ Final Approved</span>
                                ) : l.principal_status === 'Rejected' ? (
                                  <span className="text-rose-400 font-bold">✕ Rejected</span>
                                ) : l.hod_status === 'Approved' ? (
                                  <span className="text-amber-400 animate-pulse font-bold">⏳ Pending Principal</span>
                                ) : (
                                  <span className="text-textMuted">Waiting for HOD</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap space-x-1.5">
                            {/* Sanction Order Button: Shown ONLY when both HOD and Principal have approved */}
                            {isFullyApproved ? (
                              <button
                                onClick={() => setViewingLeave(l)}
                                className="px-2.5 py-1 rounded-lg bg-surface border border-brand-primary/40 hover:bg-brand-soft text-brand-primary text-xs font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                title="View and Print Official Sanction Order (Approved by HOD and Principal)"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Sanction Order</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-textMuted italic">
                                {l.hod_status !== 'Approved' ? 'Awaiting HOD' : 'Awaiting Principal'}
                              </span>
                            )}

                            {!isFullyApproved && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Cancel leave request (${l.leave_type} for ${l.num_days} days)?`)) {
                                    cancelLeaveMutation.mutate(l.id);
                                  }
                                }}
                                disabled={cancelLeaveMutation.isPending}
                                className="px-2 py-1 rounded-lg border border-alert/30 text-alert hover:bg-alert-soft text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Cancel</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SUB-TAB 2: Duties Reassigned To Me ── */}
        {activeSubTab === 'reassigned-duties' && (
          <div>
            {isLoadingDuties ? (
              <div className="py-12 text-center text-xs text-textMuted">Loading reassigned duties...</div>
            ) : reassignedDuties.length === 0 ? (
              <div className="py-12 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-1">
                <Briefcase className="w-8 h-8 text-textMuted mx-auto" />
                <p className="font-bold text-textPrimary">No Reassigned Covering Duties</p>
                <p className="text-[11px] text-textSecondary">You have not been assigned any covering classes or exam duties by colleagues.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-2.5 px-3.5">Type</th>
                      <th className="py-2.5 px-3.5">Date</th>
                      <th className="py-2.5 px-3.5">Subject / Exam Duty</th>
                      <th className="py-2.5 px-3.5">Periods / Timing</th>
                      <th className="py-2.5 px-3.5">Colleague on Leave</th>
                      <th className="py-2.5 px-3.5 text-center">Duty Status</th>
                      <th className="py-2.5 px-3.5 text-right">Your Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {reassignedDuties.map((duty, idx) => {
                      const isPendingDuty = !duty.acceptance_status || duty.acceptance_status === 'Pending';
                      const isAccepted = duty.acceptance_status === 'Accepted';
                      const isRejected = duty.acceptance_status === 'Rejected';

                      return (
                        <tr key={duty.id || idx} className="hover:bg-surface-2/40 transition-colors">
                          <td className="py-2.5 px-3.5 font-bold uppercase text-[10px]">
                            <span
                              className={`px-2 py-0.5 rounded-md ${
                                duty.adjustment_type === 'exam_duty'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-brand-soft text-brand-primary border border-brand-primary/20'
                              }`}
                            >
                              {duty.adjustment_type === 'exam_duty' ? 'Exam Duty' : 'Classwork'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-textPrimary whitespace-nowrap">{duty.date}</td>
                          <td className="py-2.5 px-3.5 font-bold text-textPrimary">{duty.subject_or_duty}</td>
                          <td className="py-2.5 px-3.5 text-textSecondary font-mono">{duty.timing_slot}</td>
                          <td className="py-2.5 px-3.5">
                            <p className="font-bold text-textPrimary">{duty.original_faculty_name}</p>
                            <p className="text-[10px] text-textMuted">{duty.original_faculty_email}</p>
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            {isAccepted ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                <Check className="w-3 h-3" /> Accepted by You
                              </span>
                            ) : isRejected ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1">
                                ✕ Declined
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Action Required
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                            {isPendingDuty ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const reason = prompt('Please enter reason for declining this covering duty:');
                                    if (reason !== null) {
                                      dutyResponseMutation.mutate({
                                        adjId: duty.id || '',
                                        status: 'Rejected',
                                        rejected_reason: reason,
                                      });
                                    }
                                  }}
                                  disabled={dutyResponseMutation.isPending}
                                  className="px-2.5 py-1 rounded-lg border border-alert/30 text-alert hover:bg-alert-soft font-bold text-xs transition-all cursor-pointer"
                                >
                                  Decline
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Accept covering duty for ${duty.subject_or_duty} on ${duty.date}?`)) {
                                      dutyResponseMutation.mutate({
                                        adjId: duty.id || '',
                                        status: 'Accepted',
                                      });
                                    }
                                  }}
                                  disabled={dutyResponseMutation.isPending}
                                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Accept Duty</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-textMuted">Confirmed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── APPLY FOR LEAVE MODAL ── */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-brand-primary" /> Apply for Faculty Leave
              </h4>
              <button onClick={() => setShowApplyModal(false)} className="text-textMuted hover:text-textPrimary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="space-y-4 text-xs">
              {/* 1. Leave Type & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Leave Type *</label>
                  <select
                    value={formLeaveType}
                    onChange={(e) => setFormLeaveType(e.target.value as FacultyLeaveType)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-surface text-textPrimary text-xs focus:outline-none focus:border-brand-primary"
                  >
                    <option value="Casual Leave">Casual Leave (CL)</option>
                    <option value="Academic Leave">Academic Leave (AL)</option>
                    <option value="SP CL">Special Casual Leave (SP CL)</option>
                    <option value="Paid Leave">Loss of Pay (Paid Leave)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-textSecondary block mb-1">From Date *</label>
                  <input
                    type="date"
                    value={formFromDate}
                    onChange={(e) => {
                      setFormFromDate(e.target.value);
                      if (e.target.value > formToDate) setFormToDate(e.target.value);
                      setAdjDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-surface text-textPrimary text-xs font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-textSecondary block mb-1">To Date *</label>
                  <input
                    type="date"
                    value={formToDate}
                    min={formFromDate}
                    onChange={(e) => setFormToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-surface text-textPrimary text-xs font-mono"
                    required
                  />
                </div>
              </div>

              {/* Working Days Calculation & Balance Display */}
              <div className="p-3 bg-surface-2 rounded-xl border border-borderLine flex items-center justify-between text-xs">
                <div>
                  <span className="text-textSecondary">Calculated Working Days: </span>
                  <strong className="text-textPrimary font-mono text-sm ml-1">{calculatedDays} day(s)</strong>
                  <span className="text-[10px] text-textMuted ml-1.5">(excl. Sundays &amp; Holidays)</span>
                </div>
                <div>
                  <span className="text-textSecondary">Available Balance: </span>
                  <strong
                    className={`font-mono text-sm ml-1 ${
                      isInsufficient ? 'text-alert' : 'text-emerald-400'
                    }`}
                  >
                    {currentRemaining} day(s)
                  </strong>
                </div>
              </div>

              {isInsufficient && (
                <div className="p-3 rounded-xl bg-alert-soft border border-alert/30 text-alert text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Insufficient {formLeaveType} balance ({currentRemaining} days remaining, requested {calculatedDays} days).
                    Please select <strong>Loss of Pay (Paid Leave)</strong> to proceed.
                  </span>
                </div>
              )}

              {/* 2. Reason for applying */}
              <div>
                <label className="font-bold text-textSecondary block mb-1">Reason for Applying *</label>
                <textarea
                  rows={2}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="State the reason for leave (e.g. personal work, medical, attending conference/workshop)..."
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-surface text-textPrimary text-xs focus:outline-none focus:border-brand-primary"
                  required
                />
              </div>

              {/* ── 3. Classwork & Exam Duty Adjustment Section ── */}
              <div className="pt-2 border-t border-borderLine space-y-3">
                <div>
                  <h5 className="font-bold text-textPrimary flex items-center gap-1.5 text-xs">
                    <Users className="w-4 h-4 text-purple-400" /> Classwork &amp; Exam Duty Adjustments
                  </h5>
                  <p className="text-[11px] text-textSecondary">
                    Select the date, duty type (Classwork/Exam), multi-select periods, and choose a colleague across any department.
                  </p>
                </div>

                {/* Adjustment Input Box */}
                <div className="p-3 bg-surface-2 rounded-xl border border-borderLine space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Assigning Duty Type *</label>
                      <select
                        value={adjType}
                        onChange={(e) => setAdjType(e.target.value as any)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs"
                      >
                        <option value="classwork">Classwork (Lecture / Lab)</option>
                        <option value="exam_duty">Exam Duty (Invigilation / Mid / Sem)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">On Which Date *</label>
                      <input
                        type="date"
                        value={adjDate}
                        min={formFromDate}
                        max={formToDate}
                        onChange={(e) => setAdjDate(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Subject / Duty Description *</label>
                      <input
                        type="text"
                        placeholder="e.g. Data Structures Lab / Mid Exam Hall 201"
                        value={adjSubject}
                        onChange={(e) => setAdjSubject(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs"
                      />
                    </div>
                  </div>

                  {/* Multi-Select Period Checkboxes */}
                  <div>
                    <label className="font-bold text-textMuted block mb-1 text-[10px]">
                      Select Adjusting Period(s) * (Multi-Select: Click to toggle)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {AVAILABLE_PERIODS.map((p) => {
                        const isChecked = adjPeriods.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePeriod(p.id)}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                                : 'bg-background border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface-3'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-3 h-3 rounded accent-purple-500 pointer-events-none"
                            />
                            <span className="truncate">{p.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Searchable Colleague Dropdown List */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-textMuted block text-[10px]">
                      Select Colleague Faculty * (Search and choose from all departments)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Filter colleague by name, department, or email..."
                          value={colleagueSearch}
                          onChange={(e) => setColleagueSearch(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                      <div className="flex-1">
                        <select
                          value={adjFacultyEmail}
                          onChange={(e) => {
                            const selectedEmail = e.target.value;
                            setAdjFacultyEmail(selectedEmail);
                            const found = facultyDirectory.find(
                              (f: any) => f.email?.toLowerCase() === selectedEmail.toLowerCase()
                            );
                            if (found) {
                              setAdjFacultyName(found.name || '');
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs focus:outline-none focus:border-brand-primary"
                        >
                          <option value="">
                            {isLoadingFaculty
                              ? 'Loading faculty directory...'
                              : filteredFacultyForDuty.length === 0
                              ? 'No faculty matched search'
                              : `-- Select Colleague (${filteredFacultyForDuty.length} available) --`}
                          </option>
                          {filteredFacultyForDuty.map((f: any) => (
                            <option key={f.id || f.email} value={f.email}>
                              {f.name} • {f.department} ({f.email})
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddAdjustment}
                        className="px-4 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Duty</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Adjustments Preview Table */}
                {formAdjustments.length > 0 && (
                  <div className="rounded-xl border border-borderLine overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-surface-2 text-textMuted font-bold border-b border-borderLine">
                        <tr>
                          <th className="p-2">Type</th>
                          <th className="p-2">Date</th>
                          <th className="p-2">Subject / Duty</th>
                          <th className="p-2">Periods</th>
                          <th className="p-2">Covering Faculty</th>
                          <th className="p-2 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borderLine font-mono">
                        {formAdjustments.map((a, i) => (
                          <tr key={i}>
                            <td className="p-2 font-sans font-bold uppercase text-[10px]">{a.adjustment_type}</td>
                            <td className="p-2">{a.date}</td>
                            <td className="p-2 font-sans font-medium text-textPrimary">{a.subject_or_duty}</td>
                            <td className="p-2 text-purple-300 font-semibold">{a.periods?.join(', ') || a.timing_slot}</td>
                            <td className="p-2 font-sans">
                              <span className="font-bold text-textPrimary block">{a.reassigned_faculty_name || a.reassigned_faculty_email}</span>
                              {a.reassigned_faculty_name && a.reassigned_faculty_name !== a.reassigned_faculty_email && (
                                <span className="text-[10px] text-textMuted font-mono block">{a.reassigned_faculty_email}</span>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveAdjustment(i)}
                                className="text-alert hover:underline cursor-pointer"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-borderLine">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyMutation.isPending || isInsufficient}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {applyMutation.isPending ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── REASSIGN COLLEAGUE MODAL ── */}
      {reassignModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" /> Reassign Covering Colleague
              </h4>
              <button onClick={() => setReassignModal(null)} className="text-textMuted hover:text-textPrimary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-textSecondary">
              Reassign covering duty for <strong>{reassignModal.originalDuty}</strong> on {reassignModal.date}.
            </p>

            <div className="space-y-2 text-xs">
              <input
                type="text"
                placeholder="Search colleague by name or department..."
                value={reassignColleagueSearch}
                onChange={(e) => setReassignColleagueSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary"
              />

              <select
                value={reassignNewEmail}
                onChange={(e) => {
                  const sEmail = e.target.value;
                  setReassignNewEmail(sEmail);
                  const fObj = facultyDirectory.find((f: any) => f.email?.toLowerCase() === sEmail.toLowerCase());
                  if (fObj) setReassignNewName(fObj.name || '');
                }}
                className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-medium"
              >
                <option value="">-- Choose New Colleague ({filteredFacultyForReassign.length} available) --</option>
                {filteredFacultyForReassign.map((f: any) => (
                  <option key={f.id || f.email} value={f.email}>
                    {f.name} • {f.department} ({f.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-borderLine">
              <button
                type="button"
                onClick={() => setReassignModal(null)}
                className="px-3.5 py-1.5 rounded-xl border border-borderLine text-textSecondary text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reassignNewEmail || reassignMutation.isPending}
                onClick={() => {
                  reassignMutation.mutate({
                    adjId: reassignModal.adjId,
                    email: reassignNewEmail,
                    name: reassignNewName,
                  });
                }}
                className="px-4 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {reassignMutation.isPending ? 'Reassigning...' : 'Confirm Reassignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Official Leave Letter Modal (Sanction Order) ── */}
      <LeaveLetterModal
        isOpen={Boolean(viewingLeave)}
        onClose={() => setViewingLeave(null)}
        leave={viewingLeave}
      />
    </div>
  );
};
