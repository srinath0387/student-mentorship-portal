import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, Trash2, Save, Loader2, Table2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const OUTCOMES = [...Array.from({ length: 12 }, (_, i) => `PO${i + 1}`), 'PSO1', 'PSO2', 'PSO3'];
const DEFAULTS = { target_pct: 60, l1: 50, l2: 60, l3: 70, direct_weight: 80 };
const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2 py-1.5 text-xs rounded-lg border border-borderLine bg-background font-semibold focus:outline-none';
const levelTone = (v: number | null | undefined) => v === null || v === undefined ? 'text-textMuted' : v >= 2.5 ? 'text-emerald-600' : v >= 1.5 ? 'text-amber-600' : 'text-red-600';

interface Cfg { settings: typeof DEFAULTS; cos: { id: string; text: string }[]; mapping: Record<string, Record<string, number>>; attainment: Record<string, { direct_pct: number | null; indirect: number | null }> }

/** Same calculation as the server, for live preview. */
function compute(cfg: Cfg) {
  const st = { ...DEFAULTS, ...cfg.settings };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const cos = cfg.cos.map(co => {
    const a = cfg.attainment[co.id] || { direct_pct: null, indirect: null };
    const pct = a.direct_pct === null || (a.direct_pct as any) === '' ? null : Number(a.direct_pct);
    const direct = pct === null ? null : pct >= st.l3 ? 3 : pct >= st.l2 ? 2 : pct >= st.l1 ? 1 : 0;
    const ind = a.indirect === null || (a.indirect as any) === '' ? null : Number(a.indirect);
    const w = st.direct_weight / 100;
    return { id: co.id, direct, attainment: direct === null ? null : r2(ind === null ? direct : w * direct + (1 - w) * ind) };
  });
  const po: Record<string, number | null> = {};
  for (const o of OUTCOMES) {
    let num = 0, den = 0;
    for (const c of cos) { const m = cfg.mapping[c.id]?.[o] || 0; if (m > 0 && c.attainment !== null) { num += c.attainment * m; den += m; } }
    po[o] = den ? r2(num / den) : null;
  }
  return { cos, po };
}

function CourseEditor({ allotmentId }: { allotmentId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['obeCourse', allotmentId], queryFn: () => api.getObeCourse(allotmentId) });
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (data) setCfg({ settings: { ...DEFAULTS, ...data.config.settings }, cos: data.config.cos.length ? data.config.cos : [{ id: 'CO1', text: '' }],
      mapping: data.config.mapping || {}, attainment: data.config.attainment || {} });
  }, [data]);
  const save = useMutation({
    mutationFn: () => api.saveObeCourse(allotmentId, cfg),
    onSuccess: () => { setMsg({ ok: true, text: 'Saved.' }); qc.invalidateQueries({ queryKey: ['obeCourses'] }); qc.invalidateQueries({ queryKey: ['obeCourse', allotmentId] }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Could not save' }),
  });
  const result = useMemo(() => (cfg ? compute(cfg) : null), [cfg]);
  if (isLoading || !cfg || !result) return <div className={`${card} p-8 text-center text-xs text-textMuted`}>Loading course…</div>;
  const edit = data.can_edit;
  const renumber = (cos: Cfg['cos']) => cos.map((c, i) => ({ ...c, id: `CO${i + 1}` }));
  const setMap = (co: string, o: string, v: number) => setCfg({ ...cfg, mapping: { ...cfg.mapping, [co]: { ...(cfg.mapping[co] || {}), [o]: v } } });
  const setAtt = (co: string, k: 'direct_pct' | 'indirect', v: string) =>
    setCfg({ ...cfg, attainment: { ...cfg.attainment, [co]: { ...(cfg.attainment[co] || { direct_pct: null, indirect: null }), [k]: v === '' ? null : Number(v) } } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-textPrimary">{data.course.subject_name} · {data.course.semester_label} {data.course.section}</div>
          <div className="text-[11px] text-textMuted">{data.course.department} · {data.course.faculty_name}</div>
        </div>
        {edit && <button disabled={save.isPending} onClick={() => save.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save</button>}
      </div>
      {msg && <div className={`px-3 py-2 rounded-xl text-xs font-semibold ${msg.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{msg.text}</div>}

      <div className={`${card} p-4 space-y-2`}>
        <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">1 · Course outcomes</h3>
        {cfg.cos.map((co, i) => (
          <div key={co.id} className="flex items-center gap-2">
            <span className="w-10 text-xs font-black text-brand-primary">{co.id}</span>
            <input disabled={!edit} value={co.text} onChange={e => setCfg({ ...cfg, cos: cfg.cos.map((c, j) => j === i ? { ...c, text: e.target.value } : c) })}
              placeholder="Students will be able to…" className={`${input} flex-1`} />
            {edit && cfg.cos.length > 1 && <button onClick={() => setCfg({ ...cfg, cos: renumber(cfg.cos.filter((_, j) => j !== i)) })} className="p-1.5 text-textMuted hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
        {edit && cfg.cos.length < 12 && <button onClick={() => setCfg({ ...cfg, cos: [...cfg.cos, { id: `CO${cfg.cos.length + 1}`, text: '' }] })}
          className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-borderLine inline-flex items-center gap-1"><Plus className="w-3 h-3" />Add CO</button>}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary">2 · CO → PO / PSO mapping (0 none · 1 low · 2 medium · 3 high)</div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr className="bg-surface-2 text-textMuted font-bold text-[10px]"><th className="py-2 px-3 text-left">CO</th>{OUTCOMES.map(o => <th key={o} className="py-2 px-1.5 text-center">{o}</th>)}</tr></thead>
            <tbody className="divide-y divide-borderLine">
              {cfg.cos.map(co => (
                <tr key={co.id}>
                  <td className="py-1.5 px-3 font-black text-brand-primary">{co.id}</td>
                  {OUTCOMES.map(o => (
                    <td key={o} className="py-1 px-1 text-center">
                      <select disabled={!edit} value={cfg.mapping[co.id]?.[o] || 0} onChange={e => setMap(co.id, o, Number(e.target.value))}
                        className={`w-11 px-1 py-1 rounded-md border border-borderLine bg-background text-center font-bold ${(cfg.mapping[co.id]?.[o] || 0) > 0 ? 'text-brand-primary' : 'text-textMuted'}`}>
                        {[0, 1, 2, 3].map(v => <option key={v} value={v}>{v === 0 ? '–' : v}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">3 · Attainment</h3>
        <div className="flex flex-wrap gap-3 text-[11px] text-textSecondary">
          {([['target_pct', 'Target mark %'], ['l1', 'Level 1 if ≥ % students'], ['l2', 'Level 2 if ≥'], ['l3', 'Level 3 if ≥'], ['direct_weight', 'Direct weight %']] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5">{label}
              <input disabled={!edit} type="number" value={cfg.settings[k]} onChange={e => setCfg({ ...cfg, settings: { ...cfg.settings, [k]: Number(e.target.value) } })} className={`${input} w-16`} />
            </label>
          ))}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-textMuted font-bold text-[10px] uppercase"><th className="text-left py-1.5">CO</th><th className="text-left">% students ≥ target (direct)</th><th className="text-left">Course-exit survey (0–3)</th><th className="text-center">Direct level</th><th className="text-center">CO attainment</th></tr></thead>
          <tbody className="divide-y divide-borderLine">
            {cfg.cos.map((co, i) => (
              <tr key={co.id}>
                <td className="py-1.5 font-black text-brand-primary">{co.id}</td>
                <td><input disabled={!edit} type="number" min={0} max={100} value={cfg.attainment[co.id]?.direct_pct ?? ''} onChange={e => setAtt(co.id, 'direct_pct', e.target.value)} className={`${input} w-24`} /></td>
                <td><input disabled={!edit} type="number" min={0} max={3} step={0.1} value={cfg.attainment[co.id]?.indirect ?? ''} onChange={e => setAtt(co.id, 'indirect', e.target.value)} className={`${input} w-24`} /></td>
                <td className="text-center font-bold text-textSecondary">{result.cos[i]?.direct ?? '—'}</td>
                <td className={`text-center font-black ${levelTone(result.cos[i]?.attainment)}`}>{result.cos[i]?.attainment ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary">4 · PO / PSO attainment (out of 3)</div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <tbody><tr>{OUTCOMES.map(o => (
              <td key={o} className="px-3 py-2 text-center"><div className="text-[10px] font-bold text-textMuted">{o}</div><div className={`font-black ${levelTone(result.po[o])}`}>{result.po[o] ?? '—'}</div></td>
            ))}</tr></tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DepartmentSummary({ courses }: { courses: any[] }) {
  const done = courses.filter(c => c.po_attainment && Object.values(c.po_attainment).some(v => v !== null));
  const avg: Record<string, number | null> = {};
  for (const o of OUTCOMES) {
    const vals = done.map(c => c.po_attainment[o]).filter((v: any) => v !== null) as number[];
    avg[o] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  }
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary">PO attainment by course ({done.length} of {courses.length} courses with data)</div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead><tr className="bg-surface-2 text-textMuted font-bold text-[10px]"><th className="py-2 px-3 text-left">Course</th>{OUTCOMES.map(o => <th key={o} className="py-2 px-1.5 text-center">{o}</th>)}</tr></thead>
          <tbody className="divide-y divide-borderLine">
            {done.map(c => (
              <tr key={c.allotment_id}>
                <td className="py-1.5 px-3 whitespace-nowrap"><b className="text-textPrimary">{c.subject_name}</b> <span className="text-textMuted">{c.semester_label} {c.section}</span></td>
                {OUTCOMES.map(o => <td key={o} className={`py-1.5 px-1.5 text-center font-bold ${levelTone(c.po_attainment[o])}`}>{c.po_attainment[o] ?? '·'}</td>)}
              </tr>
            ))}
            <tr className="bg-surface-2">
              <td className="py-2 px-3 font-black text-textPrimary">Average</td>
              {OUTCOMES.map(o => <td key={o} className={`py-2 px-1.5 text-center font-black ${levelTone(avg[o])}`}>{avg[o] ?? '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const ObePage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || '';
  const { data: courses = [], isLoading } = useQuery<any[]>({ queryKey: ['obeCourses'], queryFn: () => api.getObeCourses() });
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'course' | 'summary'>(role === 'faculty' ? 'course' : 'summary');
  const active = selected || courses[0]?.allotment_id || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><Target className="w-5 h-5 text-brand-primary" />CO–PO Attainment</h1>
          <p className="text-xs text-textMuted mt-0.5">Outcome-based education: course outcomes, mapping to programme outcomes, and attainment (NBA)</p>
        </div>
        {role !== 'faculty' && (
          <div className="flex gap-1.5">
            <button onClick={() => setMode('summary')} className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${mode === 'summary' ? 'bg-brand-primary text-white' : 'text-textSecondary bg-surface-2'}`}><Table2 className="w-3.5 h-3.5" />Department summary</button>
            <button onClick={() => setMode('course')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${mode === 'course' ? 'bg-brand-primary text-white' : 'text-textSecondary bg-surface-2'}`}>Courses</button>
          </div>
        )}
      </div>
      {isLoading ? <div className={`${card} p-8 text-center text-xs text-textMuted`}>Loading courses…</div>
        : courses.length === 0 ? <div className={`${card} p-8 text-center text-xs text-textMuted`}>No subject allotments found.</div>
        : mode === 'summary' ? <DepartmentSummary courses={courses} />
        : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
            <div className="space-y-1.5 max-h-[75vh] overflow-y-auto">
              {courses.map(c => (
                <button key={c.allotment_id} onClick={() => setSelected(c.allotment_id)}
                  className={`${card} w-full p-3 text-left ${active === c.allotment_id ? 'ring-2 ring-brand-primary' : ''}`}>
                  <div className="text-xs font-black text-textPrimary">{c.subject_name}</div>
                  <div className="text-[10px] text-textMuted">{c.semester_label} {c.section} · {c.department}</div>
                  <div className={`text-[10px] font-bold ${c.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {c.configured ? `${c.cos_count} COs · attainment for ${c.attainment_entered}` : 'Not set up yet'}
                  </div>
                </button>
              ))}
            </div>
            {active && <CourseEditor allotmentId={active} />}
          </div>
        )}
    </div>
  );
};

export default ObePage;
