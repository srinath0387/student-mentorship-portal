import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Users,
  GraduationCap,
  FileText,
  Building,
  Printer,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
  Trash2
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  FacultyLeaveRecord,
  StudentPermissionRecord
} from '../../types';
import { LeaveLetterModal } from './LeaveLetterModal';
import { PermissionLetterModal } from './PermissionLetterModal';
import { ProofViewerModal } from './ProofViewerModal';

export const HodLeaveApprovalTab: React.FC<{ studentsOnly?: boolean }> = ({ studentsOnly = false }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<'faculty' | 'students'>(studentsOnly ? 'students' : 'faculty');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Remarks modal for rejection / approval notes
  const [actionModal, setActionModal] = useState<{
    type: 'faculty' | 'student';
    id: string;
    action: 'Approved' | 'Rejected';
    title: string;
  } | null>(null);
  const [remarksText, setRemarksText] = useState('');

  const [viewingLeave, setViewingLeave] = useState<FacultyLeaveRecord | null>(null);
  const [viewingPermission, setViewingPermission] = useState<StudentPermissionRecord | null>(null);
  const [inspectingProof, setInspectingProof] = useState<StudentPermissionRecord | null>(null);

  // Queries
  const { data: facultyLeaves = [], isLoading: isLoadingFaculty } = useQuery<FacultyLeaveRecord[]>({
    queryKey: ['hodFacultyLeaves'],
    queryFn: () => api.getHodFacultyLeaves(),
  });

  const { data: studentPermissions = [], isLoading: isLoadingStudents } = useQuery<StudentPermissionRecord[]>({
    queryKey: ['hodStudentPermissions'],
    queryFn: () => api.getHodStudentPermissions(),
  });

  // Mutations
  const updateFacultyLeaveMutation = useMutation({
    mutationFn: ({ id, status, remarks }: { id: string; status: 'Approved' | 'Rejected'; remarks?: string }) =>
      api.updateFacultyLeaveStatus(id, status, remarks),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['hodFacultyLeaves'] });
      const prev = queryClient.getQueryData(['hodFacultyLeaves']);
      queryClient.setQueryData(['hodFacultyLeaves'], (old: any[]) =>
        (old || []).map((l) => (l.id === id ? { ...l, status } : l))
      );
      return { prev };
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
      setActionModal(null);
      setRemarksText('');
      showToast(
        status === 'Approved'
          ? 'Faculty leave approved successfully.'
          : 'Faculty leave rejected.',
        status === 'Approved' ? 'success' : 'error'
      );
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.prev) {
        queryClient.setQueryData(['hodFacultyLeaves'], context.prev);
      }
      showToast(`Failed: ${err.message || 'Something went wrong'}`, 'error');
    },
  });

  const updateStudentPermissionMutation = useMutation({
    mutationFn: ({ id, status, hod_remarks }: { id: string; status: 'Approved' | 'Rejected'; hod_remarks?: string }) =>
      api.updateStudentPermissionStatus(id, status, hod_remarks),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['hodStudentPermissions'] });
      const prev = queryClient.getQueryData(['hodStudentPermissions']);
      queryClient.setQueryData(['hodStudentPermissions'], (old: any[]) =>
        (old || []).map((p) => (p.id === id ? { ...p, status } : p))
      );
      return { prev };
    },
    onSuccess: (_data, { status, id }) => {
      queryClient.invalidateQueries({ queryKey: ['hodStudentPermissions'] });
      // Also broadcast to student's own query key so their history refreshes
      queryClient.invalidateQueries({ queryKey: ['studentPermissions'] });
      setActionModal(null);
      setRemarksText('');
      showToast(
        status === 'Approved'
          ? '✅ On-Duty approved! Attendance will be credited as Present.'
          : '❌ On-Duty permission rejected.',
        status === 'Approved' ? 'success' : 'error'
      );
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.prev) {
        queryClient.setQueryData(['hodStudentPermissions'], context.prev);
      }
      showToast(`Failed: ${err.message || 'Something went wrong'}`, 'error');
    },
  });

  const deleteFacultyLeaveMutation = useMutation({
    mutationFn: (id: string) => api.deleteHodFacultyLeave(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary'] });
      showToast(res.message || 'Leave request deleted. Leave balance credited back to faculty.', 'info');
    },
    onError: (err: any) => {
      showToast(`Failed to delete leave: ${err.message}`, 'error');
    },
  });

  const deleteStudentPermissionMutation = useMutation({
    mutationFn: (id: string) => api.deleteHodStudentPermission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hodStudentPermissions'] });
      queryClient.invalidateQueries({ queryKey: ['studentPermissions'] });
      showToast('Permission request deleted.', 'info');
    },
    onError: (err: any) => {
      showToast(`Failed to delete permission: ${err.message}`, 'error');
    },
  });

  const handleConfirmAction = () => {
    if (!actionModal) return;
    if (actionModal.type === 'faculty') {
      updateFacultyLeaveMutation.mutate({
        id: actionModal.id,
        status: actionModal.action,
        remarks: remarksText.trim(),
      });
    } else {
      updateStudentPermissionMutation.mutate({
        id: actionModal.id,
        status: actionModal.action,
        hod_remarks: remarksText.trim(),  // ← fixed: matches backend field name
      });
    }
  };

  // Filtered Faculty Leaves
  const filteredFacultyLeaves = facultyLeaves.filter((l) => {
    const matchStatus = filterStatus === 'All' || l.status === filterStatus;
    const matchSearch =
      !searchQuery ||
      l.faculty_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.faculty_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.leave_type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Filtered Student Permissions
  const filteredStudentPermissions = studentPermissions.filter((p) => {
    const matchStatus = filterStatus === 'All' || p.status === filterStatus;
    const matchSearch =
      !searchQuery ||
      p.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.permission_type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const pendingFacultyCount = facultyLeaves.filter((l) => l.status === 'Pending').length;
  const pendingStudentCount = studentPermissions.filter((p) => p.status === 'Pending').length;

  return (
    <div className="space-y-6">
      {/* ── Main Approval Card ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-5">
        {/* Navigation Tabs & Counts */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-borderLine pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!studentsOnly && (
              <button
                onClick={() => setActiveSubTab('faculty')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeSubTab === 'faculty'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Faculty Leaves</span>
                {pendingFacultyCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                    {pendingFacultyCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveSubTab('students')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === 'students'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Student On-Duty Permissions</span>
              {pendingStudentCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                  {pendingStudentCount}
                </span>
              )}
            </button>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-borderLine bg-background text-xs w-48 sm:w-60">
              <Search className="w-3.5 h-3.5 text-textSecondary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name, reg no, type..."
                className="w-full bg-transparent focus:outline-none text-textPrimary"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-borderLine bg-background text-textPrimary text-xs font-bold"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Only</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* ── SECTION 1: Faculty Leave Requests ── */}
        {activeSubTab === 'faculty' && (
          <div className="space-y-4">
            {isLoadingFaculty ? (
              <div className="py-12 text-center text-xs text-textMuted">Loading faculty leave applications...</div>
            ) : filteredFacultyLeaves.length === 0 ? (
              <div className="py-12 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-1">
                <Calendar className="w-8 h-8 text-textMuted mx-auto" />
                <p className="font-bold text-textPrimary">No Faculty Leave Requests</p>
                <p className="text-[11px] text-textSecondary">There are no faculty leave requests matching your current filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFacultyLeaves.map((l) => {
                  const isPending = l.status === 'Pending';
                  const isApproved = l.status === 'Approved';
                  const isRejected = l.status === 'Rejected';

                  return (
                    <div
                      key={l.id}
                      className="p-4.5 rounded-2xl border border-borderLine bg-surface-2/40 hover:bg-surface-2/70 transition-all space-y-3"
                    >
                      {/* Top Row: Applicant & Leave Type */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center font-black text-xs shrink-0">
                            {l.faculty_name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-textPrimary">{l.faculty_name}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-borderLine font-bold text-textSecondary">
                                {l.department}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
                                {l.leave_type}
                              </span>
                            </div>
                            <p className="text-[11px] text-textMuted mt-0.5">{l.faculty_email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              isApproved
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isRejected
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {l.status}
                          </span>

                          {isApproved && (
                            <button
                              onClick={() => setViewingLeave(l)}
                              className="px-2.5 py-1 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-brand-primary text-xs font-bold inline-flex items-center gap-1 shadow-xs"
                              title="Print Sanction Order"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Order</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete leave request for ${l.faculty_name} (${l.num_days} days)?\n\nThis will remove the leave application and credit ${l.num_days} days back to ${l.faculty_name}'s leave balance.`
                                )
                              ) {
                                deleteFacultyLeaveMutation.mutate(l.id);
                              }
                            }}
                            disabled={deleteFacultyLeaveMutation.isPending}
                            className="p-1.5 rounded-lg border border-alert/30 hover:bg-alert-soft text-alert text-xs font-bold inline-flex items-center gap-1 shadow-xs transition-all"
                            title="Delete leave request & restore faculty balance"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Middle: Dates, Working Days & Reason */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface rounded-xl border border-borderLine text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-textMuted block">DURATION</span>
                          <span className="font-mono font-bold text-textPrimary">{l.from_date?.split('T')[0]} to {l.to_date?.split('T')[0]}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-textMuted block">TOTAL WORKING DAYS</span>
                          <span className="font-bold text-brand-primary">{l.num_days} Day(s) (Excl. Holidays &amp; Sundays)</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-textMuted block">REASON</span>
                          <span className="text-textSecondary italic">&ldquo;{l.reason}&rdquo;</span>
                        </div>
                      </div>

                      {/* Classwork & Exam Duty Adjustments */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-purple-400" />
                            <span>Classwork &amp; Exam Duty Adjustments ({l.adjustments?.length || 0})</span>
                          </p>
                          {(!l.adjustments || l.adjustments.length === 0) && (
                            <span className="text-[10px] text-textMuted italic">No covering duties added for this leave</span>
                          )}
                        </div>

                        {l.adjustments && l.adjustments.length > 0 && (
                          <div className="rounded-xl border border-borderLine overflow-hidden">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-surface font-bold text-textMuted border-b border-borderLine">
                                <tr>
                                  <th className="p-2">Adjustment Type</th>
                                  <th className="p-2">Date</th>
                                  <th className="p-2">Subject / Duty Description</th>
                                  <th className="p-2">Periods / Slot</th>
                                  <th className="p-2">Covering Faculty Colleague</th>
                                  <th className="p-2 text-center">Colleague Acceptance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-borderLine">
                                {l.adjustments.map((adj, i) => {
                                  const isAccepted = adj.acceptance_status === 'Accepted';
                                  const isRejected = adj.acceptance_status === 'Rejected';
                                  return (
                                    <tr key={i} className="hover:bg-surface transition-colors">
                                      <td className="p-2">
                                        <span
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                            adj.adjustment_type === 'exam_duty'
                                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                              : 'bg-brand-soft text-brand-primary border border-brand-primary/20'
                                          }`}
                                        >
                                          {adj.adjustment_type === 'exam_duty' ? 'Exam Duty' : 'Classwork'}
                                        </span>
                                      </td>
                                      <td className="p-2 font-mono text-textPrimary font-bold">{adj.date?.split('T')[0]}</td>
                                      <td className="p-2 font-medium text-textPrimary">{adj.subject_or_duty}</td>
                                      <td className="p-2 font-mono text-purple-300 font-semibold">{adj.periods?.join(', ') || adj.timing_slot}</td>
                                      <td className="p-2">
                                        <p className="font-bold text-textPrimary">{adj.reassigned_faculty_name || adj.reassigned_faculty_email}</p>
                                        {adj.reassigned_faculty_name && adj.reassigned_faculty_name !== adj.reassigned_faculty_email && (
                                          <p className="text-[10px] text-textMuted font-mono">{adj.reassigned_faculty_email}</p>
                                        )}
                                      </td>
                                      <td className="p-2 text-center">
                                        {isAccepted ? (
                                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                            <span>Accepted</span>
                                          </span>
                                        ) : isRejected ? (
                                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black inline-flex items-center gap-1">
                                            <XCircle className="w-3 h-3 text-rose-400" />
                                            <span>Declined</span>
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-amber-400" />
                                            <span>Pending</span>
                                          </span>
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

                      {/* Approval Stepper Status Bar */}
                      <div className="p-2.5 bg-surface rounded-xl border border-borderLine flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-textMuted uppercase font-bold">Stage:</span>
                          <span className={`text-xs font-bold ${l.hod_status === 'Approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            HOD: {l.hod_status || 'Pending'}
                          </span>
                          <span className="text-textMuted">→</span>
                          <span className={`text-xs font-bold ${l.principal_status === 'Approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            Principal: {l.principal_status || 'Pending'}
                          </span>
                        </div>

                        {l.is_deducted && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                            ✓ Balance Deducted
                          </span>
                        )}
                      </div>

                      {/* Action Buttons for Pending */}
                      {isPending && (
                        <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-borderLine">
                          {/* Colleague Warning if any pending/rejected */}
                          {l.adjustments && l.adjustments.some(a => a.acceptance_status === 'Rejected') && (
                            <span className="text-xs text-rose-400 font-bold mr-auto">
                              ⚠️ Colleague declined duty. Reassignment needed before approval.
                            </span>
                          )}

                          <button
                            onClick={() =>
                              setActionModal({
                                type: 'faculty',
                                id: l.id,
                                action: 'Rejected',
                                title: `Reject Leave for ${l.faculty_name}`,
                              })
                            }
                            className="px-3.5 py-1.5 rounded-xl border border-alert/30 text-alert hover:bg-alert-soft text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>

                          {/* HOD Approval Button */}
                          {l.hod_status !== 'Approved' && (
                            <button
                              onClick={() =>
                                setActionModal({
                                  type: 'faculty',
                                  id: l.id,
                                  action: 'Approved',
                                  title: `Approve Leave as HOD for ${l.faculty_name}`,
                                })
                              }
                              disabled={l.adjustments?.some(a => a.acceptance_status === 'Rejected')}
                              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve (HOD)</span>
                            </button>
                          )}

                          {/* Principal Final Approval Button (For Admin / Principal) */}
                          {(user?.role === 'admin' || user?.email?.toLowerCase().includes('principal')) && l.hod_status === 'Approved' && l.principal_status !== 'Approved' && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`Grant FINAL PRINCIPAL APPROVAL for ${l.faculty_name} (${l.num_days} days)?\n\nThis will deduct ${l.num_days} day(s) from their leave balance.`)) {
                                  try {
                                    await api.principalApproveFacultyLeave(l.id, 'Approved', 'Approved by Principal Office');
                                    queryClient.invalidateQueries({ queryKey: ['hodFacultyLeaves'] });
                                    queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary'] });
                                    alert('Principal approval granted. Leave balance deducted.');
                                  } catch (err: any) {
                                    alert(`Failed: ${err.message}`);
                                  }
                                }
                              }}
                              className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Final Approval (Principal)</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Remarks display if already processed */}
                      {l.hod_remarks && (
                        <p className="text-[11px] text-textMuted bg-surface p-2 rounded-lg border border-borderLine">
                          <strong>HOD Remarks:</strong> {l.hod_remarks}
                        </p>
                      )}
                      {l.principal_remarks && (
                        <p className="text-[11px] text-textMuted bg-purple-500/5 p-2 rounded-lg border border-purple-500/20">
                          <strong>Principal Office Remarks:</strong> {l.principal_remarks}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SECTION 2: Student On-Duty Permissions ── */}
        {activeSubTab === 'students' && (
          <div className="space-y-4">
            {isLoadingStudents ? (
              <div className="py-12 text-center text-xs text-textMuted">Loading student permissions...</div>
            ) : filteredStudentPermissions.length === 0 ? (
              <div className="py-12 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-1">
                <GraduationCap className="w-8 h-8 text-textMuted mx-auto" />
                <p className="font-bold text-textPrimary">No Student Permissions Found</p>
                <p className="text-[11px] text-textSecondary">There are no student on-duty permission requests matching your filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudentPermissions.map((p) => {
                  const isPending = p.status === 'Pending';
                  const isApproved = p.status === 'Approved';
                  const isRejected = p.status === 'Rejected';

                  return (
                    <div
                      key={p.id}
                      className="p-4.5 rounded-2xl border border-borderLine bg-surface-2/40 hover:bg-surface-2/70 transition-all space-y-3"
                    >
                      {/* Top Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-black text-xs shrink-0">
                            {p.student_name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-xs text-brand-primary">{p.roll_number}</span>
                              <h4 className="text-xs font-bold text-textPrimary">{p.student_name}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-borderLine font-bold text-textSecondary">
                                {p.department} · Sec {p.section} · {p.year}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-bold border border-purple-500/20">
                                {p.permission_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              isApproved
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isRejected
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {p.status}
                          </span>

                          {isApproved && (
                            <button
                              onClick={() => setViewingPermission(p)}
                              className="px-2.5 py-1 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-brand-primary text-xs font-bold inline-flex items-center gap-1 shadow-xs"
                              title="Print On-Duty Sanction Order"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Sanction Order</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (window.confirm(`Delete permission request for ${p.student_name} (${p.roll_number})?`)) {
                                deleteStudentPermissionMutation.mutate(p.id);
                              }
                            }}
                            disabled={deleteStudentPermissionMutation.isPending}
                            className="p-1.5 rounded-lg border border-alert/30 hover:bg-alert-soft text-alert text-xs font-bold inline-flex items-center gap-1 shadow-xs transition-all"
                            title="Delete student permission request"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Details & Proof Document */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-surface rounded-xl border border-borderLine text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-textMuted block">EVENT DATES</span>
                          <span className="font-mono font-bold text-textPrimary">{p.from_date} to {p.to_date}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-textMuted block">WORKING DAYS</span>
                          <span className="font-bold text-brand-primary">{p.num_days} Day(s)</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-[10px] font-bold text-textMuted block">PURPOSE / DESCRIPTION</span>
                          <span className="text-textSecondary italic">&ldquo;{p.reason}&rdquo;</span>
                        </div>
                      </div>

                      {/* Proof Document Link */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-borderLine text-xs">
                        <span className="font-bold text-textSecondary flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-brand-primary" />
                          <span>Uploaded Proof Document:</span>
                        </span>
                        {p.proof_url ? (
                          <button
                            type="button"
                            onClick={() => setInspectingProof(p)}
                            className="px-3 py-1.5 rounded-lg bg-brand-soft text-brand-primary font-bold text-xs hover:bg-brand-primary hover:text-white transition-all inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>View / Inspect Proof Document</span>
                          </button>
                        ) : (
                          <span className="text-textMuted">No proof attached</span>
                        )}
                      </div>

                      {/* Action Buttons for Pending */}
                      {isPending && (
                        <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-borderLine">
                          <button
                            onClick={() =>
                              setActionModal({
                                type: 'student',
                                id: p.id,
                                action: 'Rejected',
                                title: `Reject Permission for ${p.student_name} (${p.roll_number})`,
                              })
                            }
                            className="px-3.5 py-1.5 rounded-xl border border-alert/30 text-alert hover:bg-alert-soft text-xs font-bold flex items-center gap-1.5 transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            onClick={() =>
                              setActionModal({
                                type: 'student',
                                id: p.id,
                                action: 'Approved',
                                title: `Approve On-Duty for ${p.student_name} (${p.roll_number})`,
                              })
                            }
                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve On-Duty (Locks Attendance as Present)</span>
                          </button>
                        </div>
                      )}

                      {p.hod_remarks && (
                        <p className="text-[11px] text-textMuted bg-surface p-2 rounded-lg border border-borderLine">
                          <strong>HOD Remarks:</strong> {p.hod_remarks}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ACTION CONFIRMATION MODAL (Approve / Reject with Remarks) ── */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="text-base font-bold text-textPrimary">{actionModal.title}</h4>

            <div className="space-y-2">
              <label className="text-xs font-bold text-textSecondary block">
                {actionModal.action === 'Approved' ? 'Approval Remarks (Optional)' : 'Reason for Rejection *'}
              </label>
              <textarea
                rows={3}
                value={remarksText}
                onChange={(e) => setRemarksText(e.target.value)}
                placeholder={
                  actionModal.action === 'Approved'
                    ? 'e.g. Sanctioned on-duty leave. All attendance will be credited.'
                    : 'e.g. Incomplete proof / mid-term exam dates conflict.'
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary resize-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-borderLine">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold text-xs hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`px-5 py-2 rounded-xl text-white font-bold text-xs shadow-sm transition-all ${
                  actionModal.action === 'Approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-alert hover:bg-alert/90'
                }`}
              >
                Confirm {actionModal.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Letters Modals */}
      <LeaveLetterModal
        isOpen={Boolean(viewingLeave)}
        onClose={() => setViewingLeave(null)}
        leave={viewingLeave}
      />
      <PermissionLetterModal
        isOpen={Boolean(viewingPermission)}
        onClose={() => setViewingPermission(null)}
        permission={viewingPermission}
      />
      <ProofViewerModal
        isOpen={Boolean(inspectingProof)}
        onClose={() => setInspectingProof(null)}
        proofUrl={inspectingProof?.proof_url || null}
        studentName={inspectingProof?.student_name}
        rollNumber={inspectingProof?.roll_number}
        title={`Event Proof: ${inspectingProof?.permission_type || 'Document'}`}
      />
    </div>
  );
};
