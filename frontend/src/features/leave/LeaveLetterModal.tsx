import React, { useRef } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  CheckCircle2,
  Calendar,
  Building,
  User,
  ShieldCheck
} from 'lucide-react';
import { FacultyLeaveRecord } from '../../types';

interface LeaveLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  leave: FacultyLeaveRecord | null;
}

export const LeaveLetterModal: React.FC<LeaveLetterModalProps> = ({
  isOpen,
  onClose,
  leave,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !leave) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedAppliedDate = new Date(leave.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedFrom = new Date(leave.from_date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTo = new Date(leave.to_date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedApprovedDate = leave.approved_at
    ? new Date(leave.approved_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : formattedAppliedDate;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in">
      <div className="bg-surface border border-borderLine rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Top Modal Controls (Hidden during print) */}
        <div className="p-4 border-b border-borderLine bg-surface-2 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-primary" />
            <span className="text-sm font-bold text-textPrimary">Official Faculty Leave Approval Letter</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              {leave.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl border border-borderLine text-textMuted hover:text-textPrimary hover:bg-surface transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── PRINTABLE LETTER BODY ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 print:p-0 print:bg-white print:overflow-visible text-slate-900">
          <div
            ref={printRef}
            className="bg-white text-slate-900 p-8 sm:p-10 rounded-xl shadow-lg print:shadow-none print:p-0 print:border-none print:rounded-none max-w-2xl mx-auto space-y-6 border border-slate-200"
          >
            {/* Header */}
            <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
              <div className="flex items-center justify-between gap-4">
                <img
                  src="/rgmcet-crest.png"
                  alt="RGM CET Crest"
                  className="w-16 h-16 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="flex-1">
                  <h1 className="text-base sm:text-lg font-black tracking-wide uppercase text-slate-950">
                    Rajeev Gandhi Memorial College of Engineering &amp; Technology
                  </h1>
                  <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                    (Autonomous) • Approved by AICTE • Accredited by NAAC with &apos;A+&apos; Grade &amp; NBA
                  </p>
                  <p className="text-[9px] text-slate-600">
                    NH-40, Nandyal, Andhra Pradesh - 518501, India | Web: www.rgmcet.edu.in
                  </p>
                </div>
                <div className="w-16 text-right font-mono text-[9px] font-bold text-slate-600">
                  <div>REF: RGM/FAC-LV</div>
                  <div>AY 2025-26</div>
                </div>
              </div>

              <div className="mt-3 py-1 px-3 bg-slate-100 rounded-lg flex items-center justify-between text-xs font-bold text-slate-900">
                <span>FACULTY LEAVE SANCTION ORDER</span>
                <span>DATE: {formattedApprovedDate}</span>
              </div>
            </div>

            {/* Faculty & Leave Meta Details */}
            <div className="text-xs space-y-3 leading-relaxed">
              <p className="text-slate-800">
                <strong>To:</strong> <br />
                The Head of Department, <br />
                Department of {leave.department}, <br />
                RGMCET, Nandyal.
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <p><strong>Faculty Name:</strong> {leave.faculty_name}</p>
                  <p><strong>Email ID:</strong> {leave.faculty_email}</p>
                  <p><strong>Department:</strong> {leave.department}</p>
                  <p><strong>Leave Type:</strong> <span className="font-bold text-indigo-900">{leave.leave_type}</span></p>
                  <p><strong>Duration:</strong> {formattedFrom} to {formattedTo}</p>
                  <p><strong>Total Working Days:</strong> <span className="font-black text-slate-900">{leave.num_days} Day(s)</span> <span className="text-[10px] text-slate-500">(Excl. Sundays &amp; Holidays)</span></p>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-900">Reason for Leave:</p>
                <p className="text-slate-700 italic pl-3 border-l-2 border-slate-300 mt-1">
                  &ldquo;{leave.reason}&rdquo;
                </p>
              </div>

              {/* Classwork & Exam Duty Adjustments Table */}
              {leave.adjustments && leave.adjustments.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
                    Classwork &amp; Exam Duty Adjustments / Reassignments:
                  </p>
                  <table className="w-full text-[11px] border border-slate-300 text-left">
                    <thead className="bg-slate-100 font-bold border-b border-slate-300">
                      <tr>
                        <th className="p-1.5 border-r border-slate-300">Type</th>
                        <th className="p-1.5 border-r border-slate-300">Date</th>
                        <th className="p-1.5 border-r border-slate-300">Subject / Duty</th>
                        <th className="p-1.5 border-r border-slate-300">Periods / Slot</th>
                        <th className="p-1.5 border-r border-slate-300">Covering Colleague</th>
                        <th className="p-1.5 text-center">Colleague Acceptance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {leave.adjustments.map((adj, idx) => (
                        <tr key={idx}>
                          <td className="p-1.5 border-r border-slate-200 uppercase font-semibold text-[10px]">
                            {adj.adjustment_type === 'exam_duty' ? 'Exam Duty' : 'Classwork'}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 whitespace-nowrap font-mono">{adj.date}</td>
                          <td className="p-1.5 border-r border-slate-200 font-medium">{adj.subject_or_duty}</td>
                          <td className="p-1.5 border-r border-slate-200 font-mono text-[10px]">{adj.periods?.join(', ') || adj.timing_slot}</td>
                          <td className="p-1.5 border-r border-slate-200 font-bold text-slate-900">
                            {adj.reassigned_faculty_name}
                            <span className="block text-[9px] text-slate-500 font-normal">{adj.reassigned_faculty_email}</span>
                          </td>
                          <td className="p-1.5 text-center font-bold text-[10px]">
                            {adj.acceptance_status === 'Accepted' ? (
                              <span className="text-emerald-700 font-black">✓ Digitally Accepted</span>
                            ) : (
                              <span className="text-amber-700">{adj.acceptance_status || 'Pending'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Remarks */}
              {leave.hod_remarks && (
                <div className="text-[11px] bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                  <strong>HOD Remarks:</strong> {leave.hod_remarks}
                </div>
              )}
              {leave.principal_remarks && (
                <div className="text-[11px] bg-purple-50 border border-purple-200 p-2.5 rounded-lg">
                  <strong>Principal Office Remarks:</strong> {leave.principal_remarks}
                </div>
              )}
            </div>

            {/* Approval Signatures */}
            <div className="pt-8 border-t border-slate-300 grid grid-cols-3 gap-4 text-xs">
              {/* 1. Applicant */}
              <div className="text-center space-y-1">
                <div className="border-b border-slate-400 pb-6" />
                <p className="font-bold text-slate-800">Signature of Faculty</p>
                <p className="text-[10px] text-slate-500">{leave.faculty_name}</p>
              </div>

              {/* 2. HOD */}
              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[9px] font-black uppercase mb-1">
                  ✓ HOD: {leave.approved_by || 'HOD'}
                </div>
                <div className="border-b border-slate-400 pb-1" />
                <p className="font-bold text-slate-900">Head of Department</p>
                <p className="text-[10px] text-slate-500">Dept. of {leave.department}</p>
              </div>

              {/* 3. Principal */}
              <div className="text-center space-y-1">
                {leave.principal_status === 'Approved' ? (
                  <div className="inline-flex items-center justify-center p-1.5 rounded-lg bg-purple-50 border border-purple-300 text-purple-900 text-[9px] font-black uppercase mb-1">
                    ✓ {leave.principal_approved_by || 'Principal Office'}
                  </div>
                ) : (
                  <div className="h-6" />
                )}
                <div className="border-b border-slate-400 pb-1" />
                <p className="font-bold text-slate-900">Principal</p>
                <p className="text-[10px] text-slate-500">RGMCET Autonomous</p>
              </div>
            </div>

            {/* Institutional Footer */}
            <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-100">
              This document is an electronically generated and digitally approved leave order of RGMCET EDUFLOW ERP.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
