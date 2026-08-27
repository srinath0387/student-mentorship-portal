import React, { useRef } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  CheckCircle2,
  Calendar,
  Building,
  GraduationCap
} from 'lucide-react';
import { StudentPermissionRecord } from '../../types';

interface PermissionLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: StudentPermissionRecord | null;
}

export const PermissionLetterModal: React.FC<PermissionLetterModalProps> = ({
  isOpen,
  onClose,
  permission,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !permission) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedAppliedDate = new Date(permission.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedFrom = new Date(permission.from_date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTo = new Date(permission.to_date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedApprovedDate = permission.approved_at
    ? new Date(permission.approved_at).toLocaleDateString('en-IN', {
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
            <GraduationCap className="w-5 h-5 text-brand-primary" />
            <span className="text-sm font-bold text-textPrimary">Student Official On-Duty (OD) Permission Sanction Order</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              {permission.status}
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
                  <div>REF: RGM/ST-OD</div>
                  <div>AY 2025-26</div>
                </div>
              </div>

              <div className="mt-3 py-1 px-3 bg-slate-100 rounded-lg flex items-center justify-between text-xs font-bold text-slate-900">
                <span>STUDENT ON-DUTY (OD) PERMISSION SANCTION ORDER</span>
                <span>DATE: {formattedApprovedDate}</span>
              </div>
            </div>

            {/* Student & Permission Meta Details */}
            <div className="text-xs space-y-3 leading-relaxed">
              <p className="text-slate-800">
                <strong>To:</strong> <br />
                The Faculty Incharges &amp; Subject Teachers, <br />
                Department of {permission.department}, <br />
                RGMCET, Nandyal.
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <p><strong>Student Name:</strong> {permission.student_name}</p>
                  <p><strong>Registration No:</strong> <span className="font-mono font-bold text-indigo-900">{permission.roll_number}</span></p>
                  <p><strong>Department &amp; Section:</strong> {permission.department} (Sec {permission.section})</p>
                  <p><strong>Academic Year:</strong> {permission.year}</p>
                  <p><strong>Permission Type:</strong> <span className="font-bold text-purple-900">{permission.permission_type}</span></p>
                  <p><strong>Duration:</strong> {formattedFrom} to {formattedTo}</p>
                  <p><strong>Total Working Days:</strong> <span className="font-black text-slate-900">{permission.num_days} Day(s)</span></p>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-900">Purpose / Description:</p>
                <p className="text-slate-700 italic pl-3 border-l-2 border-slate-300 mt-1">
                  &ldquo;{permission.reason}&rdquo;
                </p>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Attendance Directive:</span>
                </p>
                <p>
                  The student has been granted official On-Duty (OD) sanction for the specified period.
                  All subject teachers and lab in-charges are requested to credit attendance as <strong>PRESENT (On-Duty)</strong> for the duration.
                </p>
              </div>

              {/* HOD Remarks */}
              {permission.hod_remarks && (
                <div className="text-[11px] bg-slate-100 border border-slate-300 p-2.5 rounded-lg text-slate-800">
                  <strong>Approval Remarks:</strong> {permission.hod_remarks}
                </div>
              )}
            </div>

            {/* Approval Signatures */}
            <div className="pt-8 border-t border-slate-300 flex items-end justify-between text-xs">
              <div className="text-center space-y-1">
                <div className="w-32 border-b border-slate-400 pb-8" />
                <p className="font-bold text-slate-800">Signature of Student</p>
                <p className="text-[10px] text-slate-500 font-mono">{permission.roll_number}</p>
              </div>

              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase mb-1">
                  ✓ Digital Approval by {permission.approved_by || 'HOD'}
                </div>
                <div className="w-40 border-b border-slate-400 pb-1" />
                <p className="font-bold text-slate-900">Head of the Department</p>
                <p className="text-[10px] text-slate-500">Dept. of {permission.department}, RGMCET</p>
              </div>
            </div>

            {/* Institutional Footer */}
            <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-100">
              This document is an electronically verified and approved On-Duty permission sanction of RGMCET EDUFLOW ERP.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
