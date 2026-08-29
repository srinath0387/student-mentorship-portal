import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock, AlertTriangle, Calendar, RefreshCw, User, BookOpen,
  Filter, Download, CheckCircle2, ChevronRight, ArrowRight
} from 'lucide-react';
import { api } from '../../lib/api';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

interface NotPostedAttendanceTabProps {
  defaultSemester?: string;
  defaultDepartment?: string;
  facultyEmail?: string;
  isFacultyView?: boolean;
}

export const NotPostedAttendanceTab: React.FC<NotPostedAttendanceTabProps> = ({
  defaultSemester = '',
  defaultDepartment = '',
  facultyEmail = '',
  isFacultyView = false,
}) => {
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [filterSem, setFilterSem] = useState<string>(defaultSemester);
  const [filterDept, setFilterDept] = useState<string>(defaultDepartment);
  const [filterSec, setFilterSec] = useState<string>('All');

  const { data: notPostedData, isLoading, refetch } = useQuery({
    queryKey: ['notPostedAttendanceData', selectedDate, filterSem, filterDept, filterSec, facultyEmail],
    queryFn: () => api.getNotPostedAttendance({
      date: selectedDate,
      semester: filterSem,
      department: filterDept,
      section: filterSec,
      faculty_email: facultyEmail,
    }),
  });

  const pendingSlots: any[] = Array.isArray(notPostedData?.pendingSlots) ? notPostedData.pendingSlots : [];
  const postedSlots: any[] = Array.isArray(notPostedData?.postedSlots) ? notPostedData.postedSlots : [];

  const downloadExcel = () => {
    const rows = pendingSlots.map((s, idx) => ({
      '#': idx + 1,
      'Date': selectedDate,
      'Semester': s.semester_label,
      'Department': s.department,
      'Section': s.section,
      'Period Start': `Period ${s.period_start}`,
      'Num Periods': s.num_periods,
      'Subject Name': s.subject_name,
      'Subject Type': s.subject_type,
      'Faculty Name': s.faculty_name,
      'Faculty Email': s.faculty_email,
      'Room No': s.room_no || '—',
      'Status': 'PENDING / NOT POSTED',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Unposted_Attendance');
    XLSX.writeFile(wb, `Unposted_Attendance_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* ── Top Bar ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-bold uppercase tracking-wider mb-1.5">
              <Clock className="w-3.5 h-3.5" />
              Attendance Compliance Audit
            </div>
            <h2 className="text-lg font-black text-textPrimary">
              {isFacultyView ? 'My Pending Timetable Classes' : 'Unposted Attendance Compliance Report'}
            </h2>
            <p className="text-xs text-textSecondary mt-0.5">
              {isFacultyView
                ? 'Scheduled classes for which attendance has not been posted yet. Click "Mark Now" to take attendance immediately.'
                : 'Identifies scheduled timetable slots that have not had attendance posted for the selected date.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface-2 border border-borderLine rounded-xl px-3 py-1.5 text-xs">
              <Calendar className="w-4 h-4 text-textSecondary" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-textPrimary font-semibold focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl border border-borderLine bg-surface-2 hover:bg-surface-3 text-textSecondary hover:text-textPrimary transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {!isFacultyView && (
              <button
                onClick={downloadExcel}
                disabled={pendingSlots.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-borderLine text-xs font-bold text-textSecondary hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Counters */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-borderLine">
          <div className="bg-surface-2/60 rounded-xl p-3 border border-borderLine">
            <span className="text-[10px] font-bold text-textMuted uppercase">Total Scheduled</span>
            <div className="text-xl font-black text-textPrimary mt-0.5">{notPostedData?.totalScheduled || 0}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <span className="text-[10px] font-bold text-emerald-400 uppercase">Posted on Time</span>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{notPostedData?.postedCount || 0}</div>
          </div>
          <div className="bg-rose-500/10 rounded-xl p-3 border border-rose-500/20">
            <span className="text-[10px] font-bold text-rose-400 uppercase">Pending / Not Posted</span>
            <div className="text-xl font-black text-rose-400 mt-0.5">{pendingSlots.length}</div>
          </div>
        </div>
      </div>

      {/* ── Pending Slots Table ── */}
      {isLoading ? (
        <div className="py-12 text-center text-textMuted text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-primary" />
          <span>Analyzing timetable and attendance logs...</span>
        </div>
      ) : !notPostedData?.isWorkingDay ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-2">
          <Calendar className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="text-sm font-bold text-textPrimary">{notPostedData?.message || 'Non-working day / Holiday'}</h3>
          <p className="text-xs text-textMuted">No classes scheduled for {selectedDate}.</p>
        </div>
      ) : pendingSlots.length === 0 ? (
        <div className="bg-surface border border-borderLine rounded-2xl p-12 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-bold text-textPrimary">100% Attendance Compliance!</h3>
          <p className="text-xs text-textMuted">All scheduled classes for {selectedDate} have been successfully posted.</p>
        </div>
      ) : (
        <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-borderLine flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {pendingSlots.length} Timetable Slot(s) Pending Attendance Entry
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold">
                <tr>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5">Class &amp; Section</th>
                  <th className="px-4 py-2.5">Subject</th>
                  <th className="px-4 py-2.5">Assigned Faculty</th>
                  <th className="px-4 py-2.5 text-center">Room</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {pendingSlots.map((slot, idx) => (
                  <tr key={idx} className="hover:bg-surface-2/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 font-black text-xs">
                        Period {slot.period_start} {slot.num_periods > 1 ? `– ${parseInt(slot.period_start) + parseInt(slot.num_periods) - 1}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-textPrimary">{slot.semester_label} — {slot.department}</div>
                      <div className="text-[11px] text-textMuted">Section {slot.section}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-textPrimary flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                        <span>{slot.subject_name}</span>
                      </div>
                      <span className="text-[10px] text-textMuted uppercase font-semibold">{slot.subject_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-textPrimary font-semibold">{slot.faculty_name || 'Unassigned'}</div>
                      <div className="text-[10px] text-textMuted font-mono">{slot.faculty_email}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-textMuted font-mono">
                      {slot.room_no || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          navigate(`/attendance?sem=${encodeURIComponent(slot.semester_label)}&sec=${encodeURIComponent(slot.section)}&subj=${encodeURIComponent(slot.subject_name)}&date=${encodeURIComponent(selectedDate)}&period=${encodeURIComponent(slot.period_start)}`);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                      >
                        <span>Mark Now</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
