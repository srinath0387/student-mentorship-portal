import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare, Clock, CheckCircle2, XCircle, FileText,
  ExternalLink, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { DutySubmissionModal } from './DutySubmissionModal';

function deadlineBadge(deadline: string | null) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Overdue', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (days <= 3) return { label: `Due in ${days}d`, cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  return {
    label: `Due ${new Date(deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
    cls: 'bg-green-100 text-green-700 border-green-200',
  };
}

function myRoleBadge(role: string) {
  if (role === 'coordinator')
    return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-semibold">Coordinator</span>;
  if (role === 'co_coordinator')
    return <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-semibold">Co-Coordinator</span>;
  return <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">Assigned</span>;
}

function DutyStatusBlock({ d }: { d: any }) {
  const s = d.submission_status;
  if (s === 'Approved') return (
    <div className="flex items-start gap-2 p-3 bg-green-50 rounded-xl border border-green-100">
      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-green-700">Approved{d.points_awarded != null ? ` · +${d.points_awarded} pts` : ''}</p>
        {d.hod_remarks && <p className="text-xs text-green-600 mt-0.5">HOD: "{d.hod_remarks}"</p>}
      </div>
    </div>
  );
  if (s === 'Rejected') return (
    <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
      <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-red-700">Rejected</p>
        {d.reject_reason && <p className="text-xs text-red-600 mt-0.5">Reason: {d.reject_reason}</p>}
        {d.hod_remarks && <p className="text-xs text-red-500 mt-0.5">HOD: "{d.hod_remarks}"</p>}
      </div>
    </div>
  );
  if (s === 'Submitted') return (
    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-blue-700">Submitted — awaiting HOD review</p>
        {d.resubmit_count > 1 && <p className="text-xs text-blue-500 mt-0.5">Resubmitted {d.resubmit_count} times</p>}
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
      <p className="text-sm font-medium text-amber-700">Pending — submit your work before the deadline</p>
    </div>
  );
}

export default function MyDutiesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState<{ assignmentId: number; title: string; dutyType: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-academic-duties', user?.email],
    queryFn: () => api.getMyAcademicDuties(),
    enabled: !!user?.email,
  });

  const duties: any[] = Array.isArray(data) ? data : [];
  const pending = duties.filter(d => d.submission_status !== 'Approved' && d.assignment_status !== 'Cancelled');
  const done = duties.filter(d => d.submission_status === 'Approved' || d.assignment_status === 'Cancelled');

  if (isLoading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading your duties…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl text-sm">
        <AlertTriangle className="w-5 h-5" /> Failed to load duties. Please refresh.
      </div>
    </div>
  );

  const DutyCard = ({ d }: { d: any }) => {
    const badge = deadlineBadge(d.deadline);
    const canSubmit = ['Pending', 'Rejected'].includes(d.submission_status);
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        {/* Top */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold flex-shrink-0">{d.duty_type}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">{d.title}</h3>
              {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
              <div className="flex flex-wrap items-center gap-x-3 mt-1.5 text-xs text-gray-400">
                <span>Assigned by: {d.assigned_by_name || d.assigned_by}</span>
                <span>Dept: {d.department}</span>
                {d.resubmit_count > 0 && <span>Resubmitted {d.resubmit_count}×</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {badge && <span className={`text-xs px-2 py-1 rounded-full border font-medium ${badge.cls}`}>{badge.label}</span>}
            {myRoleBadge(d.my_role)}
          </div>
        </div>

        {/* Status block */}
        <DutyStatusBlock d={d} />

        {/* Submission details if submitted */}
        {d.submission_text && d.submission_status !== 'Pending' && (
          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-700 mb-1">Your submission:</p>
            <p className="whitespace-pre-wrap">{d.submission_text}</p>
            {d.proof_url && (
              <a href={d.proof_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-indigo-600 hover:underline">
                <ExternalLink className="w-3 h-3" /> View Proof
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        {canSubmit && (
          <button
            onClick={() => setSubmitting({ assignmentId: d.assignment_id, title: d.title, dutyType: d.duty_type })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              d.submission_status === 'Rejected'
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {d.submission_status === 'Rejected' ? (
              <><RefreshCw className="w-4 h-4" /> Re-Submit Work</>
            ) : (
              <><FileText className="w-4 h-4" /> Submit Work</>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-indigo-100">
          <CheckSquare className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Duties</h1>
          <p className="text-sm text-gray-500">Academic duties assigned to you by HOD / Admin</p>
        </div>
      </div>

      {/* Pending / Active */}
      {pending.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Pending &amp; Active <span className="ml-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">{pending.length}</span>
          </h2>
          {pending.map(d => <DutyCard key={d.assignee_id} d={d} />)}
        </div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Completed <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">{done.length}</span>
          </h2>
          {done.map(d => <DutyCard key={d.assignee_id} d={d} />)}
        </div>
      )}

      {duties.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No duties assigned to you yet.</p>
        </div>
      )}

      {/* Submission modal */}
      {submitting && (
        <DutySubmissionModal
          assignmentId={submitting.assignmentId}
          dutyTitle={submitting.title}
          dutyType={submitting.dutyType}
          onClose={() => setSubmitting(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['my-academic-duties'] }); setSubmitting(null); }}
        />
      )}
    </div>
  );
}
