import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck2, Check, Download, FileSpreadsheet, Loader2, Paperclip, Plus, Trash2, Undo2, Upload, Wand2 } from 'lucide-react';
import { api } from '../../lib/api';
import { uploadAcademicFile } from '../../lib/academicFiles';
import { fmtD } from '../../lib/pdfReport';
import { CoverageBar, StatusChip, Topic, autoSchedule, btnGhost, btnPrimary, card, input, lessonPlanPdf, todayIso } from './lessonPlanShared';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Lesson plan for one allotted subject: plan editor, coverage tracker, HOD review. */
export function LessonPlanEditor({ allotmentId, onBack }: { allotmentId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['lessonPlan', allotmentId], queryFn: () => api.getLessonPlan(allotmentId) });
  const [tab, setTab] = useState<'plan' | 'coverage'>('plan');
  const [f, setF] = useState<{ objectives: string; outcomes: { code: string; text: string }[]; topics: Topic[]; text_books: string; references_text: string; file_key: string | null }>(
    { objectives: '', outcomes: [], topics: [], text_books: '', references_text: '', file_key: null });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sched, setSched] = useState<{ open: boolean; start: string; days: Record<string, number> }>({ open: false, start: todayIso(), days: {} });
  const [busyFile, setBusyFile] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = data.plan;
    setF({
      objectives: p?.objectives || '', outcomes: p?.outcomes?.length ? p.outcomes : [{ code: 'CO1', text: '' }],
      topics: p?.topics?.length ? p.topics : [{ id: newId(), unit: 1, unit_title: '', topic: '', periods: 1, planned_date: null, co: 'CO1', method: 'Chalk & Talk' }],
      text_books: p?.text_books || '', references_text: p?.references_text || '', file_key: p?.file_key || null,
    });
    const days: Record<string, number> = {};
    (data.class_days || []).forEach((d: any) => { days[d.day_of_week] = Number(d.periods) || 1; });
    const semStart = data.semester?.start_date;
    setSched(s => ({ ...s, days, start: semStart && semStart > todayIso() ? semStart : (semStart || todayIso()) }));
    setDirty(false);
    if (data.can_edit === false && data.plan) setTab(data.plan.status === 'approved' ? 'coverage' : 'plan');
  }, [data]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['lessonPlan', allotmentId] }); qc.invalidateQueries({ queryKey: ['myLessonPlans'] }); qc.invalidateQueries({ queryKey: ['deptLessonPlans'] }); };
  const save = useMutation({
    mutationFn: () => api.saveLessonPlan(allotmentId, f),
    onSuccess: (r: any) => { setDirty(false); refresh(); setMsg({ ok: true, text: r?.resubmitted ? 'Saved. The plan was already approved, so it goes back to the HOD for re-approval.' : 'Lesson plan saved.' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });
  const submit = useMutation({
    mutationFn: async () => { if (dirty) await api.saveLessonPlan(allotmentId, f); return api.submitLessonPlan(allotmentId); },
    onSuccess: () => { setDirty(false); refresh(); setMsg({ ok: true, text: 'Submitted to the HOD for approval.' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });
  const [remarks, setRemarks] = useState('');
  const review = useMutation({
    mutationFn: (status: 'approved' | 'returned') => api.reviewLessonPlan(data.plan.id, status, remarks),
    onSuccess: (_r, status) => { refresh(); setMsg({ ok: true, text: status === 'approved' ? 'Lesson plan approved.' : 'Returned to the faculty.' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });
  const cover = useMutation({
    mutationFn: ({ id, on }: { id: string; on: string | null }) => api.markTopicCovered(allotmentId, id, on),
    onSuccess: refresh, onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });

  const upd = (patch: Partial<typeof f>) => { setF(prev => ({ ...prev, ...patch })); setDirty(true); };
  const updTopic = (id: string, patch: Partial<Topic>) => upd({ topics: f.topics.map(t => (t.id === id ? { ...t, ...patch } : t)) });
  const coCodes = f.outcomes.map(o => o.code).filter(Boolean);
  const summary = useMemo(() => {
    const today = todayIso(); const topics = data?.plan?.topics || [];
    const covered = topics.filter((t: Topic) => t.covered_on).length;
    const due = topics.filter((t: Topic) => t.planned_date && t.planned_date <= today);
    return { total: topics.length, covered, behind: Math.max(0, due.length - due.filter((t: Topic) => t.covered_on).length) };
  }, [data]);

  const importExcel = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const pick = (r: any, ...names: string[]) => { const k = Object.keys(r).find(x => names.includes(x.toLowerCase().replace(/[^a-z]/g, ''))); return k ? r[k] : ''; };
      const toIso = (v: any) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
      const topics: Topic[] = rows.map(r => ({
        id: newId(), unit: parseInt(pick(r, 'unit', 'unitno'), 10) || 1, unit_title: String(pick(r, 'unittitle', 'unitname') || '').trim(),
        topic: String(pick(r, 'topic', 'topics', 'topictobecovered') || '').trim(), periods: parseInt(pick(r, 'periods', 'hours', 'noofperiods'), 10) || 1,
        co: String(pick(r, 'co', 'courseoutcome') || '').trim() || null, method: String(pick(r, 'method', 'teachingmethod', 'pedagogy') || '').trim() || null,
        planned_date: toIso(pick(r, 'planneddate', 'date')),
      })).filter(t => t.topic);
      if (!topics.length) throw new Error('No topics found. Use the template: Unit, Unit Title, Topic, Periods, CO, Method, Planned Date.');
      upd({ topics });
      setMsg({ ok: true, text: `Imported ${topics.length} topics. Check them, then Save.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Could not read the Excel file' }); }
  };
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet([
      { Unit: 1, 'Unit Title': 'Introduction', Topic: 'Overview of the course', Periods: 1, CO: 'CO1', Method: 'Chalk & Talk', 'Planned Date': '' },
      { Unit: 1, 'Unit Title': 'Introduction', Topic: 'Basic concepts', Periods: 2, CO: 'CO1', Method: 'PPT', 'Planned Date': '' },
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Lesson Plan');
    XLSX.writeFile(wb, 'lesson-plan-template.xlsx');
  };
  const runSchedule = () => {
    const classDays = Object.entries(sched.days).filter(([, p]) => p > 0).map(([day, periods]) => ({ day, periods }));
    if (!classDays.length) { setMsg({ ok: false, text: 'Pick the days this class meets.' }); return; }
    upd({ topics: autoSchedule(f.topics, classDays, sched.start, data?.holidays || []) });
    setSched(s => ({ ...s, open: false }));
    const end = data?.semester?.end_date;
    setMsg({ ok: true, text: `Dates filled from ${fmtD(sched.start)}${end ? ` (semester ends ${fmtD(end)})` : ''}, skipping Sundays & holidays. Save to keep them.` });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-textMuted" /></div>;
  if (error || !data) return <div className={`${card} p-6 text-sm text-rose-600`}>{(error as any)?.message || 'Could not load'} <button className={btnGhost} onClick={onBack}>Back</button></div>;
  const a = data.allotment; const p = data.plan; const canEdit = data.can_edit;
  const status = p?.status || 'not_started';
  const lastDate = f.topics.map(t => t.planned_date).filter(Boolean).sort().pop();
  const pastEnd = data.semester?.end_date && lastDate && lastDate > data.semester.end_date;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-black text-textPrimary">{a.subject_name}</h1>
          <p className="text-xs text-textSecondary">{a.semester_label} · Section {a.section || '—'} · {a.department} · {a.faculty_name}{a.co_faculty_name ? ` & ${a.co_faculty_name}` : ''}</p>
        </div>
        <StatusChip s={status} />
        <button className={btnGhost} disabled={!p} onClick={() => lessonPlanPdf(a, { ...p, ...(canEdit ? f : {}) })}><Download className="w-3.5 h-3.5 inline mr-1" />PDF</button>
      </div>

      {p?.status === 'returned' && p.hod_remarks && <div className="rounded-xl px-4 py-2.5 text-xs bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><b>HOD's remarks:</b> {p.hod_remarks}</div>}
      {msg && <div className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      {data.can_review && p?.status === 'submitted' && (
        <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
          <div className="flex-1 min-w-[220px] space-y-1"><label className="text-[11px] font-bold text-textSecondary uppercase">Remarks (required to return)</label>
            <input className={`${input} w-full`} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. Add CO mapping for Unit 3" /></div>
          <button className={`${btnPrimary} bg-emerald-600`} disabled={review.isPending} onClick={() => review.mutate('approved')}><Check className="w-3.5 h-3.5 inline mr-1" />Approve</button>
          <button className={btnGhost} disabled={review.isPending || !remarks.trim()} onClick={() => review.mutate('returned')}><Undo2 className="w-3.5 h-3.5 inline mr-1" />Return</button>
        </div>
      )}

      <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold w-fit">
        <button onClick={() => setTab('plan')} className={`px-4 py-2 ${tab === 'plan' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>Plan</button>
        <button onClick={() => setTab('coverage')} disabled={!p} className={`px-4 py-2 disabled:opacity-40 ${tab === 'coverage' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>Syllabus coverage</button>
      </div>

      {tab === 'plan' ? (
        <div className="space-y-4">
          <div className={`${card} p-4 space-y-3`}>
            <p className="text-sm font-black text-textPrimary">Course objectives &amp; outcomes</p>
            <textarea rows={2} disabled={!canEdit} className={`${input} w-full`} placeholder="Course objectives" value={f.objectives} onChange={e => upd({ objectives: e.target.value })} />
            <div className="space-y-1.5">
              {f.outcomes.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input disabled={!canEdit} className={`${input} w-16 font-bold`} value={o.code} onChange={e => upd({ outcomes: f.outcomes.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} />
                  <input disabled={!canEdit} className={`${input} flex-1`} placeholder="Students will be able to…" value={o.text} onChange={e => upd({ outcomes: f.outcomes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  {canEdit && <button onClick={() => upd({ outcomes: f.outcomes.filter((_, j) => j !== i) })} className="p-1.5 text-textMuted hover:text-rose-600" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
              {canEdit && f.outcomes.length < 12 && <button className="text-[11px] font-bold text-brand-primary" onClick={() => upd({ outcomes: [...f.outcomes, { code: `CO${f.outcomes.length + 1}`, text: '' }] })}>+ Add outcome</button>}
            </div>
          </div>

          <div className={`${card} overflow-hidden`}>
            <div className="p-3 border-b border-borderLine flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-textPrimary mr-auto">Topics ({f.topics.length}) · {f.topics.reduce((n, t) => n + (Number(t.periods) || 1), 0)} periods</p>
              {canEdit && (<>
                <button className={btnGhost} onClick={downloadTemplate}><FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Template</button>
                <label className={`${btnGhost} cursor-pointer`}><Upload className="w-3.5 h-3.5 inline mr-1" />Import Excel
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const x = e.target.files?.[0]; if (x) importExcel(x); e.target.value = ''; }} /></label>
                <button className={btnGhost} onClick={() => setSched(s => ({ ...s, open: !s.open }))}><Wand2 className="w-3.5 h-3.5 inline mr-1" />Auto-fill dates</button>
              </>)}
            </div>
            {sched.open && (
              <div className="p-3 border-b border-borderLine bg-surface-2/50 flex flex-wrap items-end gap-3 text-xs">
                <div className="space-y-1"><p className="text-[11px] font-bold text-textSecondary">Start from</p><input type="date" className={input} value={sched.start} onChange={e => setSched({ ...sched, start: e.target.value })} /></div>
                <div className="space-y-1"><p className="text-[11px] font-bold text-textSecondary">Periods per class day {data.class_days?.length ? '(from the timetable)' : '(no timetable found — pick the days)'}</p>
                  <div className="flex flex-wrap gap-1.5">{DAYS.map(d => (
                    <label key={d} className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${sched.days[d] ? 'border-brand-primary bg-brand-soft/40' : 'border-borderLine'}`}>
                      <span className="font-bold">{d.slice(0, 3)}</span>
                      <input type="number" min={0} max={6} className="w-9 bg-transparent text-center" value={sched.days[d] || 0} onChange={e => setSched({ ...sched, days: { ...sched.days, [d]: Number(e.target.value) || 0 } })} />
                    </label>
                  ))}</div></div>
                <button className={btnPrimary} onClick={runSchedule}>Fill dates</button>
              </div>
            )}
            {pastEnd && <p className="px-3 py-2 text-[11px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300">The plan runs past the semester end ({fmtD(data.semester.end_date)}). Reduce periods or add classes.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
                  <tr><th className="px-2 py-2 w-14">Unit</th><th className="px-2 py-2 text-left">Unit title</th><th className="px-2 py-2 text-left min-w-[240px]">Topic</th><th className="px-2 py-2 w-16">Periods</th>
                    <th className="px-2 py-2 w-32">Planned date</th><th className="px-2 py-2 w-20">CO</th><th className="px-2 py-2 w-36">Method</th>{canEdit && <th className="w-8" />}</tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {f.topics.map(t => (
                    <tr key={t.id}>
                      <td className="px-1 py-1"><input disabled={!canEdit} type="number" min={1} max={20} className={`${input} w-12 text-center`} value={t.unit} onChange={e => updTopic(t.id, { unit: Number(e.target.value) || 1 })} /></td>
                      <td className="px-1 py-1"><input disabled={!canEdit} className={`${input} w-full`} value={t.unit_title || ''} onChange={e => updTopic(t.id, { unit_title: e.target.value })} /></td>
                      <td className="px-1 py-1"><input disabled={!canEdit} className={`${input} w-full`} value={t.topic} onChange={e => updTopic(t.id, { topic: e.target.value })} /></td>
                      <td className="px-1 py-1"><input disabled={!canEdit} type="number" min={1} max={10} className={`${input} w-14 text-center`} value={t.periods} onChange={e => updTopic(t.id, { periods: Number(e.target.value) || 1 })} /></td>
                      <td className="px-1 py-1"><input disabled={!canEdit} type="date" className={`${input} w-full`} value={t.planned_date || ''} onChange={e => updTopic(t.id, { planned_date: e.target.value || null })} /></td>
                      <td className="px-1 py-1"><select disabled={!canEdit} className={`${input} w-full`} value={t.co || ''} onChange={e => updTopic(t.id, { co: e.target.value || null })}>
                        <option value="">—</option>{coCodes.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                      <td className="px-1 py-1"><select disabled={!canEdit} className={`${input} w-full`} value={t.method || ''} onChange={e => updTopic(t.id, { method: e.target.value || null })}>
                        <option value="">—</option>{(data.methods || []).map((m: string) => <option key={m} value={m}>{m}</option>)}</select></td>
                      {canEdit && <td className="px-1"><button onClick={() => upd({ topics: f.topics.filter(x => x.id !== t.id) })} className="p-1 text-textMuted hover:text-rose-600" aria-label="Remove topic"><Trash2 className="w-3.5 h-3.5" /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div className="p-3 flex gap-3">
                <button className="text-[11px] font-bold text-brand-primary" onClick={() => { const last = f.topics[f.topics.length - 1]; upd({ topics: [...f.topics, { id: newId(), unit: last?.unit || 1, unit_title: last?.unit_title || '', topic: '', periods: 1, co: last?.co || null, method: last?.method || null }] }); }}><Plus className="w-3 h-3 inline" /> Add topic</button>
                <button className="text-[11px] font-bold text-brand-primary" onClick={() => { const last = f.topics[f.topics.length - 1]; upd({ topics: [...f.topics, { id: newId(), unit: (last?.unit || 0) + 1, unit_title: '', topic: '', periods: 1, co: null, method: null }] }); }}><Plus className="w-3 h-3 inline" /> Add unit</button>
              </div>
            )}
          </div>

          <div className={`${card} p-4 grid md:grid-cols-2 gap-3`}>
            <div className="space-y-1"><p className="text-[11px] font-bold text-textSecondary uppercase">Text books</p><textarea disabled={!canEdit} rows={3} className={`${input} w-full`} value={f.text_books} onChange={e => upd({ text_books: e.target.value })} /></div>
            <div className="space-y-1"><p className="text-[11px] font-bold text-textSecondary uppercase">Reference books / resources</p><textarea disabled={!canEdit} rows={3} className={`${input} w-full`} value={f.references_text} onChange={e => upd({ references_text: e.target.value })} /></div>
            <div className="md:col-span-2 flex flex-wrap items-center gap-2 text-xs">
              <Paperclip className="w-3.5 h-3.5 text-textMuted" />
              {p?.file_url ? <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-primary">Attached lesson plan document</a> : f.file_key ? <span className="font-bold text-emerald-600">Document attached — save to keep</span> : <span className="text-textMuted">Optional: attach your own lesson plan document (PDF / Word / Excel)</span>}
              {canEdit && (
                <label className={`${btnGhost} cursor-pointer`}>{busyFile ? 'Uploading…' : f.file_key ? 'Replace' : 'Attach'}
                  <input type="file" accept=".pdf,.docx,.xlsx" className="hidden" disabled={busyFile} onChange={async e => {
                    const x = e.target.files?.[0]; e.target.value = ''; if (!x) return;
                    setBusyFile(true);
                    try { const r = await uploadAcademicFile('lesson-plans', x); upd({ file_key: r.key }); } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusyFile(false); }
                  }} /></label>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 sticky bottom-2">
              <button className={btnGhost} disabled={save.isPending || !dirty} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}</button>
              {status !== 'approved' && status !== 'submitted' && <button className={btnPrimary} disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? 'Submitting…' : 'Submit to HOD'}</button>}
            </div>
          )}
        </div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="p-4 border-b border-borderLine flex flex-wrap items-center gap-4">
            <CoverageBar covered={summary.covered} total={summary.total} behind={summary.behind} />
            <p className="text-[11px] text-textMuted flex-1">Tick each topic when it is taught. The HOD sees the same view.</p>
          </div>
          <div className="divide-y divide-borderLine">
            {(p?.topics || []).map((t: Topic, i: number) => {
              const today = todayIso();
              const state = t.covered_on ? 'covered' : t.planned_date && t.planned_date < today ? 'overdue' : t.planned_date === today ? 'today' : 'upcoming';
              return (
                <div key={t.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs">
                  <span className="w-6 text-textMuted font-bold">{i + 1}</span>
                  <span className="w-14 text-[10px] font-black text-textSecondary">UNIT {t.unit}</span>
                  <span className="flex-1 min-w-[180px] text-textPrimary font-semibold">{t.topic}<span className="text-textMuted font-normal"> · {t.periods}p{t.co ? ` · ${t.co}` : ''}</span></span>
                  <span className="w-28 text-textSecondary">{t.planned_date ? fmtD(t.planned_date) : '—'}</span>
                  <span className={`w-28 text-[10px] font-black ${state === 'covered' ? 'text-emerald-600' : state === 'overdue' ? 'text-rose-600' : state === 'today' ? 'text-sky-600' : 'text-textMuted'}`}>
                    {state === 'covered' ? `✓ ${fmtD(t.covered_on)}` : state === 'overdue' ? 'Overdue' : state === 'today' ? 'Today' : 'Upcoming'}
                  </span>
                  {canEdit && (t.covered_on
                    ? <button className="text-[11px] font-bold text-textMuted hover:text-rose-600" onClick={() => cover.mutate({ id: t.id, on: null })}>Undo</button>
                    : <span className="flex items-center gap-1.5">
                        <button className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold" disabled={cover.isPending} onClick={() => cover.mutate({ id: t.id, on: todayIso() })}><CalendarCheck2 className="w-3 h-3 inline mr-1" />Taught today</button>
                        <input type="date" max={todayIso()} title="Taught on an earlier day" aria-label="Taught on date" className={`${input} w-[118px]`} value="" onChange={e => e.target.value && cover.mutate({ id: t.id, on: e.target.value })} />
                      </span>)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
