import { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';

const ACADEMIC_DUTIES = [
  'NAAC',
  'NBA',
  'JNTU',
  'Exam Duty',
  'Monthly Duty',
  'Other Academic',
];

const INDUSTRY_DUTIES = [
  'Industry Visit',
  'Guest Lecture',
  'Workshop Conducted',
  'Workshop Attended',
  'FDP Conducted',
  'FDP Attended',
  'Professional Activity',
];

const ALL_DUTY_TYPES = [...ACADEMIC_DUTIES, ...INDUSTRY_DUTIES];

interface Props {
  facultyEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DutyLogModal({ facultyEmail, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    duty_type: '',
    title: '',
    description: '',
    duty_date: '',
    proof_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.duty_type || !form.title || !form.duty_date) {
      setError('Duty type, title, and date are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.submitFacultyDuty(facultyEmail, {
        duty_type: form.duty_type,
        title: form.title,
        description: form.description || undefined,
        duty_date: form.duty_date,
        proof_url: form.proof_url || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit duty');
    } finally {
      setLoading(false);
    }
  };

  const category = ACADEMIC_DUTIES.includes(form.duty_type)
    ? 'Academic Duty'
    : INDUSTRY_DUTIES.includes(form.duty_type)
    ? 'Industry & Professional'
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Log a Duty / Activity</h2>
            <p className="text-sm text-gray-500 mt-0.5">Submit for HOD/Admin approval</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              Duty submitted successfully! Awaiting approval.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Duty Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duty Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.duty_type}
              onChange={e => setForm(f => ({ ...f, duty_type: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">Select duty type…</option>
              <optgroup label="Academic Duties">
                {ACADEMIC_DUTIES.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </optgroup>
              <optgroup label="Industry & Professional">
                {INDUSTRY_DUTIES.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </optgroup>
            </select>
            {category && (
              <p className="text-xs text-indigo-600 mt-1">📂 Category: {category}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. NAAC Criterion 2 Documentation"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.duty_date}
              onChange={e => setForm(f => ({ ...f, duty_date: e.target.value }))}
              max={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Brief description of the activity…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Proof URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              Proof / Certificate URL <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/…"
              value={form.proof_url}
              onChange={e => setForm(f => ({ ...f, proof_url: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit for Approval'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
