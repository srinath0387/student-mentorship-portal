import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CalendarCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  Plus,
  Trash2,
  Printer,
  FileText,
  Building,
  Briefcase,
  HelpCircle,
  X,
  Search,
  Check,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  FacultyLeaveRecord,
  FacultyLeaveType,
  FacultyLeaveAdjustment,
  FacultyLeaveSummaryResponse,
  HolidayCalendarEntry,
} from '../../types';
import { LeaveLetterModal } from './LeaveLetterModal';

const AVAILABLE_PERIODS = [
  { id: 'Period 1', label: 'Period 1 (09:00 - 09:50 AM)' },
  { id: 'Period 2', label: 'Period 2 (09:50 - 10:40 AM)' },
  { id: 'Period 3', label: 'Period 3 (11:00 - 11:50 AM)' },
  { id: 'Period 4', label: 'Period 4 (11:50 - 12:40 PM)' },
  { id: 'Period 5', label: 'Period 5 (01:40 - 02:30 PM)' },
  { id: 'Period 6', label: 'Period 6 (02:30 - 03:20 PM)' },
  { id: 'Period 7', label: 'Period 7 (03:20 - 04:10 PM)' },
];

export const FacultyLeaveTab: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const email = user?.email || '';

  const [activeSubTab, setActiveSubTab] = useState<'my-leaves' | 'reassigned-duties'>('my-leaves');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [viewingLeave, setViewingLeave] = useState<FacultyLeaveRecord | null>(null);

  // Form State
  const [formLeaveType, setFormLeaveType] = useState<FacultyLeaveType>('Casual Leave');
  const [formFromDate, setFormFromDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formToDate, setFormToDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formReason, setFormReason] = useState<string>('');
  const [formAdjustments, setFormAdjustments] = useState<FacultyLeaveAdjustment[]>([]);

  // Adjustment Inputs
  const [adjType, setAdjType] = useState<'classwork' | 'exam_duty'>('classwork');
  const [adjDate, setAdjDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adjSubject, setAdjSubject] = useState<string>('');
  const [adjPeriods, setAdjPeriods] = useState<string[]>(['Period 1']);
  const [adjFacultyEmail, setAdjFacultyEmail] = useState<string>('');
  const [adjFacultyName, setAdjFacultyName] = useState<string>('');
  const [colleagueSearch, setColleagueSearch] = useState<string>('');

  // Reassign Modal State
  const [reassignModal, setReassignModal] = useState<{
    adjId: string;
    originalDuty: string;
    date: string;
  } | null>(null);
  const [reassignNewEmail, setReassignNewEmail] = useState<string>('');
  const [reassignNewName, setReassignNewName] = useState<string>('');
  const [reassignColleagueSearch, setReassignColleagueSearch] = useState<string>('');

  // Queries
  const { data: summary, isLoading: isLoadingSummary } = useQuery<FacultyLeaveSummaryResponse>({
    queryKey: ['facultyLeaveSummary', email],
    queryFn: () => api.getMyFacultyLeaveSummary(),
    enabled: Boolean(email),
  });

  const { data: holidays = [] } = useQuery<HolidayCalendarEntry[]>({
    queryKey: ['holidayCalendar'],
    queryFn: () => api.getHolidays(),
  });

  const { data: reassignedDuties = [], isLoading: isLoadingDuties } = useQuery<FacultyLeaveAdjustment[]>({
    queryKey: ['facultyReassignedDuties', email],
    queryFn: () => api.getReassignedDuties(),
    enabled: Boolean(email),
  });

  const { data: facultyDirectory = [] } = useQuery({
    queryKey: ['facultyDirectoryForAdjustments'],
    queryFn: () => (api.getAllFaculty ? api.getAllFaculty('All') : Promise.resolve([])),
  });

  // Filtered Faculty Directory for Searchable Dropdowns
  const filteredFacultyForDuty = useMemo(() => {
    const q = colleagueSearch.toLowerCase().trim();
    return facultyDirectory
      .filter((f: any) => f.email && f.email.toLowerCase() !== email.toLowerCase())
      .filter((f: any) => {
        if (!q) return true;
        return (
          f.name?.toLowerCase().includes(q) ||
          f.email?.toLowerCase().includes(q) ||
          f.department?.toLowerCase().includes(q)
        );
      });
  }, [facultyDirectory, email, colleagueSearch]);

  const filteredFacultyForReassign = useMemo(() => {
    const q = reassignColleagueSearch.toLowerCase().trim();
    return facultyDirectory
      .filter((f: any) => f.email && f.email.toLowerCase() !== email.toLowerCase())
      .filter((f: any) => {
        if (!q) return true;
        return (
          f.name?.toLowerCase().includes(q) ||
          f.email?.toLowerCase().includes(q) ||
          f.department?.toLowerCase().includes(q)
        );
      });
  }, [facultyDirectory, email, reassignColleagueSearch]);

  const holidaySet = useMemo(() => {
    return new Set(
      holidays.map((h) => {
        return typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0];
      })
    );
  }, [holidays]);

  const calculatedDays = useMemo(() => {
    const start = new Date(formFromDate);
    const end = new Date(formToDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dayOfWeek = cur.getDay();
      const iso = cur.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && !holidaySet.has(iso)) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [formFromDate, formToDate, holidaySet]);

  const currentRemaining = summary?.balances?.[formLeaveType]?.remaining ?? 0;
  const isInsufficient = formLeaveType !== 'Paid Leave' && calculatedDays > currentRemaining;

  const applyMutation = useMutation({
    mutationFn: (payload: any) => api.applyFacultyLeave(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      setShowApplyModal(false);
      resetForm();
      alert(res.message || 'Leave application submitted successfully!');
    },
    onError: (err: any) => {
      alert(`Failed to apply: ${err.message}`);
    },
  });

  const dutyResponseMutation = useMutation({
    mutationFn: ({ adjId, status, rejected_reason }: { adjId: string; status: 'Accepted' | 'Rejected'; rejected_reason?: string }) =>
      api.respondToAdjustment(adjId, status, rejected_reason),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyReassignedDuties', email] });
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary'] });
      alert(res.message || 'Response recorded successfully.');
    },
    onError: (err: any) => {
      alert(`Failed to record response: ${err.message}`);
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({ adjId, email, name }: { adjId: string; email: string; name?: string }) =>
      api.reassignDutyColleague(adjId, email, name),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      setReassignModal(null);
      setReassignNewEmail('');
      setReassignNewName('');
      alert(res.message || 'Reassigned successfully.');
    },
    onError: (err: any) => {
      alert(`Failed to reassign: ${err.message}`);
    },
  });

  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => api.deleteFacultyLeave(leaveId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['facultyLeaveSummary', email] });
      alert(res.message || 'Leave cancelled.');
    },
    onError: (err: any) => {
      alert(`Failed to cancel leave: ${err.message}`);
    },
  });

  const resetForm = () => {
    setFormLeaveType('Casual Leave');
    setFormFromDate(new Date().toISOString().split('T')[0]);
    setFormToDate(new Date().toISOString().split('T')[0]);
    setFormReason('');
    setFormAdjustments([]);
    setAdjPeriods(['Period 1']);
    setColleagueSearch('');
  };

  const togglePeriod = (pId: string) => {
    setAdjPeriods((prev) =>
      prev.includes(pId) ? (prev.length > 1 ? prev.filter((p) => p !== pId) : prev) : [...prev, pId].sort()
    );
  };

  const handleAddAdjustment = () => {
    if (!adjSubject.trim() || !adjFacultyEmail.trim() || adjPeriods.length === 0) {
      alert('Please fill in all adjustment fields correctly.');
      return;
    }
    const facultyObj = facultyDirectory.find((f: any) => f.email?.toLowerCase() === adjFacultyEmail.toLowerCase());
    const facultyName = facultyObj?.name || adjFacultyName || adjFacultyEmail;
    setFormAdjustments((prev) => [
      ...prev,
      {
        adjustment_type: adjType,
        date: adjDate || formFromDate,
        subject_or_duty: adjSubject.trim(),
        periods: [...adjPeriods],
        timing_slot: adjPeriods.join(', '),
        reassigned_faculty_email: adjFacultyEmail.toLowerCase().trim(),
        reassigned_faculty_name: facultyName,
        acceptance_status: 'Pending',
      },
    ]);
    setAdjSubject('');
    setAdjFacultyEmail('');
    setAdjFacultyName('');
    setColleagueSearch('');
  };

  const handleRemoveAdjustment = (idx: number) => {
    setFormAdjustments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (calculatedDays <= 0 || isInsufficient) return;
    let finalAdjustments = [...formAdjustments];
    if (adjSubject.trim() && adjFacultyEmail.trim() && adjPeriods.length > 0) {
      const facultyObj = facultyDirectory.find((f: any) => f.email?.toLowerCase() === adjFacultyEmail.toLowerCase());
      finalAdjustments.push({
        adjustment_type: adjType,
        date: adjDate || formFromDate,
        subject_or_duty: adjSubject.trim(),
        periods: [...adjPeriods],
        timing_slot: adjPeriods.join(', '),
        reassigned_faculty_email: adjFacultyEmail.toLowerCase().trim(),
        reassigned_faculty_name: facultyObj?.name || adjFacultyName || adjFacultyEmail,
        acceptance_status: 'Pending',
      });
    }
    applyMutation.mutate({
      leave_type: formLeaveType,
      from_date: formFromDate,
      to_date: formToDate,
      reason: formReason.trim(),
      adjustments: finalAdjustments,
    });
  };

  const balances = summary?.balances || {
    'Casual Leave': { quota: 15, used: 0, in_process: 0, remaining: 15 },
    'Academic Leave': { quota: 6, used: 0, in_process: 0, remaining: 6 },
    'SP CL': { quota: 7, used: 0, in_process: 0, remaining: 7 },
    'Paid Leave': { quota: 0, used: 0, in_process: 0, remaining: 999 },
  };

  const pendingCoveringDutiesCount = reassignedDuties.filter((d: any) => d.acceptance_status === 'Pending').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Casual Leave</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-soft text-brand-primary font-bold">Quota: 15</span>
          </div>
          <span className="text-2xl font-black text-brand-primary">{balances['Casual Leave'].remaining}</span>
          <span className="text-xs text-textSecondary ml-1">remaining</span>
        </div>
        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Academic Leave</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-bold">Quota: 6</span>
          </div>
          <span className="text-2xl font-black text-purple-400">{balances['Academic Leave'].remaining}</span>
          <span className="text-xs text-textSecondary ml-1">remaining</span>
        </div>
        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Special CL</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold">Quota: 7</span>
          </div>
          <span className="text-2xl font-black text-emerald-400">{balances['SP CL'].remaining}</span>
          <span className="text-xs text-textSecondary ml-1">remaining</span>
        </div>
        <div className="bg-surface border border-borderLine rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-textSecondary uppercase tracking-wider">Covering Duties</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold">Total</span>
          </div>
          <span className="text-2xl font-black text-amber-500">{reassignedDuties.length}</span>
          <span className="text-xs text-textSecondary ml-1">assigned</span>
        </div>
      </div>

      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-borderLine pb-4">
          <div className="flex gap-2">
            <button onClick={() => setActiveSubTab('my-leaves')} className={`px-4 py-2 rounded-xl text-xs font-bold ${activeSubTab === 'my-leaves' ? 'bg-brand-primary text-white' : 'bg-surface-2'}`}>My Leaves</button>
            <button onClick={() => setActiveSubTab('reassigned-duties')} className={`px-4 py-2 rounded-xl text-xs font-bold ${activeSubTab === 'reassigned-duties' ? 'bg-brand-primary text-white' : 'bg-surface-2'}`}>Duties ({pendingCoveringDutiesCount})</button>
          </div>
          <button onClick={() => setShowApplyModal(true)} className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold">Apply Leave</button>
        </div>

        {activeSubTab === 'my-leaves' && (
          <div className="overflow-x-auto rounded-xl border border-borderLine">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-textMuted font-bold uppercase border-b border-borderLine">
                <tr>
                  <th className="py-2.5 px-3.5">Type</th>
                  <th className="py-2.5 px-3.5">Date</th>
                  <th className="py-2.5 px-3.5">Adjustments</th>
                  <th className="py-2.5 px-3.5">Approval Flow</th>
                  <th className="py-2.5 px-3.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {summary?.leaves?.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-2/40">
                    <td className="py-2.5 px-3.5 font-bold text-textPrimary">{l.leave_type}</td>
                    <td className="py-2.5 px-3.5 font-mono">{l.from_date} to {l.to_date}</td>
                    <td className="py-2.5 px-3.5">
                      {l.adjustments?.map((a, i) => (
                        <div key={i} className="text-[10px]">{a.subject_or_duty}: {a.reassigned_faculty_name} ({a.acceptance_status})</div>
                      ))}
                    </td>
                    <td className="py-2.5 px-3.5 space-y-0.5">
                      <div className="flex gap-1 text-[10px]">
                        <span>Colleague: {l.adjustments?.every(a => a.acceptance_status === 'Accepted') ? '✅' : '⏳'}</span>
                        <span>HOD: {l.hod_status === 'Approved' ? '✅' : '⏳'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <button onClick={() => cancelLeaveMutation.mutate(l.id)} className="text-alert">Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h4 className="font-bold text-lg mb-4">Apply for Leave</h4>
            <form onSubmit={handleSubmitLeave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <select value={formLeaveType} onChange={(e) => setFormLeaveType(e.target.value as any)} className="p-2 rounded-xl border border-borderLine">
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Academic Leave">Academic Leave</option>
                  <option value="SP CL">SP CL</option>
                  <option value="Paid Leave">Paid Leave</option>
                </select>
                <input type="date" value={formFromDate} onChange={(e) => setFormFromDate(e.target.value)} className="p-2 rounded-xl border border-borderLine" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {AVAILABLE_PERIODS.map(p => (
                  <button type="button" key={p.id} onClick={() => togglePeriod(p.id)} className={`px-2 py-1 text-[10px] rounded-lg border ${adjPeriods.includes(p.id) ? 'bg-purple-500 text-white' : ''}`}>
                    {p.id}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Subject/Duty Name" value={adjSubject} onChange={(e) => setAdjSubject(e.target.value)} className="w-full p-2 rounded-xl border border-borderLine" />
              <input type="text" placeholder="Search colleague..." value={colleagueSearch} onChange={(e) => setColleagueSearch(e.target.value)} className="w-full p-2 rounded-xl border border-borderLine" />
              <select onChange={(e) => setAdjFacultyEmail(e.target.value)} className="w-full p-2 rounded-xl border border-borderLine">
                <option value="">Select Colleague</option>
                {filteredFacultyForDuty.map((f: any) => <option key={f.email} value={f.email}>{f.name} ({f.department})</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowApplyModal(false)} className="px-4 py-2 rounded-xl border">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-brand-primary text-white">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
