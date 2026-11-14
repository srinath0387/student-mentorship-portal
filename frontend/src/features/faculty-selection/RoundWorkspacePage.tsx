/**
 * Faculty Selection — one round: details, eligible students, groups / subjects / faculty seats,
 * live dashboard (5 s polling) with release / assign / move, exports and audit log.
 * Route: #/faculty-selection/manage/:roundId   (admin + HOD, own department)
 */
import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileSpreadsheet, FileText, Lock, Pencil, Play, Plus, Search, Upload } from 'lucide-react';
import { fsApi, fmtTime, toLocalInput, type FsOffering, type FsRoundDetail } from './fsApi';
import { exportAllPdf, exportExcel, exportFacultyWisePdf } from './exportRound';
import { ConfirmButton } from './ManageRoundsPage';
import {
  card, input, label, btnPrimary, btnGhost, RoundStatus, SeatMeter, Notice, Empty, th, td, errText, chipOk, chipBad, chipWarn, chipMuted, chipBrand,
} from './fsUi';

type Msg = { ok: boolean; text: string } | null;
type Tab = 'details' | 'eligible' | 'seats' | 'live' | 'audit';
const TABS: { key: Tab; text: string }[] = [
  { key: 'details', text: 'Details' }, { key: 'eligible', text: 'Eligible students' }, { key: 'seats', text: 'Groups, subjects & seats' },
  { key: 'live', text: 'Live dashboard' }, { key: 'audit', text: 'Audit log' },
];

export default function RoundWorkspacePage() {
  const { roundId = '' } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('seats');
  const [msg, setMsg] = useState<Msg>(null);
  const round = useQuery({ queryKey: ['fs', 'round', roundId], queryFn: () => fsApi.round(roundId), enabled: !!roundId });
  const refresh = () => qc.invalidateQueries({ queryKey: ['fs'] });
  const status = useMutation({
    mutationFn: (s: string) => fsApi.setStatus(roundId, s),
    onSuccess: (_d, s) => { setMsg({ ok: true, text: s === 'open' ? 'Round opened. Students can choose during the window.' : s === 'closed' ? 'Round closed. Students can no longer choose.' : 'Moved back to draft.' }); refresh(); },
    onError: e => setMsg({ ok: false, text: errText(e) }),
  });
  const [exporting, setExporting] = useState(false);
  const runExport = async (kind: 'xlsx' | 'facpdf' | 'allpdf') => {
    if (!round.data) return;
    setExporting(true);
    try {
      const rows = await fsApi.selections(roundId);
      if (kind === 'xlsx') {
        const dash = await fsApi.dashboard(roundId);
        exportExcel(round.data, rows, dash.students || [], round.data.subjects.length);
      } else if (kind === 'facpdf') await exportFacultyWisePdf(round.data, rows);
      else await exportAllPdf(round.data, rows);
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setExporting(false); }
  };

  if (round.isLoading) return <p className="p-6 text-xs text-textMuted">Loading round…</p>;
  if (round.error || !round.data) return <div className="p-6"><Notice msg={{ ok: false, text: errText(round.error) }} /></div>;
  const r = round.data;

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-6xl mx-auto">
      <Link to="/faculty-selection/manage" className="text-[11px] font-bold text-textSecondary hover:text-brand-primary"><ArrowLeft className="w-3 h-3 inline mr-1" />All rounds</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-textPrimary tracking-tight">{r.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[11px] font-bold text-textSecondary">{r.department} · Semester {r.semester_label}</span>
            <RoundStatus round={r} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status !== 'open' && <button className={btnPrimary} disabled={status.isPending} onClick={() => status.mutate('open')}><Play className="w-3.5 h-3.5 inline mr-1" />{r.status === 'closed' ? 'Reopen' : 'Open round'}</button>}
          {r.status === 'open' && <ConfirmButton label="Close round" confirmLabel="Stop all student choices?" onConfirm={() => status.mutate('closed')} />}
          <button className={btnGhost} disabled={exporting} onClick={() => runExport('xlsx')}><FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Excel</button>
          <button className={btnGhost} disabled={exporting} onClick={() => runExport('facpdf')}><FileText className="w-3.5 h-3.5 inline mr-1" />Faculty-wise PDF</button>
          <button className={btnGhost} disabled={exporting} onClick={() => runExport('allpdf')}><Download className="w-3.5 h-3.5 inline mr-1" />All allotments PDF</button>
        </div>
      </div>
      <Notice msg={msg} />
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === t.key ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>
            {t.text}{t.key === 'eligible' ? ` · ${r.eligible_count}` : ''}
          </button>
        ))}
      </div>
      {tab === 'details' && <DetailsTab r={r} onSaved={() => { setMsg({ ok: true, text: 'Saved.' }); refresh(); }} />}
      {tab === 'eligible' && <EligibleTab r={r} onChange={refresh} />}
      {tab === 'seats' && <SeatsTab r={r} onChange={refresh} />}
      {tab === 'live' && <LiveTab r={r} />}
      {tab === 'audit' && <AuditTab roundId={r.id} />}
    </div>
  );
}

// ─── Details ─────────────────────────────────────────────────────────────────
const detailsSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters'),
  starts_at: z.string().min(1, 'Required'),
  ends_at: z.string().min(1, 'Required'),
}).refine(v => new Date(v.ends_at) > new Date(v.starts_at), { message: 'Must be after the open time', path: ['ends_at'] });

function DetailsTab({ r, onSaved }: { r: FsRoundDetail; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof detailsSchema>>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { title: r.title, starts_at: toLocalInput(r.starts_at), ends_at: toLocalInput(r.ends_at) },
  });
  const [err, setErr] = useState<string | null>(null);
  const submit = handleSubmit(async v => {
    try {
      await fsApi.updateRound(r.id, { title: v.title, starts_at: new Date(v.starts_at).toISOString(), ends_at: new Date(v.ends_at).toISOString() });
      setErr(null); onSaved();
    } catch (e) { setErr(errText(e)); }
  });
  return (
    <form onSubmit={submit} className={`${card} p-5 space-y-4`} noValidate>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-1 md:col-span-3"><label className={label} htmlFor="fsd-title">Title</label>
          <input id="fsd-title" className={`${input} w-full`} {...register('title')} />
          {errors.title && <p className="text-[10px] font-bold text-rose-600">{errors.title.message}</p>}</div>
        <div className="space-y-1"><label className={label} htmlFor="fsd-open">Selection opens</label>
          <input id="fsd-open" type="datetime-local" className={`${input} w-full`} {...register('starts_at')} /></div>
        <div className="space-y-1"><label className={label} htmlFor="fsd-close">Selection closes</label>
          <input id="fsd-close" type="datetime-local" className={`${input} w-full`} {...register('ends_at')} />
          {errors.ends_at && <p className="text-[10px] font-bold text-rose-600">{errors.ends_at.message}</p>}</div>
        <div className="space-y-1"><span className={label}>Department · semester</span>
          <p className="text-xs font-bold text-textPrimary py-2">{r.department} · {r.semester_label}</p></div>
      </div>
      <Notice msg={err ? { ok: false, text: err } : null} />
      <div className="flex justify-end"><button className={btnPrimary} type="submit" disabled={isSubmitting}>Save</button></div>
      <p className="text-[11px] text-textMuted">Students can choose only while the round is open and the current time is inside this window.</p>
    </form>
  );
}

// ─── Eligible students ───────────────────────────────────────────────────────
const RESULT_CHIP: Record<string, [string, string]> = {
  added: [chipOk, 'Added'], duplicate: [chipWarn, 'Duplicate'], not_found: [chipBad, 'Not in students'],
  invalid: [chipBad, 'Invalid'], other_department: [chipBad, 'Other department'],
};

function EligibleTab({ r, onChange }: { r: FsRoundDetail; onChange: () => void }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['fs', 'eligible', r.id], queryFn: () => fsApi.eligible(r.id) });
  const [text, setText] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const add = useMutation({
    mutationFn: (rolls: string[]) => fsApi.addEligible(r.id, rolls),
    onSuccess: d => { setResult(d); setText(''); qc.invalidateQueries({ queryKey: ['fs', 'eligible', r.id] }); onChange(); },
    onError: e => setErr(errText(e)),
  });
  const remove = useMutation({
    mutationFn: (roll: string) => fsApi.removeEligible(r.id, roll),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fs', 'eligible', r.id] }); onChange(); },
    onError: e => setErr(errText(e)),
  });
  const parseRolls = (s: string) => s.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  const onFile = async (f: File) => {
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
      const head = (rows[0] || []).map((c: any) => String(c || '').toLowerCase());
      let col = head.findIndex((h: string) => /roll|reg/.test(h));
      const start = col >= 0 ? 1 : 0;
      if (col < 0) col = 0;
      const rolls = rows.slice(start).map(row => String(row[col] || '').trim()).filter(Boolean);
      setText(rolls.join('\n'));
      setErr(rolls.length ? null : 'No roll numbers found in the first column.');
    } catch { setErr('Could not read that file. Use .xlsx, .xls or .csv.'); }
  };
  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Roll Number'], ['22091A0501'], ['22091A0502']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Eligible');
    XLSX.writeFile(wb, 'faculty-selection-eligible-template.xlsx');
  };
  const rows = (list.data || []).filter((s: any) => !q || `${s.roll_number} ${s.name} ${s.section}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-textPrimary">Add roll numbers</h3>
            <div className="flex gap-2">
              <label className={`${btnGhost} cursor-pointer`}><Upload className="w-3.5 h-3.5 inline mr-1" />Excel / CSV
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              </label>
              <button className={btnGhost} onClick={template}>Template</button>
            </div>
          </div>
          <textarea id="fs-rolls" rows={7} className={`${input} w-full font-mono`} placeholder={'Paste roll numbers, one per line\n22091A0501\n22091A0502'} value={text} onChange={e => setText(e.target.value)} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-textMuted">{parseRolls(text).length} roll numbers · only {r.department} students can be added</span>
            <button className={btnPrimary} disabled={!parseRolls(text).length || add.isPending} onClick={() => { setErr(null); add.mutate(parseRolls(text)); }}>
              {add.isPending ? 'Checking…' : 'Check and add'}</button>
          </div>
          <Notice msg={err ? { ok: false, text: err } : null} />
        </div>
        <div className={`${card} p-4 space-y-3`}>
          <h3 className="text-sm font-black text-textPrimary">Check result</h3>
          {!result ? <p className="text-xs text-textMuted">Each roll is checked against the students list. The section comes from the student's record.</p> : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.summary).map(([k, n]) => <span key={k} className={RESULT_CHIP[k]?.[0] || chipMuted}>{n as number} {RESULT_CHIP[k]?.[1].toLowerCase() || k}</span>)}
              </div>
              <div className="max-h-64 overflow-auto rounded-xl border border-borderLine">
                <table className="w-full"><thead className="sticky top-0 bg-surface"><tr><th className={th}>Roll</th><th className={th}>Name</th><th className={th}>Sec</th><th className={th}>Result</th></tr></thead>
                  <tbody>{result.results.map((x: any, i: number) => (
                    <tr key={i} className="border-t border-borderLine">
                      <td className={`${td} font-mono`}>{x.roll_number}</td><td className={td}>{x.name || '—'}</td><td className={td}>{x.section || '—'}</td>
                      <td className={td}><span className={RESULT_CHIP[x.result]?.[0] || chipMuted}>{RESULT_CHIP[x.result]?.[1] || x.result}</span>
                        {(x.warning || (x.result !== 'added' && x.message)) && <span className="ml-1.5 text-[10px] text-textMuted">{x.warning || x.message}</span>}</td>
                    </tr>))}</tbody></table>
              </div>
            </>
          )}
        </div>
      </div>
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-textPrimary">Eligible students · {list.data?.length ?? 0}</h3>
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-textMuted" />
            <input aria-label="Search students" className={`${input} pl-8 w-56`} placeholder="Search roll, name, section" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        {!rows.length ? <p className="text-xs text-textMuted">No students yet.</p> : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full"><thead className="sticky top-0 bg-surface"><tr><th className={th}>Roll</th><th className={th}>Name</th><th className={th}>Section</th><th className={`${th} text-right`}>Chosen</th><th className={th} /></tr></thead>
              <tbody>{rows.map((s: any) => (
                <tr key={s.roll_number} className="border-t border-borderLine">
                  <td className={`${td} font-mono`}>{s.roll_number}</td><td className={td}>{s.name}</td><td className={td}>{s.section || <span className={chipBad}>No section</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{s.picked} / {r.subjects.length}</td>
                  <td className={`${td} text-right`}>{s.picked === 0 && s.released === 0 && (
                    <button className="text-[11px] font-bold text-rose-600 hover:underline" onClick={() => remove.mutate(s.roll_number)}>Remove</button>)}</td>
                </tr>))}</tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Groups, subjects & seats ────────────────────────────────────────────────
function SeatsTab({ r, onChange }: { r: FsRoundDetail; onChange: () => void }) {
  const [err, setErr] = useState<Msg>(null);
  const run = async (fn: () => Promise<any>, ok?: string) => {
    try { await fn(); setErr(ok ? { ok: true, text: ok } : null); onChange(); } catch (e) { setErr({ ok: false, text: errText(e) }); }
  };
  const sections = useMemo(() => Array.from(new Set([...(r.sections || []), ...(r.eligible_sections || []), ...r.offerings.map(o => o.section)]))
    .filter(Boolean).sort(), [r]);
  const faculty = useQuery({ queryKey: ['fs', 'faculty-options'], queryFn: fsApi.facultyOptions, staleTime: 10 * 60e3 });
  const [newGroup, setNewGroup] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newSubject, setNewSubject] = useState({ subject_name: '', subject_type: 'Theory' });

  return (
    <div className="space-y-4">
      <Notice msg={err} />
      <div className={`${card} p-4 space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black text-textPrimary mr-2">Groups</h3>
          {r.groups.map(g => (
            <span key={g.id} className={`${chipBrand} text-[11px] py-1 px-2.5`}>{g.name}
              {!r.offerings.some(o => o.group_id === g.id) && (
                <button aria-label={`Delete ${g.name}`} className="ml-1 opacity-70 hover:opacity-100" onClick={() => run(() => fsApi.deleteGroup(g.id))}>×</button>)}
            </span>
          ))}
          <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); if (newGroup.trim()) run(() => fsApi.addGroup(r.id, newGroup.trim()).then(() => setNewGroup(''))); }}>
            <input id="fs-new-group" aria-label="New group name" className={`${input} w-32`} placeholder="Group A" value={newGroup} onChange={e => setNewGroup(e.target.value)} />
            <button className={btnGhost} type="submit"><Plus className="w-3.5 h-3.5 inline" /> Group</button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black text-textPrimary mr-2">Sections</h3>
          {sections.length ? sections.map(s => <span key={s} className={`${chipMuted} text-[11px] py-1 px-2.5`}>Sec {s}</span>)
            : <span className="text-[11px] text-textMuted">Sections appear from eligible students; you can add more.</span>}
          <form className="flex gap-1.5" onSubmit={e => {
            e.preventDefault(); const s = newSection.trim().toUpperCase(); if (!s) return;
            run(() => fsApi.updateRound(r.id, { sections: Array.from(new Set([...(r.sections || []), s])) }).then(() => setNewSection('')));
          }}>
            <input id="fs-new-section" aria-label="New section" className={`${input} w-20`} placeholder="E" maxLength={10} value={newSection} onChange={e => setNewSection(e.target.value)} />
            <button className={btnGhost} type="submit"><Plus className="w-3.5 h-3.5 inline" /> Section</button>
          </form>
        </div>
        <p className="text-[11px] text-textMuted">Under each subject, every group gives each section its own faculty and its own seats. A student sees one option per group for their own section. Their first choice fixes their group for the whole round.</p>
      </div>

      <form className={`${card} p-4 flex flex-wrap items-end gap-3`} onSubmit={e => {
        e.preventDefault(); if (newSubject.subject_name.trim().length < 2) return;
        run(() => fsApi.addSubject(r.id, newSubject).then(() => setNewSubject({ subject_name: '', subject_type: 'Theory' })));
      }}>
        <div className="space-y-1 flex-1 min-w-[200px]"><label className={label} htmlFor="fs-subj">Add subject</label>
          <input id="fs-subj" className={`${input} w-full`} placeholder="e.g. Deep Learning" value={newSubject.subject_name} onChange={e => setNewSubject({ ...newSubject, subject_name: e.target.value })} /></div>
        <div className="space-y-1"><label className={label} htmlFor="fs-subj-type">Type</label>
          <select id="fs-subj-type" className={input} value={newSubject.subject_type} onChange={e => setNewSubject({ ...newSubject, subject_type: e.target.value })}>
            <option>Theory</option><option>Lab</option></select></div>
        <button className={btnPrimary} type="submit"><Plus className="w-3.5 h-3.5 inline mr-1" />Add subject</button>
      </form>

      {!r.subjects.length ? <Empty title="No subjects yet" text="Add the subjects that go through faculty selection. Other subjects keep the normal roster process." /> :
        r.subjects.map(s => (
          <SubjectCard key={s.id} r={r} subject={s} sections={sections} faculty={faculty.data || []}
            offerings={r.offerings.filter(o => o.subject_id === s.id)} run={run} />
        ))}
    </div>
  );
}

function SubjectCard({ r, subject, sections, faculty, offerings, run }: {
  r: FsRoundDetail; subject: FsRoundDetail['subjects'][number]; sections: string[]; faculty: { name: string; email: string; department: string }[];
  offerings: FsOffering[]; run: (fn: () => Promise<any>, ok?: string) => Promise<void>;
}) {
  const [f, setF] = useState({ group_id: r.groups[0]?.id || '', section: sections[0] || '', faculty_email: '', capacity: '30' });
  const [editing, setEditing] = useState<string | null>(null);
  const [cap, setCap] = useState('');
  const [rename, setRename] = useState<string | null>(null);
  const total = offerings.reduce((n, o) => n + o.capacity, 0);
  const filled = offerings.reduce((n, o) => n + o.filled, 0);
  const listId = `fs-fac-${subject.id}`;
  const facEmail = (v: string) => {
    const m = faculty.find(x => x.email.toLowerCase() === v.toLowerCase() || `${x.name} (${x.email})` === v);
    return m?.email || v;
  };

  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {rename !== null ? (
            <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); run(() => fsApi.updateSubject(subject.id, { subject_name: rename }).then(() => setRename(null))); }}>
              <input aria-label="Subject name" className={`${input} w-56`} value={rename} onChange={e => setRename(e.target.value)} />
              <button className={btnGhost} type="submit">Save</button><button type="button" className={btnGhost} onClick={() => setRename(null)}>Cancel</button>
            </form>
          ) : <h3 className="text-sm font-black text-textPrimary">{subject.subject_name}</h3>}
          <span className={chipMuted}>{subject.subject_type}</span>
          <span className="text-[11px] font-bold text-textSecondary tabular-nums">{filled} / {total} seats filled</span>
        </div>
        <div className="flex gap-2">
          {rename === null && <button className={btnGhost} onClick={() => setRename(subject.subject_name)}><Pencil className="w-3.5 h-3.5 inline" /></button>}
          {!filled && <ConfirmButton label="Delete" confirmLabel={`Delete ${subject.subject_name}?`} onConfirm={() => run(() => fsApi.deleteSubject(subject.id))} />}
        </div>
      </div>
      {offerings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-borderLine"><th className={th}>Group</th><th className={th}>Section</th><th className={th}>Faculty</th><th className={`${th} text-right`}>Seats</th><th className={`${th} text-right`}>Filled</th><th className={th}>Use</th><th className={th} /></tr></thead>
            <tbody>
              {offerings.map(o => (
                <tr key={o.id} className="border-b border-borderLine last:border-0">
                  <td className={td}>{o.group_name}</td><td className={td}>{o.section}</td>
                  <td className={td}><span className="font-bold">{o.faculty_name}</span> <span className="text-textMuted text-[10px]">{o.faculty_email}</span></td>
                  <td className={`${td} text-right tabular-nums`}>
                    {editing === o.id ? (
                      <form className="inline-flex gap-1" onSubmit={e => { e.preventDefault(); run(() => fsApi.updateOffering(o.id, { capacity: Number(cap) }).then(() => setEditing(null)), 'Seats updated.'); }}>
                        <input aria-label="Seats" type="number" min={o.filled} className={`${input} w-20 py-1`} value={cap} onChange={e => setCap(e.target.value)} />
                        <button className={btnGhost} type="submit">Save</button>
                      </form>
                    ) : o.capacity}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{o.filled}</td>
                  <td className={td}><SeatMeter filled={o.filled} capacity={o.capacity} /></td>
                  <td className={`${td} text-right`}>
                    {editing !== o.id && <button className="text-[11px] font-bold text-brand-primary hover:underline mr-3" onClick={() => { setEditing(o.id); setCap(String(o.capacity)); }}>Edit seats</button>}
                    {o.filled === 0 && <button className="text-[11px] font-bold text-rose-600 hover:underline" onClick={() => run(() => fsApi.deleteOffering(o.id))}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!r.groups.length ? <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Add a group first (for one choice per section, a single group is enough).</p> : (
        <form className="flex flex-wrap items-end gap-2 pt-1 border-t border-borderLine" onSubmit={e => {
          e.preventDefault();
          run(() => fsApi.addOffering(subject.id, { group_id: f.group_id, section: f.section, faculty_email: facEmail(f.faculty_email), capacity: Number(f.capacity) })
            .then(() => setF({ ...f, faculty_email: '' })));
        }}>
          <div className="space-y-1"><label className={label} htmlFor={`g-${subject.id}`}>Group</label>
            <select id={`g-${subject.id}`} className={input} value={f.group_id} onChange={e => setF({ ...f, group_id: e.target.value })}>{r.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div className="space-y-1"><label className={label} htmlFor={`s-${subject.id}`}>Section</label>
            <select id={`s-${subject.id}`} className={input} value={f.section} onChange={e => setF({ ...f, section: e.target.value })}>
              {!sections.length && <option value="">—</option>}{sections.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="space-y-1 flex-1 min-w-[220px]"><label className={label} htmlFor={`f-${subject.id}`}>Faculty</label>
            <input id={`f-${subject.id}`} list={listId} className={`${input} w-full`} placeholder="Type a name or email" value={f.faculty_email} onChange={e => setF({ ...f, faculty_email: e.target.value })} />
            <datalist id={listId}>{faculty.map(x => <option key={x.email} value={`${x.name} (${x.email})`}>{x.department}</option>)}</datalist></div>
          <div className="space-y-1"><label className={label} htmlFor={`c-${subject.id}`}>Seats</label>
            <input id={`c-${subject.id}`} type="number" min={1} className={`${input} w-20`} value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value })} /></div>
          <button className={btnPrimary} type="submit" disabled={!f.section || !f.faculty_email || !(Number(f.capacity) > 0)}><Plus className="w-3.5 h-3.5 inline mr-1" />Add faculty</button>
        </form>
      )}
    </div>
  );
}

// ─── Live dashboard ──────────────────────────────────────────────────────────
function LiveTab({ r }: { r: FsRoundDetail }) {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ['fs', 'dash', r.id], queryFn: () => fsApi.dashboard(r.id), refetchInterval: 5000 });
  const sels = useQuery({ queryKey: ['fs', 'sels', r.id], queryFn: () => fsApi.selections(r.id), refetchInterval: 10000 });
  const [view, setView] = useState<'selected' | 'pending' | 'released'>('selected');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [move, setMove] = useState<{ sel?: any; roll?: string; section?: string; subject_id?: string; offering_id?: string } | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['fs'] }); };
  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg({ ok: true, text: ok }); setMove(null); refresh(); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const d = dash.data;
  if (dash.isLoading) return <p className="text-xs text-textMuted">Loading live data…</p>;
  if (!d) return <Notice msg={{ ok: false, text: errText(dash.error) }} />;
  const offerings: FsOffering[] = d.offerings;
  const all = (sels.data || []).filter((s: any) => (!subjectFilter || s.subject_id === subjectFilter) && (!q || `${s.roll_number} ${s.student_name} ${s.faculty_name}`.toLowerCase().includes(q.toLowerCase())));
  const active = all.filter((s: any) => s.status === 'active');
  const released = all.filter((s: any) => s.status === 'released');
  const pending = (d.students || []).filter((s: any) => s.picked < d.subjects.length && (!q || `${s.roll_number} ${s.name}`.toLowerCase().includes(q.toLowerCase())));
  const optionsFor = (subjectId?: string, section?: string) => offerings.filter(o => o.subject_id === subjectId && o.section === section);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-textSecondary"><span className="w-2 h-2 rounded-full bg-emerald-500" />Live · refreshes every 5 seconds · {fmtTime(d.server_time, true)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Eligible students', d.counts.eligible], ['Chose all subjects', d.counts.complete], ['Chose some', d.counts.partial], ['Not started', d.counts.none]].map(([k, v]) => (
          <div key={k as string} className={`${card} p-4`}><p className="text-2xl font-black text-textPrimary tabular-nums">{v as number}</p><p className="text-[11px] font-bold text-textSecondary">{k as string}</p></div>
        ))}
      </div>
      <Notice msg={msg} />

      {d.subjects.map((s: any) => {
        const os = offerings.filter(o => o.subject_id === s.id);
        return (
          <div key={s.id} className={`${card} p-4 space-y-2`}>
            <div className="flex items-center gap-2"><h3 className="text-sm font-black text-textPrimary">{s.subject_name}</h3><span className={chipMuted}>{s.subject_type}</span>
              <span className="text-[11px] font-bold text-textSecondary tabular-nums ml-auto">{os.reduce((n, o) => n + o.filled, 0)} / {os.reduce((n, o) => n + o.capacity, 0)}</span></div>
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr className="border-b border-borderLine"><th className={th}>Group</th><th className={th}>Section</th><th className={th}>Faculty</th><th className={`${th} text-right`}>Seats</th><th className={`${th} text-right`}>Filled</th><th className={`${th} text-right`}>Left</th><th className={th}>Use</th></tr></thead>
              <tbody>{os.map(o => (
                <tr key={o.id} className="border-b border-borderLine last:border-0">
                  <td className={td}>{o.group_name}</td><td className={td}>{o.section}</td><td className={td}>{o.faculty_name}</td>
                  <td className={`${td} text-right tabular-nums`}>{o.capacity}</td><td className={`${td} text-right tabular-nums`}>{o.filled}</td>
                  <td className={`${td} text-right tabular-nums font-bold ${o.capacity - o.filled === 0 ? 'text-rose-600' : ''}`}>{o.capacity - o.filled}</td>
                  <td className={td}><SeatMeter filled={o.filled} capacity={o.capacity} /></td>
                </tr>))}</tbody></table></div>
          </div>
        );
      })}

      {move && (
        <div className={`${card} p-4 space-y-3 border-brand-primary/40`}>
          <h3 className="text-sm font-black text-textPrimary">{move.sel ? `Move ${move.sel.roll_number} · ${move.sel.subject_name}` : `Assign faculty to ${move.roll}`}</h3>
          <div className="flex flex-wrap items-end gap-2">
            {!move.sel && (
              <div className="space-y-1"><label className={label} htmlFor="fs-as-subj">Subject</label>
                <select id="fs-as-subj" className={input} value={move.subject_id || ''} onChange={e => setMove({ ...move, subject_id: e.target.value, offering_id: '' })}>
                  <option value="">Choose…</option>{d.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.subject_name}</option>)}</select></div>
            )}
            <div className="space-y-1"><label className={label} htmlFor="fs-as-off">Faculty (Section {move.section})</label>
              <select id="fs-as-off" className={input} value={move.offering_id || ''} onChange={e => setMove({ ...move, offering_id: e.target.value })}>
                <option value="">Choose…</option>
                {optionsFor(move.sel?.subject_id || move.subject_id, move.section).filter(o => o.id !== move.sel?.offering_id).map(o => (
                  <option key={o.id} value={o.id} disabled={o.filled >= o.capacity}>{o.group_name} · {o.faculty_name} ({o.capacity - o.filled} left)</option>))}
              </select></div>
            <button className={btnPrimary} disabled={!move.offering_id} onClick={() => move.sel
              ? act(() => fsApi.reassign(move.sel.id, move.offering_id!), `${move.sel.roll_number} moved.`)
              : act(() => fsApi.assign(r.id, { roll_number: move.roll!, subject_id: move.subject_id!, offering_id: move.offering_id! }), `${move.roll} assigned.`)}>
              {move.sel ? 'Move' : 'Assign'}</button>
            <button className={btnGhost} onClick={() => setMove(null)}>Cancel</button>
          </div>
          <p className="text-[11px] text-textMuted">Admin assignments skip the group lock and the time window, and are recorded in the audit log.</p>
        </div>
      )}

      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {([['selected', `Selected · ${active.length}`], ['pending', `Pending · ${pending.length}`], ['released', `Released · ${released.length}`]] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${view === k ? 'bg-brand-soft text-brand-primary' : 'text-textSecondary hover:bg-surface-2'}`}>{t}</button>))}
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            {view !== 'pending' && (
              <select aria-label="Filter by subject" className={input} value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
                <option value="">All subjects</option>{d.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.subject_name}</option>)}</select>)}
            <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-textMuted" />
              <input aria-label="Search" className={`${input} pl-8 w-52`} placeholder="Roll, name or faculty" value={q} onChange={e => setQ(e.target.value)} /></div>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          {view === 'selected' && (active.length ? (
            <table className="w-full"><thead className="sticky top-0 bg-surface"><tr><th className={`${th} text-right`}>#</th><th className={th}>Confirmed at</th><th className={th}>Roll</th><th className={th}>Name</th><th className={th}>Sec</th><th className={th}>Group</th><th className={th}>Subject</th><th className={th}>Faculty</th><th className={th} /></tr></thead>
              <tbody>{active.map((s: any, i: number) => (
                <tr key={s.id} className="border-t border-borderLine">
                  <td className={`${td} text-right tabular-nums text-textMuted`}>{i + 1}</td><td className={`${td} font-mono text-[11px]`}>{fmtTime(s.created_at, true, true)}</td>
                  <td className={`${td} font-mono`}>{s.roll_number}</td><td className={td}>{s.student_name}</td><td className={td}>{s.section}</td><td className={td}>{s.group_name}</td>
                  <td className={td}>{s.subject_name}</td><td className={`${td} font-bold`}>{s.faculty_name}</td>
                  <td className={`${td} text-right`}>
                    <button className="text-[11px] font-bold text-brand-primary hover:underline mr-3" onClick={() => setMove({ sel: s, section: s.section })}>Move</button>
                    <ConfirmButton label="Release" confirmLabel="Release seat?" onConfirm={() => act(() => fsApi.release(s.id), `Released ${s.roll_number} from ${s.subject_name}. Assign a faculty from the Released tab.`)} />
                  </td>
                </tr>))}</tbody></table>
          ) : <p className="text-xs text-textMuted p-2">No choices yet.</p>)}

          {view === 'pending' && (pending.length ? (
            <table className="w-full"><thead className="sticky top-0 bg-surface"><tr><th className={th}>Roll</th><th className={th}>Name</th><th className={th}>Sec</th><th className={`${th} text-right`}>Chosen</th><th className={th} /></tr></thead>
              <tbody>{pending.map((s: any) => (
                <tr key={s.roll_number} className="border-t border-borderLine">
                  <td className={`${td} font-mono`}>{s.roll_number}</td><td className={td}>{s.name}</td><td className={td}>{s.section || <span className={chipBad}>No section</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{s.picked} / {d.subjects.length}</td>
                  <td className={`${td} text-right`}>{s.section && <button className="text-[11px] font-bold text-brand-primary hover:underline" onClick={() => setMove({ roll: s.roll_number, section: s.section })}>Assign</button>}</td>
                </tr>))}</tbody></table>
          ) : <p className="text-xs text-textMuted p-2">Everyone has chosen all subjects.</p>)}

          {view === 'released' && (released.length ? (
            <table className="w-full"><thead className="sticky top-0 bg-surface"><tr><th className={th}>Roll</th><th className={th}>Name</th><th className={th}>Sec</th><th className={th}>Subject</th><th className={th}>Released</th><th className={th} /></tr></thead>
              <tbody>{released.map((s: any) => (
                <tr key={s.id} className="border-t border-borderLine">
                  <td className={`${td} font-mono`}>{s.roll_number}</td><td className={td}>{s.student_name}</td><td className={td}>{s.section}</td><td className={td}>{s.subject_name}</td>
                  <td className={`${td} text-[11px]`}>{fmtTime(s.updated_at, true)}</td>
                  <td className={`${td} text-right`}><button className="text-[11px] font-bold text-brand-primary hover:underline" onClick={() => setMove({ roll: s.roll_number, section: s.section, subject_id: s.subject_id })}>Assign faculty</button></td>
                </tr>))}</tbody></table>
          ) : <p className="text-xs text-textMuted p-2">No released choices.</p>)}
        </div>
      </div>
    </div>
  );
}

// ─── Audit ───────────────────────────────────────────────────────────────────
const ACTION_TEXT: Record<string, string> = {
  select: 'Student chose', assign: 'Admin assigned', release: 'Released', reassign: 'Moved', round_create: 'Round created', round_update: 'Round edited',
  round_open: 'Round opened', round_closed: 'Round closed', round_draft: 'Back to draft', eligible_add: 'Students added', eligible_remove: 'Student removed',
  group_create: 'Group added', group_rename: 'Group renamed', group_delete: 'Group deleted', subject_create: 'Subject added', subject_update: 'Subject edited',
  subject_delete: 'Subject deleted', offering_create: 'Faculty option added', offering_update: 'Seats / faculty edited', offering_delete: 'Faculty option removed',
};
function AuditTab({ roundId }: { roundId: string }) {
  const a = useQuery({ queryKey: ['fs', 'audit', roundId], queryFn: () => fsApi.audit(roundId) });
  if (a.isLoading) return <p className="text-xs text-textMuted">Loading…</p>;
  if (!a.data?.length) return <Empty title="Nothing recorded yet" />;
  const detail = (x: any) => {
    const v = x.details || {};
    if (x.action === 'select' || x.action === 'assign') return `${v.subject} → ${v.faculty} · ${v.group} · Sec ${v.section}`;
    if (x.action === 'release') return `${v.subject} (${v.faculty || ''})${v.reason ? ` · ${v.reason}` : ''}`;
    if (x.action === 'offering_update') return `seats ${v.from?.capacity} → ${v.to?.capacity}${v.from?.faculty !== v.to?.faculty ? ` · ${v.from?.faculty} → ${v.to?.faculty}` : ''}`;
    return Object.entries(v).filter(([, val]) => typeof val !== 'object').map(([k, val]) => `${k}: ${val}`).join(' · ');
  };
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full"><thead><tr className="border-b border-borderLine"><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Student</th><th className={th}>Details</th></tr></thead>
        <tbody>{a.data.map((x: any) => (
          <tr key={x.id} className="border-b border-borderLine last:border-0">
            <td className={`${td} font-mono text-[11px]`}>{fmtTime(x.created_at, true)}</td><td className={td}>{x.actor_email} <span className="text-textMuted">({x.actor_role})</span></td>
            <td className={td}>{x.action === 'select' ? <span className={chipOk}><Lock className="w-2.5 h-2.5" />{ACTION_TEXT[x.action]}</span> : ACTION_TEXT[x.action] || x.action}</td>
            <td className={`${td} font-mono`}>{x.roll_number || ''}</td><td className={`${td} whitespace-normal min-w-[240px]`}>{detail(x)}</td>
          </tr>))}</tbody></table>
    </div>
  );
}

