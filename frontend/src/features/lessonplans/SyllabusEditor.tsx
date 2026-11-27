/**
 * SyllabusEditor — the subject's syllabus (shared by every section and faculty teaching it).
 * Faculty paste or type units and topics, then generate the semester's lesson plan from it.
 */
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, FileText, Paperclip, Plus, Trash2, Wand2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { uploadAcademicFile } from '../../lib/academicFiles';
import { BouncingDots } from '../../components/common/BouncingDots';
import { NumberedListInput, listItems } from '../../components/common/NumberedListInput';
import { Topic, btnGhost, btnPrimary, card, input, syllabusPdf } from './lessonPlanShared';

type Unit = { title: string; hours: string; topics: string };
type Form = {
  subject_code: string; regulation: string; credits: string; objectives: string;
  outcomes: { code: string; text: string }[]; units: Unit[]; text_books: string; references_text: string; file_key: string | null;
};
const lbl = 'text-[11px] font-bold text-textSecondary uppercase tracking-wider';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const numbered = (items: string[]) => items.map((t, i) => `${i + 1}. ${t}`).join('\n');
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const emptyUnit = (): Unit => ({ title: '', hours: '', topics: '' });

/** "UNIT – I: Title (10 Hours) topic a, topic b; topic c …" → units */
export function parseSyllabusText(text: string): Unit[] {
  const parts = text.replace(/\r/g, '').split(/\bUNIT\s*[-–—:.]?\s*(?=[IVX]+\b|\d+\b)([IVX]+|\d+)\b/i);
  const chunks: string[] = [];
  if (parts.length < 3) chunks.push(text);
  else for (let i = 2; i < parts.length; i += 2) chunks.push(parts[i]);
  return chunks.map(raw => {
    let body = raw.replace(/^[\s:.\-–—]+/, '');
    let hours = '';
    const h = body.match(/\(?\s*(\d{1,2})\s*(?:hours|hrs|hr|periods|lectures|L)\s*\)?/i);
    if (h) { hours = h[1]; body = body.replace(h[0], ' '); }
    let title = '';
    const t = body.match(/^([^\n:]{3,120}?)\s*(?::|\n)([\s\S]*)$/);
    if (t) { title = t[1].trim(); body = t[2]; }
    const topics = body.split(/[,;\n•]|\.\s+(?=[A-Z])/).map(x => x.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').replace(/\.$/, '').trim()).filter(x => x.length > 2);
    return { title, hours, topics: numbered(topics) };
  }).filter(u => u.title || u.topics);
}

/** Turn the syllabus into lesson-plan rows: each unit's hours are spread across its topics. */
export function topicsFromSyllabus(units: Unit[], outcomes: { code: string }[]): Topic[] {
  const rows: Topic[] = [];
  units.forEach((u, ui) => {
    const items = listItems(u.topics);
    if (!items.length) return;
    const hours = Math.max(items.length, parseInt(u.hours, 10) || items.length);
    const base = Math.floor(hours / items.length);
    const extra = hours - base * items.length;
    const co = outcomes[ui]?.code || outcomes[outcomes.length - 1]?.code || null;
    items.forEach((topic, k) => rows.push({
      id: newId(), unit: ui + 1, unit_title: u.title || null, topic, periods: Math.max(1, base + (k < extra ? 1 : 0)),
      planned_date: null, co, method: 'Chalk & Talk',
    } as Topic));
  });
  return rows;
}

export function SyllabusEditor({ allotmentId, onGenerate }: {
  allotmentId: string;
  onGenerate: (plan: { objectives: string; outcomes: { code: string; text: string }[]; topics: Topic[]; text_books: string; references_text: string }) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['syllabus', allotmentId], queryFn: () => api.getSyllabus(allotmentId) });
  const [f, setF] = useState<Form>({ subject_code: '', regulation: '', credits: '', objectives: '', outcomes: [{ code: 'CO1', text: '' }], units: [emptyUnit()], text_books: '', references_text: '', file_key: null });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState(false);

  useEffect(() => {
    const s = data?.syllabus;
    if (!s) return;
    setF({
      subject_code: s.subject_code || '', regulation: s.regulation || '', credits: s.credits || '', objectives: s.objectives || '',
      outcomes: s.outcomes?.length ? s.outcomes : [{ code: 'CO1', text: '' }],
      units: s.units?.length ? s.units.map((u: any) => ({ title: u.title || '', hours: u.hours ? String(u.hours) : '', topics: numbered(u.topics || []) })) : [emptyUnit()],
      text_books: s.text_books || '', references_text: s.references_text || '', file_key: s.file_key || null,
    });
    setDirty(false);
  }, [data]);

  const upd = (p: Partial<Form>) => { setF(x => ({ ...x, ...p })); setDirty(true); };
  const updUnit = (i: number, p: Partial<Unit>) => upd({ units: f.units.map((u, j) => (j === i ? { ...u, ...p } : u)) });
  const canEdit = !!data?.can_edit;
  const body = () => ({
    ...f,
    outcomes: f.outcomes.filter(o => o.text.trim()),
    units: f.units.map(u => ({ title: u.title.trim(), hours: u.hours ? Number(u.hours) : null, topics: listItems(u.topics) })).filter(u => u.title || u.topics.length),
  });
  const save = useMutation({
    mutationFn: () => api.saveSyllabus(allotmentId, body()),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ['syllabus', allotmentId] }); setMsg({ ok: true, text: 'Syllabus saved. Every section of this subject uses it.' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });

  if (isLoading) return <div className="p-10 text-center"><BouncingDots size="md" className="text-brand-primary" /></div>;
  const a = data?.allotment;
  const topicCount = f.units.reduce((n, u) => n + listItems(u.topics).length, 0);
  const hourCount = f.units.reduce((n, u) => n + (parseInt(u.hours, 10) || listItems(u.topics).length), 0);

  return (
    <div className="space-y-4">
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}
      {!data?.syllabus && <p className="text-xs text-textSecondary">No syllabus yet for {a?.subject_name}. Paste it from the university syllabus PDF or type the units below, then generate the lesson plan.</p>}
      {data?.syllabus?.updated_by_name && <p className="text-[11px] text-textMuted">Last updated by {data.syllabus.updated_by_name}. Shared with every section of {a?.subject_name} in {a?.semester_label}.</p>}

      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-black text-textPrimary mr-auto">Subject details</p>
          {canEdit && <button className={btnGhost} onClick={() => setPaste('')}><ClipboardPaste className="w-3.5 h-3.5 inline mr-1" />Paste syllabus</button>}
          <button className={btnGhost} disabled={!topicCount} onClick={() => syllabusPdf(a, body())}><FileText className="w-3.5 h-3.5 inline mr-1" />Syllabus PDF</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1"><label htmlFor="sy-code" className={lbl}>Subject code</label><input id="sy-code" disabled={!canEdit} className={`${input} w-full`} value={f.subject_code} onChange={e => upd({ subject_code: e.target.value })} placeholder="e.g. A0532" /></div>
          <div className="space-y-1"><label htmlFor="sy-reg" className={lbl}>Regulation</label><input id="sy-reg" disabled={!canEdit} className={`${input} w-full`} value={f.regulation} onChange={e => upd({ regulation: e.target.value })} placeholder="e.g. R20" /></div>
          <div className="space-y-1"><label htmlFor="sy-cr" className={lbl}>Credits (L-T-P-C)</label><input id="sy-cr" disabled={!canEdit} className={`${input} w-full`} value={f.credits} onChange={e => upd({ credits: e.target.value })} placeholder="e.g. 3-0-0-3" /></div>
        </div>
        <div className="space-y-1"><label htmlFor="sy-obj" className={lbl}>Course objectives</label>
          <NumberedListInput id="sy-obj" disabled={!canEdit} rows={3} className={`${input} w-full`} value={f.objectives} onChange={v => upd({ objectives: v })} /></div>
        <div className="space-y-1.5">
          <p className={lbl}>Course outcomes</p>
          {f.outcomes.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label="CO code" disabled={!canEdit} className={`${input} w-16 font-bold`} value={o.code} onChange={e => upd({ outcomes: f.outcomes.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} />
              <input aria-label={`Outcome ${o.code}`} disabled={!canEdit} className={`${input} flex-1 min-w-0`} placeholder="Students will be able to…" value={o.text} onChange={e => upd({ outcomes: f.outcomes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {canEdit && <button onClick={() => upd({ outcomes: f.outcomes.filter((_, j) => j !== i) })} className="p-1.5 text-textMuted hover:text-rose-600" aria-label="Remove outcome"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {canEdit && f.outcomes.length < 12 && <button className="text-[11px] font-bold text-brand-primary" onClick={() => upd({ outcomes: [...f.outcomes, { code: `CO${f.outcomes.length + 1}`, text: '' }] })}>+ Add outcome</button>}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-black text-textPrimary">Units · {f.units.length} units · {topicCount} topics · {hourCount} hours</p>
        {f.units.map((u, i) => (
          <div key={i} className={`${card} p-4 space-y-2`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-brand-primary w-16">UNIT {ROMAN[i] || i + 1}</span>
              <input aria-label={`Unit ${i + 1} title`} disabled={!canEdit} className={`${input} flex-1 min-w-[180px]`} placeholder="Unit title, e.g. Introduction to Deep Learning" value={u.title} onChange={e => updUnit(i, { title: e.target.value })} />
              <label className="flex items-center gap-1 text-[11px] font-bold text-textSecondary">Hours
                <input disabled={!canEdit} type="number" min={1} max={60} className={`${input} w-16 text-center`} value={u.hours} onChange={e => updUnit(i, { hours: e.target.value })} placeholder={String(listItems(u.topics).length || '')} /></label>
              {canEdit && f.units.length > 1 && <button onClick={() => upd({ units: f.units.filter((_, j) => j !== i) })} className="p-1.5 text-textMuted hover:text-rose-600" aria-label={`Remove unit ${i + 1}`}><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
            <NumberedListInput disabled={!canEdit} rows={4} className={`${input} w-full`} value={u.topics} onChange={v => updUnit(i, { topics: v })} placeholder="1. First topic of this unit" />
          </div>
        ))}
        {canEdit && f.units.length < 12 && <button className="text-[11px] font-bold text-brand-primary" onClick={() => upd({ units: [...f.units, emptyUnit()] })}><Plus className="w-3 h-3 inline" /> Add unit</button>}
      </div>

      <div className={`${card} p-4 grid md:grid-cols-2 gap-3`}>
        <div className="space-y-1"><label htmlFor="sy-tb" className={lbl}>Text books</label><NumberedListInput id="sy-tb" disabled={!canEdit} rows={3} className={`${input} w-full`} value={f.text_books} onChange={v => upd({ text_books: v })} /></div>
        <div className="space-y-1"><label htmlFor="sy-ref" className={lbl}>Reference books / resources</label><NumberedListInput id="sy-ref" disabled={!canEdit} rows={3} className={`${input} w-full`} value={f.references_text} onChange={v => upd({ references_text: v })} /></div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-2 text-xs">
          <Paperclip className="w-3.5 h-3.5 text-textMuted" />
          {data?.syllabus?.file_url ? <a href={data.syllabus.file_url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-primary">Official syllabus document</a>
            : f.file_key ? <span className="font-bold text-emerald-600">Document attached — save to keep</span> : <span className="text-textMuted">Optional: attach the university syllabus PDF</span>}
          {canEdit && (
            <label className={`${btnGhost} cursor-pointer`}>{busyFile ? 'Uploading…' : f.file_key ? 'Replace' : 'Attach'}
              <input type="file" accept=".pdf,.docx" className="hidden" disabled={busyFile} onChange={async e => {
                const x = e.target.files?.[0]; e.target.value = ''; if (!x) return;
                setBusyFile(true);
                try { const r = await uploadAcademicFile('lesson-plans', x); upd({ file_key: r.key }); } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusyFile(false); }
              }} /></label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sticky bottom-2">
        {canEdit && <button className={btnGhost} disabled={save.isPending || !dirty} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : dirty ? 'Save syllabus' : 'Saved'}</button>}
        <button className={btnPrimary} disabled={!topicCount} onClick={async () => {
          if (canEdit && dirty) { try { await save.mutateAsync(); } catch { return; } }
          onGenerate({
            objectives: f.objectives, outcomes: f.outcomes.filter(o => o.text.trim()),
            topics: topicsFromSyllabus(f.units, f.outcomes.filter(o => o.text.trim())),
            text_books: f.text_books, references_text: f.references_text,
          });
        }}><Wand2 className="w-3.5 h-3.5 inline mr-1" />Generate lesson plan from syllabus</button>
      </div>

      {paste !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setPaste(null)}>
          <div className={`${card} w-full max-w-2xl p-5 space-y-3`} role="dialog" aria-modal="true" aria-labelledby="paste-title" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><p id="paste-title" className="text-sm font-black text-textPrimary">Paste the syllabus</p>
                <p className="text-[11px] text-textSecondary">Copy the units from the university syllabus PDF. Each "UNIT – I", "UNIT – II" … becomes a unit; commas and new lines split the topics. You can fix anything afterwards.</p></div>
              <button onClick={() => setPaste(null)} className="p-1 text-textMuted" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <textarea aria-label="Syllabus text" rows={12} className={`${input} w-full font-mono`} value={paste} onChange={e => setPaste(e.target.value)}
              placeholder={'UNIT – I: Introduction (10 Hours)\nWhat is deep learning, Neural networks, Perceptron, Activation functions\n\nUNIT – II: Training Neural Networks\nBackpropagation, Gradient descent, Regularization …'} />
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setPaste(null)}>Cancel</button>
              <button className={btnPrimary} disabled={!paste.trim()} onClick={() => {
                const units = parseSyllabusText(paste);
                if (!units.length) { setMsg({ ok: false, text: 'No units found in the pasted text.' }); return; }
                upd({ units });
                setPaste(null);
                setMsg({ ok: true, text: `Found ${units.length} units and ${units.reduce((n, u) => n + listItems(u.topics).length, 0)} topics. Check them, then Save.` });
              }}>Use this syllabus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
