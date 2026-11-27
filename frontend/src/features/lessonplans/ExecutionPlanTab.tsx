/**
 * Course Execution Plan tab — the department's 6-sheet workbook as a form, prefilled from the portal.
 * Faculty fill it in, save, and download the same Excel template with their data in it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { BouncingDots } from '../../components/common/BouncingDots';
import { btnGhost, btnPrimary, card, input } from './lessonPlanShared';
import {
  CatalogRow, EXPERT_FIELDS, ExecPlan, INITIAL_ROWS, InitialKey, calendarWeeks, catalogFor, downloadExecPlan, emptyBrief, emptyTeam, emptyWeek,
  normalizePlan, planChecks, prefillExecPlan, progressOf, totalHours,
} from './execPlan';

type Sheet = 'initial' | 'brief' | 'weekly' | 'experts' | 'teams' | 'catalog';
const SHEETS: [Sheet, string][] = [['initial', 'Initial Plan'], ['brief', 'Brief Plan'], ['weekly', 'Weekly Plan'], ['experts', 'Industry Experts'], ['teams', 'Student Teams'], ['catalog', 'Subject Catalog']];
const METHODS = ['Chalk & Talk', 'PPT', 'Demonstration', 'Hands-on / Lab', 'Flipped Class', 'Case Study', 'Group Discussion', 'Quiz / Activity', 'Video'];
const th = 'px-2 py-1.5 border border-borderLine text-[10px] font-black uppercase tracking-wide text-textSecondary text-left align-bottom';
const td = 'p-1 border border-borderLine align-top';
const cellIn = 'w-full bg-transparent px-1.5 py-1 text-xs text-textPrimary rounded focus:outline-none focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-80';
const label = 'block text-[11px] font-bold text-textSecondary';

/** Up to `max` students picked from the class roster, stored as "Name, Name, Name" */
function StudentPicker({ value, onChange, students, max = 3, disabled }: { value: string; onChange: (v: string) => void; students: string[]; max?: number; disabled?: boolean }) {
  const picked = value.split(',').map(s => s.trim()).filter(Boolean);
  return (
    <div className="min-w-[150px] space-y-1">
      <div className="flex flex-wrap gap-1">
        {picked.map(nm => (
          <span key={nm} className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-textPrimary">{nm}
            {!disabled && <button aria-label={`Remove ${nm}`} onClick={() => onChange(picked.filter(x => x !== nm).join(', '))} className="text-textMuted hover:text-rose-600"><X className="w-3 h-3" /></button>}</span>
        ))}
      </div>
      {!disabled && picked.length < max && (
        <select aria-label="Add a student" className={`${cellIn} border border-dashed border-borderLine`} value="" onChange={e => e.target.value && onChange([...picked, e.target.value].join(', '))}>
          <option value="">+ Add student</option>
          {students.filter(s => !picked.includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

const Area = ({ value, onChange, disabled, rows = 2, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; placeholder?: string; ariaLabel: string }) => (
  <textarea aria-label={ariaLabel} disabled={disabled} rows={Math.max(rows, Math.min(10, value.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 34)), 0)))}
    className={`${cellIn} resize-y`} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
);

export function ExecutionPlanTab({ allotmentId, lp }: { allotmentId: string; lp: any }) {
  const qc = useQueryClient();
  const ex = useQuery({ queryKey: ['execPlan', allotmentId], queryFn: () => api.getExecPlan(allotmentId) });
  const sy = useQuery({ queryKey: ['syllabus', allotmentId], queryFn: () => api.getSyllabus(allotmentId) });
  const [plan, setPlan] = useState<ExecPlan | null>(null);
  const [sheet, setSheet] = useState<Sheet>('initial');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const catalog: CatalogRow[] = ex.data?.catalog || [];
  const students = useMemo(() => (ex.data?.students || []).map(s => s.name), [ex.data]);
  const canEdit = !!ex.data?.can_edit;
  const fresh = () => prefillExecPlan({
    allot: lp.allotment, lessonPlan: lp.plan, classDays: lp.class_days || [], semester: lp.semester, syllabus: sy.data?.syllabus || null,
    strength: ex.data?.strength || 0, catalog, due_date: ex.data?.due_date || null,
  });

  useEffect(() => {
    if (!ex.data || sy.isLoading || plan) return;
    setPlan(normalizePlan(ex.data.plan?.data, fresh()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.data, sy.isLoading]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (ex.isLoading || sy.isLoading || !plan) {
    if (ex.error) return <div className={`${card} p-6 text-sm text-rose-600`}>{(ex.error as any).message}</div>;
    return <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>;
  }

  const set = (next: ExecPlan) => { setPlan(next); setDirty(true); setMsg(null); };
  const setI = (k: InitialKey, v: string) => set({ ...plan, initial: { ...plan.initial, [k]: v } });
  const setRow = <K extends 'brief' | 'weekly' | 'teams' | 'experts'>(list: K, i: number, patch: Partial<ExecPlan[K][number]>) =>
    set({ ...plan, [list]: (plan[list] as any[]).map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const checks = planChecks(plan);
  const total = totalHours(plan);
  const cat = catalogFor(catalog, lp.allotment);
  const toolHints = (cat?.tools || '').split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
  const coCodes = [...new Set([...(sy.data?.syllabus?.outcomes || []), ...(lp.plan?.outcomes || [])].map((o: any) => o?.code).filter(Boolean))] as string[];
  const cos = coCodes.length ? coCodes : ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
  const ro = !canEdit;

  const save = async () => {
    setBusy('save');
    try {
      const r = await api.saveExecPlan(allotmentId, plan);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['execPlan', allotmentId] });
      qc.invalidateQueries({ queryKey: ['deptExecPlans'] });
      setMsg({ ok: true, text: `Saved. The plan is ${r.progress}% filled.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Could not save' }); } finally { setBusy(null); }
  };
  const download = async () => {
    setBusy('download');
    try {
      if (canEdit && dirty) { await api.saveExecPlan(allotmentId, plan); setDirty(false); qc.invalidateQueries({ queryKey: ['deptExecPlans'] }); }
      await downloadExecPlan(plan, catalog, lp.allotment);
      setMsg({ ok: true, text: canEdit && dirty ? 'Saved and downloaded.' : 'Downloaded in the department template.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Could not build the Excel file' }); } finally { setBusy(null); }
  };
  const split7030 = () => {
    const t = (Number(plan.initial.teaching_weeks) || 0) * (Number(plan.initial.hours_per_week) || 0);
    if (!t) { setMsg({ ok: false, text: 'Enter the teaching weeks and hours per week first.' }); return; }
    const c = Math.round(t * 0.7);
    set({ ...plan, initial: { ...plan.initial, classroom_hours: String(c), online_hours: String(t - c) } });
  };
  const resizeWeeks = (weeks: number) => {
    const w = Math.max(1, Math.min(30, weeks));
    set({
      ...plan,
      weekly: Array.from({ length: w }, (_, i) => plan.weekly[i] || emptyWeek(i + 1)),
      teams: Array.from({ length: w }, (_, i) => plan.teams[i] || emptyTeam(i + 1)),
    });
  };
  const pct = progressOf(plan);

  return (
    <div className="space-y-3">
      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-black text-textPrimary">Course Execution Plan</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-32 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-brand-primary" style={{ width: `${pct}%` }} /></div>
            <span className="text-[11px] font-bold text-textSecondary">{pct}% filled{dirty ? ' · unsaved changes' : ex.data?.plan?.updated_at ? ` · saved ${new Date(ex.data.plan.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ' · not saved yet'}</span>
            {ex.data?.due_date && <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Due {new Date(ex.data.due_date + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>}
          </div>
        </div>
        {canEdit && <button className={btnGhost} disabled={!!busy} onClick={() => setConfirmReset(true)}><RotateCcw className="w-3.5 h-3.5 inline mr-1" />Refill from syllabus</button>}
        {canEdit && <button className={btnGhost} disabled={!!busy || !dirty} onClick={save}>{busy === 'save' ? <BouncingDots size="xs" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}Save</button>}
        <button className={btnPrimary} disabled={!!busy} onClick={download}>{busy === 'download' ? <BouncingDots size="xs" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Download Excel</button>
      </div>

      {confirmReset && (
        <div className={`${card} p-3 flex flex-wrap items-center gap-3 border-amber-300`}>
          <p className="text-xs font-bold text-textPrimary flex-1 min-w-[220px]">Replace everything on this plan with a fresh draft from the syllabus, lesson plan and timetable? Anything you typed is lost.</p>
          <button className={btnPrimary} onClick={() => { set(fresh()); setConfirmReset(false); }}>Replace</button>
          <button className={btnGhost} onClick={() => setConfirmReset(false)}>Keep my plan</button>
        </div>
      )}
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}
      {checks.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 text-xs bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 space-y-0.5">
          {checks.map(c => <p key={c} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{c}</p>)}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {SHEETS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sheet === k} onClick={() => setSheet(k)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${sheet === k ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>

      {sheet === 'initial' && (
        <div className={`${card} divide-y divide-borderLine`}>
          {INITIAL_ROWS.map(r => {
            const key = r.key as InitialKey;
            const computed = r.key === 'total' ? String(total || '') : r.key.startsWith('expert') || r.key.startsWith('session') ? null : undefined;
            const e = plan.experts[r.key.endsWith('1') ? 0 : 1];
            const fromExperts = r.key.startsWith('expert') ? [e.name, e.role, e.company, e.specialization].filter(Boolean).join(', ')
              : r.key.startsWith('session') ? [e.date, e.topic, e.outcomes].filter(Boolean).join(', ') : '';
            return (
              <div key={r.key} className="grid grid-cols-1 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-4 gap-y-1 p-3">
                <div>
                  <label htmlFor={`cep-${r.key}`} className="text-xs font-bold text-textPrimary whitespace-pre-line">{r.label}</label>
                </div>
                <div className="space-y-1">
                  {computed !== undefined ? (
                    <p id={`cep-${r.key}`} className="text-xs text-textPrimary px-1.5 py-1 rounded bg-surface-2/60">
                      {r.key === 'total' ? (total ? `${total} hours (classroom ${plan.initial.classroom_hours || 0} + online ${plan.initial.online_hours || 0})` : '—')
                        : fromExperts || <span className="text-textMuted">Filled from the Industry Experts tab</span>}
                    </p>
                  ) : r.long ? (
                    <textarea id={`cep-${r.key}`} disabled={ro} rows={3} className={`${input} w-full resize-y`} value={plan.initial[key]} onChange={ev => setI(key, ev.target.value)} />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <input id={`cep-${r.key}`} disabled={ro} type={r.type === 'date' ? 'date' : r.type === 'number' ? 'number' : 'text'} min={r.type === 'number' ? 0 : undefined}
                        className={`${input} ${r.type ? 'w-40' : 'w-full'}`} value={plan.initial[key]} onChange={ev => setI(key, ev.target.value)} />
                      {r.key === 'teaching_weeks' && calendarWeeks(plan) > 0 && <span className="text-[11px] text-textMuted">{calendarWeeks(plan)} calendar weeks · 70% = {Math.floor(calendarWeeks(plan) * 0.7)}</span>}
                      {r.key === 'teaching_weeks' && canEdit && plan.weekly.length !== (Number(plan.initial.teaching_weeks) || plan.weekly.length) && (
                        <button className="text-[11px] font-bold text-brand-primary" onClick={() => resizeWeeks(Number(plan.initial.teaching_weeks))}>Set Weekly Plan to {plan.initial.teaching_weeks} weeks</button>)}
                      {r.key === 'classroom_hours' && canEdit && <button className="text-[11px] font-bold text-brand-primary" onClick={split7030}>Split weeks × hours as 70 / 30</button>}
                      {r.key === 'classroom_hours' && total > 0 && <span className="text-[11px] text-textMuted">{Math.round((Number(plan.initial.classroom_hours) / total) * 100)}% of {total}</span>}
                    </div>
                  )}
                  {['faculty_tool', 'tool_a', 'tool_b', 'tool_c'].includes(r.key) && canEdit && toolHints.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1"><span className="text-[10px] text-textMuted">Suggested:</span>
                      {toolHints.map(t => <button key={t} onClick={() => setI(key, plan.initial[key] ? `${plan.initial[key]}; ${t}` : t)} className="rounded-full border border-borderLine px-2 py-0.5 text-[10px] font-bold text-textSecondary hover:bg-surface-2">{t}</button>)}
                    </div>
                  )}
                  {r.hint && <p className="text-[11px] text-textMuted whitespace-pre-line">{r.hint}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sheet === 'brief' && (
        <div className={`${card} p-3 space-y-2`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs border-collapse">
              <thead><tr>{['Unit', 'Heading of the Unit', 'Detailed topics', 'Course outcome(s)', 'Hours', 'Classroom', 'Online / collab', 'Tool / activity', 'Evidence / deliverable', ''].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {plan.brief.map((r, i) => (
                  <tr key={i}>
                    <td className={`${td} w-20`}><input aria-label="Unit" disabled={ro} className={cellIn} value={r.unit} onChange={e => setRow('brief', i, { unit: e.target.value })} /></td>
                    <td className={`${td} w-44`}><Area ariaLabel={`Unit ${i + 1} heading`} disabled={ro} value={r.heading} onChange={v => setRow('brief', i, { heading: v })} /></td>
                    <td className={td}><Area ariaLabel={`Unit ${i + 1} topics`} disabled={ro} rows={3} value={r.topics} onChange={v => setRow('brief', i, { topics: v })} /></td>
                    <td className={`${td} w-36`}>
                      <div className="flex flex-wrap gap-1 p-1">
                        {cos.map(c => {
                          const on = r.cos.split('/').map(s => s.trim()).includes(c);
                          return <button key={c} disabled={ro} aria-pressed={on} onClick={() => setRow('brief', i, { cos: cos.filter(x => (x === c ? !on : r.cos.split('/').map(s => s.trim()).includes(x))).join(' / ') })}
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-black border ${on ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{c}</button>;
                        })}
                      </div>
                    </td>
                    {(['hours', 'classroom', 'online'] as const).map(k => (
                      <td key={k} className={`${td} w-16`}><input aria-label={k} type="number" min={0} disabled={ro} className={cellIn} value={r[k]} onChange={e => setRow('brief', i, { [k]: e.target.value })} /></td>
                    ))}
                    <td className={`${td} w-36`}><Area ariaLabel="Tool" disabled={ro} value={r.tool} onChange={v => setRow('brief', i, { tool: v })} /></td>
                    <td className={`${td} w-36`}><Area ariaLabel="Evidence" disabled={ro} value={r.evidence} onChange={v => setRow('brief', i, { evidence: v })} /></td>
                    <td className={`${td} w-8`}>{canEdit && plan.brief.length > 1 && <button aria-label="Remove unit" onClick={() => set({ ...plan, brief: plan.brief.filter((_, j) => j !== i) })} className="p-1 text-textMuted hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-black text-textPrimary">
                <td className={td} colSpan={4}><span className="px-1.5">Total</span></td>
                {(['hours', 'classroom', 'online'] as const).map(k => <td key={k} className={`${td} px-2`}>{plan.brief.reduce((s, r) => s + (Number(r[k]) || 0), 0)}</td>)}
                <td className={td} colSpan={3} />
              </tr></tfoot>
            </table>
          </div>
          {canEdit && plan.brief.length < 12 && <button className="text-[11px] font-bold text-brand-primary" onClick={() => set({ ...plan, brief: [...plan.brief, emptyBrief(plan.brief.length + 1)] })}><Plus className="w-3 h-3 inline" /> Add unit</button>}
        </div>
      )}

      {sheet === 'weekly' && (
        <div className={`${card} p-3 space-y-2`}>
          <p className="text-[11px] text-textMuted">Topics are spread across the weeks from the syllabus. Groups are picked from the class list ({students.length} students).</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-xs border-collapse">
              <thead><tr>{['Week', 'Unit / topic', 'Competency / CO', 'Classroom method', 'Classroom hrs', 'Online / collab hrs', 'Total', 'Teacher-student activity', 'Tool / feature', 'Group A (3 names)', 'Group B (3 names)', 'Deliverable / evidence'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {plan.weekly.map((r, i) => (
                  <tr key={i}>
                    <td className={`${td} w-12 text-center font-black text-textPrimary pt-2`}>{r.week || i + 1}</td>
                    <td className={`${td} w-64`}><Area ariaLabel={`Week ${i + 1} topic`} disabled={ro} rows={2} value={r.topic} onChange={v => setRow('weekly', i, { topic: v })} /></td>
                    <td className={`${td} w-28`}><input aria-label="CO" disabled={ro} className={cellIn} value={r.co} onChange={e => setRow('weekly', i, { co: e.target.value })} /></td>
                    <td className={`${td} w-32`}><input aria-label="Method" list="cep-methods" disabled={ro} className={cellIn} value={r.method} onChange={e => setRow('weekly', i, { method: e.target.value })} /></td>
                    {(['classroom', 'online'] as const).map(k => (
                      <td key={k} className={`${td} w-16`}><input aria-label={k} type="number" min={0} disabled={ro} className={cellIn} value={r[k]} onChange={e => setRow('weekly', i, { [k]: e.target.value })} /></td>
                    ))}
                    <td className={`${td} w-12 text-center font-bold pt-2`}>{(Number(r.classroom) || 0) + (Number(r.online) || 0) || ''}</td>
                    <td className={`${td} w-40`}><Area ariaLabel="Activity" disabled={ro} value={r.activity} onChange={v => setRow('weekly', i, { activity: v })} /></td>
                    <td className={`${td} w-32`}><Area ariaLabel="Tool" disabled={ro} value={r.tool} onChange={v => setRow('weekly', i, { tool: v })} /></td>
                    <td className={td}><StudentPicker disabled={ro} students={students} value={r.group_a} onChange={v => setRow('weekly', i, { group_a: v })} /></td>
                    <td className={td}><StudentPicker disabled={ro} students={students} value={r.group_b} onChange={v => setRow('weekly', i, { group_b: v })} /></td>
                    <td className={`${td} w-36`}><Area ariaLabel="Deliverable" disabled={ro} value={r.deliverable} onChange={v => setRow('weekly', i, { deliverable: v })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="cep-methods">{METHODS.map(m => <option key={m} value={m} />)}</datalist>
          </div>
          {canEdit && (
            <div className="flex gap-3">
              <button className="text-[11px] font-bold text-brand-primary" onClick={() => resizeWeeks(plan.weekly.length + 1)}><Plus className="w-3 h-3 inline" /> Add week</button>
              {plan.weekly.length > 1 && <button className="text-[11px] font-bold text-textSecondary hover:text-rose-600" onClick={() => resizeWeeks(plan.weekly.length - 1)}>Remove last week</button>}
            </div>
          )}
        </div>
      )}

      {sheet === 'experts' && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-xs border-collapse">
            <thead><tr><th className={th}>Expert Session</th><th className={th}>1</th><th className={th}>2</th></tr></thead>
            <tbody>
              {EXPERT_FIELDS.map(f => (
                <tr key={f.key}>
                  <td className={`${td} w-48 px-2 pt-2 font-bold text-textPrimary`}>{f.label}</td>
                  {[0, 1].map(i => (
                    <td key={i} className={td}>
                      {f.long ? <Area ariaLabel={`Expert ${i + 1} ${f.label}`} disabled={ro} value={plan.experts[i][f.key]} onChange={v => setRow('experts', i, { [f.key]: v })} />
                        : f.key === 'alumni' || f.key === 'mode' ? (
                          <select aria-label={`Expert ${i + 1} ${f.label}`} disabled={ro} className={cellIn} value={plan.experts[i][f.key]} onChange={e => setRow('experts', i, { [f.key]: e.target.value })}>
                            <option value="" />{(f.key === 'alumni' ? ['Alumni', 'Non-Alumni'] : ['Online', 'In-campus']).map(o => <option key={o}>{o}</option>)}
                          </select>)
                        : <input aria-label={`Expert ${i + 1} ${f.label}`} disabled={ro} type={f.type === 'date' ? 'date' : f.key === 'email' ? 'email' : f.key === 'linkedin' ? 'url' : 'text'}
                          className={cellIn} value={plan.experts[i][f.key]} onChange={e => setRow('experts', i, { [f.key]: e.target.value })} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sheet === 'teams' && (
        <div className={`${card} p-3 space-y-2`}>
          <p className="text-[11px] text-textMuted">Fill this week by week during the semester: which students demonstrated which tool, with the evidence link and your feedback.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-xs border-collapse">
              <thead><tr>{['Week', 'Date', 'Duration (min)', 'Tool', 'Student 1', 'Student 2', 'Student 3', 'Feature demonstrated', 'Learning objective', 'Evidence link', 'Faculty feedback'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {plan.teams.map((r, i) => (
                  <tr key={i}>
                    <td className={`${td} w-12 text-center font-black text-textPrimary pt-2`}>{r.week || i + 1}</td>
                    <td className={`${td} w-32`}><input aria-label="Date" type="date" disabled={ro} className={cellIn} value={r.date} onChange={e => setRow('teams', i, { date: e.target.value })} /></td>
                    <td className={`${td} w-20`}><input aria-label="Duration" type="number" min={0} disabled={ro} className={cellIn} value={r.duration} onChange={e => setRow('teams', i, { duration: e.target.value })} /></td>
                    <td className={`${td} w-28`}><input aria-label="Tool" disabled={ro} className={cellIn} value={r.tool} onChange={e => setRow('teams', i, { tool: e.target.value })} /></td>
                    {(['s1', 's2', 's3'] as const).map(k => (
                      <td key={k} className={`${td} w-36`}>
                        <select aria-label={`Student ${k.slice(1)}`} disabled={ro} className={cellIn} value={r[k]} onChange={e => setRow('teams', i, { [k]: e.target.value })}>
                          <option value="" />{(r[k] && !students.includes(r[k]) ? [r[k], ...students] : students).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    ))}
                    <td className={`${td} w-36`}><Area ariaLabel="Feature" disabled={ro} value={r.feature} onChange={v => setRow('teams', i, { feature: v })} /></td>
                    <td className={`${td} w-36`}><Area ariaLabel="Objective" disabled={ro} value={r.objective} onChange={v => setRow('teams', i, { objective: v })} /></td>
                    <td className={`${td} w-36`}><input aria-label="Evidence link" type="url" disabled={ro} className={cellIn} placeholder="https://…" value={r.evidence} onChange={e => setRow('teams', i, { evidence: e.target.value })} /></td>
                    <td className={`${td} w-40`}><Area ariaLabel="Feedback" disabled={ro} value={r.feedback} onChange={v => setRow('teams', i, { feedback: v })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sheet === 'catalog' && (
        <div className={`${card} p-3 space-y-2`}>
          <p className="text-[11px] text-textMuted">{catalog.length ? 'The department’s subject catalog, kept by the HOD. It goes into the first sheet of the download.' : 'The HOD hasn’t added the department’s subject catalog yet, so the download keeps the template’s sample table.'}</p>
          {catalog.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs border-collapse">
                <thead><tr>{['Semester', 'Short Code', 'Subject', 'Syllabus Code', 'Key Concepts / Key Topics', 'Suggested tools'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>{catalog.map((c, i) => (
                  <tr key={i} className={cat === c ? 'bg-brand-primary/5 font-bold' : ''}>
                    {(['semester', 'short_code', 'subject', 'syllabus_code', 'key_topics', 'tools'] as const).map(k => <td key={k} className={`${td} px-2 py-1.5 text-textPrimary`}>{c[k]}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
