import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Search,
  Edit2,
  History,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  Building,
  User,
  Clock,
  ShieldCheck,
  Plus
} from 'lucide-react';
import { api } from '../../../lib/api';
import { FacultyLeaveCredit, FacultyLeaveCreditLog } from '../../../types';
import { VALID_DEPARTMENT_NAMES } from '../../../lib/validation/auth';

export const LeaveCreditManagementTab: React.FC = () => {
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');

  // Edit Modal State
  const [editingCredit, setEditingCredit] = useState<{
    faculty_email: string;
    faculty_name: string;
    department: string;
    leave_type: 'Casual Leave' | 'SP CL' | 'Academic Leave';
    current_quota: number;
  } | null>(null);
  const [newQuotaValue, setNewQuotaValue] = useState<number>(15);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');

  // Audit Log Modal State
  const [viewingLogsEmail, setViewingLogsEmail] = useState<string | null>(null);
  const [showPdfReport, setShowPdfReport] = useState<boolean>(false);

  // Queries
  const { data: credits = [], isLoading: isLoadingCredits } = useQuery<FacultyLeaveCredit[]>({
    queryKey: ['adminFacultyLeaveCredits'],
    queryFn: () => api.getFacultyLeaveCredits(),
  });

  const { data: creditLogs = [], isLoading: isLoadingLogs } = useQuery<FacultyLeaveCreditLog[]>({
    queryKey: ['adminFacultyCreditLogs', viewingLogsEmail],
    queryFn: () => (viewingLogsEmail ? api.getFacultyCreditLogs(viewingLogsEmail) : Promise.resolve([])),
    enabled: Boolean(viewingLogsEmail),
  });

  // Adjust Mutation
  const adjustMutation = useMutation({
    mutationFn: (payload: { faculty_email: string; leave_type: string; new_quota: number; reason: string }) =>
      api.adjustFacultyLeaveCredit(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminFacultyLeaveCredits'] });
      queryClient.invalidateQueries({ queryKey: ['adminFacultyCreditLogs', editingCredit?.faculty_email] });
      setEditingCredit(null);
      setAdjustmentReason('');
      alert(res.message || 'Leave credit updated successfully.');
    },
    onError: (err: any) => {
      alert(`Failed to update credit: ${err.message}`);
    },
  });

  const filteredCredits = useMemo(() => {
    return credits.filter((c) => {
      const matchDept = selectedDept === 'All' || c.department === selectedDept;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        c.faculty_name?.toLowerCase().includes(q) ||
        c.faculty_email.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q);
      return matchDept && matchSearch;
    });
  }, [credits, selectedDept, searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header & Stats ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-textPrimary flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-brand-primary" />
            <span>Faculty Leave Credit Allotment &amp; Management</span>
          </h3>
          <p className="text-xs text-textSecondary mt-0.5">
            Default Annual Allotments: <strong>Casual Leave = 15</strong>, <strong>SP CL = 7</strong>, <strong>Academic Leave = 6</strong>.
            Adjust and pro-rate quotas for mid-year joiners with audit tracking.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPdfReport(true)}
          className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all self-start md:self-auto cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Export Principal Balance Report</span>
        </button>
      </div>

      {/* ── Filters & Search ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-textSecondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search faculty name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-borderLine bg-surface text-textPrimary focus:outline-none focus:border-brand-primary"
            />
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-surface text-textPrimary font-semibold focus:outline-none focus:border-brand-primary"
          >
            <option value="All">All Departments</option>
            {VALID_DEPARTMENT_NAMES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-textSecondary font-semibold">
          Showing {filteredCredits.length} Faculty Members
        </div>
      </div>

      {/* ── Faculty Credits Table ── */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
              <tr>
                <th className="py-3 px-4">Faculty Member</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-center">Casual Leave (CL)</th>
                <th className="py-3 px-4 text-center">Special CL (SP CL)</th>
                <th className="py-3 px-4 text-center">Academic Leave (AL)</th>
                <th className="py-3 px-4 text-right">Audit History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoadingCredits ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-textMuted">
                    Loading faculty leave credits...
                  </td>
                </tr>
              ) : filteredCredits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-textMuted">
                    No faculty found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredCredits.map((f) => (
                  <tr key={f.faculty_email} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-bold text-textPrimary">{f.faculty_name}</p>
                      <p className="text-[10px] text-textMuted font-mono">{f.faculty_email}</p>
                    </td>
                    <td className="py-3 px-4 font-medium text-textSecondary">{f.department}</td>

                    {/* Casual Leave Quota & Balance */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-surface-2 px-2.5 py-1 rounded-xl border border-borderLine">
                        <span className="font-bold text-brand-primary font-mono">{f.casual_leave_quota}</span>
                        <span className="text-[10px] text-textMuted">({f.casual_leave_used || 0} used)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCredit({
                              faculty_email: f.faculty_email,
                              faculty_name: f.faculty_name || '',
                              department: f.department || '',
                              leave_type: 'Casual Leave',
                              current_quota: f.casual_leave_quota,
                            });
                            setNewQuotaValue(f.casual_leave_quota);
                          }}
                          className="p-1 hover:text-brand-primary transition-colors cursor-pointer"
                          title="Edit Casual Leave Quota"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    {/* SP CL Quota & Balance */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-surface-2 px-2.5 py-1 rounded-xl border border-borderLine">
                        <span className="font-bold text-emerald-400 font-mono">{f.sp_cl_quota}</span>
                        <span className="text-[10px] text-textMuted">({f.sp_cl_used || 0} used)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCredit({
                              faculty_email: f.faculty_email,
                              faculty_name: f.faculty_name || '',
                              department: f.department || '',
                              leave_type: 'SP CL',
                              current_quota: f.sp_cl_quota,
                            });
                            setNewQuotaValue(f.sp_cl_quota);
                          }}
                          className="p-1 hover:text-emerald-400 transition-colors cursor-pointer"
                          title="Edit SP CL Quota"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    {/* Academic Leave Quota & Balance */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-surface-2 px-2.5 py-1 rounded-xl border border-borderLine">
                        <span className="font-bold text-purple-400 font-mono">{f.academic_leave_quota}</span>
                        <span className="text-[10px] text-textMuted">({f.academic_leave_used || 0} used)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCredit({
                              faculty_email: f.faculty_email,
                              faculty_name: f.faculty_name || '',
                              department: f.department || '',
                              leave_type: 'Academic Leave',
                              current_quota: f.academic_leave_quota,
                            });
                            setNewQuotaValue(f.academic_leave_quota);
                          }}
                          className="p-1 hover:text-purple-400 transition-colors cursor-pointer"
                          title="Edit Academic Leave Quota"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setViewingLogsEmail(f.faculty_email)}
                        className="px-2.5 py-1 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-textSecondary hover:text-textPrimary text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <History className="w-3 h-3" />
                        <span>Logs</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EDIT / PRO-RATE QUOTA MODAL ── */}
      {editingCredit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-brand-primary" /> Adjust {editingCredit.leave_type} Quota
              </h4>
              <button onClick={() => setEditingCredit(null)} className="text-textMuted hover:text-textPrimary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-surface-2 rounded-xl text-xs space-y-1">
              <p className="font-bold text-textPrimary">{editingCredit.faculty_name}</p>
              <p className="text-textSecondary font-mono">{editingCredit.faculty_email}</p>
              <p className="text-[11px] text-textMuted">Dept: {editingCredit.department}</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-textSecondary block mb-1">
                  New Annual Quota (Current: {editingCredit.current_quota}) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={newQuotaValue}
                  onChange={(e) => setNewQuotaValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">
                  Reason for Adjustment (Mandatory for Audit Trail) *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Joined institution mid-year on 1st July (pro-rated credit), special sanction by Principal..."
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-borderLine">
              <button
                type="button"
                onClick={() => setEditingCredit(null)}
                className="px-3.5 py-1.5 rounded-xl border border-borderLine text-textSecondary text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!adjustmentReason.trim() || adjustMutation.isPending}
                onClick={() => {
                  adjustMutation.mutate({
                    faculty_email: editingCredit.faculty_email,
                    leave_type: editingCredit.leave_type,
                    new_quota: newQuotaValue,
                    reason: adjustmentReason.trim(),
                  });
                }}
                className="px-4 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {adjustMutation.isPending ? 'Saving...' : 'Save & Log Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT LOG MODAL ── */}
      {viewingLogsEmail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 animate-in fade-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <History className="w-4 h-4 text-brand-primary" /> Credit Modification History
              </h4>
              <button onClick={() => setViewingLogsEmail(null)} className="text-textMuted hover:text-textPrimary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-textSecondary">Audit logs for {viewingLogsEmail}</p>

            {isLoadingLogs ? (
              <div className="py-8 text-center text-xs text-textMuted">Loading audit logs...</div>
            ) : creditLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-textMuted bg-surface-2 rounded-xl">
                No manual credit adjustments on record (running on default annual quotas).
              </div>
            ) : (
              <div className="space-y-2">
                {creditLogs.map((l) => (
                  <div key={l.id} className="p-3 bg-surface-2 rounded-xl border border-borderLine text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-textPrimary">{l.leave_type}</span>
                      <span className="font-mono text-[10px] text-textMuted">
                        {new Date(l.created_at).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-textSecondary">Quota changed from {l.old_quota} → </span>
                      <strong className="text-brand-primary font-mono">{l.new_quota}</strong>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-borderLine text-textMuted">
                        Δ {l.change_amount > 0 ? `+${l.change_amount}` : l.change_amount}
                      </span>
                    </div>
                    <p className="text-textSecondary italic">&ldquo;{l.reason}&rdquo;</p>
                    <p className="text-[10px] text-textMuted">Modified by: {l.changed_by}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRINCIPAL PRINTABLE REPORT MODAL ── */}
      {showPdfReport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-surface border border-borderLine rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="p-4 border-b border-borderLine bg-surface-2 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-brand-primary" />
                <span className="text-sm font-bold text-textPrimary">
                  Official Institutional Faculty Leave Balances &amp; Allotment Report
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Report</span>
                </button>
                <button
                  onClick={() => setShowPdfReport(false)}
                  className="p-1.5 rounded-xl border border-borderLine text-textMuted hover:text-textPrimary cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-950 print:p-0 print:bg-white text-slate-900">
              <div
                ref={printRef}
                className="bg-white text-slate-900 p-8 rounded-xl max-w-3xl mx-auto space-y-6 border border-slate-200 print:border-none print:shadow-none"
              >
                {/* Header */}
                <div className="border-b-2 border-slate-900 pb-3 text-center space-y-1">
                  <h2 className="text-base font-black tracking-wide uppercase text-slate-950">
                    RAJEEV GANDHI MEMORIAL COLLEGE OF ENGINEERING &amp; TECHNOLOGY (AUTONOMOUS)
                  </h2>
                  <p className="text-[10px] text-slate-600">
                    Nandyal - 518501, A.P. | Approved by AICTE, Affiliated to JNTUA, Accredited by NAAC with &apos;A+&apos; Grade
                  </p>
                  <div className="pt-2">
                    <span className="px-3 py-1 bg-slate-100 border border-slate-300 font-bold uppercase text-xs rounded-md">
                      Annual Faculty Leave Quota &amp; Utilization Summary — Academic Year {new Date().getFullYear()}
                    </span>
                  </div>
                </div>

                {/* Table */}
                <table className="w-full text-[11px] border border-slate-300 text-left">
                  <thead className="bg-slate-100 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-1.5 border-r border-slate-300">Faculty Name</th>
                      <th className="p-1.5 border-r border-slate-300">Dept</th>
                      <th className="p-1.5 border-r border-slate-300 text-center">Casual Leave (Rem/Total)</th>
                      <th className="p-1.5 border-r border-slate-300 text-center">SP CL (Rem/Total)</th>
                      <th className="p-1.5 text-center">Academic (Rem/Total)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredCredits.map((f) => (
                      <tr key={f.faculty_email}>
                        <td className="p-1.5 border-r border-slate-200 font-bold">{f.faculty_name}</td>
                        <td className="p-1.5 border-r border-slate-200">{f.department}</td>
                        <td className="p-1.5 border-r border-slate-200 text-center font-mono">
                          {Math.max(0, f.casual_leave_quota - (f.casual_leave_used || 0))} / {f.casual_leave_quota}
                        </td>
                        <td className="p-1.5 border-r border-slate-200 text-center font-mono">
                          {Math.max(0, f.sp_cl_quota - (f.sp_cl_used || 0))} / {f.sp_cl_quota}
                        </td>
                        <td className="p-1.5 text-center font-mono">
                          {Math.max(0, f.academic_leave_quota - (f.academic_leave_used || 0))} / {f.academic_leave_quota}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signatures */}
                <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs">
                  <div className="text-center space-y-1">
                    <div className="border-b border-slate-400 pb-6" />
                    <p className="font-bold text-slate-800">Administrative Officer</p>
                    <p className="text-[10px] text-slate-500">RGMCET ERP Section</p>
                  </div>
                  <div className="text-center space-y-1">
                    <div className="inline-flex items-center justify-center p-1 rounded bg-purple-50 border border-purple-300 text-purple-900 text-[9px] font-black uppercase mb-1">
                      ✓ Approved by Principal Office (principaloffice@rgmcet.edu.in)
                    </div>
                    <div className="border-b border-slate-400 pb-1" />
                    <p className="font-bold text-slate-900">Principal</p>
                    <p className="text-[10px] text-slate-500">RGMCET Autonomous</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
