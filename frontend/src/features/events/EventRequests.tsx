/**
 * Event requests — fill the department's pre-event form once, download the Permission & Venue form and the
 * Budget form in the department's Word templates, and after the event start the report from it.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, NotebookPen, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { fmtD } from '../../lib/pdfReport';
import { BouncingDots } from '../../components/common/BouncingDots';
import { NumberedListInput } from '../../components/common/NumberedListInput';
import { ER_PARTICIPANTS, ER_TYPES, EventRequest, budgetTotal, downloadRequestDoc, emptyRequest, inWords, normalizeRequest, reportPrefill, rupees } from './eventRequestDocs';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;
const lbl = 'block text-[11px] font-bold text-textSecondary uppercase tracking-wider';
const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];

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

function DownloadButtons({ r, department, author, size = 'md' }: { r: EventRequest; department: string; author: string; size?: 'sm' | 'md' }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (k: 'permission' | 'budget') => {
    setBusy(k); setErr(null);
    try { await downloadRequestDoc(k, r, department, author); } catch (e: any) { setErr(e.message || 'Could not build the Word file'); } finally { setBusy(null); }
  };
  const cls = size === 'sm' ? 'px-2 py-1 rounded-lg text-[11px] font-bold border border-borderLine text-textSecondary hover:bg-surface-2 disabled:opacity-50' : btnGhost;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button className={cls} disabled={!!busy} onClick={e => { e.stopPropagation(); go('permission'); }}>
        {busy === 'permission' ? <BouncingDots size="xs" /> : <FileText className="w-3.5 h-3.5 inline mr-1" />}Permission &amp; Venue</button>
      <button className={cls} disabled={!!busy} onClick={e => { e.stopPropagation(); go('budget'); }}>
        {busy === 'budget' ? <BouncingDots size="xs" /> : <FileText className="w-3.5 h-3.5 inline mr-1" />}Budget</button>
      {err && <span className="text-[11px] font-bold text-rose-600">{err}</span>}
    </span>
  );
}

function RequestForm({ initial, onDone, onCancel, onReport }: { initial: any | null; onDone: () => void; onCancel: () => void; onReport: (prefill: any) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ownDept = ['hod', 'faculty', 'coordinator'].includes(user?.role || '') ? user?.department || '' : '';
  const [r, setR] = useState<EventRequest>(() => initial ? normalizeRequest(initial.data) : emptyRequest(user?.name || '', ownDept));
  const [dept, setDept] = useState<string>(initial?.department || ownDept || 'CSE');
  const [saved, setSaved] = useState<any | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (p: Partial<EventRequest>) => { setR(x => ({ ...x, ...p })); setMsg(null); };
  const setOrg = (i: number, p: any) => set({ organizers: r.organizers.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const setRp = (i: number, p: any) => set({ resource_persons: r.resource_persons.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const total = budgetTotal(r);
  const canEdit = !initial || initial.can_edit;
  const department = saved?.department || dept;

  const save = async () => {
    if (!r.title.trim()) { setMsg({ ok: false, text: 'Enter the name of the event.' }); return; }
    setBusy(true);
    try {
      const body = { ...r, department: dept };
      const res = saved ? await api.updateEventRequest(saved.id, body) : await api.createEventRequest(body);
      setSaved(res); qc.invalidateQueries({ queryKey: ['eventRequests'] });
      setMsg({ ok: true, text: 'Saved. Download the forms below.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const ro = !canEdit;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[200px]"><h1 className="text-lg font-black text-textPrimary">{initial ? r.title || 'Event request' : 'New event request'}</h1>
          <p className="text-xs text-textSecondary">One form, two downloads: the Permission &amp; Venue request and the Budget request, in the department format.</p></div>
      </div>
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      <fieldset disabled={ro} className="space-y-4">
        <div className={`${card} p-4 space-y-4`}>
          <p className="text-sm font-black text-textPrimary">Event</p>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <Field id="er-title" label="Name of the event"><input id="er-title" className={`${input} w-full`} value={r.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Two-Day Workshop on Generative AI" /></Field>
            {!ownDept && !initial ? (
              <Field id="er-dept" label="Department"><select id="er-dept" className={`${input} w-full`} value={dept} onChange={e => setDept(e.target.value)}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></Field>
            ) : <Field label="Department"><p className="text-xs font-bold text-textPrimary py-1.5">{department}</p></Field>}
          </div>
          <Field label="Event type"><Chips label="Event type" options={ER_TYPES} value={r.types} onChange={v => set({ types: v })} /></Field>
          {r.types.includes('Other') && <Field id="er-other" label="Other (type)"><input id="er-other" className={`${input} w-full md:w-80`} value={r.other_type} onChange={e => set({ other_type: e.target.value })} /></Field>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field id="er-fd" label="From date"><input id="er-fd" type="date" className={`${input} w-full`} value={r.from_date} onChange={e => set({ from_date: e.target.value, to_date: r.to_date && r.to_date >= e.target.value ? r.to_date : e.target.value })} /></Field>
            <Field id="er-td" label="To date"><input id="er-td" type="date" min={r.from_date || undefined} className={`${input} w-full`} value={r.to_date} onChange={e => set({ to_date: e.target.value })} /></Field>
            <Field id="er-ft" label="From time"><input id="er-ft" type="time" className={`${input} w-full`} value={r.from_time} onChange={e => set({ from_time: e.target.value })} /></Field>
            <Field id="er-tt" label="To time"><input id="er-tt" type="time" className={`${input} w-full`} value={r.to_time} onChange={e => set({ to_time: e.target.value })} /></Field>
          </div>
          {[0, 1].map(i => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field id={`er-o${i}n`} label={`Faculty organizer ${i + 1} — name`}><input id={`er-o${i}n`} className={`${input} w-full`} value={r.organizers[i].name} onChange={e => setOrg(i, { name: e.target.value })} /></Field>
              <Field id={`er-o${i}d`} label="Designation"><input id={`er-o${i}d`} className={`${input} w-full`} value={r.organizers[i].designation} onChange={e => setOrg(i, { designation: e.target.value })} placeholder="Assistant Professor" /></Field>
              <Field id={`er-o${i}p`} label="Department"><input id={`er-o${i}p`} className={`${input} w-full`} value={r.organizers[i].department} onChange={e => setOrg(i, { department: e.target.value })} /></Field>
            </div>
          ))}
          <Field id="er-obj" label="Objective(s) of the event"><NumberedListInput id="er-obj" rows={3} className={`${input} w-full`} value={r.objectives} onChange={v => set({ objectives: v })} placeholder="1. Objective" /></Field>
          <Field label="Target participants"><Chips label="Target participants" options={ER_PARTICIPANTS} value={r.participants} onChange={v => set({ participants: v })} /></Field>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <Field id="er-tg" label="Target year, branch, dept."><input id="er-tg" className={`${input} w-full`} value={r.target} onChange={e => set({ target: e.target.value })} placeholder="III B.Tech, CSE (Data Science), Sections A & B" /></Field>
            <Field id="er-n" label="Expected no. of participants"><input id="er-n" type="number" min={0} className={`${input} w-full`} value={r.expected_count} onChange={e => set({ expected_count: e.target.value })} /></Field>
          </div>
        </div>

        <div className={`${card} p-4 space-y-3`}>
          <p className="text-sm font-black text-textPrimary">Resource persons</p>
          {[0, 1].map(i => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field id={`er-r${i}n`} label={`Resource person ${i + 1} — name`}><input id={`er-r${i}n`} className={`${input} w-full`} value={r.resource_persons[i].name} onChange={e => setRp(i, { name: e.target.value })} /></Field>
              <Field id={`er-r${i}d`} label="Designation"><input id={`er-r${i}d`} className={`${input} w-full`} value={r.resource_persons[i].designation} onChange={e => setRp(i, { designation: e.target.value })} /></Field>
              <Field id={`er-r${i}o`} label="Organisation"><input id={`er-r${i}o`} className={`${input} w-full`} value={r.resource_persons[i].organization} onChange={e => setRp(i, { organization: e.target.value })} /></Field>
              <Field id={`er-r${i}c`} label="Email / phone"><input id={`er-r${i}c`} className={`${input} w-full`} value={r.resource_persons[i].contact} onChange={e => setRp(i, { contact: e.target.value })} /></Field>
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
      </fieldset>

      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        {canEdit && <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? <BouncingDots size="xs" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}{saved ? 'Save changes' : 'Save request'}</button>}
        <span className="text-[11px] font-bold text-textSecondary">Download (Word):</span>
        <DownloadButtons r={r} department={department} author={r.organizers[0].name || user?.name || ''} />
        {saved && canEdit && <button className={`${btnGhost} ml-auto`} onClick={() => onReport(reportPrefill(r, department))}><NotebookPen className="w-3.5 h-3.5 inline mr-1" />Write the event report</button>}
        {!canEdit && <button className={`${btnGhost} ml-auto`} onClick={onDone}>Close</button>}
      </div>
    </div>
  );
}

/** The Requests view inside Events & Activities */
export function EventRequestsView({ onReport }: { onReport: (prefill: any) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || '';
  const ownDept = ['hod', 'faculty', 'coordinator'].includes(role) ? user?.department || null : null;
  const [dept, setDept] = useState('All');
  const [open, setOpen] = useState<{ mode: 'new' } | { mode: 'edit'; r: any } | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const { data: list = [], isLoading, error } = useQuery<any[]>({ queryKey: ['eventRequests', ownDept ? 'own' : dept], queryFn: () => api.getEventRequests(ownDept ? undefined : dept) });
  const canCreate = !['principal', 'director', 'management'].includes(role);

  if (open) return <RequestForm initial={open.mode === 'edit' ? open.r : null} onCancel={() => setOpen(null)} onDone={() => setOpen(null)} onReport={onReport} />;

  const del = async (id: number) => {
    try { await api.deleteEventRequest(id); qc.invalidateQueries({ queryKey: ['eventRequests'] }); } finally { setConfirmDel(null); }
  };
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="p-3 border-b border-borderLine flex flex-wrap items-center gap-2">
        <p className="text-xs text-textSecondary flex-1 min-w-[220px]">Before an event: fill the request once and download the <b>Permission &amp; Venue</b> and <b>Budget</b> forms in the department format.</p>
        {!ownDept && <select aria-label="Department" className={input} value={dept} onChange={e => setDept(e.target.value)}><option value="All">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>}
        {canCreate && <button className={btnPrimary} onClick={() => setOpen({ mode: 'new' })}><Plus className="w-3.5 h-3.5 inline mr-1" />New request</button>}
      </div>
      {isLoading ? <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>
        : error ? <div className="p-10 text-center text-xs text-rose-600">{(error as any).message}</div>
        : list.length === 0 ? <div className="p-10 text-center text-xs text-textMuted">No requests yet. Click “New request” before your next workshop, FDP or guest lecture.</div>
        : (
          <div className="divide-y divide-borderLine">
            {list.map(x => {
              const r = normalizeRequest(x.data);
              const total = budgetTotal(r);
              return (
                <div key={x.id} className="px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-surface-2/60 cursor-pointer" onClick={() => setOpen({ mode: 'edit', r: x })}>
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-bold text-textPrimary">{x.title}</p>
                    <p className="text-[11px] text-textSecondary">
                      {r.types.filter(t => t !== 'Other').concat(r.types.includes('Other') && r.other_type ? [r.other_type] : []).join(', ') || 'Type not set'}
                      {' · '}{x.start_date ? fmtD(x.start_date) : 'date not set'}{r.venue ? ` · ${r.venue}` : ''}{total ? ` · ${rupees(total)}` : ''}
                      {!ownDept ? ` · ${x.department}` : ''} · by {x.created_by_name || x.created_by}
                    </p>
                  </div>
                  <DownloadButtons size="sm" r={r} department={x.department} author={r.organizers[0].name || x.created_by_name || ''} />
                  {x.can_edit && <button className="p-1.5 rounded-lg text-textSecondary hover:bg-surface-2" aria-label={`Edit ${x.title}`} onClick={e => { e.stopPropagation(); setOpen({ mode: 'edit', r: x }); }}><Pencil className="w-3.5 h-3.5" /></button>}
                  {(x.can_edit || role === 'hod' || role === 'admin') && (confirmDel === x.id ? (
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
