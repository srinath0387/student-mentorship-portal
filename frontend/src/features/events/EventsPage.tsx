import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Download, FileSpreadsheet, FileText, ImagePlus, Loader2, Paperclip, Pencil, Plus, Send, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { uploadAcademicFile } from '../../lib/academicFiles';
import { fmtD } from '../../lib/pdfReport';

import { BouncingDots } from '../../components/common/BouncingDots';
import { NumberedListInput } from '../../components/common/NumberedListInput';
import { EventRequestsView } from './EventRequests';
import { eventReportTablePdf, eventReportWord } from './eventReportTabular';
const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;
const lbl = 'text-[11px] font-bold text-textSecondary uppercase tracking-wider';
const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
const TYPES = ['Workshop', 'Faculty Development Programme (FDP)', 'Guest Lecture', 'Industrial Visit', 'Seminar', 'Webinar', 'Conference', 'Hackathon', 'Training Programme', 'Student Activity', 'Outreach / Extension', 'Other'];
const SPEAKER_TYPES = ['Workshop', 'Faculty Development Programme (FDP)', 'Guest Lecture', 'Seminar', 'Webinar', 'Conference', 'Training Programme'];
const EMOJI: Record<string, string> = { Workshop: '🛠️', 'Faculty Development Programme (FDP)': '🎓', 'Guest Lecture': '🎤', 'Industrial Visit': '🏭', Seminar: '📢', Webinar: '💻', Conference: '🏛️', Hackathon: '⚡', 'Training Programme': '📘', 'Student Activity': '🎯', 'Outreach / Extension': '🤝', Other: '✨' };
const STATUS: Record<string, { t: string; c: string }> = {
  draft: { t: 'Draft', c: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  submitted: { t: 'Awaiting HOD', c: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
  approved: { t: 'Approved', c: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  returned: { t: 'Returned', c: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
};
const Chip = ({ s }: { s: string }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS[s]?.c || ''}`}>{STATUS[s]?.t || s}</span>;
const d10 = (v: any) => String(v || '').slice(0, 10);
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const ayOf = (d: string) => { const [y, m] = d.split('-').map(Number); const s = m >= 6 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
const attendedOf = (e: any) => e.participation === 'attended';
const ParticipationChip = ({ e }: { e: any }) => attendedOf(e)
  ? <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">Attended</span>
  : <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Organized</span>;
const participants = (e: any) => [e.student_count != null ? `${e.student_count} students` : '', e.faculty_count != null ? `${e.faculty_count} faculty` : '', e.external_count != null ? `${e.external_count} external` : ''].filter(Boolean).join(' · ');


function People({ label, rows, onChange, fields }: { label: string; rows: any[]; onChange: (r: any[]) => void; fields: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      <p className={lbl}>{label}</p>
      {rows.map((p, i) => (
        <div key={i} className="flex gap-1.5">
          {fields.map(([k, ph]) => <input key={k} className={`${input} flex-1 min-w-0`} placeholder={ph} value={p[k] || ''} onChange={ev => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)))} />)}
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="p-1 text-textMuted hover:text-rose-600" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button className="text-[11px] font-bold text-brand-primary" onClick={() => onChange([...rows, {}])}><Plus className="w-3 h-3 inline" /> Add</button>
    </div>
  );
}

/** Shown on a report started from an event request: what came across, and the few things left to add */
function FromRequestChecklist({ e }: { e: any }) {
  const att = e.participation === 'attended';
  const has = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';
  const todo: [string, string, boolean][] = [
    ...(att ? [] : [['Number of participants (students / faculty / external)', 'ev-student_count', has(e.student_count) || has(e.faculty_count) || has(e.external_count)]] as [string, string, boolean][]),
    ['Summary of the event — what happened', 'ev-summary', has(e.summary)],
    ['Achieved outcomes', 'ev-achieved', has(e.outcomes)],
    [att ? 'Takeaways for the department' : 'Participant feedback', 'ev-feedback', has(e.feedback)],
    ['Photos', 'ev-photos', (e.photos || []).length > 0],
  ];
  const go = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLInputElement | null)?.focus?.({ preventScroll: true }); };
  const left = todo.filter(t => !t[2]).length;
  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-2">
      <p className="text-xs font-black text-emerald-900 dark:text-emerald-200">Filled from your event request: title, type, dates, duration, venue, organisers, resource persons, audience, objectives and expected outcomes.</p>
      <p className="text-xs text-emerald-900/80 dark:text-emerald-200/80">{left ? `Add what happened at the event (${left} left):` : 'Everything is filled. Check it and submit to the HOD.'}</p>
      <ul className="grid sm:grid-cols-2 gap-1">
        {todo.map(([label, id, done]) => (
          <li key={id}><button type="button" onClick={() => go(id)} className="flex items-start gap-2 text-left text-xs font-bold text-textPrimary hover:underline">
            <span className={`mt-0.5 inline-grid place-items-center w-4 h-4 rounded border text-[10px] ${done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-emerald-700/50 bg-white dark:bg-transparent'}`}>{done ? '✓' : ''}</span>{label}</button></li>
        ))}
      </ul>
      {!att && has(e.budget) && <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">The budget shows the amount you requested. <button type="button" onClick={() => go('ev-budget')} className="font-bold underline">Change it</button> to the amount actually spent.</p>}
    </div>
  );
}

function EventForm({ initial, department, onDone, onCancel, prefill }: { initial: any | null; department: string | null; onDone: (e: any) => void; onCancel: () => void; prefill?: any }) {
  const { user } = useAuth();
  const [e, setE] = useState<any>(() => initial ? { ...initial, start_date: d10(initial.start_date), end_date: d10(initial.end_date), visit: initial.visit || {} } : {
    event_type: 'Workshop', title: '', organized_by: department ? `Department of ${department}` : '', start_date: today(), end_date: today(), duration_hours: '', mode: 'Offline', venue: '',
    coordinators: [{ name: user?.name || '', designation: '', email: user?.email || '' }], resource_persons: [{}], visit: {},
    student_count: '', faculty_count: '', external_count: '', target_audience: '', objectives: '', summary: '', outcomes: '', feedback: '', budget: '', photos: [], attachments: [],
    department: department || '', participation: 'organized', expected_outcomes: '',
    // started from an event request: carry its details over
    ...(prefill || {}),
    ...(prefill?.coordinators?.length ? {} : { coordinators: [{ name: user?.name || '', designation: '', email: user?.email || '' }] }),
    ...(prefill?.resource_persons?.length ? {} : { resource_persons: [{}] }),
  });
  const [previews, setPreviews] = useState<Record<string, string>>(initial?.urls || {});
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: any) => setE((x: any) => ({ ...x, ...p }));
  const iv = e.event_type === 'Industrial Visit';
  const speakers = SPEAKER_TYPES.includes(e.event_type);
  const att = e.participation === 'attended';
  const setParticipation = (p: 'organized' | 'attended') => {
    if (p === e.participation) return;
    const ours = department ? `Department of ${department}` : '';
    set({ participation: p, organized_by: p === 'attended' ? (e.organized_by === ours ? '' : e.organized_by) : (e.organized_by || ours) });
  };

  const addPhotos = async (files: FileList) => {
    const list = Array.from(files).slice(0, 12 - e.photos.length);
    setBusy(n => n + list.length); setMsg(null);
    for (const f of list) {
      try {
        const r = await uploadAcademicFile('events', f);
        setPreviews(p => ({ ...p, [r.key]: URL.createObjectURL(f) }));
        setE((x: any) => ({ ...x, photos: [...x.photos, { key: r.key, caption: '' }] }));
      } catch (err: any) { setMsg(err.message); }
      finally { setBusy(n => n - 1); }
    }
  };
  const addAttachment = async (f: File) => {
    setBusy(n => n + 1);
    try { const r = await uploadAcademicFile('events', f); setE((x: any) => ({ ...x, attachments: [...x.attachments, { key: r.key, name: f.name }] })); }
    catch (err: any) { setMsg(err.message); } finally { setBusy(n => n - 1); }
  };
  const save = useMutation({
    mutationFn: async (andSubmit: boolean) => {
      const body = { ...e, coordinators: e.coordinators.filter((c: any) => c.name), resource_persons: iv ? [] : e.resource_persons.filter((p: any) => p.name) };
      const saved: any = initial ? await api.updateEvent(initial.id, body) : await api.createEvent(body);
      if (andSubmit) await api.submitEvent(saved.id);
      return saved;
    },
    onSuccess: onDone,
    onError: (err: any) => setMsg(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-lg font-black text-textPrimary">{initial ? 'Edit report' : 'New event report'}</h1>
      </div>
      {!initial && e.request_id && <FromRequestChecklist e={e} />}
      {initial?.status === 'returned' && initial.hod_remarks && <div className="rounded-xl px-4 py-2.5 text-xs bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><b>HOD's remarks:</b> {initial.hod_remarks}</div>}

      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-black text-textPrimary mr-auto">{att ? 'What was attended' : 'What was conducted'}</p>
          <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold" role="radiogroup" aria-label="Organized or attended">
            {([['organized', 'We organized it'], ['attended', 'We attended it']] as const).map(([k, t]) => (
              <button key={k} role="radio" aria-checked={e.participation === k} onClick={() => setParticipation(k)}
                className={`px-3 py-1.5 ${e.participation === k ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">{TYPES.map(t => (
          <button key={t} onClick={() => set({ event_type: t })} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${e.event_type === t ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{EMOJI[t]} {t}</button>
        ))}</div>
        <div className="grid md:grid-cols-4 gap-3">
          {!department && <div className="space-y-1"><p className={lbl}>Department</p><select className={`${input} w-full`} value={e.department} onChange={ev => set({ department: ev.target.value })}><option value="">Choose…</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>}
          <div className="space-y-1 md:col-span-3"><p className={lbl}>Title</p><input className={`${input} w-full`} value={e.title} onChange={ev => set({ title: ev.target.value })} placeholder={iv ? 'e.g. Industrial visit to Infosys, Mysuru' : 'e.g. Two-day workshop on Generative AI'} /></div>
          <div className="space-y-1 md:col-span-2"><p className={lbl}>{att ? 'Organised by (host institution / organisation)' : 'Organised by'}</p><input className={`${input} w-full`} value={e.organized_by} onChange={ev => set({ organized_by: ev.target.value })} placeholder={att ? 'e.g. NIT Warangal / AICTE ATAL Academy / IEEE' : 'Department / club / IEEE student branch'} /></div>
          <div className="space-y-1"><p className={lbl}>From</p><input type="date" className={`${input} w-full`} value={e.start_date} onChange={ev => set({ start_date: ev.target.value, end_date: ev.target.value > e.end_date ? ev.target.value : e.end_date })} /></div>
          <div className="space-y-1"><p className={lbl}>To</p><input type="date" min={e.start_date} className={`${input} w-full`} value={e.end_date} onChange={ev => set({ end_date: ev.target.value })} /></div>
          <div className="space-y-1"><p className={lbl}>Duration (hours)</p><input type="number" min={0} className={`${input} w-full`} value={e.duration_hours ?? ''} onChange={ev => set({ duration_hours: ev.target.value })} /></div>
          <div className="space-y-1"><p className={lbl}>Mode</p><select className={`${input} w-full`} value={e.mode} onChange={ev => set({ mode: ev.target.value })}>{['Offline', 'Online', 'Hybrid'].map(x => <option key={x}>{x}</option>)}</select></div>
          {!iv && <div className="space-y-1 md:col-span-2"><p className={lbl}>Venue</p><input className={`${input} w-full`} value={e.venue || ''} onChange={ev => set({ venue: ev.target.value })} placeholder="Seminar hall / lab / online link" /></div>}
        </div>
      </div>

      <div className={`${card} p-4 grid md:grid-cols-2 gap-4`}>
        {iv ? (
          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-black text-textPrimary">🏭 Place visited</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1"><p className={lbl}>Company / organisation</p><input className={`${input} w-full`} value={e.visit?.company || ''} onChange={ev => set({ visit: { ...e.visit, company: ev.target.value } })} /></div>
              <div className="space-y-1"><p className={lbl}>Location</p><input className={`${input} w-full`} value={e.visit?.location || ''} onChange={ev => set({ visit: { ...e.visit, location: ev.target.value } })} placeholder="City, State" /></div>
              <div className="space-y-1"><p className={lbl}>Contact person at the industry</p><input className={`${input} w-full`} value={e.visit?.contact_person || ''} onChange={ev => set({ visit: { ...e.visit, contact_person: ev.target.value } })} placeholder="Name, designation" /></div>
              <div className="space-y-1"><p className={lbl}>Faculty who accompanied</p><input className={`${input} w-full`} value={e.visit?.faculty_accompanied || ''} onChange={ev => set({ visit: { ...e.visit, faculty_accompanied: ev.target.value } })} /></div>
            </div>
          </div>
        ) : (
          <div className="md:col-span-2"><People label={speakers ? 'Resource person(s) / speaker(s)' : 'Resource person(s) (optional)'} rows={e.resource_persons} onChange={r => set({ resource_persons: r })}
            fields={[['name', 'Name'], ['designation', 'Designation'], ['organization', 'Organisation'], ['topic', 'Topic / session']]} /></div>
        )}
        <People label={att ? 'Attended by (faculty / students)' : 'Coordinator(s)'} rows={e.coordinators} onChange={r => set({ coordinators: r })} fields={[['name', 'Name'], ['designation', 'Designation']]} />
        {!att && <div className="space-y-1.5">
          <p className={lbl}>Participants</p>
          <div className="grid grid-cols-3 gap-2">
            {[['student_count', 'Students'], ['faculty_count', 'Faculty'], ['external_count', 'External']].map(([k, l]) => (
              <label key={k} className="text-[10px] font-bold text-textMuted">{l}<input id={`ev-${k}`} type="number" min={0} className={`${input} w-full mt-0.5`} value={e[k] ?? ''} onChange={ev => set({ [k]: ev.target.value })} /></label>
            ))}
          </div>
          <input className={`${input} w-full`} value={e.target_audience || ''} onChange={ev => set({ target_audience: ev.target.value })} placeholder="Target audience, e.g. III B.Tech CSE (DS) A & B" />
        </div>}
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1"><label htmlFor="ev-objectives" className={lbl}>Objectives</label>
            <NumberedListInput id="ev-objectives" rows={4} className={`${input} w-full`} value={e.objectives || ''} onChange={v => set({ objectives: v })} /></div>
          <div className="space-y-1"><label htmlFor="ev-expected" className={lbl}>Expected outcomes</label>
            <NumberedListInput id="ev-expected" rows={4} className={`${input} w-full`} value={e.expected_outcomes || ''} onChange={v => set({ expected_outcomes: v })} placeholder="1. What participants should be able to do…" /></div>
          <div className="space-y-1"><label htmlFor="ev-achieved" className={lbl}>Achieved outcomes</label>
            <NumberedListInput id="ev-achieved" rows={4} className={`${input} w-full`} value={e.outcomes || ''} onChange={v => set({ outcomes: v })} placeholder="1. What was actually achieved…" /></div>
        </div>
        <div className="space-y-1"><p className={lbl}>{iv ? 'About the visit' : 'Summary of the event'} *</p><textarea id="ev-summary" rows={5} className={`${input} w-full`} value={e.summary || ''} onChange={ev => set({ summary: ev.target.value })} placeholder={iv ? 'Departments visited, processes observed, interaction with engineers…' : 'Sessions conducted, hands-on activities, highlights…'} /></div>
        <div className={`grid gap-3 ${att ? '' : 'md:grid-cols-[1fr_200px]'}`}>
          <div className="space-y-1"><p className={lbl}>{att ? 'Takeaways for the department (optional)' : 'Participant feedback (optional)'}</p><input id="ev-feedback" className={`${input} w-full`} value={e.feedback || ''} onChange={ev => set({ feedback: ev.target.value })} placeholder={att ? 'e.g. Will introduce a lab on LLM fine-tuning next semester' : 'e.g. 92% rated the session excellent'} /></div>
          {!att && <div className="space-y-1"><p className={lbl}>Budget / spent (₹)</p><input id="ev-budget" type="number" min={0} className={`${input} w-full`} value={e.budget ?? ''} onChange={ev => set({ budget: ev.target.value })} /></div>}
        </div>
      </div>

      <div id="ev-photos" className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between"><p className="text-sm font-black text-textPrimary">Photos ({e.photos.length}/12) *</p>
          <label className={`${btnGhost} cursor-pointer ${e.photos.length >= 12 ? 'opacity-40 pointer-events-none' : ''}`}><ImagePlus className="w-3.5 h-3.5 inline mr-1" />Add photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={ev => { if (ev.target.files) addPhotos(ev.target.files); ev.target.value = ''; }} /></label></div>
        {busy > 0 && <p className="text-[11px] font-bold text-sky-600"><BouncingDots size="xs" className="mr-1" />Uploading {busy}…</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {e.photos.map((p: any, i: number) => (
            <div key={p.key} className="space-y-1">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-surface-2 border border-borderLine">
                {previews[p.key] ? <img src={previews[p.key]} alt={p.caption || `Photo ${i + 1}`} className="w-full h-full object-cover" /> : <div className="grid place-items-center h-full text-[10px] text-textMuted">Saved photo</div>}
                <button onClick={() => set({ photos: e.photos.filter((_: any, j: number) => j !== i) })} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white" aria-label="Remove photo"><X className="w-3 h-3" /></button>
              </div>
              <input className={`${input} w-full`} placeholder="Caption" value={p.caption || ''} onChange={ev => set({ photos: e.photos.map((x: any, j: number) => (j === i ? { ...x, caption: ev.target.value } : x)) })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Paperclip className="w-3.5 h-3.5 text-textMuted" />
          {e.attachments.map((a: any, i: number) => (
            <span key={a.key} className="px-2 py-1 rounded-lg bg-surface-2 border border-borderLine">{a.name}<button className="ml-1 text-textMuted hover:text-rose-600" onClick={() => set({ attachments: e.attachments.filter((_: any, j: number) => j !== i) })} aria-label="Remove">×</button></span>
          ))}
          <label className="text-[11px] font-bold text-brand-primary cursor-pointer">+ Attendance sheet / brochure / certificate (PDF)
            <input type="file" accept=".pdf,.xlsx,.docx,image/*" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) addAttachment(f); ev.target.value = ''; }} /></label>
        </div>
      </div>

      {msg && <div className="rounded-xl px-4 py-2.5 text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{msg}</div>}
      <div className="flex flex-wrap gap-2">
        <button className={btnGhost} disabled={save.isPending || busy > 0 || !e.title} onClick={() => save.mutate(false)}>Save draft</button>
        <button className={btnPrimary} disabled={save.isPending || busy > 0 || !e.title} onClick={() => save.mutate(true)}><Send className="w-3.5 h-3.5 inline mr-1" />Save &amp; submit to HOD</button>
      </div>
    </div>
  );
}

function EventDetail({ id, onBack, onEdit }: { id: number; onBack: () => void; onEdit: (e: any) => void }) {
  const qc = useQueryClient();
  const { data: e, isLoading } = useQuery({ queryKey: ['event', id], queryFn: () => api.getEvent(id) });
  const [remarks, setRemarks] = useState('');
  const [pdfBusy, setPdfBusy] = useState<'word' | 'pdf' | null>(null);
  const [dlErr, setDlErr] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['event', id] }); qc.invalidateQueries({ queryKey: ['events'] }); };
  const review = useMutation({ mutationFn: (s: 'approved' | 'returned') => api.reviewEvent(id, s, remarks), onSuccess: refresh });
  const submit = useMutation({ mutationFn: () => api.submitEvent(id), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => api.deleteEvent(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['eventRequests'] }); onBack(); } });
  if (isLoading || !e) return <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>;
  const iv = e.event_type === 'Industrial Visit';
  const err = (review.error || submit.error || del.error) as any;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[200px]"><h1 className="text-lg font-black text-textPrimary">{EMOJI[e.event_type]} {e.title}</h1>
          <p className="text-xs text-textSecondary">{e.event_type} · {fmtD(e.start_date)}{d10(e.end_date) !== d10(e.start_date) ? ` – ${fmtD(e.end_date)}` : ''} · {e.department}{e.ref_no ? ` · ${e.ref_no}` : ''}</p></div>
        <ParticipationChip e={e} />
        <Chip s={e.status} />
        {e.can_edit && <button className={btnGhost} onClick={() => onEdit(e)}><Pencil className="w-3.5 h-3.5 inline mr-1" />Edit</button>}
        <button className={btnGhost} disabled={!!pdfBusy} onClick={async () => { setPdfBusy('word'); try { await eventReportWord(e); } catch (x: any) { setDlErr(x?.message || 'Could not build the Word file'); } finally { setPdfBusy(null); } }}>
          {pdfBusy === 'word' ? <BouncingDots size="xs" className="mr-1" /> : <FileText className="w-3.5 h-3.5 inline mr-1" />}Report (Word)</button>
        <button className={btnPrimary} disabled={!!pdfBusy} onClick={async () => { setPdfBusy('pdf'); try { await eventReportTablePdf(e); } catch (x: any) { setDlErr(x?.message || 'Could not build the PDF'); } finally { setPdfBusy(null); } }}>
          {pdfBusy === 'pdf' ? <BouncingDots size="xs" className="mr-1" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Report PDF</button>
      </div>
      {e.hod_remarks && <div className="rounded-xl px-4 py-2.5 text-xs bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><b>HOD's remarks:</b> {e.hod_remarks}</div>}
      {err && <div className="rounded-xl px-4 py-2.5 text-xs font-bold bg-rose-50 text-rose-700">{err.message}</div>}
      {dlErr && <div role="status" className="rounded-xl px-4 py-2.5 text-xs font-bold bg-rose-50 text-rose-700">{dlErr}</div>}
      {e.can_review && (
        <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
          <div className="flex-1 min-w-[220px] space-y-1"><p className={lbl}>Remarks (required to return)</p><input className={`${input} w-full`} value={remarks} onChange={ev => setRemarks(ev.target.value)} /></div>
          <button className={`${btnPrimary} bg-emerald-600`} disabled={review.isPending} onClick={() => review.mutate('approved')}><Check className="w-3.5 h-3.5 inline mr-1" />Approve</button>
          <button className={btnGhost} disabled={review.isPending || !remarks.trim()} onClick={() => review.mutate('returned')}><Undo2 className="w-3.5 h-3.5 inline mr-1" />Return</button>
        </div>
      )}
      {['draft', 'returned'].includes(e.status) && e.can_edit && (
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={submit.isPending} onClick={() => submit.mutate()}><Send className="w-3.5 h-3.5 inline mr-1" />Submit to HOD</button>
          <button className={`${btnGhost} text-rose-600`} onClick={() => window.confirm('Delete this report?') && del.mutate()}><Trash2 className="w-3.5 h-3.5 inline mr-1" />Delete</button>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${card} p-4 space-y-2 text-xs`}>
          {[[iv ? 'Place visited' : 'Venue', iv ? [e.visit?.company, e.visit?.location].filter(Boolean).join(', ') : e.venue], ['Organised by', e.organized_by], ['Mode', e.mode],
            ['Duration', e.duration_hours ? `${e.duration_hours} h` : ''], ['Participants', participants(e)], ['Audience', e.target_audience],
            [attendedOf(e) ? 'Attended by' : 'Coordinators', (e.coordinators || []).map((c: any) => c.name).join(', ')], ['Submitted by', e.submitted_by_name]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><p className="text-[10px] font-bold uppercase text-textMuted">{k}</p><p className="text-textPrimary font-semibold">{v}</p></div>
          ))}
          {(e.resource_persons || []).length > 0 && <div><p className="text-[10px] font-bold uppercase text-textMuted">Resource persons</p>
            {e.resource_persons.map((p: any, i: number) => <p key={i} className="text-textPrimary"><b>{p.name}</b>{p.designation ? `, ${p.designation}` : ''}{p.organization ? `, ${p.organization}` : ''}{p.topic ? ` — ${p.topic}` : ''}</p>)}</div>}
          {(e.attachments || []).map((a: any) => e.urls?.[a.key] && <a key={a.key} href={e.urls[a.key]} target="_blank" rel="noopener noreferrer" className="block font-bold text-brand-primary"><Paperclip className="w-3 h-3 inline" /> {a.name}</a>)}
        </div>
        <div className={`${card} p-4 space-y-3 text-xs lg:col-span-2`}>
          {[['Objectives', e.objectives], ['Expected outcomes', e.expected_outcomes], [iv ? 'About the visit' : 'Summary', e.summary], ['Achieved outcomes', e.outcomes],
            [attendedOf(e) ? 'Takeaways' : 'Feedback', e.feedback]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><p className="text-[10px] font-bold uppercase text-textMuted">{k}</p><p className="text-textPrimary whitespace-pre-line">{v}</p></div>
          ))}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(e.photos || []).map((p: any) => e.urls?.[p.key] && (
              <figure key={p.key}><img src={e.urls[p.key]} alt={p.caption || 'Event photo'} className="w-full aspect-[4/3] object-cover rounded-lg border border-borderLine" />
                {p.caption && <figcaption className="text-[10px] text-textMuted mt-0.5">{p.caption}</figcaption>}</figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || '';
  const ownDept = ['hod', 'faculty', 'coordinator'].includes(role) ? user?.department || null : null;
  const [f, setF] = useState({ department: 'All', type: 'All', year: 'All', status: 'All', participation: 'All' });
  const [view, setView] = useState<{ mode: 'list' } | { mode: 'new'; prefill?: any } | { mode: 'edit'; e: any } | { mode: 'detail'; id: number }>({ mode: 'list' });
  const [tab, setTab] = useState<'reports' | 'requests'>('reports');
  const { data: events = [], isLoading } = useQuery<any[]>({ queryKey: ['events', f, ownDept], queryFn: () => api.getEvents({ ...f, department: ownDept ? undefined : f.department }) });
  const years = useMemo(() => Array.from(new Set(events.map(e => ayOf(d10(e.start_date))))).sort().reverse(), [events]);
  const byType = useMemo(() => { const m: Record<string, number> = {}; events.filter(e => e.status === 'approved').forEach(e => { m[e.event_type] = (m[e.event_type] || 0) + 1; }); return m; }, [events]);

  if (view.mode === 'new' || view.mode === 'edit') {
    return <EventForm initial={view.mode === 'edit' ? view.e : null} prefill={view.mode === 'new' ? view.prefill : undefined} department={ownDept} onCancel={() => setView({ mode: 'list' })} onDone={saved => { qc.invalidateQueries({ queryKey: ['eventRequests'] }); setTab('reports'); setView({ mode: 'detail', id: saved.id }); }} />;
  }
  if (view.mode === 'detail') return <EventDetail id={view.id} onBack={() => setView({ mode: 'list' })} onEdit={e => setView({ mode: 'edit', e })} />;

  const approved = events.filter(e => e.status === 'approved');
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = approved.map((e, i) => ({
      'S.No': i + 1, 'Academic Year': String(e.academic_year || '').replace('–', '-'), Department: e.department, Type: e.event_type,
      'Organized / Attended': attendedOf(e) ? 'Attended' : 'Organized', 'Organised by': e.organized_by || '', Title: e.title,
      'From': d10(e.start_date), 'To': d10(e.end_date), 'Duration (h)': e.duration_hours ?? '',
      'Resource Person / Place Visited': e.event_type === 'Industrial Visit' ? [e.visit?.company, e.visit?.location].filter(Boolean).join(', ') : (e.resource_persons || []).map((p: any) => `${p.name}${p.organization ? ` (${p.organization})` : ''}`).join('; '),
      Students: e.student_count ?? '', Faculty: e.faculty_count ?? '', External: e.external_count ?? '',
      'Coordinators / Attended by': (e.coordinators || []).map((c: any) => c.name).join(', '),
      'Expected Outcomes': e.expected_outcomes || '', 'Achieved Outcomes': e.outcomes || '', 'Ref No': e.ref_no || '',
    }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Events');
    XLSX.writeFile(wb, `events-register-${f.year === 'All' ? 'all-years' : f.year}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-black text-textPrimary">Events &amp; Activities</h1>
          <p className="text-xs text-textSecondary">Workshops, FDPs, guest lectures, industrial visits… Submit the report once, the HOD approves, and the PDF and NAAC list are ready.</p></div>
        <div className="flex gap-2">
          {tab === 'reports' && <button className={btnGhost} disabled={!approved.length} onClick={exportExcel}><FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Excel (NAAC)</button>}
          {tab === 'reports' && role !== 'principal' && role !== 'director' && role !== 'management' && <button className={btnPrimary} onClick={() => setView({ mode: 'new' })}><Plus className="w-3.5 h-3.5 inline mr-1" />New report</button>}
        </div>
      </div>

      <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold w-fit" role="tablist">
        <button role="tab" aria-selected={tab === 'reports'} onClick={() => setTab('reports')} className={`px-4 py-2 ${tab === 'reports' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>Event reports</button>
        <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')} className={`px-4 py-2 ${tab === 'requests' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>Requests (before the event)</button>
      </div>

      {tab === 'requests' ? <EventRequestsView onReport={prefill => setView({ mode: 'new', prefill })} onOpenReport={id => { setTab('reports'); setView({ mode: 'detail', id }); }} /> : (<>

      <div className="flex flex-wrap gap-2">
        {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <button key={t} onClick={() => setF({ ...f, type: f.type === t ? 'All' : t })} className={`${card} px-3 py-2 text-left ${f.type === t ? 'ring-2 ring-brand-primary' : ''}`}>
            <p className="text-[10px] font-bold text-textMuted">{EMOJI[t]} {t}</p><p className="text-lg font-black text-textPrimary">{n}</p></button>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-3 border-b border-borderLine flex flex-wrap gap-2">
          {!ownDept && <select className={input} value={f.department} onChange={e => setF({ ...f, department: e.target.value })}><option value="All">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>}
          <select className={input} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="All">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <select className={input} value={f.year} onChange={e => setF({ ...f, year: e.target.value })}><option value="All">All years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
          <select className={input} value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="All">Any status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select>
          <select aria-label="Organized or attended" className={input} value={f.participation} onChange={e => setF({ ...f, participation: e.target.value })}>
            <option value="All">Organized &amp; attended</option><option value="organized">Organized</option><option value="attended">Attended</option></select>
        </div>
        {isLoading ? <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>
          : events.length === 0 ? <div className="p-10 text-center text-xs text-textMuted">No reports yet. Click “New report” after a workshop, FDP, guest lecture or industrial visit.</div>
          : (
            <div className="divide-y divide-borderLine">
              {events.map(e => (
                <button key={e.id} onClick={() => setView({ mode: 'detail', id: e.id })} className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-surface-2/60">
                  <span className="text-xl w-8 text-center">{EMOJI[e.event_type] || '✨'}</span>
                  <div className="flex-1 min-w-[220px]"><p className="text-sm font-bold text-textPrimary">{e.title}</p>
                    <p className="text-[11px] text-textSecondary">{e.event_type} · {fmtD(e.start_date)}{!ownDept ? ` · ${e.department}` : ''} · {attendedOf(e) ? (e.organized_by ? `at ${e.organized_by}` : 'attended') : (participants(e) || 'participants not entered')} · by {e.submitted_by_name}</p></div>
                  <span className="text-[11px] text-textMuted">{(e.photos || []).length} 📷</span>
                  <ParticipationChip e={e} />
                  <Chip s={e.status} />
                </button>
              ))}
            </div>
          )}
      </div>
      </>)}
    </div>
  );
}
