import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, CheckCircle2, Circle, Download, FileText, Loader2, Plus, Send, Trash2, Users, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ReportPdf, fmtD } from '../../lib/pdfReport';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;
const lbl = 'text-[11px] font-bold text-textSecondary uppercase tracking-wider';
const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
const EDITORS = ['hod', 'admin', 'principal', 'director'];
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const d10 = (v: any) => String(v || '').slice(0, 10);
const nid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const time12 = (t?: string | null) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

const STATUS: Record<string, string> = {
  scheduled: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};
const Chip = ({ s }: { s: string }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS[s] || ''}`}>{s === 'published' ? 'Minutes published' : s === 'scheduled' ? 'Scheduled' : 'Cancelled'}</span>;

export async function meetingPdf(m: any, kind: 'minutes' | 'notice') {
  const r = await ReportPdf.create(m.department);
  const when = `${fmtD(m.meeting_date)}${m.start_time ? `, ${time12(m.start_time)}${m.end_time ? ` – ${time12(m.end_time)}` : ''}` : ''}`;
  if (kind === 'notice') {
    r.refLine('', `Date: ${fmtD(m.created_at || today())}`);
    r.title('Notice of Meeting', m.meeting_type);
    r.para(`A ${m.meeting_type.toLowerCase()} of the Department of ${m.department} is scheduled as per the details below. All members are requested to attend without fail.`);
    r.keyValues([['Meeting', m.title], ['Date & Time', when], ['Venue', m.venue], ['Chaired by', m.chair_name]]);
    r.heading('Agenda');
    r.table(['S.No', 'Agenda item'], (m.agenda || []).map((a: any, i: number) => [i + 1, a.item]), { 0: { cellWidth: 14 } });
    r.heading('Members');
    r.table(['S.No', 'Name', 'Designation'], (m.attendees || []).map((a: any, i: number) => [i + 1, a.name, a.designation || '']), { 0: { cellWidth: 14 } });
    r.signatures([{ role: 'HOD', name: `Department of ${m.department}` }]);
    r.save(`Meeting Notice - ${m.title} - ${d10(m.meeting_date)}.pdf`);
    return;
  }
  r.refLine(m.ref_no ? `Ref: ${m.ref_no}` : 'DRAFT', `Date: ${fmtD(m.published_at || m.meeting_date)}`);
  r.title('Minutes of the Meeting', `${m.meeting_type} — ${m.title}`);
  const present = (m.attendees || []).filter((a: any) => a.present === true);
  const absent = (m.attendees || []).filter((a: any) => a.present === false);
  r.keyValues([['Date & Time', when], ['Venue', m.venue], ['Chaired by', m.chair_name], ['Members present', `${present.length} of ${(m.attendees || []).length}`], ['Special invitees', m.special_invitees]]);
  r.heading('Members Present');
  r.table(['S.No', 'Name', 'Designation', 'Signature'], present.map((a: any, i: number) => [i + 1, a.name, a.designation || '', '']), { 0: { cellWidth: 14 }, 3: { cellWidth: 40, minCellHeight: 8 } });
  if (absent.length) { r.heading('Leave of Absence'); r.para(absent.map((a: any) => a.name).join(', ')); }
  r.heading('Agenda, Discussion & Resolutions');
  r.table(['S.No', 'Agenda item', 'Discussion', 'Resolution'], (m.agenda || []).map((a: any, i: number) => [i + 1, a.item, a.discussion || '', a.resolution || '']),
    { 0: { cellWidth: 12 }, 1: { cellWidth: 42, fontStyle: 'bold' } });
  if ((m.action_items || []).length) {
    r.heading('Action Taken / To Be Taken');
    r.table(['S.No', 'Action', 'Responsibility', 'Target date', 'Status'], m.action_items.map((a: any, i: number) => [i + 1, a.task, a.owner_name || '', fmtD(a.due_date), a.status === 'done' ? `Done ${fmtD(a.done_on)}` : 'Open']),
      { 0: { cellWidth: 12 }, 3: { cellWidth: 24 }, 4: { cellWidth: 24 } });
  }
  if (m.notes) { r.heading('Other Points'); r.para(m.notes); }
  r.para('The meeting concluded with a vote of thanks.');
  r.signatures([{ role: 'Convener', name: '' }, { role: 'HOD', name: `Department of ${m.department}` }, { role: 'Principal' }]);
  r.save(`Minutes - ${m.title} - ${d10(m.meeting_date)}.pdf`);
}

function MeetingEditor({ meeting, department, onBack }: { meeting: any | null; department: string | null; onBack: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: meta } = useQuery({ queryKey: ['meetingMeta'], queryFn: () => api.getMeetingMeta() });
  const [dept, setDept] = useState<string>(meeting?.department || department || '');
  const { data: faculty = [] } = useQuery<any[]>({ queryKey: ['deptFaculty', dept], queryFn: () => api.getDepartmentFaculty(dept), enabled: !!dept });
  const [m, setM] = useState<any>(() => meeting ? { ...meeting, meeting_date: d10(meeting.meeting_date) } : {
    title: '', meeting_type: 'Department Meeting', meeting_date: today(), start_time: '15:30', end_time: '16:30', venue: '', chair_name: user?.role === 'hod' ? (user?.name || 'HOD') : '',
    agenda: [{ id: nid('g'), item: 'Confirmation of the minutes of the previous meeting', discussion: '', resolution: '' }], attendees: [], action_items: [], special_invitees: '', notes: '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [step, setStep] = useState<'details' | 'minutes'>(meeting && d10(meeting.meeting_date) <= today() ? 'minutes' : 'details');
  const [savedId, setSavedId] = useState<number | null>(meeting?.id || null);
  const set = (patch: any) => setM((x: any) => ({ ...x, ...patch }));
  const invited = new Set((m.attendees || []).map((a: any) => a.email));
  const linked = faculty.filter((x: any) => x.email && !String(x.email).startsWith('pending_'));

  useEffect(() => { // first time: invite the whole department
    if (!meeting && linked.length && !(m.attendees || []).length) {
      set({ attendees: linked.map((x: any) => ({ email: x.email, name: x.name, designation: x.designation || '', present: null })) });
    }
  }, [linked.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (notify: boolean) => {
      const body = { ...m, department: dept, notify };
      if (savedId) return api.updateMeeting(savedId, body);
      return api.createMeeting(body);
    },
    onSuccess: (r: any, notify) => { setSavedId(r.id); setM({ ...r, meeting_date: d10(r.meeting_date) }); qc.invalidateQueries({ queryKey: ['meetings'] }); setMsg({ ok: true, text: notify && !meeting ? 'Meeting scheduled — invited members were notified.' : 'Saved.' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });
  const publish = useMutation({
    mutationFn: async () => { await api.updateMeeting(savedId!, { ...m, department: dept }); return api.publishMeeting(savedId!); },
    onSuccess: (r: any) => { setM({ ...r, meeting_date: d10(r.meeting_date) }); qc.invalidateQueries({ queryKey: ['meetings'] }); setMsg({ ok: true, text: `Minutes published as ${r.ref_no}. Members and action owners were notified.` }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelMeeting(savedId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetings'] }); onBack(); },
  });

  const agendaRow = (i: number, patch: any) => set({ agenda: m.agenda.map((a: any, j: number) => (j === i ? { ...a, ...patch } : a)) });
  const actionRow = (i: number, patch: any) => set({ action_items: m.action_items.map((a: any, j: number) => (j === i ? { ...a, ...patch } : a)) });
  const presentCount = (m.attendees || []).filter((a: any) => a.present === true).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-black text-textPrimary">{m.title || 'New meeting'}</h1>
          <p className="text-xs text-textSecondary">{dept || 'Choose a department'}{m.ref_no ? ` · ${m.ref_no}` : ''}</p>
        </div>
        {m.status && <Chip s={m.status} />}
        {savedId && <button className={btnGhost} onClick={() => meetingPdf({ ...m, department: dept }, 'notice')}><FileText className="w-3.5 h-3.5 inline mr-1" />Notice PDF</button>}
        {savedId && <button className={btnGhost} onClick={() => meetingPdf({ ...m, department: dept }, 'minutes')}><Download className="w-3.5 h-3.5 inline mr-1" />Minutes PDF</button>}
      </div>
      {msg && <div className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold w-fit">
        <button onClick={() => setStep('details')} className={`px-4 py-2 ${step === 'details' ? 'bg-brand-primary text-white' : 'text-textSecondary'}`}>1 · Agenda &amp; members</button>
        <button onClick={() => setStep('minutes')} disabled={!savedId} className={`px-4 py-2 disabled:opacity-40 ${step === 'minutes' ? 'bg-brand-primary text-white' : 'text-textSecondary'}`}>2 · Attendance &amp; minutes</button>
      </div>

      {step === 'details' ? (
        <div className="space-y-4">
          <div className={`${card} p-4 grid md:grid-cols-3 gap-3`}>
            {!department && (
              <div className="space-y-1"><p className={lbl}>Department</p>
                <select className={`${input} w-full`} value={dept} disabled={!!savedId} onChange={e => { setDept(e.target.value); set({ attendees: [] }); }}>
                  <option value="">Choose…</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
            )}
            <div className="space-y-1 md:col-span-2"><p className={lbl}>Title</p><input className={`${input} w-full`} value={m.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Department meeting — mid-semester review" /></div>
            <div className="space-y-1"><p className={lbl}>Type</p><select className={`${input} w-full`} value={m.meeting_type} onChange={e => set({ meeting_type: e.target.value })}>{(meta?.types || ['Department Meeting']).map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="space-y-1"><p className={lbl}>Date</p><input type="date" className={`${input} w-full`} value={m.meeting_date} onChange={e => set({ meeting_date: e.target.value })} /></div>
            <div className="space-y-1"><p className={lbl}>From – to</p><div className="flex gap-1"><input type="time" className={`${input} flex-1`} value={m.start_time || ''} onChange={e => set({ start_time: e.target.value })} /><input type="time" className={`${input} flex-1`} value={m.end_time || ''} onChange={e => set({ end_time: e.target.value })} /></div></div>
            <div className="space-y-1"><p className={lbl}>Venue</p><input className={`${input} w-full`} value={m.venue || ''} onChange={e => set({ venue: e.target.value })} placeholder="HOD chamber / Seminar hall" /></div>
            <div className="space-y-1"><p className={lbl}>Chaired by</p><input className={`${input} w-full`} value={m.chair_name || ''} onChange={e => set({ chair_name: e.target.value })} /></div>
            <div className="space-y-1"><p className={lbl}>Special invitees</p><input className={`${input} w-full`} value={m.special_invitees || ''} onChange={e => set({ special_invitees: e.target.value })} placeholder="Industry expert, alumni…" /></div>
          </div>

          <div className={`${card} p-4 space-y-2`}>
            <p className="text-sm font-black text-textPrimary">Agenda</p>
            {m.agenda.map((a: any, i: number) => (
              <div key={a.id} className="flex gap-2 items-center">
                <span className="w-6 text-xs font-bold text-textMuted">{i + 1}.</span>
                <input className={`${input} flex-1`} value={a.item} onChange={e => agendaRow(i, { item: e.target.value })} placeholder="Agenda item" />
                <button onClick={() => set({ agenda: m.agenda.filter((_: any, j: number) => j !== i) })} className="p-1 text-textMuted hover:text-rose-600" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button className="text-[11px] font-bold text-brand-primary" onClick={() => set({ agenda: [...m.agenda, { id: nid('g'), item: '', discussion: '', resolution: '' }] })}><Plus className="w-3 h-3 inline" /> Add agenda item</button>
          </div>

          <div className={`${card} p-4 space-y-2`}>
            <div className="flex items-center justify-between"><p className="text-sm font-black text-textPrimary">Members invited ({m.attendees.length})</p>
              <div className="flex gap-2 text-[11px] font-bold">
                <button className="text-brand-primary" onClick={() => set({ attendees: linked.map((x: any) => ({ email: x.email, name: x.name, designation: x.designation || '', present: null })) })}>All faculty</button>
                <button className="text-textMuted" onClick={() => set({ attendees: [] })}>None</button></div></div>
            {!dept ? <p className="text-xs text-textMuted">Choose the department first.</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                {linked.map((x: any) => (
                  <label key={x.email} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${invited.has(x.email) ? 'border-brand-primary/50 bg-brand-soft/30' : 'border-borderLine'}`}>
                    <input type="checkbox" checked={invited.has(x.email)} onChange={() => set({ attendees: invited.has(x.email) ? m.attendees.filter((a: any) => a.email !== x.email) : [...m.attendees, { email: x.email, name: x.name, designation: x.designation || '', present: null }] })} />
                    <span className="truncate"><b className="text-textPrimary">{x.name}</b> <span className="text-textMuted">{x.designation || ''}</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!savedId ? (<>
              <button className={btnPrimary} disabled={save.isPending || !m.title || !dept} onClick={() => save.mutate(true)}><Send className="w-3.5 h-3.5 inline mr-1" />Schedule &amp; notify members</button>
              <button className={btnGhost} disabled={save.isPending || !m.title || !dept} onClick={() => save.mutate(false)}>Save without notifying</button>
            </>) : (<>
              <button className={btnPrimary} disabled={save.isPending} onClick={() => save.mutate(false)}>Save</button>
              <button className={btnGhost} onClick={() => setStep('minutes')}>Next: attendance &amp; minutes →</button>
              {m.status === 'scheduled' && <button className={`${btnGhost} text-rose-600 ml-auto`} onClick={() => window.confirm('Cancel this meeting and inform the members?') && cancel.mutate()}><XCircle className="w-3.5 h-3.5 inline mr-1" />Cancel meeting</button>}
            </>)}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`${card} p-4 space-y-2`}>
            <div className="flex items-center justify-between"><p className="text-sm font-black text-textPrimary">Attendance · {presentCount} present</p>
              <button className="text-[11px] font-bold text-brand-primary" onClick={() => set({ attendees: m.attendees.map((a: any) => ({ ...a, present: true })) })}>Mark all present</button></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {m.attendees.map((a: any, i: number) => (
                <div key={a.email || i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-borderLine text-xs">
                  <span className="flex-1 truncate"><b className="text-textPrimary">{a.name}</b></span>
                  {(['P', 'A'] as const).map(k => {
                    const on = k === 'P' ? a.present === true : a.present === false;
                    return <button key={k} onClick={() => set({ attendees: m.attendees.map((x: any, j: number) => (j === i ? { ...x, present: k === 'P' } : x)) })}
                      className={`w-7 h-6 rounded-md text-[11px] font-black ${on ? (k === 'P' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-surface-2 text-textMuted'}`}>{k}</button>;
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className={`${card} p-4 space-y-3`}>
            <p className="text-sm font-black text-textPrimary">Minutes — discussion &amp; resolution per agenda item</p>
            {m.agenda.map((a: any, i: number) => (
              <div key={a.id} className="rounded-xl border border-borderLine p-3 space-y-2">
                <p className="text-xs font-black text-textPrimary">{i + 1}. {a.item}</p>
                <textarea rows={2} className={`${input} w-full`} value={a.discussion || ''} onChange={e => agendaRow(i, { discussion: e.target.value })} placeholder="Discussion" />
                <textarea rows={1} className={`${input} w-full`} value={a.resolution || ''} onChange={e => agendaRow(i, { resolution: e.target.value })} placeholder="Resolution / decision" />
              </div>
            ))}
            <button className="text-[11px] font-bold text-brand-primary" onClick={() => set({ agenda: [...m.agenda, { id: nid('g'), item: 'Any other matter with the permission of the chair', discussion: '', resolution: '' }] })}><Plus className="w-3 h-3 inline" /> Add item raised in the meeting</button>
          </div>

          <div className={`${card} p-4 space-y-2`}>
            <p className="text-sm font-black text-textPrimary">Action items</p>
            {m.action_items.map((a: any, i: number) => (
              <div key={a.id} className="grid md:grid-cols-[1fr_200px_140px_auto] gap-2 items-center">
                <input className={input} value={a.task} onChange={e => actionRow(i, { task: e.target.value })} placeholder="What needs to be done" />
                <select className={input} value={a.owner_email || ''} onChange={e => { const o = m.attendees.find((x: any) => x.email === e.target.value); actionRow(i, { owner_email: e.target.value || null, owner_name: o?.name || null }); }}>
                  <option value="">Responsible…</option>{m.attendees.filter((x: any) => x.email).map((x: any) => <option key={x.email} value={x.email}>{x.name}</option>)}
                </select>
                <input type="date" className={input} value={a.due_date || ''} onChange={e => actionRow(i, { due_date: e.target.value || null })} />
                <button onClick={() => set({ action_items: m.action_items.filter((_: any, j: number) => j !== i) })} className="p-1 text-textMuted hover:text-rose-600" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button className="text-[11px] font-bold text-brand-primary" onClick={() => set({ action_items: [...m.action_items, { id: nid('a'), task: '', owner_email: null, owner_name: null, due_date: null, status: 'open' }] })}><Plus className="w-3 h-3 inline" /> Add action item</button>
            <textarea rows={2} className={`${input} w-full`} value={m.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder="Other points (optional)" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} disabled={save.isPending} onClick={() => save.mutate(false)}>Save draft</button>
            <button className={btnPrimary} disabled={publish.isPending || m.status === 'cancelled'} onClick={() => publish.mutate()}>
              {m.status === 'published' ? 'Update published minutes' : 'Publish minutes & notify'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingView({ m, onBack }: { m: any; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1"><h1 className="text-lg font-black text-textPrimary">{m.title}</h1>
          <p className="text-xs text-textSecondary">{m.meeting_type} · {fmtD(m.meeting_date)}{m.start_time ? ` · ${time12(m.start_time)}` : ''}{m.venue ? ` · ${m.venue}` : ''}</p></div>
        <Chip s={m.status} />
        <button className={btnGhost} onClick={() => meetingPdf(m, m.status === 'published' ? 'minutes' : 'notice')}><Download className="w-3.5 h-3.5 inline mr-1" />{m.status === 'published' ? 'Minutes PDF' : 'Notice PDF'}</button>
      </div>
      <div className={`${card} p-4 space-y-3`}>
        {(m.agenda || []).map((a: any, i: number) => (
          <div key={a.id}><p className="text-xs font-black text-textPrimary">{i + 1}. {a.item}</p>
            {m.status === 'published' && <>{a.discussion && <p className="text-xs text-textSecondary mt-0.5">{a.discussion}</p>}{a.resolution && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5"><b>Resolved:</b> {a.resolution}</p>}</>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || '';
  const editor = EDITORS.includes(role);
  const ownDept = role === 'hod' ? user?.department || null : null;
  const [deptFilter, setDeptFilter] = useState('All');
  const { data: meetings = [], isLoading } = useQuery<any[]>({ queryKey: ['meetings', deptFilter], queryFn: () => api.getMeetings(ownDept ? undefined : deptFilter) });
  const { data: actions = [] } = useQuery<any[]>({ queryKey: ['myMeetingActions'], queryFn: () => api.getMyMeetingActions() });
  const toggle = useMutation({
    mutationFn: ({ id, aid, done }: { id: number; aid: string; done: boolean }) => api.setMeetingAction(id, aid, done ? 'done' : 'open'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myMeetingActions'] }); qc.invalidateQueries({ queryKey: ['meetings'] }); },
  });
  const [open, setOpen] = useState<any | 'new' | null>(null);
  const openActions = useMemo(() => meetings.filter(m => m.status === 'published').flatMap(m => (m.action_items || []).filter((a: any) => a.status !== 'done').map((a: any) => ({ ...a, meeting: m }))), [meetings]);

  if (open) {
    return editor
      ? <MeetingEditor meeting={open === 'new' ? null : open} department={ownDept} onBack={() => setOpen(null)} />
      : <MeetingView m={open} onBack={() => setOpen(null)} />;
  }
  const upcoming = meetings.filter(m => m.status === 'scheduled' && d10(m.meeting_date) >= today());
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-black text-textPrimary">Meetings &amp; Minutes</h1>
          <p className="text-xs text-textSecondary">{editor ? 'Schedule meetings, record attendance and minutes, track action items, download the minutes PDF.' : 'Meetings you are invited to and the actions assigned to you.'}</p></div>
        <div className="flex gap-2">
          {editor && !ownDept && <select className={input} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}><option value="All">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>}
          {editor && <button className={btnPrimary} onClick={() => setOpen('new')}><CalendarPlus className="w-3.5 h-3.5 inline mr-1" />New meeting</button>}
        </div>
      </div>

      {actions.length > 0 && (
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-sm font-black text-textPrimary">My action items</p>
          {actions.map((x: any) => (
            <div key={`${x.meeting_id}-${x.action.id}`} className="flex items-center gap-3 text-xs">
              <button onClick={() => toggle.mutate({ id: x.meeting_id, aid: x.action.id, done: x.action.status !== 'done' })} aria-label="Toggle done">
                {x.action.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-textMuted" />}</button>
              <span className={`flex-1 ${x.action.status === 'done' ? 'line-through text-textMuted' : 'text-textPrimary font-semibold'}`}>{x.action.task}</span>
              <span className="text-textMuted">{x.title}</span>
              {x.action.due_date && <span className={`font-bold ${x.action.status !== 'done' && x.action.due_date < today() ? 'text-rose-600' : 'text-textSecondary'}`}>due {fmtD(x.action.due_date)}</span>}
            </div>
          ))}
        </div>
      )}

      {editor && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Meetings this year', meetings.filter(m => m.status !== 'cancelled').length], ['Upcoming', upcoming.length], ['Minutes pending', meetings.filter(m => m.status === 'scheduled' && d10(m.meeting_date) < today()).length], ['Open action items', openActions.length]].map(([l, v]) => (
            <div key={String(l)} className={`${card} p-3`}><p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{l}</p><p className="text-2xl font-black text-textPrimary">{v}</p></div>
          ))}
        </div>
      )}

      {isLoading ? <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-textMuted" /></div>
        : meetings.length === 0 ? <div className={`${card} p-10 text-center text-xs text-textMuted`}>No meetings yet.</div>
        : (
          <div className={`${card} divide-y divide-borderLine`}>
            {meetings.map(m => {
              const minutesDue = m.status === 'scheduled' && d10(m.meeting_date) < today();
              return (
                <button key={m.id} onClick={() => setOpen(m)} className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-surface-2/60">
                  <div className="w-12 text-center shrink-0"><p className="text-lg font-black text-textPrimary leading-none">{d10(m.meeting_date).slice(8)}</p>
                    <p className="text-[10px] font-bold text-textMuted uppercase">{new Date(d10(m.meeting_date) + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</p></div>
                  <div className="flex-1 min-w-[200px]"><p className="text-sm font-bold text-textPrimary">{m.title}</p>
                    <p className="text-[11px] text-textSecondary">{m.meeting_type}{!ownDept ? ` · ${m.department}` : ''} · <Users className="w-3 h-3 inline" /> {(m.attendees || []).length}{m.ref_no ? ` · ${m.ref_no}` : ''}</p></div>
                  {minutesDue && editor && <span className="text-[10px] font-black text-amber-600">Record minutes</span>}
                  <Chip s={m.status} />
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}
