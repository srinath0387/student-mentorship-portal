import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Building
} from 'lucide-react';
import { api } from '../../../lib/api';
import { HolidayCalendarEntry } from '../../../types';

export const HolidayCalendarTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [typeInput, setTypeInput] = useState('Holiday');

  // Query
  const { data: holidays = [], isLoading } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

  // Add Mutation
  const addMutation = useMutation({
    mutationFn: (payload: { date: string; title: string; type?: string }) =>
      api.addHoliday(payload.date, payload.title, payload.type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayCalendar'] });
      setShowAddModal(false);
      setDateInput('');
      setTitleInput('');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteHoliday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayCalendar'] });
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateInput || !titleInput.trim()) return;
    addMutation.mutate({
      date: dateInput,
      title: titleInput.trim(),
      type: typeInput,
    });
  };

  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-borderLine pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-primary border border-brand-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-textPrimary">Institutional Holiday Calendar</h3>
            <p className="text-xs text-textSecondary mt-0.5">
              Official institutional holidays used to automatically exclude non-working days from leave calculations.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Holiday</span>
        </button>
      </div>

      {/* Holiday Table */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-textMuted">Loading holiday calendar...</div>
      ) : holidays.length === 0 ? (
        <div className="py-10 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-2">
          <Calendar className="w-8 h-8 text-textMuted mx-auto" />
          <p className="font-bold text-textPrimary">No Holidays Registered</p>
          <p className="text-[11px] text-textSecondary">Add your academic holidays to enable automatic leave day exclusion.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borderLine">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
              <tr>
                <th className="py-2.5 px-3.5">#</th>
                <th className="py-2.5 px-3.5">Date</th>
                <th className="py-2.5 px-3.5">Day</th>
                <th className="py-2.5 px-3.5">Holiday / Occasion</th>
                <th className="py-2.5 px-3.5">Type</th>
                <th className="py-2.5 px-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {holidays.map((h, idx) => {
                const dateObj = new Date(h.date);
                const dayName = isNaN(dateObj.getTime())
                  ? ''
                  : dateObj.toLocaleDateString('en-IN', { weekday: 'long' });

                return (
                  <tr key={h.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-2.5 px-3.5 font-mono text-textMuted">{idx + 1}</td>
                    <td className="py-2.5 px-3.5 font-mono font-bold text-textPrimary whitespace-nowrap">
                      {typeof h.date === 'string' ? h.date.split('T')[0] : ''}
                    </td>
                    <td className="py-2.5 px-3.5 text-textSecondary">{dayName}</td>
                    <td className="py-2.5 px-3.5 font-bold text-textPrimary">{h.title}</td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-soft text-brand-primary border border-brand-primary/20">
                        {h.type || 'Holiday'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete holiday "${h.title}"?`)) {
                            deleteMutation.mutate(h.id);
                          }
                        }}
                        className="p-1 rounded-lg text-textMuted hover:text-alert hover:bg-alert-soft transition-all"
                        title="Delete Holiday"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Holiday Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-primary" /> Add Institutional Holiday
              </h4>
              <button onClick={() => setShowAddModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-textSecondary block mb-1">Holiday Date *</label>
                <input
                  type="date"
                  required
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">Holiday Title / Occasion *</label>
                <input
                  type="text"
                  required
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="e.g. Ugadi, Deepavali, Sankranti"
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">Type</label>
                <select
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary"
                >
                  <option value="Holiday">General Public Holiday</option>
                  <option value="Restricted Holiday">Restricted Holiday</option>
                  <option value="Institutional Holiday">Institutional Non-Instructional Day</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-borderLine">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm"
                >
                  {addMutation.isPending ? 'Saving...' : 'Save Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
