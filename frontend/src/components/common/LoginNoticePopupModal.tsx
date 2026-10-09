import React, { useState } from 'react';
import {
  Bell,
  X,
  AlertTriangle,
  Info,
  Calendar,
  Building2,
  User,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { BroadcastNotification } from '../../types';

interface LoginNoticePopupModalProps {
  notices: BroadcastNotification[];
  onDismissNotice: (id: string) => Promise<void>;
  onClose: () => void;
}

export const LoginNoticePopupModal: React.FC<LoginNoticePopupModalProps> = ({
  notices,
  onDismissNotice,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);

  if (!notices || notices.length === 0) return null;

  const currentNotice = notices[currentIndex] || notices[0];

  const handleAcknowledge = async () => {
    setIsDismissing(true);
    try {
      await onDismissNotice(currentNotice.id);
      if (currentIndex < notices.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onClose();
      }
    } catch (e) {
      console.warn('Failed to dismiss notice popup:', e);
      onClose();
    } finally {
      setIsDismissing(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            URGENT ALERT
          </span>
        );
      case 'action_required':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3 h-3" />
            ACTION REQUIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <Info className="w-3 h-3" />
            OFFICIAL NOTICE
          </span>
        );
    }
  };

  const formattedDate = new Date(currentNotice.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getSenderRoleLabel = (role: string, dept?: string) => {
    switch (role?.toLowerCase()) {
      case 'hod':
        return `Head of Department (${dept || 'Department'})`;
      case 'principal':
        return 'Principal, RGMCET';
      case 'director':
        return 'Director, RGMCET';
      case 'management':
        return 'Management, RGMCET';
      case 'program_chair':
        return 'Program Chair';
      case 'faculty':
        return 'Faculty Mentor';
      case 'coordinator':
        return 'Academic Coordinator';
      case 'admin':
        return `Department Administration (${dept || 'Campus'})`;
      case 'superadmin':
        return 'Institutional Administration';
      default:
        return 'Administration';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-borderLine flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Top Institutional Header Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-primary via-indigo-500 to-amber-500" />

        {/* Modal Header */}
        <div className="p-5 pb-4 border-b border-borderLine bg-surface-2/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-textPrimary">Institutional Announcement</h3>
                  {getPriorityBadge(currentNotice.priority)}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-textSecondary">
                  <User className="w-3 h-3 text-textSecondary" />
                  <span className="font-semibold text-textPrimary">{currentNotice.sender_name}</span>
                  <span>•</span>
                  <span>{getSenderRoleLabel(currentNotice.sender_role, currentNotice.sender_department)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleAcknowledge}
              disabled={isDismissing}
              className="p-1 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface-3 transition-colors"
              title="Close"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Notice Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div>
            <h4 className="text-base font-bold text-textPrimary leading-snug">
              {currentNotice.title}
            </h4>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-textSecondary">
              <Calendar className="w-3 h-3" />
              <span>Posted: {formattedDate}</span>
              {currentNotice.target_department && currentNotice.target_department !== 'ALL' && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    Dept: {currentNotice.target_department}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Message Content */}
          <div className="p-4 rounded-xl bg-surface-2/70 border border-borderLine/80 text-xs sm:text-sm text-textPrimary leading-relaxed whitespace-pre-wrap selection:bg-brand-primary/20">
            {currentNotice.message}
          </div>
        </div>

        {/* Modal Footer with pagination & dismissal */}
        <div className="px-6 py-4 bg-surface-2/50 border-t border-borderLine flex items-center justify-between gap-3">
          {/* Notice counter */}
          <div className="flex items-center gap-2">
            {notices.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0 || isDismissing}
                  className="p-1 rounded-lg border border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold text-textSecondary px-1.5">
                  {currentIndex + 1} of {notices.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(notices.length - 1, prev + 1))}
                  disabled={currentIndex === notices.length - 1 || isDismissing}
                  className="p-1 rounded-lg border border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={isDismissing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 transition-all shadow-xs disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Acknowledge & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
