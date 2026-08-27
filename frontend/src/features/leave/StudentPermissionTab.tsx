import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Upload,
  Printer,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  StudentPermissionRecord,
  StudentPermissionType,
  HolidayCalendarEntry
} from '../../types';
import { PermissionLetterModal } from './PermissionLetterModal';
import { ProofViewerModal } from './ProofViewerModal';

interface StudentPermissionTabProps {
  rollNumber?: string;
}

export const StudentPermissionTab: React.FC<StudentPermissionTabProps> = ({ rollNumber }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const activeRollNo = (rollNumber || user?.rollNumber || '').toUpperCase().trim();

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [viewingPermission, setViewingPermission] = useState<StudentPermissionRecord | null>(null);
  const [inspectingProof, setInspectingProof] = useState<StudentPermissionRecord | null>(null);

  // Form State
  const [formType, setFormType] = useState<StudentPermissionType>('Attending Workshop');
  const [formFromDate, setFormFromDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formToDate, setFormToDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formReason, setFormReason] = useState<string>('');
  const [formProofUrl, setFormProofUrl] = useState<string>('');
  const [proofFileName, setProofFileName] = useState<string>('');
  const [proofError, setProofError] = useState<string>('');

  // Queries
  const { data: permissions = [], isLoading } = useQuery<StudentPermissionRecord[]>({
    queryKey: ['studentPermissions', activeRollNo],
    queryFn: () => api.getMyStudentPermissions(activeRollNo),
    enabled: Boolean(activeRollNo),
  });

  const { data: holidays = [] } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

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
    return Math.max(1, count);
  }, [formFromDate, formToDate, holidaySet]);

  // Apply Mutation
  const applyMutation = useMutation({
    mutationFn: (payload: any) => api.applyStudentPermission(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['studentPermissions', activeRollNo] });
      setShowApplyModal(false);
      resetForm();
      alert(res.message || 'Permission application submitted and sent to HOD for approval!');
    },
    onError: (err: any) => {
      alert(`Failed to submit: ${err.message}`);
    },
  });

  const resetForm = () => {
    setFormType('Attending Workshop');
    setFormFromDate(new Date().toISOString().split('T')[0]);
    setFormToDate(new Date().toISOString().split('T')[0]);
    setFormReason('');
    setFormProofUrl('');
    setProofFileName('');
    setProofError('');
  };

  const handleProofFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProofError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setProofError('File size exceeds 5MB limit.');
      return;
    }

    setProofFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setFormProofUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReason.trim()) {
      alert('Please describe the purpose/event details.');
      return;
    }
    if (!formProofUrl) {
      alert('Please upload event proof / invitation / certificate (PDF or Image).');
      return;
    }

    applyMutation.mutate({
      roll_number: activeRollNo,
      permission_type: formType,
      from_date: formFromDate,
      to_date: formToDate,
      reason: formReason.trim(),
      proof_url: formProofUrl,
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Header Card ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-primary border border-brand-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-textPrimary">Student On-Duty (OD) Permissions &amp; Leaves</h3>
              <p className="text-xs text-textSecondary mt-0.5">
                Apply for official permission for Hackathons, Workshops, Conferences, and Competitions. Approved permissions auto-credit attendance as Present.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowApplyModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Apply for Permission</span>
          </button>
        </div>

        {/* History Table */}
        {isLoading ? (
          <div className="py-12 text-center text-xs text-textMuted">Loading permission history...</div>
        ) : permissions.length === 0 ? (
          <div className="py-10 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-2">
            <Calendar className="w-8 h-8 text-textMuted mx-auto" />
            <p className="font-bold text-textPrimary">No Permission Requests Yet</p>
            <p className="text-[11px] text-textSecondary">
              Apply for on-duty leave with proof documents whenever participating in external events.
            </p>
            <button
              onClick={() => setShowApplyModal(true)}
              className="mt-2 px-3.5 py-1.5 rounded-lg bg-brand-primary text-white font-bold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Apply for First Permission
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-borderLine">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                <tr>
                  <th className="py-2.5 px-3.5">Permission Type</th>
                  <th className="py-2.5 px-3.5">Date Range</th>
                  <th className="py-2.5 px-3.5 text-center">Days</th>
                  <th className="py-2.5 px-3.5">Purpose / Event</th>
                  <th className="py-2.5 px-3.5 text-center">Proof Doc</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {permissions.map((p) => {
                  const isApproved = p.status === 'Approved';
                  const isRejected = p.status === 'Rejected';
                  return (
                    <tr key={p.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="py-2.5 px-3.5 font-bold text-textPrimary whitespace-nowrap">{p.permission_type}</td>
                      <td className="py-2.5 px-3.5 text-textSecondary whitespace-nowrap">
                        {p.from_date} to {p.to_date}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold">{p.num_days}</td>
                      <td className="py-2.5 px-3.5 text-textSecondary max-w-xs truncate">{p.reason}</td>
                      <td className="py-2.5 px-3.5 text-center">
                        {p.proof_url ? (
                          <button
                            type="button"
                            onClick={() => setInspectingProof(p)}
                            className="px-2 py-0.5 rounded-md bg-brand-soft border border-brand-primary/20 text-[10px] font-bold text-brand-primary inline-flex items-center gap-1 hover:bg-brand-primary hover:text-white transition-all cursor-pointer"
                          >
                            <FileText className="w-2.5 h-2.5" /> View Proof
                          </button>
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
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        {isApproved && (
                          <button
                            onClick={() => setViewingPermission(p)}
                            className="px-2.5 py-1 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-brand-primary text-xs font-bold inline-flex items-center gap-1 shadow-xs"
                            title="View and Print Official On-Duty Sanction Order"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Sanction Order</span>
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

      {/* ── APPLY PERMISSION MODAL ── */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-brand-primary" /> Apply for Student On-Duty Permission
              </h4>
              <button onClick={() => setShowApplyModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-textSecondary block mb-1">Permission / Event Type *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as StudentPermissionType)}
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-medium focus:outline-none focus:border-brand-primary"
                >
                  <option value="Attending Workshop">Attending Workshop</option>
                  <option value="Conference">Conference Paper Presentation</option>
                  <option value="Industry Visit">Industry Visit</option>
                  <option value="Hackathon">Hackathon / Coding Competition</option>
                  <option value="Others">Others / Special Event</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-2 rounded-xl border border-borderLine">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">From Date *</label>
                  <input
                    type="date"
                    required
                    value={formFromDate}
                    onChange={(e) => setFormFromDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-borderLine bg-background text-textPrimary font-mono text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">To Date *</label>
                  <input
                    type="date"
                    required
                    value={formToDate}
                    onChange={(e) => setFormToDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-borderLine bg-background text-textPrimary font-mono text-xs focus:outline-none"
                  />
                </div>
                <div className="flex flex-col justify-center items-center bg-surface border border-borderLine rounded-xl p-1.5">
                  <span className="text-[9px] font-bold text-textSecondary uppercase">Duration</span>
                  <span className="text-lg font-black text-brand-primary">{calculatedDays}</span>
                  <span className="text-[8px] text-textMuted">Day(s)</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">Purpose / Event Description *</label>
                <textarea
                  required
                  rows={2.5}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="e.g. Selected for Grand Finale of Smart India Hackathon at IIT Bombay..."
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary resize-none"
                />
              </div>

              {/* Proof Document Upload */}
              <div className="space-y-1.5">
                <label className="font-bold text-textSecondary block">
                  Upload Proof Document / Certificate / Invitation * (Required)
                </label>
                <div className="border-2 border-dashed border-borderLine rounded-xl p-4 text-center hover:border-brand-primary transition-all">
                  <Upload className="w-6 h-6 text-brand-primary mx-auto mb-1.5" />
                  <input
                    type="file"
                    required
                    accept=".pdf,image/*"
                    onChange={handleProofFileUpload}
                    className="block w-full text-xs text-textSecondary file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white cursor-pointer"
                  />
                  {proofFileName && (
                    <p className="text-[11px] font-bold text-emerald-400 mt-1.5">✓ Uploaded: {proofFileName}</p>
                  )}
                  {proofError && (
                    <p className="text-[11px] text-alert font-bold mt-1">{proofError}</p>
                  )}
                </div>
              </div>

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
                  disabled={applyMutation.isPending || !formProofUrl}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm disabled:opacity-50"
                >
                  {applyMutation.isPending ? 'Submitting...' : 'Submit to HOD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Official Permission Letter Modal ── */}
      <PermissionLetterModal
        isOpen={Boolean(viewingPermission)}
        onClose={() => setViewingPermission(null)}
        permission={viewingPermission}
      />

      {/* ── Proof Document Viewer Modal ── */}
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
