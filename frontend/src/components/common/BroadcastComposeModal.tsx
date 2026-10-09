import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  Bell,
  Users,
  GraduationCap,
  Building2,
  ShieldAlert,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { BroadcastPriority, BroadcastTargetRole } from '../../types';

interface BroadcastComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DEPARTMENTS = [
  'CSE',
  'CSE (Data Science)',
  'CSE (AI & ML)',
  'CSE & BS',
  'ECE',
  'EEE',
  'ME',
  'CE',
  'MCA',
  'MBA',
];

export const BroadcastComposeModal: React.FC<BroadcastComposeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const isHOD = role === 'hod';
  const isFaculty = role === 'faculty';
  const isExecutive = ['principal', 'director', 'management', 'program_chair'].includes(role || '');
  const isAdmin = role === 'admin';
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  // Form states
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<BroadcastPriority>('normal');
  const [targetRole, setTargetRole] = useState<BroadcastTargetRole>(
    isFaculty ? 'mentees' : 'all'
  );
  const [targetDeptScope, setTargetDeptScope] = useState<'ALL' | 'SPECIFIC'>(
    isHOD ? 'SPECIFIC' : 'ALL'
  );
  const [specificDept, setSpecificDept] = useState(user?.department || 'CSE');
  const [popupOnLogin, setPopupOnLogin] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please provide an announcement title.');
      return;
    }
    if (!message.trim()) {
      setError('Please enter the notice / message content.');
      return;
    }

    let finalDept = 'ALL';
    let finalTargetRole: BroadcastTargetRole = targetRole;

    if (isHOD) {
      finalDept = user?.department || specificDept;
    } else if (isFaculty) {
      finalTargetRole = 'mentees';
      finalDept = user?.department || 'ALL';
    } else if (isExecutive || (isAdmin && isSuperAdmin)) {
      finalDept = targetDeptScope === 'ALL' ? 'ALL' : specificDept;
    } else if (isAdmin) {
      finalDept = user?.department || specificDept;
    }

    setIsSubmitting(true);
    try {
      await api.createBroadcastNotification({
        title: title.trim(),
        message: message.trim(),
        priority,
        target_role: finalTargetRole,
        target_department: finalDept,
        popup_on_login: popupOnLogin,
        sender_name: user?.name,
      });

      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPopupNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['sentNotifications'] });

      setTimeout(() => {
        setIsSuccess(false);
        setTitle('');
        setMessage('');
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to publish announcement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-borderLine flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLine bg-surface-2/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold">
              <Bell className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-textPrimary">Send Broadcast Announcement</h2>
              <p className="text-xs text-textSecondary">
                {isHOD && `HOD Broadcast (${user?.department || 'Department'})`}
                {isFaculty && 'Mentor Broadcast (Assigned Mentees)'}
                {isExecutive && `${user?.role?.toUpperCase()} Institutional Notice`}
                {isAdmin && `${isSuperAdmin ? 'Superadmin Global Broadcast' : `Department Admin (${user?.department || ''})`}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface-3 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Broadcast message published successfully!</span>
            </div>
          )}

          {/* Target Audience Section */}
          <div className="bg-surface-2/60 border border-borderLine rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-textPrimary">
              <Users className="w-3.5 h-3.5 text-brand-primary" />
              <span>Target Audience & Scope</span>
            </div>

            {/* HOD View: Students only, Faculty only, Both */}
            {isHOD && (
              <div className="space-y-2">
                <p className="text-[11px] text-textSecondary">
                  Delivering to your department: <span className="font-semibold text-textPrimary">{user?.department}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'students', label: 'Students Only', icon: GraduationCap },
                    { id: 'faculty', label: 'Faculty Only', icon: Building2 },
                    { id: 'all', label: 'Both (Everyone)', icon: Users },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetRole(opt.id as BroadcastTargetRole)}
                      className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                        targetRole === opt.id
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold shadow-xs'
                          : 'border-borderLine bg-surface text-textSecondary hover:bg-surface-2'
                      }`}
                    >
                      <opt.icon className="w-4 h-4" />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Faculty / Mentor View: Mentees */}
            {isFaculty && (
              <div className="p-2.5 rounded-lg bg-surface border border-borderLine flex items-center gap-2.5 text-xs text-textPrimary">
                <GraduationCap className="w-4 h-4 text-brand-primary shrink-0" />
                <span>
                  Notice will be delivered to <strong className="text-brand-primary">all students assigned to your mentorship</strong>.
                </span>
              </div>
            )}

            {/* Executive / Superadmin View */}
            {(isExecutive || (isAdmin && isSuperAdmin)) && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'All Users', icon: Users },
                    { id: 'students', label: 'Students', icon: GraduationCap },
                    { id: 'faculty', label: 'Faculty', icon: Building2 },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetRole(opt.id as BroadcastTargetRole)}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all ${
                        targetRole === opt.id
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold'
                          : 'border-borderLine bg-surface text-textSecondary hover:bg-surface-2'
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-1.5 text-xs text-textSecondary cursor-pointer">
                    <input
                      type="radio"
                      name="deptScope"
                      checked={targetDeptScope === 'ALL'}
                      onChange={() => setTargetDeptScope('ALL')}
                      className="text-brand-primary focus:ring-brand-primary"
                    />
                    <span>Campus-Wide (All Depts)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-textSecondary cursor-pointer">
                    <input
                      type="radio"
                      name="deptScope"
                      checked={targetDeptScope === 'SPECIFIC'}
                      onChange={() => setTargetDeptScope('SPECIFIC')}
                      className="text-brand-primary focus:ring-brand-primary"
                    />
                    <span>Specific Department</span>
                  </label>
                </div>

                {targetDeptScope === 'SPECIFIC' && (
                  <select
                    value={specificDept}
                    onChange={(e) => setSpecificDept(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-borderLine bg-surface text-textPrimary focus:outline-none focus:border-brand-primary"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Department Admin (Non-Superadmin) */}
            {isAdmin && !isSuperAdmin && (
              <div className="space-y-2">
                <p className="text-[11px] text-textSecondary">
                  Department Admin: <span className="font-semibold text-textPrimary">{user?.department || 'Assigned Department'}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'students', label: 'Students', icon: GraduationCap },
                    { id: 'faculty', label: 'Faculty', icon: Building2 },
                    { id: 'all', label: 'Both', icon: Users },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetRole(opt.id as BroadcastTargetRole)}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all ${
                        targetRole === opt.id
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold'
                          : 'border-borderLine bg-surface text-textSecondary hover:bg-surface-2'
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Priority Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-textPrimary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Priority Level</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'normal', label: 'Normal Notice', color: 'border-blue-400 text-blue-600 bg-blue-500/10' },
                { id: 'urgent', label: 'Urgent Alert', color: 'border-amber-500 text-amber-600 bg-amber-500/10' },
                { id: 'action_required', label: 'Action Required', color: 'border-rose-500 text-rose-600 bg-rose-500/10' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPriority(p.id as BroadcastPriority)}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-medium text-center transition-all ${
                    priority === p.id
                      ? `${p.color} font-bold shadow-xs`
                      : 'border-borderLine bg-surface text-textSecondary hover:bg-surface-2'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-textPrimary">Announcement Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Mandatory Project Review Submission / Holiday Notice"
              className="w-full text-xs p-2.5 rounded-xl border border-borderLine bg-surface text-textPrimary placeholder:text-textSecondary/50 focus:outline-none focus:border-brand-primary"
              maxLength={200}
              required
            />
          </div>

          {/* Message Body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-textPrimary">Message Content</label>
              <span className="text-[10px] text-textSecondary">{message.length}/2000</span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the complete instructions or announcement message here..."
              rows={5}
              maxLength={2000}
              className="w-full text-xs p-3 rounded-xl border border-borderLine bg-surface text-textPrimary placeholder:text-textSecondary/50 focus:outline-none focus:border-brand-primary leading-relaxed resize-none"
              required
            />
          </div>

          {/* Popup on login option */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 text-xs text-textPrimary cursor-pointer select-none p-2.5 rounded-xl border border-borderLine bg-surface-2/40 hover:bg-surface-2 transition-colors">
              <input
                type="checkbox"
                checked={popupOnLogin}
                onChange={(e) => setPopupOnLogin(e.target.checked)}
                className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary"
              />
              <div className="flex flex-col">
                <span className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-brand-primary" />
                  Show prominent Pop-up on Login
                </span>
                <span className="text-[11px] text-textSecondary">
                  Recipients will immediately see this notice as an institutional popup modal when they log in.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-borderLine">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-textSecondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !message.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 transition-all shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Publish Broadcast
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
