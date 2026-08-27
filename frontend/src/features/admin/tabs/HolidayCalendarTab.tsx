import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Building,
  Clock,
  BookOpen,
  CalendarCheck,
  Lock,
  Layers
} from 'lucide-react';
import { api } from '../../../lib/api';
import { HolidayCalendarEntry, AcademicCalendarEntry } from '../../../types';
import { useAuth } from '../../../context/AuthContext';

export const HolidayCalendarTab: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || (user?.role as string) === 'super-admin';

  const [activeSubTab, setActiveSubTab] = useState<'academic' | 'holidays'>('academic');

  // ── HOLIDAYS STATE ──
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayCalendarEntry | null>(null);
  const [holDate, setHolDate] = useState('');
  const [holTitle, setHolTitle] = useState('');
  const [holType, setHolType] = useState('Holiday');

  // ── ACADEMIC CALENDAR STATE ──
  const [showAcademicModal, setShowAcademicModal] = useState(false);
  const [editingAcademic, setEditingAcademic] = useState<AcademicCalendarEntry | null>(null);
  const [acadYear, setAcadYear] = useState('2025-2026');
  const [acadSem, setAcadSem] = useState('1-1');
  const [acadStart, setAcadStart] = useState('');
  const [acadEnd, setAcadEnd] = useState('');
  const [acadDesc, setAcadDesc] = useState('');

  // ── QUERIES ──
  const { data: holidays = [], isLoading: isLoadingHolidays } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

  const { data: academicCalendars = [], isLoading: isLoadingAcademic } = useQuery<AcademicCalendarEntry[]>({
    queryKey: ['academicCalendars'],
    queryFn: () => api.getAcademicCalendars(),
  });

  // ── HOLIDAY MUTATIONS ──
  const saveHolidayMutation = useMutation({
    mutationFn: (payload: { id?: string; date: string; title: string; type?: string }) => {
      if (payload.id) {
        return api.updateHoliday(payload.id, payload.date, payload.title, payload.type);
      }
      return api.addHoliday(payload.date, payload.title, payload.type);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayCalendar'] });
      setShowHolidayModal(false);
      resetHolidayForm();
    },
    onError: (err: any) => {
      alert(`Failed to save holiday: ${err.message}`);
    },
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: string) => api.deleteHoliday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidayCalendar'] });
    },
  });

  // ── ACADEMIC CALENDAR MUTATIONS ──
  const saveAcademicMutation = useMutation({
    mutationFn: (payload: {
      academic_year: string;
      semester: string;
      start_date: string;
      end_date: string;
      description?: string;
    }) => api.saveAcademicCalendar(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academicCalendars'] });
      setShowAcademicModal(false);
      resetAcademicForm();
    },
    onError: (err: any) => {
      alert(`Failed to save academic calendar: ${err.message}`);
    },
  });

  const deleteAcademicMutation = useMutation({
    mutationFn: (id: string) => api.deleteAcademicCalendar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academicCalendars'] });
    },
  });

  // ── FORM HELPERS ──
  const resetHolidayForm = () => {
    setEditingHoliday(null);
    setHolDate('');
    setHolTitle('');
    setHolType('Holiday');
  };

  const handleOpenAddHoliday = () => {
    resetHolidayForm();
    setShowHolidayModal(true);
  };

  const handleOpenEditHoliday = (h: HolidayCalendarEntry) => {
    setEditingHoliday(h);
    const dateStr = typeof h.date === 'string' ? h.date.split('T')[0] : '';
    setHolDate(dateStr);
    setHolTitle(h.title);
    setHolType(h.type || 'Holiday');
    setShowHolidayModal(true);
  };

  const handleHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holDate || !holTitle.trim()) return;
    saveHolidayMutation.mutate({
      id: editingHoliday?.id,
      date: holDate,
      title: holTitle.trim(),
      type: holType,
    });
  };

  const resetAcademicForm = () => {
    setEditingAcademic(null);
    setAcadYear('2025-2026');
    setAcadSem('1-1');
    setAcadStart('');
    setAcadEnd('');
    setAcadDesc('');
  };

  const handleOpenAddAcademic = () => {
    resetAcademicForm();
    setShowAcademicModal(true);
  };

  const handleOpenEditAcademic = (entry: AcademicCalendarEntry) => {
    setEditingAcademic(entry);
    setAcadYear(entry.academic_year);
    setAcadSem(String(entry.semester));
    setAcadStart(typeof entry.start_date === 'string' ? entry.start_date.split('T')[0] : '');
    setAcadEnd(typeof entry.end_date === 'string' ? entry.end_date.split('T')[0] : '');
    setAcadDesc(entry.description || '');
    setShowAcademicModal(true);
  };

  const handleAcademicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!acadYear || !acadSem || !acadStart || !acadEnd) return;
    if (new Date(acadStart) > new Date(acadEnd)) {
      alert('Semester Start Date cannot be after End Date.');
      return;
    }
    saveAcademicMutation.mutate({
      academic_year: acadYear.trim(),
      semester: acadSem.trim(),
      start_date: acadStart,
      end_date: acadEnd,
      description: acadDesc.trim(),
    });
  };

  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-6">
      {/* ── Sub-Tab Switcher & Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-borderLine pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('academic')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'academic'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Academic Semester Windows ({academicCalendars.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('holidays')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'holidays'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Public &amp; Institutional Holidays ({holidays.length})</span>
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            {activeSubTab === 'academic' ? (
              <button
                onClick={handleOpenAddAcademic}
                className="px-3.5 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Semester Window</span>
              </button>
            ) : (
              <button
                onClick={handleOpenAddHoliday}
                className="px-3.5 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Holiday</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 1: ACADEMIC CALENDAR SEMESTER WINDOWS ── */}
      {activeSubTab === 'academic' && (
        <div className="space-y-4">
          <div className="bg-brand-soft/50 border border-brand-primary/20 rounded-xl p-3.5 text-xs text-textSecondary flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-textPrimary">Attendance Locking Enforcement</p>
              <p className="text-[11px] mt-0.5">
                Attendance can only be marked and posted by faculty within the active semester start and end dates.
                Dates outside these configured windows are locked in the attendance posting wizard.
              </p>
            </div>
          </div>

          {isLoadingAcademic ? (
            <div className="py-12 text-center text-xs text-textMuted">Loading academic calendars...</div>
          ) : academicCalendars.length === 0 ? (
            <div className="py-10 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-2">
              <BookOpen className="w-8 h-8 text-textMuted mx-auto" />
              <p className="font-bold text-textPrimary">No Academic Calendars Configured</p>
              <p className="text-[11px] text-textSecondary">Set up semester date ranges to enforce automated attendance validation windows.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-borderLine">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                  <tr>
                    <th className="py-2.5 px-3.5">Academic Year</th>
                    <th className="py-2.5 px-3.5">Semester</th>
                    <th className="py-2.5 px-3.5">Start Date</th>
                    <th className="py-2.5 px-3.5">End Date</th>
                    <th className="py-2.5 px-3.5">Description</th>
                    <th className="py-2.5 px-3.5 text-center">Status</th>
                    {isAdmin && <th className="py-2.5 px-3.5 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {academicCalendars.map((item) => {
                    const startStr = typeof item.start_date === 'string' ? item.start_date.split('T')[0] : '';
                    const endStr = typeof item.end_date === 'string' ? item.end_date.split('T')[0] : '';
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isCurrent = todayStr >= startStr && todayStr <= endStr;

                    return (
                      <tr key={item.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-2.5 px-3.5 font-bold text-textPrimary font-mono">{item.academic_year}</td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                            Sem {item.semester}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-textSecondary">{startStr}</td>
                        <td className="py-2.5 px-3.5 font-mono text-textSecondary">{endStr}</td>
                        <td className="py-2.5 px-3.5 text-textSecondary">{item.description || 'Academic Instruction'}</td>
                        <td className="py-2.5 px-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isCurrent
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-surface text-textMuted border border-borderLine'
                            }`}
                          >
                            {isCurrent ? 'Active Now' : 'Scheduled'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 px-3.5 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenEditAcademic(item)}
                              className="p-1 rounded-lg text-textMuted hover:text-brand-primary hover:bg-brand-soft transition-all"
                              title="Edit Academic Window"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete academic calendar entry for ${item.academic_year} Sem ${item.semester}?`)) {
                                  deleteAcademicMutation.mutate(item.id);
                                }
                              }}
                              className="p-1 rounded-lg text-textMuted hover:text-alert hover:bg-alert-soft transition-all"
                              title="Delete Academic Window"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 2: PUBLIC & INSTITUTIONAL HOLIDAYS ── */}
      {activeSubTab === 'holidays' && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 text-xs text-textSecondary flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-textPrimary">Automated Attendance &amp; Leave Integration</p>
              <p className="text-[11px] mt-0.5">
                Every declared holiday automatically locks the date in the attendance module (faculty cannot take attendance),
                and is excluded from faculty/student working day leave calculations.
              </p>
            </div>
          </div>

          {isLoadingHolidays ? (
            <div className="py-12 text-center text-xs text-textMuted">Loading holiday calendar...</div>
          ) : holidays.length === 0 ? (
            <div className="py-10 text-center text-xs text-textMuted bg-surface-2/30 rounded-xl border border-dashed border-borderLine space-y-2">
              <Calendar className="w-8 h-8 text-textMuted mx-auto" />
              <p className="font-bold text-textPrimary">No Holidays Registered</p>
              <p className="text-[11px] text-textSecondary">Add your academic holidays to enable automatic leave day exclusion and attendance locking.</p>
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
                    {isAdmin && <th className="py-2.5 px-3.5 text-right">Action</th>}
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
                        {isAdmin && (
                          <td className="py-2.5 px-3.5 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenEditHoliday(h)}
                              className="p-1 rounded-lg text-textMuted hover:text-brand-primary hover:bg-brand-soft transition-all"
                              title="Edit Holiday"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete holiday "${h.title}"?`)) {
                                  deleteHolidayMutation.mutate(h.id);
                                }
                              }}
                              className="p-1 rounded-lg text-textMuted hover:text-alert hover:bg-alert-soft transition-all"
                              title="Delete Holiday"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIGURE ACADEMIC SEMESTER MODAL ── */}
      {showAcademicModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-primary" />
                <span>{editingAcademic ? 'Edit Academic Semester Window' : 'Configure Academic Semester Window'}</span>
              </h4>
              <button onClick={() => setShowAcademicModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAcademicSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Academic Year *</label>
                  <select
                    value={acadYear}
                    onChange={(e) => setAcadYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono font-bold focus:outline-none focus:border-brand-primary"
                  >
                    <option value="2024-2025">2024-2025</option>
                    <option value="2025-2026">2025-2026</option>
                    <option value="2026-2027">2026-2027</option>
                    <option value="2027-2028">2027-2028</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-textSecondary block mb-1">Semester *</label>
                  <select
                    value={acadSem}
                    onChange={(e) => setAcadSem(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono font-bold focus:outline-none focus:border-brand-primary"
                  >
                    <option value="1-1">1-1 (1st Year Sem 1)</option>
                    <option value="1-2">1-2 (1st Year Sem 2)</option>
                    <option value="2-1">2-1 (2nd Year Sem 1)</option>
                    <option value="2-2">2-2 (2nd Year Sem 2)</option>
                    <option value="3-1">3-1 (3rd Year Sem 1)</option>
                    <option value="3-2">3-2 (3rd Year Sem 2)</option>
                    <option value="4-1">4-1 (4th Year Sem 1)</option>
                    <option value="4-2">4-2 (4th Year Sem 2)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Semester Start Date *</label>
                  <input
                    type="date"
                    required
                    value={acadStart}
                    onChange={(e) => setAcadStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Semester End Date *</label>
                  <input
                    type="date"
                    required
                    value={acadEnd}
                    onChange={(e) => setAcadEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">Description / Notes</label>
                <input
                  type="text"
                  value={acadDesc}
                  onChange={(e) => setAcadDesc(e.target.value)}
                  placeholder="e.g. Regular Academic Instruction & Laboratory Sessions"
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-borderLine">
                <button
                  type="button"
                  onClick={() => setShowAcademicModal(false)}
                  className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveAcademicMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm"
                >
                  {saveAcademicMutation.isPending ? 'Saving...' : 'Save Semester Window'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD/EDIT HOLIDAY MODAL ── */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-primary" />
                <span>{editingHoliday ? 'Edit Institutional Holiday' : 'Add Institutional Holiday'}</span>
              </h4>
              <button onClick={() => setShowHolidayModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleHolidaySubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-textSecondary block mb-1">Holiday Date *</label>
                <input
                  type="date"
                  required
                  value={holDate}
                  onChange={(e) => setHolDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">Holiday Title / Occasion *</label>
                <input
                  type="text"
                  required
                  value={holTitle}
                  onChange={(e) => setHolTitle(e.target.value)}
                  placeholder="e.g. Ugadi, Deepavali, Sankranti, College Foundation Day"
                  className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="font-bold text-textSecondary block mb-1">Type</label>
                <select
                  value={holType}
                  onChange={(e) => setHolType(e.target.value)}
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
                  onClick={() => setShowHolidayModal(false)}
                  className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveHolidayMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm"
                >
                  {saveHolidayMutation.isPending ? 'Saving...' : 'Save Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
