import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Users,
  Printer,
  ShieldCheck,
  Building,
  Briefcase,
  AlertTriangle,
  Trash2,
  Undo2
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  FacultyLeaveRecord,
  FacultyLeaveSummaryResponse,
  FacultyLeaveType,
  HolidayCalendarEntry,
  FacultyLeaveAdjustment
} from '../../types';
import { LeaveLetterModal } from './LeaveLetterModal';

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

  // Adjustment Inputs (Temp for adding to list)
  const [adjType, setAdjType] = useState<'classwork' | 'exam_duty'>('classwork');
  const [adjDate, setAdjDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adjSubject, setAdjSubject] = useState<string>('');
  const [adjSlot, setAdjSlot] = useState<string>('Period 1 (09:00 - 09:50 AM)');
  const [adjFacultyEmail, setAdjFacultyEmail] = useState<string>('');
  const [adjFacultyName, setAdjFacultyName] = useState<string>('');

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

  const { data: facultyDirectory = [] } = useQuery({
    queryKey: ['facultyDirectoryForAdjustments'],
    queryFn: () => api.getAllFaculty ? api.getAllFaculty() : Promise.resolve([]),
  });

  // Calculate working days excluding Sundays and Holidays
  const holidaySet = useMemo(() => {
    return new Set(
      holidays.map((h) => {
        return typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0];
      })
    );
  }, [holidays]);

  const calculatedDays = useMemo(() => {
    const start = new Date(formFromDate);
    const end = new Date(formToDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dayOfWeek = cur.getDay(); // 0 is Sunday
      const iso = cur.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && !holidaySet.has(iso)) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [formFromDate, formToDate, holidaySet]);

  const currentRemaining = summary?.balances?.[formLeaveType]?.remaining ?? 0;
  const isInsufficient = formLeaveType !== 'Paid Leave' && calculatedDays > currentRemaining;

  // Apply Mutation
  const applyMutation = useMutation({
    mutationFn: (payload: any) => api.applyFacultyLeave(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      setShowApplyModal(false);
      resetForm();
      alert(res.message || 'Leave application submitted successfully!');
    },
    onError: (err: any) => {
      alert(`Failed to apply: ${err.message}`);
    },
  });

  // Cancel Leave Mutation (Restores quota balance)
  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => api.deleteFacultyLeave(leaveId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
      alert(res.message || 'Leave cancelled and credited back to your balance.');
    },
    onError: (err: any) => {
      alert(`Failed to cancel leave: ${err.message}`);
    },
  });

  const resetForm = () => {
    setFormLeaveType('Casual Leave');
    setFormFromDate(new Date().toISOString().split('T')[0]);
    setFormToDate(new Date().toISOString().split('T')[0]);
    setFormReason('');
    setFormAdjustments([]);
  };

  const handleAddAdjustment = () => {
    if (!adjSubject.trim() || !adjFacultyEmail.trim()) {
      alert('Please provide subject/duty and select a reassigned faculty.');
      return;
    }
    const facultyObj = facultyDirectory.find((f: any) => f.email?.toLowerCase() === adjFacultyEmail.toLowerCase());
    const facultyName = facultyObj?.name || adjFacultyName || adjFacultyEmail;

    setFormAdjustments((prev) => [
      ...prev,
      {
        adjustment_type: adjType,
        date: adjDate,
        subject_or_duty: adjSubject.trim(),
        timing_slot: adjSlot.trim(),
        reassigned_faculty_email: adjFacultyEmail.toLowerCase().trim(),
        reassigned_faculty_name: facultyName,
      },
    ]);

    setAdjSubject('');
    setAdjFacultyEmail('');
    setAdjFacultyName('');
  };

  const handleRemoveAdjustment = (idx: number) => {
    setFormAdjustments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReason.trim()) {
      alert('Please enter a reason for leave.');
      return;
    }
    if (calculatedDays <= 0) {
      alert('Selected range has 0 working days (falls on Sunday or declared holiday).');
      return;
    }
    if (isInsufficient) {
      alert(`Insufficient balance for ${formLeaveType}. Please switch to 'Paid Leave'.`);
      return;
    }

    applyMutation.mutate({
      leave_type: formLeaveType,
      from_date: formFromDate,
      to_date: formToDate,
      reason: formReason.trim(),
      adjustments: formAdjustments,
    });
  };

  const balances = summary?.balances || {
    'Casual Leave': { quota: 15, used: 0, remaining: 15 },
    'Academic Leave': { quota: 6, used: 0, remaining: 6 },
    'SP CL': { quota: 7, used: 0, remaining: 7 },
    'Paid Leave': { quota: 0, used: 0, remaining: 999 },
  };

  return (
    <div className="space-y-6">
      {/* ── Quota Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Casual Leave (CL)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-soft text-brand-primary font-bold">Annual: 15</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-brand-primary">{balances['Casual Leave'].remaining}</span>
            <span className="text-xs text-textSecondary">days remaining</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Used: {balances['Casual Leave'].used} / 15 days</p>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Academic Leave (AL)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-bold">Annual: 6</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-400">{balances['Academic Leave'].remaining}</span>
            <span className="text-xs text-textSecondary">days remaining</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Used: {balances['Academic Leave'].used} / 6 days</p>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Special CL (SP CL)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">Annual: 7</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{balances['SP CL'].remaining}</span>
            <span className="text-xs text-textSecondary">days remaining</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Used: {balances['SP CL'].used} / 7 days</p>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Covering Duties</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-bold">Assigned</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-sky-400">{reassignedDuties.length}</span>
            <span className="text-xs text-textSecondary">classes / duties</span>
          </div>
          <p className="text-[11px] text-textMuted mt-1">Covering for peers on leave</p>
        </div>
      </div>

      {/* ── Main Leave Portal Card ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-5">
        {/* Navigation & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-borderLine pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('my-leaves')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'my-leaves'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
              }`}
            >
              My Leave Applications ({summary?.leaves?.length || 0})
            </button>
            <button
              onClick={() => setActiveSubTab('reassigned-duties')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'reassigned-duties'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
              }`}
            >
              Duties Reassigned To Me ({reassignedDuties.length})
            </button>
          </div>

          <button
            onClick={() => setShowApplyModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Apply for Leave</span>
          </button>
        </div>

        {/* ── SUB-TAB 1: My Leave History ── */}
        {activeSubTab === 'my-leaves' && (
          <div>
            {isLoadingSummary ? (
              <div className="py-12 text-center text-xs text-textMuted">Loading leave history...</div>
            ) : !summary?.leaves || summary.leaves.length === 0 ? (
              <div className="py-12 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-2">
                <Calendar className="w-8 h-8 text-textMuted mx-auto" />
                <p className="font-bold text-textPrimary">No Leave Applications Found</p>
                <p className="text-[11px] text-textSecondary">You haven't submitted any leave requests for this calendar year.</p>
                <button
                  onClick={() => setShowApplyModal(true)}
                  className="mt-2 px-3.5 py-1.5 rounded-lg bg-brand-primary text-white font-bold text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Apply Now
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-2.5 px-3.5">Leave Type</th>
                      <th className="py-2.5 px-3.5">Date Range</th>
                      <th className="py-2.5 px-3.5 text-center">Working Days</th>
                      <th className="py-2.5 px-3.5">Reason</th>
                      <th className="py-2.5 px-3.5">Adjustments</th>
                      <th className="py-2.5 px-3.5 text-center">Status</th>
                      <th className="py-2.5 px-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {summary.leaves.map((l) => {
                      const isApproved = l.status === 'Approved';
                      const isRejected = l.status === 'Rejected';
                      return (
                        <tr key={l.id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="py-2.5 px-3.5 font-bold text-textPrimary whitespace-nowrap">{l.leave_type}</td>
                          <td className="py-2.5 px-3.5 text-textSecondary whitespace-nowrap">
                            {l.from_date} to {l.to_date}
                          </td>
                          <td className="py-2.5 px-3.5 text-center font-mono font-bold">{l.num_days}</td>
                          <td className="py-2.5 px-3.5 text-textSecondary max-w-xs truncate">{l.reason}</td>
                          <td className="py-2.5 px-3.5">
                            {l.adjustments && l.adjustments.length > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-surface-2 border border-borderLine text-[10px] font-bold text-textPrimary">
                                {l.adjustments.length} Reassignment(s)
                              </span>
                            ) : (
                              <span className="text-[10px] text-textMuted">None</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isApproved
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : isRejected
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {l.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap space-x-1.5">
                            {isApproved && (
                              <button
                                onClick={() => setViewingLeave(l)}
                                className="px-2.5 py-1 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-brand-primary text-xs font-bold inline-flex items-center gap-1 shadow-xs"
                                title="View and Print Official Sanction Order"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Sanction Order</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Cancel leave request (${l.leave_type} for ${l.num_days} days)?\n\nThis will restore ${l.num_days} days to your balance and remove covering duty adjustments.`
                                  )
                                ) {
                                  cancelLeaveMutation.mutate(l.id);
                                }
                              }}
                              disabled={cancelLeaveMutation.isPending}
                              className="px-2.5 py-1 rounded-lg bg-surface border border-alert/30 hover:bg-alert-soft text-alert text-xs font-bold inline-flex items-center gap-1 shadow-xs transition-all"
                              title="Cancel leave and restore leave balance"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Cancel</span>
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
                <p className="text-[11px] text-textSecondary">You have not been assigned any covering classes or exam duties by peers on leave.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-2.5 px-3.5">Type</th>
                      <th className="py-2.5 px-3.5">Date</th>
                      <th className="py-2.5 px-3.5">Subject / Exam Duty</th>
                      <th className="py-2.5 px-3.5">Class Timing / Slot</th>
                      <th className="py-2.5 px-3.5">Faculty on Leave</th>
                      <th className="py-2.5 px-3.5 text-center">Leave Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {reassignedDuties.map((duty, idx) => (
                      <tr key={idx} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-2.5 px-3.5 font-bold uppercase text-[10px]">
                          <span className={`px-2 py-0.5 rounded-md ${
                            duty.adjustment_type === 'exam_duty'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-brand-soft text-brand-primary border border-brand-primary/20'
                          }`}>
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
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            duty.leave_status === 'Approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {duty.leave_status}
                          </span>
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

      {/* ── APPLY FOR LEAVE MODAL ── */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-brand-primary" /> Apply for Faculty Leave
              </h4>
              <button onClick={() => setShowApplyModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="space-y-4 text-xs">
              {/* Leave Type Selector with Pop-up Remaining Count */}
              <div>
                <label className="font-bold text-textSecondary block mb-1.5">Leave Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Casual Leave', 'Academic Leave', 'SP CL', 'Paid Leave'] as FacultyLeaveType[]).map((t) => {
                    const isSelected = formLeaveType === t;
                    const rem = balances[t]?.remaining ?? 0;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormLeaveType(t)}
                        className={`p-3 rounded-xl border text-left transition-all relative ${
                          isSelected
                            ? 'border-brand-primary bg-brand-soft ring-1 ring-brand-primary/30'
                            : 'border-borderLine bg-surface-2 hover:border-borderLine'
                        }`}
                      >
                        <p className="font-bold text-textPrimary">{t}</p>
                        <p className="text-[10px] text-textSecondary mt-0.5">
                          {t === 'Paid Leave' ? 'Loss of Pay' : `${rem} days left`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Insufficient balance alert */}
              {isInsufficient && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div className="text-[11px] leading-tight">
                    <p className="font-bold">Insufficient {formLeaveType} Balance</p>
                    <p className="mt-0.5 text-textSecondary">
                      You requested <strong>{calculatedDays} days</strong>, but only have <strong>{currentRemaining} days</strong> left.
                      You can switch to <strong>Paid Leave</strong> to proceed.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormLeaveType('Paid Leave')}
                      className="mt-1.5 px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 font-bold text-[10px]"
                    >
                      Switch to Paid Leave
                    </button>
                  </div>
                </div>
              )}

              {/* Date Range & Auto Calculation (excluding Sundays & Holidays) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-surface-2 rounded-xl border border-borderLine">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">From Date *</label>
                  <input
                    type="date"
                    required
                    value={formFromDate}
                    onChange={(e) => setFormFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">To Date *</label>
                  <input
                    type="date"
                    required
                    value={formToDate}
                    onChange={(e) => setFormToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="flex flex-col justify-center items-center bg-surface border border-borderLine rounded-xl p-2">
                  <span className="text-[10px] font-bold text-textSecondary uppercase">Working Days</span>
                  <span className="text-xl font-black text-brand-primary">{calculatedDays}</span>
                  <span className="text-[9px] text-textMuted text-center">Excl. Sundays &amp; Holidays</span>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="font-bold text-textSecondary block mb-1">Reason for Leave *</label>
                <textarea
                  required
                  rows={2}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="State the purpose of leave..."
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary resize-none"
                />
              </div>

              {/* ── Classwork & Exam Duty Adjustment Section ── */}
              <div className="space-y-3 pt-2 border-t border-borderLine">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-textPrimary flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-purple-400" /> Classwork &amp; Exam Duty Adjustments
                    </h5>
                    <p className="text-[11px] text-textSecondary">
                      Reassign classes and exam duties for your leave days. Reassigned faculty will be notified on their dashboard.
                    </p>
                  </div>
                </div>

                {/* Adjustment Input Form */}
                <div className="p-3 bg-surface-2 rounded-xl border border-borderLine space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Type</label>
                      <select
                        value={adjType}
                        onChange={(e) => setAdjType(e.target.value as any)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs"
                      >
                        <option value="classwork">Classwork</option>
                        <option value="exam_duty">Exam Duty</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Date</label>
                      <input
                        type="date"
                        value={adjDate}
                        onChange={(e) => setAdjDate(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Subject / Duty</label>
                      <input
                        type="text"
                        placeholder="e.g. DS Lab or Mid Exam Hall 101"
                        value={adjSubject}
                        onChange={(e) => setAdjSubject(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Timing / Slot</label>
                      <input
                        type="text"
                        placeholder="e.g. Period 2 (09:50 AM)"
                        value={adjSlot}
                        onChange={(e) => setAdjSlot(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex-1">
                      <label className="font-bold text-textMuted block mb-0.5 text-[10px]">Adjusted / Reassigned Faculty Email *</label>
                      <input
                        type="email"
                        placeholder="colleague@rgmcet.edu.in"
                        value={adjFacultyEmail}
                        onChange={(e) => setAdjFacultyEmail(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-borderLine bg-background text-textPrimary text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAdjustment}
                      className="mt-auto px-3.5 py-1.5 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-brand-primary font-bold text-xs shadow-xs"
                    >
                      + Add Entry
                    </button>
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
                          <th className="p-2">Slot</th>
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
                            <td className="p-2">{a.timing_slot}</td>
                            <td className="p-2 font-sans font-bold text-textPrimary">{a.reassigned_faculty_email}</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveAdjustment(i)}
                                className="text-alert hover:underline"
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
                  className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyMutation.isPending || isInsufficient}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm disabled:opacity-50"
                >
                  {applyMutation.isPending ? 'Submitting...' : 'Submit Application to HOD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Official Leave Letter Modal ── */}
      <LeaveLetterModal
        isOpen={Boolean(viewingLeave)}
        onClose={() => setViewingLeave(null)}
        leave={viewingLeave}
      />
    </div>
  );
};
