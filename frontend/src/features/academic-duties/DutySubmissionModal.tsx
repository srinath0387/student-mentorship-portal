import { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';

interface Props {
  assignmentId: number;
  dutyTitle: string;
  dutyType: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DutySubmissionModal({ assignmentId, dutyTitle, dutyType, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({ submission_text: '', proof_url: '', completed_at: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.submission_text.trim() || form.submission_text.trim().length < 20) {
      setError('Please describe what you completed (at least 20 characters).');
      return;
    }
    if (!form.completed_at) { setError('Please enter the completion date.'); return; }
    setLoading(true);
    setError('');
    const sanitizeUrl = (url: string): string | undefined => {
      const trimmed = url.trim();
      if (!trimmed) return undefined;
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    };
    try {
      await api.submitAcademicDutyWork(assignmentId, {
        submission_text: form.submission_text.trim(),
        proof_url: sanitizeUrl(form.proof_url),
        completed_at: form.completed_at,
      });
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Submit Work</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-medium text-indigo-600">[{dutyType}]</span> {dutyTitle}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              Work submitted successfully! Awaiting HOD review.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* What did you complete */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What did you complete? <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Describe the work you completed for this duty…"
              value={form.submission_text}
              onChange={e => setForm(f => ({ ...f, submission_text: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-400 mt-0.5">{form.submission_text.length} chars (min 20)</p>
          </div>

          {/* Completion date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Completion Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.completed_at}
              onChange={e => setForm(f => ({ ...f, completed_at: e.target.value }))}
              max={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Proof URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              Proof / Document URL <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/…"
              value={form.proof_url}
              onChange={e => setForm(f => ({ ...f, proof_url: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || success}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
              ) : 'Submit Work'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
