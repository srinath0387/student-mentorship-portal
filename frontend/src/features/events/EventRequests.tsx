/**
 * Event requests — to organize an event or to attend one outside. Faculty fill it once and send it for approval:
 * HOD recommends (or returns), then the Principal approves, does not approve, or returns. The forms download in the
 * department format with the decisions printed in the HOD / Principal rows; after the event the report starts from it.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, FileText, NotebookPen, Pencil, Plus, Save, Send, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { fmtD } from '../../lib/pdfReport';
import { BouncingDots } from '../../components/common/BouncingDots';
import { NumberedListInput } from '../../components/common/NumberedListInput';
import { Approval, ER_PARTICIPANTS, ER_TYPES, EventRequest, budgetTotal, downloadRequestDoc, durationHours, emptyRequest, inWords, normalizeRequest, reportPrefill, rupees } from './eventRequestDocs';
import { attendPdf, attendWord } from './eventRequestAttend';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;
const lbl = 'block text-[11px] font-bold text-textSecondary uppercase tracking-wider';
const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
const PRINCIPAL_ROLES = ['principal', 'director'];

export const REQUEST_STATUS: Record<string, [string, string]> = {
  draft: ['Draft', 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'],
  submitted: ['With HOD', 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'],
  recommended: ['With Principal', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'],
  rejected: ['Not approved', 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'],
  returned: ['Returned', 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'],
};
export const RequestChip = ({ s, by }: { s: string; by?: string | null }) => {
  const [t, c] = REQUEST_STATUS[s] || REQUEST_STATUS.draft!;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${c}`}>{t}{s === 'returned' && by ? ` by ${by}` : ''}</span>;
};
const when = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

function Chips({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(o => {
        const on = value.includes(o);
        return <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o) : [...value, o])}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${on ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>{on ? '☑' : '☐'} {o}</button>;
      })}
    </div>
  );
}
const Field = ({ id, label, children, className = '' }: { id?: string; label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1 ${className}`}><label htmlFor={id} className={lbl}>{label}</label>{children}</div>
);

/** Organize: Permission & Venue + Budget (department Word templates). Attend: request to attend (Word / PDF). */
function DownloadButtons({ r, department, author, approval, size = 'md' }: { r: EventRequest; department: string; author: string; approval?: Approval | null; size?: 'sm' | 'md' }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (k: string, fn: () => Promise<any>) => {
    setBusy(k); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e.message || 'Could not build the file'); } finally { setBusy(null); }
  };
  const cls = size === 'sm' ? 'px-2 py-1 rounded-lg text-[11px] font-bold border border-borderLine text-textSecondary hover:bg-surface-2 disabled:opacity-50' : btnGhost;
  const b = (k: string, label: string, fn: () => Promise<any>) => (
    <button key={k} className={cls} disabled={!!busy} onClick={e => { e.stopPropagation(); go(k, fn); }}>
      {busy === k ? <BouncingDots size="xs" /> : <FileText className="w-3.5 h-3.5 inline mr-1" />}{label}</button>
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {r.kind === 'attend'
        ? [b('aw', 'Request to attend (Word)', () => attendWord(r, department, approval)), b('ap', 'PDF', () => attendPdf(r, department, approval))]
        : [b('permission', 'Permission & Venue', () => downloadRequestDoc('permission', r, department, author, approval)),
          b('budget', 'Budget', () => downloadRequestDoc('budget', r, department, author, approval))]}
      {err && <span className="text-[11px] font-bold text-rose-600">{err}</span>}
    </span>
  );
}

/** Where the request is in Faculty → HOD → Principal, with remarks, and the decision buttons for whoever it is waiting on */
function ApprovalPanel({ x, onChanged, onSubmit, submitting }: { x: any; onChanged: (row: any) => void; onSubmit?: () => void; submitting?: boolean }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const s = x?.status || 'draft';
  const act = async (action: string) => {
    setBusy(action); setErr(null);
    try { onChanged(await api.reviewEventRequest(x.id, action, remarks)); setRemarks(''); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const step = (done: boolean, current: boolean, title: string, sub?: string, bad?: boolean) => (
    <li className="flex-1 min-w-[150px]">
      <div className={`h-1.5 rounded-full ${bad ? 'bg-rose-500' : done ? 'bg-emerald-500' : current ? 'bg-sky-500' : 'bg-surface-2'}`} />
      <p className={`mt-1.5 text-xs font-black ${bad ? 'text-rose-700 dark:text-rose-300' : done ? 'text-textPrimary' : current ? 'text-sky-700 dark:text-sky-300' : 'text-textMuted'}`}>{title}</p>
      {sub && <p className="text-[11px] text-textSecondary">{sub}</p>}
    </li>
  );
  const hodDone = ['recommended', 'approved', 'rejected'].includes(s);
  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-textPrimary mr-auto">Approval</p>
        <RequestChip s={s} by={x?.returned_by} />
      </div>
      <ol className="flex flex-wrap gap-3">
        {step(s !== 'draft', s === 'draft' || s === 'returned', s === 'draft' ? 'Not sent yet' : 'Sent for approval', x?.submitted_at ? when(x.submitted_at) : undefined)}
        {step(hodDone, s === 'submitted', hodDone ? 'Recommended by HOD' : 'HOD recommendation', hodDone ? [x.hod_name, when(x.hod_at)].filter(Boolean).join(' · ') : undefined)}
        {step(s === 'approved', s === 'recommended', s === 'approved' ? 'Approved by Principal' : s === 'rejected' ? 'Not approved by Principal' : 'Principal approval',
          ['approved', 'rejected'].includes(s) ? [x.principal_name, when(x.principal_at)].filter(Boolean).join(' · ') : undefined, s === 'rejected')}
      </ol>
      {(x?.hod_remarks || x?.principal_remarks) && (
        <div className="space-y-1 text-xs">
          {x.hod_remarks && <p><b className="text-textPrimary">HOD:</b> <span className="text-textSecondary">{x.hod_remarks}</span></p>}
          {x.principal_remarks && <p><b className="text-textPrimary">Principal:</b> <span className="text-textSecondary">{x.principal_remarks}</span></p>}
        </div>
      )}
      {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
      {onSubmit && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnPrimary} disabled={submitting} onClick={onSubmit}>{submitting ? <BouncingDots size="xs" /> : <Send className="w-3.5 h-3.5 inline mr-1" />}{s === 'returned' ? 'Send again for approval' : 'Send for approval'}</button>
          <span className="text-[11px] text-textMuted">Goes to your HOD, then the Principal. You can't edit it while it is with them.</span>
        </div>
      )}
      {(x?.can_hod || x?.can_principal) && (
        <div className="space-y-2 rounded-xl bg-surface-2/50 p-3">
          <label htmlFor="er-remarks" className={lbl}>{x.can_hod ? 'Your recommendation / remarks' : 'Your remarks'} {x.can_hod ? '(needed to return)' : '(needed to return or not approve)'}</label>
          <textarea id="er-remarks" rows={2} className={`${input} w-full`} value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder={x.can_hod ? 'e.g. Recommended — relevant to III year electives' : 'e.g. Approved. Keep expenses within the sanctioned amount.'} />
          <div className="flex flex-wrap gap-2">
            {x.can_hod ? <>
              <button className={`${btnPrimary} bg-emerald-600`} disabled={!!busy} onClick={() => act('recommend')}>{busy === 'recommend' ? <BouncingDots size="xs" /> : <Check className="w-3.5 h-3.5 inline mr-1" />}Recommend to Principal</button>
              <button className={btnGhost} disabled={!!busy || !remarks.trim()} onClick={() => act('return')}><Undo2 className="w-3.5 h-3.5 inline mr-1" />Return for changes</button>
            </> : <>
              <button className={`${btnPrimary} bg-emerald-600`} disabled={!!busy} onClick={() => act('approve')}>{busy === 'approve' ? <BouncingDots size="xs" /> : <Check className="w-3.5 h-3.5 inline mr-1" />}Approve</button>
              <button className={btnGhost} disabled={!!busy || !remarks.trim()} onClick={() => act('return')}><Undo2 className="w-3.5 h-3.5 inline mr-1" />Return for changes</button>
              <button className={`${btnGhost} text-rose-600`} disabled={!!busy || !remarks.trim()} onClick={() => act('reject')}><X className="w-3.5 h-3.5 inline mr-1" />Not approve</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

function RequestForm({ initial, kind: newKind, onDone, onCancel, onReport, onOpenReport }: {
  initial: any | null; kind: 'organize' | 'attend'; onDone: () => void; onCancel: () => void; onReport: (prefill: any) => void; onOpenReport: (id: number) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ownDept = ['hod', 'faculty', 'coordinator'].includes(user?.role || '') ? user?.department || '' : '';
  const [r, setR] = useState<EventRequest>(() => initial ? normalizeRequest({ kind: initial.kind, ...initial.data }) : emptyRequest(user?.name || '', ownDept, newKind));
  const [dept, setDept] = useState<string>(initial?.department || ownDept || 'CSE');
  const [saved, setSaved] = useState<any | null>(initial);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (p: Partial<EventRequest>) => { setR(x => ({ ...x, ...p })); setMsg(null); };
  const setOrg = (i: number, p: any) => set({ organizers: r.organizers.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const setRp = (i: number, p: any) => set({ resource_persons: r.resource_persons.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const total = budgetTotal(r);
  const canEdit = !saved || !!saved.can_edit;
  const department = saved?.department || dept;
  const attend = r.kind === 'attend';
  const refresh = () => qc.invalidateQueries({ queryKey: ['eventRequests'] });

  const persist = async () => {
    const body = { ...r, department: dept };
    const res = saved ? await api.updateEventRequest(saved.id, body) : await api.createEventRequest(body);
    setSaved(res); refresh();
    return res;
  };
  const save = async () => {
    if (!r.title.trim()) { setMsg({ ok: false, text: 'Enter the name of the event.' }); return; }
    setBusy('save');
    try { await persist(); setMsg({ ok: true, text: 'Saved. Send it for approval when it is ready.' }); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };
  const submit = async () => {
    if (!r.title.trim()) { setMsg({ ok: false, text: 'Enter the name of the event.' }); return; }
    if (!r.from_date) { setMsg({ ok: false, text: 'Enter the event dates before sending it for approval.' }); return; }
    setBusy('submit');
    try {
      const row = await persist();
      const out = await api.submitEventRequest(row.id);
      setSaved(out); refresh();
      setMsg({ ok: true, text: out.status === 'recommended' ? 'Sent to the Principal for approval.' : 'Sent to your HOD. You will get an alert when it is recommended or approved.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };
  const approval: Approval | null = saved;
  const ro = !canEdit;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[200px]"><h1 className="text-lg font-black text-textPrimary">{saved ? r.title || 'Event request' : attend ? 'Request to attend an event' : 'Request to organize an event'}</h1>
          <p className="text-xs text-textSecondary">{attend ? 'For an FDP, conference or workshop at another institution. Your HOD recommends it, then the Principal approves.'
            : 'Fill once: the Permission & Venue form and the Budget form come from it. Your HOD recommends it, then the Principal approves.'}</p></div>
      </div>
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      {saved && <ApprovalPanel x={saved} onChanged={row => { setSaved(row); refresh(); }} onSubmit={saved.can_edit ? submit : undefined} submitting={busy === 'submit'} />}

      {canEdit && (
        <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold w-fit" role="radiogroup" aria-label="Organize or attend">
          {([['organize', 'We are organizing it'], ['attend', 'I / we will attend it']] as const).map(([k, t]) => (
            <button key={k} role="radio" aria-checked={r.kind === k} onClick={() => set({ kind: k })}
              className={`px-3 py-1.5 ${r.kind === k ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>{t}</button>
          ))}
        </div>
      )}

      <fieldset disabled={ro} className="space-y-4">
        <div className={`${card} p-4 space-y-4`}>
          <p className="text-sm font-black text-textPrimary">Event</p>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <Field id="er-title" label="Name of the event"><input id="er-title" className={`${input} w-full`} value={r.title} onChange={e => set({ title: e.target.value })}
              placeholder={attend ? 'e.g. AICTE ATAL FDP on Generative AI' : 'e.g. Two-Day Workshop on Generative AI'} /></Field>
            {!ownDept && !saved ? (
              <Field id="er-dept" label="Department"><select id="er-dept" className={`${input} w-full`} value={dept} onChange={e => setDept(e.target.value)}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></Field>
            ) : <Field label="Department"><p className="text-xs font-bold text-textPrimary py-1.5">{department}</p></Field>}
          </div>
          <Field label="Event type"><Chips label="Event type" options={ER_TYPES} value={r.types} onChange={v => set({ types: v })} /></Field>
          {r.types.includes('Other') && <Field id="er-other" label="Other (type)"><input id="er-other" className={`${input} w-full md:w-80`} value={r.other_type} onChange={e => set({ other_type: e.target.value })} /></Field>}
          {attend && (
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)] gap-3">
              <Field id="er-host" label="Organised by (host institution / organisation)"><input id="er-host" className={`${input} w-full`} value={r.host} onChange={e => set({ host: e.target.value })} placeholder="e.g. NIT Warangal / AICTE / IEEE" /></Field>
              <Field id="er-place" label="Place"><input id="er-place" className={`${input} w-full`} value={r.place} onChange={e => set({ place: e.target.value })} placeholder="City, State" /></Field>
              <Field id="er-mode" label="Mode"><select id="er-mode" className={`${input} w-full`} value={r.mode} onChange={e => set({ mode: e.target.value })}><option value="">—</option>{['Offline', 'Online', 'Hybrid'].map(m => <option key={m}>{m}</option>)}</select></Field>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field id="er-fd" label="From date"><input id="er-fd" type="date" className={`${input} w-full`} value={r.from_date} onChange={e => set({ from_date: e.target.value, to_date: r.to_date && r.to_date >= e.target.value ? r.to_date : e.target.value })} /></Field>
            <Field id="er-td" label="To date"><input id="er-td" type="date" min={r.from_date || undefined} className={`${input} w-full`} value={r.to_date} onChange={e => set({ to_date: e.target.value })} /></Field>
            <Field id="er-ft" label="From time"><input id="er-ft" type="time" className={`${input} w-full`} value={r.from_time} onChange={e => set({ from_time: e.target.value })} /></Field>
            <Field id="er-tt" label="To time"><input id="er-tt" type="time" className={`${input} w-full`} value={r.to_time} onChange={e => set({ to_time: e.target.value })} /></Field>
          </div>
          {durationHours(r) && <p className="text-[11px] text-textMuted -mt-2">Duration: {durationHours(r)} hours. This goes into the event report.</p>}
          {[0, 1].map(i => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field id={`er-o${i}n`} label={attend ? `Faculty attending ${i + 1} — name` : `Faculty organizer ${i + 1} — name`}><input id={`er-o${i}n`} className={`${input} w-full`} value={r.organizers[i]!.name} onChange={e => setOrg(i, { name: e.target.value })} /></Field>
              <Field id={`er-o${i}d`} label="Designation"><input id={`er-o${i}d`} className={`${input} w-full`} value={r.organizers[i]!.designation} onChange={e => setOrg(i, { designation: e.target.value })} placeholder="Assistant Professor" /></Field>
              <Field id={`er-o${i}p`} label="Department"><input id={`er-o${i}p`} className={`${input} w-full`} value={r.organizers[i]!.department} onChange={e => setOrg(i, { department: e.target.value })} /></Field>
            </div>
          ))}
          <Field id="er-obj" label={attend ? 'Purpose / relevance to the department' : 'Objective(s) of the event'}><NumberedListInput id="er-obj" rows={3} className={`${input} w-full`} value={r.objectives} onChange={v => set({ objectives: v })} placeholder="1. …" /></Field>
          {!attend && <>
            <Field label="Target participants"><Chips label="Target participants" options={ER_PARTICIPANTS} value={r.participants} onChange={v => set({ participants: v })} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
              <Field id="er-tg" label="Target year, branch, dept."><input id="er-tg" className={`${input} w-full`} value={r.target} onChange={e => set({ target: e.target.value })} placeholder="III B.Tech, CSE (Data Science), Sections A & B" /></Field>
              <Field id="er-n" label="Expected no. of participants"><input id="er-n" type="number" min={0} className={`${input} w-full`} value={r.expected_count} onChange={e => set({ expected_count: e.target.value })} /></Field>
            </div>
          </>}
        </div>

        {attend ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${card} p-4 space-y-3`}>
              <Field id="er-out" label="Expected benefit to the department"><NumberedListInput id="er-out" rows={3} className={`${input} w-full`} value={r.expected_outcomes} onChange={v => set({ expected_outcomes: v })} placeholder="1. e.g. Will introduce a lab on LLM fine-tuning" /></Field>
              <Field id="er-od" label="On-duty days requested" className="md:w-48"><input id="er-od" className={`${input} w-full`} value={r.od_days} onChange={e => set({ od_days: e.target.value })} placeholder="e.g. 3" /></Field>
            </div>
            <div className={`${card} p-4 space-y-3`}>
              <p className="text-sm font-black text-textPrimary">Expenses requested</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([['registration_fee', 'Registration fee (Rs)'], ['travel', 'Travel, TA/DA (Rs)'], ['lodging', 'Lodging and boarding (Rs)']] as const).map(([k, l]) => (
                  <Field key={k} id={`er-${k}`} label={l}><input id={`er-${k}`} type="number" min={0} className={`${input} w-full tabular-nums`} value={r[k]} onChange={e => set({ [k]: e.target.value } as any)} /></Field>
                ))}
              </div>
              <div className="rounded-xl bg-surface-2/60 px-3 py-2">
                <p className={lbl}>Total requested</p>
                <p className="text-lg font-black text-textPrimary tabular-nums">{total ? rupees(total) : '—'}</p>
                {total > 0 && <p className="text-xs text-textSecondary">Rupees {inWords(total)} Only</p>}
              </div>
            </div>
          </div>
        ) : <>
          <div className={`${card} p-4 space-y-3`}>
            <p className="text-sm font-black text-textPrimary">Resource persons</p>
            {[0, 1].map(i => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field id={`er-r${i}n`} label={`Resource person ${i + 1} — name`}><input id={`er-r${i}n`} className={`${input} w-full`} value={r.resource_persons[i]!.name} onChange={e => setRp(i, { name: e.target.value })} /></Field>
                <Field id={`er-r${i}d`} label="Designation"><input id={`er-r${i}d`} className={`${input} w-full`} value={r.resource_persons[i]!.designation} onChange={e => setRp(i, { designation: e.target.value })} /></Field>
                <Field id={`er-r${i}o`} label="Organisation"><input id={`er-r${i}o`} className={`${input} w-full`} value={r.resource_persons[i]!.organization} onChange={e => setRp(i, { organization: e.target.value })} /></Field>
                <Field id={`er-r${i}c`} label="Email / phone"><input id={`er-r${i}c`} className={`${input} w-full`} value={r.resource_persons[i]!.contact} onChange={e => setRp(i, { contact: e.target.value })} /></Field>
              </div>
            ))}
            <Field id="er-exp" label="Total professional experience in years" className="md:w-64"><input id="er-exp" className={`${input} w-full`} value={r.experience} onChange={e => set({ experience: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${card} p-4 space-y-3`}>
              <p className="text-sm font-black text-textPrimary">For the Permission &amp; Venue form</p>
              <Field id="er-top" label="Proposed topic(s), one per line"><textarea id="er-top" rows={3} className={`${input} w-full resize-y`} value={r.topics} onChange={e => set({ topics: e.target.value })} /></Field>
              <Field id="er-v" label="Venue requested"><input id="er-v" className={`${input} w-full`} value={r.venue} onChange={e => set({ venue: e.target.value })} placeholder="Seminar Hall, Block C" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="er-vfd" label="Venue from date"><input id="er-vfd" type="date" className={`${input} w-full`} value={r.venue_from_date} onChange={e => set({ venue_from_date: e.target.value })} /></Field>
                <Field id="er-vtd" label="Venue to date"><input id="er-vtd" type="date" className={`${input} w-full`} value={r.venue_to_date} onChange={e => set({ venue_to_date: e.target.value })} /></Field>
                <Field id="er-vft" label="Venue from time"><input id="er-vft" type="time" className={`${input} w-full`} value={r.venue_from_time} onChange={e => set({ venue_from_time: e.target.value })} /></Field>
                <Field id="er-vtt" label="Venue to time"><input id="er-vtt" type="time" className={`${input} w-full`} value={r.venue_to_time} onChange={e => set({ venue_to_time: e.target.value })} /></Field>
              </div>
              <p className="text-[11px] text-textMuted">Leave the venue dates and times empty to use the event's.</p>
              <Field id="er-out" label="Expected outcomes"><NumberedListInput id="er-out" rows={3} className={`${input} w-full`} value={r.expected_outcomes} onChange={v => set({ expected_outcomes: v })} placeholder="1. Outcome" /></Field>
            </div>
            <div className={`${card} p-4 space-y-3`}>
              <p className="text-sm font-black text-textPrimary">For the Budget form</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([['honorarium', 'Honorarium (Rs)'], ['travel', 'Travel (Rs)'], ['lodging', 'Lodging and boarding (Rs)']] as const).map(([k, l]) => (
                  <Field key={k} id={`er-${k}`} label={l}><input id={`er-${k}`} type="number" min={0} className={`${input} w-full tabular-nums`} value={r[k]} onChange={e => set({ [k]: e.target.value } as any)} /></Field>
                ))}
              </div>
              <div className="rounded-xl bg-surface-2/60 px-3 py-2">
                <p className={lbl}>Total budget requested</p>
                <p className="text-lg font-black text-textPrimary tabular-nums">{total ? rupees(total) : '—'}</p>
                {total > 0 && <p className="text-xs text-textSecondary">Rupees {inWords(total)} Only</p>}
              </div>
            </div>
          </div>
        </>}
      </fieldset>

      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        {canEdit && <button className={btnGhost} disabled={!!busy} onClick={save}>{busy === 'save' ? <BouncingDots size="xs" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}{saved ? 'Save changes' : 'Save as draft'}</button>}
        {canEdit && !saved && <button className={btnPrimary} disabled={!!busy} onClick={submit}>{busy === 'submit' ? <BouncingDots size="xs" /> : <Send className="w-3.5 h-3.5 inline mr-1" />}Save &amp; send for approval</button>}
        <span className="text-[11px] font-bold text-textSecondary">Download:</span>
        <DownloadButtons r={r} department={department} author={r.organizers[0]!.name || user?.name || ''} approval={approval} />
        {saved?.event_id ? <button className={`${btnGhost} ml-auto`} onClick={() => onOpenReport(saved.event_id)}><ExternalLink className="w-3.5 h-3.5 inline mr-1" />Open the event report</button>
          : saved?.is_author && <button className={`${btnGhost} ml-auto`} onClick={() => onReport(reportPrefill(r, department, saved.id))}><NotebookPen className="w-3.5 h-3.5 inline mr-1" />Write the event report</button>}
        {!canEdit && !saved?.is_author && <button className={`${btnGhost} ml-auto`} onClick={onDone}>Close</button>}
      </div>
    </div>
  );
}

const REPORT_CHIP: Record<string, [string, string]> = {
  draft: ['Report: draft', 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'],
  submitted: ['Report: with HOD', 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'],
  approved: ['Report approved', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'],
  returned: ['Report returned', 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'],
};
const todayIso = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/** The request's report: open it when written; otherwise "Write report" (author), flagged once the event is over */
function ReportState({ x, r, onReport, onOpenReport }: { x: any; r: EventRequest; onReport: (prefill: any) => void; onOpenReport: (id: number) => void }) {
  const small = 'px-2 py-1 rounded-lg text-[11px] font-bold';
  if (x.event_id) {
    const [t, c] = REPORT_CHIP[x.report_status] || REPORT_CHIP.draft!;
    return <button className={`${small} ${c}`} onClick={ev => { ev.stopPropagation(); onOpenReport(x.event_id); }}>{t} <ExternalLink className="w-3 h-3 inline" /></button>;
  }
  if (x.status === 'rejected') return null;
  const over = !!(r.to_date || r.from_date) && (r.to_date || r.from_date) < todayIso();
  return (
    <span className="inline-flex items-center gap-1.5">
      {over && <span className={`${small} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300`}>Report due</span>}
      {x.is_author && over && <button className={`${small} bg-brand-primary text-white`} onClick={ev => { ev.stopPropagation(); onReport(reportPrefill(r, x.department, x.id)); }}>
        <NotebookPen className="w-3 h-3 inline mr-1" />Write report</button>}
    </span>
  );
}

/** The Requests view inside Events & Activities */
export function EventRequestsView({ onReport, onOpenReport, initialDept = 'All' }: { onReport: (prefill: any) => void; onOpenReport: (id: number) => void; initialDept?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || '';
  const ownDept = ['hod', 'faculty', 'coordinator'].includes(role) ? user?.department || null : null;
  const decides = ['hod', 'admin', ...PRINCIPAL_ROLES].includes(role);
  const [dept, setDept] = useState(initialDept);
  const [show, setShow] = useState<'all' | 'waiting'>('all');
  const [open, setOpen] = useState<{ mode: 'new'; kind: 'organize' | 'attend' } | { mode: 'edit'; r: any } | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const { data: list = [], isLoading, error } = useQuery<any[]>({ queryKey: ['eventRequests', ownDept ? 'own' : dept], queryFn: () => api.getEventRequests(ownDept ? undefined : dept) });
  const canCreate = !['principal', 'director', 'management'].includes(role);
  const waiting = list.filter(x => x.can_hod || x.can_principal);
  const shown = show === 'waiting' ? waiting : list;

  if (open) return <RequestForm initial={open.mode === 'edit' ? open.r : null} kind={open.mode === 'new' ? open.kind : 'organize'} onCancel={() => setOpen(null)} onDone={() => setOpen(null)} onReport={onReport} onOpenReport={onOpenReport} />;

  const del = async (id: number) => {
    try { await api.deleteEventRequest(id); qc.invalidateQueries({ queryKey: ['eventRequests'] }); } finally { setConfirmDel(null); }
  };
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="p-3 border-b border-borderLine flex flex-wrap items-center gap-2">
        <p className="text-xs text-textSecondary flex-1 min-w-[220px]">
          {PRINCIPAL_ROLES.includes(role) ? 'Requests recommended by the HODs come to you for approval.'
            : 'Before an event — organizing or attending: fill the request, send it to your HOD and the Principal, and download the forms.'}</p>
        {decides && (
          <div className="flex rounded-lg border border-borderLine overflow-hidden text-[11px] font-bold">
            <button onClick={() => setShow('all')} className={`px-2.5 py-1 ${show === 'all' ? 'bg-brand-primary text-white' : 'text-textSecondary'}`}>All</button>
            <button onClick={() => setShow('waiting')} className={`px-2.5 py-1 ${show === 'waiting' ? 'bg-brand-primary text-white' : waiting.length ? 'text-amber-700 dark:text-amber-300' : 'text-textSecondary'}`}>Waiting for me ({waiting.length})</button>
          </div>
        )}
        {!ownDept && <select aria-label="Department" className={input} value={dept} onChange={e => setDept(e.target.value)}><option value="All">All departments</option>{(DEPTS.includes(dept) || dept === 'All' ? DEPTS : [dept, ...DEPTS]).map(d => <option key={d}>{d}</option>)}</select>}
        {canCreate && <>
          <button className={btnPrimary} onClick={() => setOpen({ mode: 'new', kind: 'organize' })}><Plus className="w-3.5 h-3.5 inline mr-1" />Organize an event</button>
          <button className={btnGhost} onClick={() => setOpen({ mode: 'new', kind: 'attend' })}><Plus className="w-3.5 h-3.5 inline mr-1" />Attend an event</button>
        </>}
      </div>
      {isLoading ? <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>
        : error ? <div className="p-10 text-center text-xs text-rose-600">{(error as any).message}</div>
        : shown.length === 0 ? <div className="p-10 text-center text-xs text-textMuted">{show === 'waiting' ? 'Nothing is waiting for you.' : 'No requests yet.'}</div>
        : (
          <div className="divide-y divide-borderLine">
            {shown.map(x => {
              const r = normalizeRequest({ kind: x.kind, ...x.data });
              const total = budgetTotal(r);
              const mine = x.can_hod || x.can_principal;
              return (
                <div key={x.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-surface-2/60 cursor-pointer ${mine ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`} onClick={() => setOpen({ mode: 'edit', r: x })}>
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-bold text-textPrimary flex flex-wrap items-center gap-2">
                      {x.title}
                      {r.kind === 'attend' && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">Attending</span>}
                      <RequestChip s={x.status} by={x.returned_by} />
                      {mine && <span className="text-[10px] font-black text-amber-700 dark:text-amber-300">Your decision needed</span>}
                    </p>
                    <p className="text-[11px] text-textSecondary">
                      {r.types.filter(t => t !== 'Other').concat(r.types.includes('Other') && r.other_type ? [r.other_type] : []).join(', ') || 'Type not set'}
                      {' · '}{x.start_date ? fmtD(x.start_date) : 'date not set'}{r.kind === 'attend' ? (r.host ? ` · ${r.host}` : '') : r.venue ? ` · ${r.venue}` : ''}{total ? ` · ${rupees(total)}` : ''}
                      {!ownDept ? ` · ${x.department}` : ''} · by {x.created_by_name || x.created_by}
                    </p>
                  </div>
                  <ReportState x={x} r={r} onReport={onReport} onOpenReport={onOpenReport} />
                  <DownloadButtons size="sm" r={r} department={x.department} author={r.organizers[0]!.name || x.created_by_name || ''} approval={x} />
                  {x.can_edit && <button className="p-1.5 rounded-lg text-textSecondary hover:bg-surface-2" aria-label={`Edit ${x.title}`} onClick={e => { e.stopPropagation(); setOpen({ mode: 'edit', r: x }); }}><Pencil className="w-3.5 h-3.5" /></button>}
                  {((x.is_author && x.status !== 'approved') || role === 'hod' || role === 'admin') && (confirmDel === x.id ? (
                    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-600 text-white" onClick={() => del(x.id)}>Delete</button>
                      <button className="px-2 py-1 rounded-lg text-[11px] font-bold border border-borderLine text-textSecondary" onClick={() => setConfirmDel(null)}>Keep</button>
                    </span>
                  ) : <button className="p-1.5 rounded-lg text-textMuted hover:text-rose-600" aria-label={`Delete ${x.title}`} onClick={e => { e.stopPropagation(); setConfirmDel(x.id); }}><Trash2 className="w-3.5 h-3.5" /></button>)}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
