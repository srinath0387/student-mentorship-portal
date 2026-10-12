import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  UserCheck,
  Lock,
  AlertTriangle,
  CheckCircle2,
  X,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StudentProfile } from '../../types';

interface StudentOnboardingPromptModalProps {
  student: StudentProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const StudentOnboardingPromptModal: React.FC<StudentOnboardingPromptModalProps> = ({
  student,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [parentPhone, setParentPhone] = useState(student.parent_phone || '');
  const [selectedMentorId, setSelectedMentorId] = useState(student.faculty_mentor_id || '');
  const [deptFaculty, setDeptFaculty] = useState<any[]>([]);
  const [isLoadingFaculty, setIsLoadingFaculty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isMentorAlreadyAssigned = Boolean(student.faculty_mentor_id);
  const isParentPhoneMissing = !student.parent_phone;

  // Fetch faculty for student's department if mentor is not yet assigned
  useEffect(() => {
    if (isOpen && student.department && !isMentorAlreadyAssigned) {
      setIsLoadingFaculty(true);
      api.getDepartmentFaculty(student.department)
        .then((data) => setDeptFaculty(Array.isArray(data) ? data : []))
        .catch(() => setDeptFaculty([]))
        .finally(() => setIsLoadingFaculty(false));
    }
  }, [isOpen, student.department, isMentorAlreadyAssigned]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validate parent phone
    const cleanedPhone = parentPhone.trim();
    if (!cleanedPhone || !/^[0-9]{10}$/.test(cleanedPhone)) {
      setErrorMsg('Please enter a valid 10-digit mobile number for your parent / guardian.');
      return;
    }

    // Validate mentor selection if not assigned yet
    if (!isMentorAlreadyAssigned && !selectedMentorId) {
      setErrorMsg('Please select your faculty mentor from your department.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        ...student,
        parent_phone: cleanedPhone,
      };

      if (!isMentorAlreadyAssigned && selectedMentorId) {
        payload.faculty_mentor_id = selectedMentorId;
      }

      await api.updateStudentProfile(student.roll_number, payload);
      queryClient.invalidateQueries({ queryKey: ['studentProfileForPhoto'] });
      queryClient.invalidateQueries({ queryKey: ['studentProfile'] });
      queryClient.invalidateQueries({ queryKey: ['studentMentor'] });
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface border border-borderLine rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-borderLine bg-gradient-to-r from-brand-primary/10 via-brand-soft to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                <Sparkles className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-textPrimary leading-tight">
                  Action Required: Complete Your Profile
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Institutional record onboarding ({student.department || 'Your Department'})
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Parent Mobile Phone Field */}
          <div>
            <label className="block text-xs font-bold text-textPrimary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-brand-primary" />
              Parent / Guardian Mobile No <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 9876543210 (10 digits)"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-borderLine bg-background text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
            <p className="text-[11px] text-textSecondary mt-1">
              Required for emergency contacts, official institutional notices, and progress reports.
            </p>
          </div>

          {/* 2. Faculty Mentor Selection Field */}
          <div>
            <label className="block text-xs font-bold text-textPrimary uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-brand-primary" />
                Faculty Mentor ({student.department || 'Department'}) <span className="text-red-500">*</span>
              </span>
              {isMentorAlreadyAssigned && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              )}
            </label>

            {isMentorAlreadyAssigned ? (
              <div className="p-3 rounded-xl border border-borderLine bg-surface-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-textPrimary">
                    {student.mentor_name || 'Assigned Mentor'}
                  </p>
                  <p className="text-xs text-textSecondary">
                    {student.mentor_email || student.faculty_mentor_id} · {student.mentor_department || student.department}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Assigned
                </span>
              </div>
            ) : (
              <div>
                <select
                  value={selectedMentorId}
                  onChange={(e) => setSelectedMentorId(e.target.value)}
                  disabled={isLoadingFaculty}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                >
                  <option value="">
                    {isLoadingFaculty ? 'Loading department faculty list...' : `Select a mentor from ${student.department}...`}
                  </option>
                  {deptFaculty.map((fac) => (
                    <option key={fac.faculty_id} value={fac.faculty_id}>
                      {fac.name} ({fac.email}) {fac.role ? `— ${fac.role}` : ''}
                    </option>
                  ))}
                </select>

                <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Important:</strong> Once you select and save your mentor, you cannot change it yourself. Any future change requires contacting the department admin.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-textSecondary hover:text-textPrimary hover:bg-surface-2 transition-colors"
            >
              Remind Me Later
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-brand-primary text-white hover:bg-brand-primary/90 transition-all shadow-md disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Saving Details...' : 'Save & Confirm'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
