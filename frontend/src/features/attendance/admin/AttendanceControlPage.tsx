import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarCheck, CalendarX, CheckCircle2, Clock, Edit2, Loader2, RotateCcw, Save, Search, Trash2, X, XCircle, CalendarClock, Users,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { VALID_DEPARTMENT_NAMES } from '../../../lib/validation/auth';
import { useAuth } from '../../../context/AuthContext';

/**
 * Admin attendance control centre.
 *   ?view=posted       Attendance Posted   (view / edit / delete any posted class)
 *   ?view=not-posted   Attendance Not Posted (who has class but hasn't posted; remove class)
 *   ?view=edit         Editing of Attendance (same list, opened for editing)
 *   ?view=remove       Remove class for a date (one class, a section, or a whole department)
 *   ?view=calendar     Academic calendar lock & late-posting approvals
 */

type View = 'posted' | 'not-posted' | 'edit' | 'remove' | 'calendar' | 'parents';

interface DaySlot {
  timetable_id: string | null;
  department: string;
  semester_label: string;
  section: string;
  subject_name: string;
  subject_type?: string;
  period_start: number;
  num_periods: number;
  faculty_email: string;
  faculty_name?: string;
  room_no?: string;
  status: 'posted' | 'not_posted' | 'no_class';
  extra_class?: boolean;
  session: null | { session_id: string; present_count: number; total_marked: number; recorded_by?: string; num_periods: number };
  no_class: null | { id: number; reason?: string; reviewed_by?: string };
}

interface DayStatus {
  date: string;
  day_of_week: string;
  holiday: string | null;
  summary: { scheduled: number; posted: number; not_posted: number; no_class: number; extra: number };
  slots: DaySlot[];
}

const today = () => new Date().toLocaleDateString('en-CA');
const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';

const VIEW_TITLES: Record<View, { title: string; sub: string }> = {
  posted: { title: 'Attendance Posted', sub: 'Classes with attendance recorded for the selected date — view, edit or delete.' },
  'not-posted': { title: 'Attendance Not Posted', sub: 'Classes scheduled in the timetable whose attendance is still pending.' },
  edit: { title: 'Editing of Attendance', sub: 'Open any posted class to correct individual students. Admin edits are not limited to the same day.' },
  remove: { title: 'Remove Class for a Date', sub: 'Cancel one class, a whole section, or a department for a date (exam, event, late holiday).' },
  calendar: { title: 'Academic Calendar & Late-Posting Approvals', sub: 'Outside the semester dates, faculty can post attendance only after you approve their request.' },
  parents: { title: 'Parent Alerts', sub: 'Absence messages for parents. Parents always see alerts in their portal; phone messages need a messaging gateway.' },
};

function Pill({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'red' | 'indigo'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400',
    indigo: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
}

// ── Session editor (view / edit one posted class) ──────────────────────────
function SessionEditor({ slot, onClose }: { slot: DaySlot; onClose: () => void }) {
  const qc = useQueryClient();
  const sessionId = slot.session!.session_id;
  const { data, isLoading } = useQuery({
    queryKey: ['adminSessionDetails', sessionId],
    queryFn: () => api.getSessionDetails(sessionId),
  });
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const records: { roll_number: string; is_present: boolean; student_name?: string }[] = Array.isArray(data?.records) ? data.records : [];
  const value = (r: { roll_number: string; is_present: boolean }) => (r.roll_number in edits ? edits[r.roll_number] : r.is_present);
  const changed = Object.keys(edits).filter(k => records.find(r => r.roll_number === k)?.is_present !== edits[k]);
  const present = records.filter(r => value(r)).length;

  const save = useMutation({
    mutationFn: () => api.updateAttendanceSession(sessionId, records.map(r => ({ roll_number: r.roll_number, is_present: value(r) }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminDayStatus'] });
      qc.invalidateQueries({ queryKey: ['adminSessionDetails', sessionId] });
      onClose();
    },
  });

  const shown = records.filter(r => !filter || r.roll_number.toLowerCase().includes(filter.toLowerCase()) || (r.student_name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${card} w-full max-w-2xl max-h-[88vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-borderLine">
          <div>
            <h3 className="text-sm font-black text-textPrimary">{slot.subject_name} · {slot.semester_label} {slot.section}</h3>
            <p className="text-[11px] text-textMuted">{slot.department} · Period {slot.period_start}{slot.num_periods > 1 ? `–${slot.period_start + slot.num_periods - 1}` : ''} · {slot.faculty_name || slot.faculty_email}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-textMuted hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2 p-3 border-b border-borderLine">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search roll no. or name" className={`${input} pl-8 w-full`} />
          </div>
          <Pill tone="green">{present} present</Pill>
          <Pill tone="red">{records.length - present} absent</Pill>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-10 text-center text-xs text-textMuted"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading students…</div>
          ) : records.length === 0 ? (
            <div className="p-10 text-center text-xs text-textMuted">No student records in this session.</div>
          ) : (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-borderLine">
                {shown.map(r => {
                  const v = value(r);
                  const isChanged = r.roll_number in edits && edits[r.roll_number] !== r.is_present;
                  return (
                    <tr key={r.roll_number} className={isChanged ? 'bg-amber-500/5' : ''}>
                      <td className="py-2 px-4 font-mono font-bold text-textPrimary">{r.roll_number}</td>
                      <td className="py-2 px-2 text-textSecondary">{r.student_name || '—'}</td>
                      <td className="py-2 px-4 text-right">
                        <div className="inline-flex rounded-lg border border-borderLine overflow-hidden">
                          <button onClick={() => setEdits(e => ({ ...e, [r.roll_number]: true }))}
                            className={`px-2.5 py-1 font-bold ${v ? 'bg-emerald-600 text-white' : 'text-textMuted hover:bg-surface-2'}`}>P</button>
                          <button onClick={() => setEdits(e => ({ ...e, [r.roll_number]: false }))}
                            className={`px-2.5 py-1 font-bold ${!v ? 'bg-red-600 text-white' : 'text-textMuted hover:bg-surface-2'}`}>A</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 p-3 border-t border-borderLine">
          <span className="text-[11px] text-textMuted">{changed.length ? `${changed.length} change${changed.length === 1 ? '' : 's'} not saved` : 'No changes'}</span>
          {save.isError && <span className="text-[11px] text-red-600">{(save.error as Error).message}</span>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine">Cancel</button>
            <button disabled={!changed.length || save.isPending} onClick={() => save.mutate()}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40 inline-flex items-center gap-1.5">
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Late-posting approvals ─────────────────────────────────────────────────
function LatePostApprovals() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'Pending' | 'Approved' | 'Rejected' | 'all'>('Pending');
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['latePostRequests', status], queryFn: () => api.getLatePostRequests(status) });
  const { data: windowToday } = useQuery({ queryKey: ['postingWindow', today()], queryFn: () => api.getPostingWindow(today()) });
  const { data: calendars } = useQuery({ queryKey: ['academicCalendars'], queryFn: () => api.getAcademicCalendars().catch(() => []) });
  const decide = useMutation({
    mutationFn: (v: { id: number; decision: 'approve' | 'reject'; reason?: string }) => api.decideLatePostRequest(v.id, v.decision, v.reason),
    onSuccess: () => { setRejecting(null); setRejectReason(''); qc.invalidateQueries({ queryKey: ['latePostRequests'] }); },
  });
  const requests: any[] = Array.isArray(data?.requests) ? data.requests : [];
  const cals: any[] = Array.isArray(calendars) ? calendars : [];

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
        <CalendarClock className="w-5 h-5 text-brand-primary" />
        <div className="flex-1 min-w-[240px]">
          <p className="text-xs font-bold text-textPrimary">
            {cals.length === 0
              ? 'No semester dates configured — attendance posting is not locked.'
              : windowToday?.semester && !windowToday?.message
                ? `Today is inside ${windowToday.semester.academic_year} semester ${windowToday.semester.semester} (${windowToday.semester.start_date} → ${windowToday.semester.end_date}).`
                : 'Today is outside every configured semester — faculty need your approval to post attendance.'}
          </p>
          <p className="text-[11px] text-textMuted">{cals.length} semester range{cals.length === 1 ? '' : 's'} configured. Set start and end dates in the Holiday &amp; Academic Calendar.</p>
        </div>
        <button onClick={() => navigate('/admin/dashboard?tab=holidays')} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine hover:bg-surface-2">
          Edit semester dates
        </button>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-borderLine">
          <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary mr-auto">Late-posting requests</h3>
          {(['Pending', 'Approved', 'Rejected', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${status === s ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Class date</th><th className="py-2.5 px-3">Class</th><th className="py-2.5 px-3">Faculty</th>
                <th className="py-2.5 px-3">Reason</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={6} className="py-8 text-center text-textMuted">Loading…</td></tr>
                : requests.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-textMuted">No {status === 'all' ? '' : status.toLowerCase()} requests.</td></tr>
                : requests.map(r => (
                  <tr key={r.id}>
                    <td className="py-2.5 px-4 font-bold text-textPrimary">{String(r.session_date).slice(0, 10)}</td>
                    <td className="py-2.5 px-3 text-textSecondary">{r.subject_name} · {r.semester_label} {r.section}<div className="text-[10px] text-textMuted">{r.department}</div></td>
                    <td className="py-2.5 px-3 text-textSecondary">{r.faculty_name || r.faculty_email}</td>
                    <td className="py-2.5 px-3 text-textSecondary max-w-[220px]">{r.reason || '—'}</td>
                    <td className="py-2.5 px-3">
                      <Pill tone={r.status === 'Approved' ? 'green' : r.status === 'Rejected' ? 'red' : 'amber'}>{r.status}</Pill>
                      {r.reject_reason && <div className="text-[10px] text-textMuted mt-0.5">{r.reject_reason}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.status === 'Pending' && rejecting !== r.id && (
                        <div className="inline-flex gap-1.5">
                          <button disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'approve' })}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Approve</button>
                          <button onClick={() => setRejecting(r.id)} className="px-2.5 py-1 rounded-lg border border-borderLine font-bold inline-flex items-center gap-1"><XCircle className="w-3 h-3" />Reject</button>
                        </div>
                      )}
                      {rejecting === r.id && (
                        <div className="inline-flex gap-1.5 items-center">
                          <input autoFocus value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason" className={`${input} w-36`} />
                          <button disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'reject', reason: rejectReason })}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold">Reject</button>
                          <button onClick={() => setRejecting(null)} className="p-1 text-textMuted"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Parent alert messages ──────────────────────────────────────────────────
function ParentDispatch() {
  const [date, setDate] = useState(today());
  const [result, setResult] = useState<any>(null);
  const run = useMutation({
    mutationFn: (send: boolean) => api.dispatchParentAlerts(date, send),
    onSuccess: (r: any) => setResult(r),
  });
  React.useEffect(() => { run.mutate(false); /* preview on open and when the date changes */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const disabled = result?.provider === 'disabled';
  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-wrap items-center gap-2`}>
        <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className={input} />
        {result && <span className="text-[11px] text-textSecondary">{result.absent_students} students absent · {result.with_parent_phone} with a parent phone number</span>}
        <button disabled={disabled || run.isPending || !result?.with_parent_phone} onClick={() => run.mutate(true)}
          className="ml-auto px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40">
          {run.isPending ? 'Working…' : `Send ${result?.with_parent_phone || 0} messages`}
        </button>
      </div>
      {disabled && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
          <b>Phone messaging is not switched on yet.</b> Parents already see these alerts when they log in. To also send SMS/WhatsApp, a messaging gateway
          (MESSAGING_WEBHOOK_URL) must be configured, and the API needs outbound internet access (a NAT gateway), which the current AWS setup does not have.
        </div>
      )}
      {result?.sent > 0 && <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 text-xs font-semibold">{result.sent} messages sent.</div>}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-xs text-left">
          <thead><tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
            <th className="py-2.5 px-4">Student</th><th className="py-2.5 px-3">Parent phone</th><th className="py-2.5 px-3">Message</th></tr></thead>
          <tbody className="divide-y divide-borderLine">
            {!result ? <tr><td colSpan={3} className="py-8 text-center text-textMuted">Loading…</td></tr>
              : result.preview.length === 0 ? <tr><td colSpan={3} className="py-8 text-center text-textMuted">No absences recorded on {date}.</td></tr>
              : result.preview.map((m: any) => (
                <tr key={m.roll_number}>
                  <td className="py-2 px-4"><div className="font-mono font-bold text-textPrimary">{m.roll_number}</div><div className="text-textSecondary">{m.name}</div></td>
                  <td className={`py-2 px-3 ${m.to ? 'text-textSecondary' : 'text-red-600'}`}>{m.to || 'missing'}</td>
                  <td className="py-2 px-3 text-textSecondary">{m.text}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export const AttendanceControlPage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (['posted', 'not-posted', 'edit', 'remove', 'calendar', 'parents'].includes(searchParams.get('view') || '') ? searchParams.get('view') : 'not-posted') as View;
  const lockedDept = user?.role === 'hod' && user?.department ? user.department : '';

  const [date, setDate] = useState(today());
  const [department, setDepartment] = useState(lockedDept || 'All');
  const [semester, setSemester] = useState('All');
  const [section, setSection] = useState('All');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DaySlot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  // remove-class form
  const [rmScope, setRmScope] = useState<'class' | 'section' | 'department'>('class');
  const [rmSlotKey, setRmSlotKey] = useState('');
  const [rmReason, setRmReason] = useState('');
  const [rmDeletePosted, setRmDeletePosted] = useState(false);

  const { data, isLoading, isError, error } = useQuery<DayStatus>({
    queryKey: ['adminDayStatus', date, department, semester, section],
    queryFn: () => api.getAttendanceDayStatus({ date, department, semester, section }),
    enabled: view !== 'calendar',
  });

  const notify = (ok: boolean, text: string) => { setFlash({ ok, text }); setTimeout(() => setFlash(null), 5000); };
  const refresh = () => qc.invalidateQueries({ queryKey: ['adminDayStatus'] });

  const del = useMutation({
    mutationFn: (sessionId: string) => api.deleteAttendanceSession(sessionId),
    onSuccess: () => { setConfirmDelete(null); refresh(); notify(true, 'Attendance for that class was deleted. It now shows as not posted.'); },
    onError: (e: any) => notify(false, e.message || 'Delete failed'),
  });
  const cancel = useMutation({
    mutationFn: (body: Parameters<typeof api.cancelClass>[0]) => api.cancelClass(body),
    onSuccess: (r: any) => { setRmReason(''); setRmSlotKey(''); refresh(); notify(true, r?.message || 'Class removed.'); },
    onError: (e: any) => notify(false, e.message || 'Could not remove class'),
  });
  const undo = useMutation({
    mutationFn: (id: number) => api.undoCancelledClass(id),
    onSuccess: () => { refresh(); notify(true, 'Class restored.'); },
    onError: (e: any) => notify(false, e.message || 'Undo failed'),
  });

  const slots = data?.slots ?? [];
  const semesters = useMemo(() => Array.from(new Set(slots.map(s => s.semester_label))).sort(), [slots]);
  const sections = useMemo(() => Array.from(new Set(slots.map(s => s.section))).sort(), [slots]);
  const q = search.trim().toLowerCase();
  const matches = (s: DaySlot) => !q || [s.subject_name, s.faculty_name, s.faculty_email, s.section, s.department].some(v => String(v || '').toLowerCase().includes(q));
  const posted = slots.filter(s => s.status === 'posted' && matches(s));
  const notPosted = slots.filter(s => s.status === 'not_posted' && matches(s));
  const noClass = slots.filter(s => s.status === 'no_class' && matches(s));

  const keyOf = (s: DaySlot) => `${s.department}|${s.semester_label}|${s.section}|${s.subject_name}|${s.period_start}`;
  const rmChoice = slots.find(s => !s.extra_class && keyOf(s) === rmSlotKey) || null;

  const submitRemove = () => {
    if (!rmReason.trim()) return notify(false, 'Please enter a reason.');
    if (rmScope === 'class') {
      if (!rmChoice) return notify(false, 'Choose the class to remove.');
      cancel.mutate({ date, department: rmChoice.department, semester_label: rmChoice.semester_label, section: rmChoice.section,
        subject_name: rmChoice.subject_name, period_start: rmChoice.period_start, reason: rmReason, delete_posted: rmDeletePosted });
    } else {
      if (department === 'All') return notify(false, 'Choose a department first.');
      if (rmScope === 'section' && (semester === 'All' || section === 'All')) return notify(false, 'Choose the semester and section first.');
      cancel.mutate({ date, department, semester_label: rmScope === 'section' ? semester : undefined, section: rmScope === 'section' ? section : undefined,
        reason: rmReason, delete_posted: rmDeletePosted });
    }
  };

  const meta = VIEW_TITLES[view];
  const setView = (v: View) => { const p = new URLSearchParams(searchParams); p.set('view', v); setSearchParams(p); };

  const slotRow = (s: DaySlot, actions: React.ReactNode) => (
    <tr key={`${keyOf(s)}|${s.session?.session_id || ''}`} className="hover:bg-surface-2/50">
      <td className="py-2.5 px-4 font-bold text-textPrimary whitespace-nowrap">P{s.period_start}{s.num_periods > 1 ? `–${s.period_start + s.num_periods - 1}` : ''}</td>
      <td className="py-2.5 px-3">
        <div className="font-bold text-textPrimary">{s.subject_name} {s.extra_class && <Pill tone="indigo">extra class</Pill>}</div>
        <div className="text-[10px] text-textMuted">{s.department} · {s.semester_label} · Sec {s.section}{s.room_no ? ` · Room ${s.room_no}` : ''}</div>
      </td>
      <td className="py-2.5 px-3 text-textSecondary">{s.faculty_name || s.faculty_email || '—'}</td>
      <td className="py-2.5 px-3">
        {s.status === 'posted' && s.session && <span className="font-bold text-textPrimary tabular-nums">{s.session.present_count}/{s.session.total_marked} <span className="text-textMuted font-normal">present</span></span>}
        {s.status === 'not_posted' && <Pill tone="amber"><Clock className="w-3 h-3" />Pending</Pill>}
        {s.status === 'no_class' && <Pill tone="slate">No class{ s.no_class?.reason ? ` · ${s.no_class.reason.replace(/^Removed by \w+: /, '')}` : ''}</Pill>}
      </td>
      <td className="py-2.5 px-4 text-right whitespace-nowrap">{actions}</td>
    </tr>
  );

  const table = (rows: DaySlot[], empty: string, actions: (s: DaySlot) => React.ReactNode) => (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
              <th className="py-2.5 px-4">Period</th><th className="py-2.5 px-3">Class</th><th className="py-2.5 px-3">Faculty</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLine">
            {isLoading ? <tr><td colSpan={5} className="py-10 text-center text-textMuted"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>
              : isError ? <tr><td colSpan={5} className="py-10 text-center text-red-600">{(error as Error)?.message || 'Could not load attendance.'}</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-textMuted">{empty}</td></tr>
              : rows.map(s => slotRow(s, actions(s)))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const postedActions = (s: DaySlot) => (
    <div className="inline-flex gap-1.5">
      <button onClick={() => setEditing(s)} className="px-2.5 py-1 rounded-lg border border-borderLine font-bold inline-flex items-center gap-1 hover:bg-surface-2">
        <Edit2 className="w-3 h-3" />{view === 'edit' ? 'Edit' : 'View / Edit'}
      </button>
      {confirmDelete === s.session!.session_id ? (
        <>
          <button disabled={del.isPending} onClick={() => del.mutate(s.session!.session_id)} className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold">Confirm delete</button>
          <button onClick={() => setConfirmDelete(null)} className="p-1 text-textMuted"><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <button onClick={() => setConfirmDelete(s.session!.session_id)} className="px-2.5 py-1 rounded-lg border border-borderLine font-bold text-red-600 inline-flex items-center gap-1 hover:bg-red-500/5">
          <Trash2 className="w-3 h-3" />Delete
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-brand-primary" />{meta.title}</h1>
          <p className="text-xs text-textMuted mt-0.5">{meta.sub}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(VIEW_TITLES) as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg ${view === v ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>
              {VIEW_TITLES[v].title.replace('Academic Calendar & ', '')}
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <div className={`px-4 py-2.5 rounded-xl text-xs font-semibold ${flash.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}>{flash.text}</div>
      )}

      {view === 'parents' ? <ParentDispatch /> : view === 'calendar' ? <LatePostApprovals /> : (
        <>
          <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
            <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className={input} />
            <select value={department} disabled={Boolean(lockedDept)} onChange={e => { setDepartment(e.target.value); setSemester('All'); setSection('All'); }} className={input}>
              <option value="All">All departments</option>
              {VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={semester} onChange={e => setSemester(e.target.value)} className={input}>
              <option value="All">All semesters</option>
              {semesters.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={section} onChange={e => setSection(e.target.value)} className={input}>
              <option value="All">All sections</option>
              {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Subject, faculty…" className={`${input} pl-8 w-full`} />
            </div>
            {data && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="text-textMuted font-semibold">{data.day_of_week}</span>
                <Pill tone="green">{data.summary.posted} posted</Pill>
                <Pill tone="amber">{data.summary.not_posted} not posted</Pill>
                <Pill tone="slate">{data.summary.no_class} no class</Pill>
                {data.summary.extra > 0 && <Pill tone="indigo">{data.summary.extra} extra</Pill>}
              </div>
            )}
          </div>

          {data?.holiday && (
            <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-2">
              <CalendarX className="w-4 h-4" />{data.date} is a holiday ({data.holiday}). Classes are not expected.
            </div>
          )}

          {(view === 'posted' || view === 'edit') && table(posted, 'No attendance has been posted for this date and filter.', postedActions)}

          {view === 'not-posted' && (
            <>
              {table(notPosted, data && data.summary.scheduled === 0 ? `No timetable classes on ${data.day_of_week}.` : 'Every scheduled class has attendance posted. 🎉', s => (
                <button onClick={() => { setView('remove'); setRmScope('class'); setRmSlotKey(keyOf(s)); }}
                  className="px-2.5 py-1 rounded-lg border border-borderLine font-bold inline-flex items-center gap-1 hover:bg-surface-2">
                  <CalendarX className="w-3 h-3" />Remove class
                </button>
              ))}
              {noClass.length > 0 && (
                <>
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-textMuted pt-2">Removed / no class ({noClass.length})</h3>
                  {table(noClass, '', s => (
                    <button disabled={undo.isPending} onClick={() => s.no_class && undo.mutate(s.no_class.id)}
                      className="px-2.5 py-1 rounded-lg border border-borderLine font-bold inline-flex items-center gap-1 hover:bg-surface-2">
                      <RotateCcw className="w-3 h-3" />Restore
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {view === 'remove' && (
            <div className="grid lg:grid-cols-[minmax(0,420px)_1fr] gap-4 items-start">
              <div className={`${card} p-4 space-y-3`}>
                <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">Remove for {date}</h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['class', 'One class'], ['section', 'Whole section'], ['department', 'Whole department']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setRmScope(k)}
                      className={`px-2 py-2 text-[11px] font-bold rounded-xl border ${rmScope === k ? 'border-brand-primary text-brand-primary bg-brand-primary/5' : 'border-borderLine text-textSecondary'}`}>{label}</button>
                  ))}
                </div>
                {rmScope === 'class' && (
                  <select value={rmSlotKey} onChange={e => setRmSlotKey(e.target.value)} className={`${input} w-full`}>
                    <option value="">Choose a class on {data?.day_of_week || 'this day'}…</option>
                    {slots.filter(s => !s.extra_class && s.status !== 'no_class').map(s => (
                      <option key={keyOf(s)} value={keyOf(s)}>
                        P{s.period_start} · {s.subject_name} · {s.semester_label} {s.section} · {s.department}{s.status === 'posted' ? ' (posted)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {rmScope !== 'class' && (
                  <p className="text-[11px] text-textMuted">
                    Uses the filters above: <b>{department === 'All' ? 'choose a department' : department}</b>
                    {rmScope === 'section' && <> · <b>{semester === 'All' ? 'choose semester' : semester}</b> · <b>{section === 'All' ? 'choose section' : `Section ${section}`}</b></>}.
                  </p>
                )}
                <textarea value={rmReason} onChange={e => setRmReason(e.target.value)} rows={2} placeholder="Reason (e.g. Mid exams, college event)" className={`${input} w-full`} />
                <label className="flex items-start gap-2 text-[11px] text-textSecondary">
                  <input type="checkbox" checked={rmDeletePosted} onChange={e => setRmDeletePosted(e.target.checked)} className="mt-0.5" />
                  Also delete attendance already posted for these classes on {date}
                </label>
                <button disabled={cancel.isPending} onClick={submitRemove}
                  className="w-full px-3 py-2.5 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {cancel.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarX className="w-3.5 h-3.5" />} Remove class
                </button>
              </div>
              <div className="space-y-2">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-textMuted flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Removed on {date} ({noClass.length})</h3>
                {table(noClass, 'Nothing removed for this date.', s => (
                  <button disabled={undo.isPending} onClick={() => s.no_class && undo.mutate(s.no_class.id)}
                    className="px-2.5 py-1 rounded-lg border border-borderLine font-bold inline-flex items-center gap-1 hover:bg-surface-2">
                    <RotateCcw className="w-3 h-3" />Restore
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && editing.session && <SessionEditor slot={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default AttendanceControlPage;
