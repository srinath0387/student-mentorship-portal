/**
 * Student Directory — read-only list for the Principal, Director, Management and Program Chair (all their departments),
 * HOD / admin (their department) and the first-year coordinator: who the student is, CGPA, this year's attendance,
 * the last 30 days, today, and the mentor. Opening a student shows their subject-wise attendance.
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { BouncingDots } from '../../components/common/BouncingDots';
import { AcademicYearPicker } from '../../components/common/AcademicYearPicker';
import { StudentAttendanceView } from '../attendance/student/StudentAttendanceView';
import { AttendanceChip } from './AttendanceChip';

const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';

export default function StudentDirectoryPage() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const pick = !['hod', 'admin', 'coordinator'].includes(String(user?.role)) || (user?.role === 'admin' && !user?.department);
  const f = { department: sp.get('department') || 'All', year: sp.get('year') || 'All', section: sp.get('section') || '', search: sp.get('q') || '', low: sp.get('low') === '1', page: Number(sp.get('page') || 0) };
  const [typed, setTyped] = useState(f.search);
  const [open, setOpen] = useState<any | null>(null);
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '' || v === 'All') next.delete(k); else next.set(k, v); }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  useEffect(() => { const t = setTimeout(() => { if (typed !== f.search) set({ q: typed.trim() || null }); }, 400); return () => clearTimeout(t); }, [typed]);  // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, error } = useQuery({
    queryKey: ['studentDirectory', f],
    queryFn: () => api.getStudentDirectory({ department: f.department, year: f.year, section: f.section, search: f.search, low: f.low, page: f.page }),
    placeholderData: prev => prev,
  });
  const rows: any[] = data?.rows || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Student Directory</h1>
          <p className="text-xs text-textSecondary">{data ? `${data.scope === 'All' ? 'All departments' : data.scope} · ${data.total.toLocaleString('en-IN')} students` : '…'} · attendance is this academic year, across each student's subject rosters</p>
        </div>
        <AcademicYearPicker value={data?.academic_year} />
      </div>

      <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
        <div className="relative flex-1 min-w-[200px]"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input aria-label="Search students" className={`${input} pl-8 w-full`} placeholder="Name or roll number" value={typed} onChange={e => setTyped(e.target.value)} /></div>
        {pick && <select aria-label="Department" className={input} value={f.department} onChange={e => set({ department: e.target.value })}><option value="All">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>}
        <select aria-label="Year" className={input} value={f.year} onChange={e => set({ year: e.target.value })}><option value="All">All years</option>{YEARS.map(y => <option key={y}>{y}</option>)}</select>
        <input aria-label="Section" className={`${input} w-20`} placeholder="Section" value={f.section} onChange={e => set({ section: e.target.value.toUpperCase().slice(0, 3) })} />
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-textPrimary">
          <input type="checkbox" checked={f.low} onChange={e => set({ low: e.target.checked ? '1' : null })} />Below 75% only</label>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
              <tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Department</th><th className="px-3 py-2">Year / Sec</th><th className="px-3 py-2 text-right">CGPA</th>
                <th className="px-3 py-2">Attendance</th><th className="px-3 py-2">Last 30 days</th><th className="px-3 py-2">Mentor</th><th className="px-3 py-2">Phone</th></tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={8} className="p-8 text-center"><BouncingDots size="sm" className="text-textMuted" /></td></tr>
                : error ? <tr><td colSpan={8} className="p-8 text-center text-rose-600">{(error as any).message}</td></tr>
                : rows.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-textMuted">{f.low ? 'No student is below 75% here.' : 'No students match these filters.'}</td></tr>
                : rows.map(r => (
                  <tr key={r.roll_number} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => setOpen(r)}>
                    <td className="px-3 py-2"><p className="font-bold text-textPrimary">{r.name || '—'}</p><p className="text-[10px] text-textMuted font-mono">{r.roll_number}</p></td>
                    <td className="px-3 py-2 text-textSecondary">{r.department}</td>
                    <td className="px-3 py-2 text-textSecondary whitespace-nowrap">{r.year || '—'}{r.section ? ` · ${r.section}` : ''}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{Number(r.cgpa) > 0 ? Number(r.cgpa).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2"><AttendanceChip a={r.attendance} /></td>
                    <td className="px-3 py-2"><AttendanceChip a={r.attendance} recent /></td>
                    <td className="px-3 py-2 text-textSecondary">{r.mentor_name || <span className="text-textMuted">Not assigned</span>}</td>
                    <td className="px-3 py-2 text-textSecondary tabular-nums whitespace-nowrap">{r.phone || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data && data.total > data.page_size && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-borderLine text-xs">
            <span className="text-textSecondary tabular-nums">{f.page * data.page_size + 1}–{Math.min(data.total, (f.page + 1) * data.page_size)} of {data.total.toLocaleString('en-IN')}</span>
            <div className="flex gap-1">
              <button className="p-1.5 rounded-lg border border-borderLine disabled:opacity-40" aria-label="Previous page" disabled={f.page === 0} onClick={() => set({ page: String(f.page - 1) })}><ChevronLeft className="w-4 h-4" /></button>
              <button className="p-1.5 rounded-lg border border-borderLine disabled:opacity-40" aria-label="Next page" disabled={f.page + 1 >= pages} onClick={() => set({ page: String(f.page + 1) })}><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {open && <StudentAttendanceDialog student={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A student's subject-wise and day-wise attendance in a dialog (used by the directory and by mentors) */
export function StudentAttendanceDialog({ student, onClose }: { student: any; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Attendance of ${student.name || student.roll_number}`} onClick={onClose}>
      <div className="bg-background border border-borderLine rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-4 relative" onClick={e => e.stopPropagation()}>
        <button className="absolute top-3 right-3 p-1.5 rounded-lg text-textSecondary hover:bg-surface-2" aria-label="Close" onClick={onClose}><X className="w-4 h-4" /></button>
        {(student.mentor_name || student.phone) && (
          <p className="text-xs text-textSecondary mb-2 pr-8">{student.mentor_name ? `Mentor: ${student.mentor_name}` : ''}{student.mentor_name && student.phone ? ' · ' : ''}{student.phone ? `Phone: ${student.phone}` : ''}</p>
        )}
        <StudentAttendanceView rollNumber={student.roll_number} />
      </div>
    </div>
  );
}
