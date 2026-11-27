/**
 * Course Execution Plans — HOD / oversight view: how far every subject's plan is filled, download one or
 * all of them in the department template, and keep the department's subject catalog (sheet 1) and due date.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ChevronRight, Download, FileArchive, Plus, Save, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { BouncingDots } from '../../components/common/BouncingDots';
import { LessonPlanEditor } from './LessonPlanEditor';
import { btnGhost, btnPrimary, card, input } from './lessonPlanShared';
import { CatalogRow, buildExecPlanXlsx, execPlanFileName, normalizePlan, prefillExecPlan } from './execPlan';

const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
const CAT_COLS: [keyof CatalogRow, string, string][] = [
  ['semester', 'Semester', 'w-20'], ['short_code', 'Short Code', 'w-20'], ['subject', 'Subject', 'w-48'], ['syllabus_code', 'Syllabus Code', 'w-24'],
  ['key_topics', 'Key Concepts / Key Topics', ''], ['tools', 'Suggested tools', ''],
];
const emptyCat = (): CatalogRow => ({ semester: '', short_code: '', subject: '', syllabus_code: '', key_topics: '', tools: '' });
const planFrom = (row: any, catalog: CatalogRow[]) => normalizePlan(row.data, prefillExecPlan({
  allot: row, lessonPlan: null, classDays: [], semester: null, syllabus: null, strength: 0, catalog, due_date: null,
}));

function Progress({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[11px] font-bold text-textMuted">Not started</span>;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-1.5 w-20 rounded-full bg-surface-2 overflow-hidden"><div className={`h-full rounded-full ${pct >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-[11px] font-bold text-textSecondary tabular-nums">{pct}%</span>
    </div>
  );
}

export default function ExecPlansPage() {
  const { user } = useAuth();
  const loc = useLocation(); const nav = useNavigate(); const qc = useQueryClient();
  const open = new URLSearchParams(loc.search).get('allotment');
  const locked = user?.role === 'hod';
  const [dept, setDept] = useState(() => new URLSearchParams(loc.search).get('department') || 'All');
  const [filter, setFilter] = useState<'all' | 'missing' | 'progress' | 'ready'>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [cat, setCat] = useState<CatalogRow[]>([]);
  const [due, setDue] = useState('');
  const [catDirty, setCatDirty] = useState(false);
  const key = locked ? 'own' : dept;
  const { data, isLoading, error } = useQuery({ queryKey: ['deptExecPlans', key], queryFn: () => api.getDeptExecPlans(locked ? undefined : dept) });
  useEffect(() => { if (data) { setCat(data.catalog?.length ? data.catalog : []); setDue(data.due_date || ''); setCatDirty(false); } }, [data]);

  const rows: any[] = data?.rows || [];
  const shown = useMemo(() => rows.filter(r =>
    (filter === 'all' || (filter === 'missing' && r.progress == null) || (filter === 'progress' && r.progress != null && r.progress < 90) || (filter === 'ready' && r.progress >= 90)) &&
    (!q.trim() || `${r.subject_name} ${r.faculty_name} ${r.section} ${r.semester_label}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, filter, q]);

  if (open) return <LessonPlanEditor allotmentId={open} initialTab="execution" onBack={() => nav('/lesson-plans/execution')} />;

  // the server scopes HODs and department admins to their own department; data.department says which one
  const canManage = (user?.role === 'hod' || user?.role === 'admin') && !!data?.department && data.department !== 'All';
  const k = {
    total: rows.length, missing: rows.filter(r => r.progress == null).length,
    progress: rows.filter(r => r.progress != null && r.progress < 90).length, ready: rows.filter(r => r.progress >= 90).length,
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Something went wrong' }); } finally { setBusy(null); }
  };
  const downloadOne = (r: any) => run(r.allotment_id, async () => {
    const d = await api.getExecPlan(r.allotment_id);
    if (!d.plan) throw new Error('This plan has not been saved yet.');
    const p = planFrom({ ...r, data: d.plan.data }, d.catalog);
    saveAs(await buildExecPlanXlsx(p, d.catalog), execPlanFileName(p, r));
  });
  const downloadAll = () => run('all', async () => {
    const full = await api.getDeptExecPlans(locked ? undefined : dept, true);
    if (!full.rows.length) throw new Error('No plans have been saved yet.');
    const zip = new JSZip(); const used = new Set<string>();
    for (const r of full.rows) {
      const p = planFrom(r, full.catalog);
      let name = execPlanFileName(p, r);
      for (let i = 2; used.has(name); i++) name = name.replace(/( \(\d+\))?\.xlsx$/, ` (${i}).xlsx`);
      used.add(name);
      zip.file(name, await buildExecPlanXlsx(p, full.catalog));
    }
    saveAs(await zip.generateAsync({ type: 'blob' }), `Course Execution Plans - ${full.department}.zip`);
    setMsg({ ok: true, text: `Downloaded ${full.rows.length} plan${full.rows.length === 1 ? '' : 's'} as one zip file.` });
  });
  const saveSettings = () => run('settings', async () => {
    const r = await api.saveExecSettings({ department: data?.department, catalog: cat, due_date: due || null });
    qc.invalidateQueries({ queryKey: ['deptExecPlans'] }); qc.invalidateQueries({ queryKey: ['execPlan'] });
    setCatDirty(false);
    setMsg({ ok: true, text: `Saved: ${r.catalog.length} subjects in the catalog${r.due_date ? `, due ${new Date(r.due_date + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ''}.` });
  });
  /** Read the "Subject Catalog" sheet of the department's Excel template */
  const importCatalog = (file: File) => run('import', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames.find(s => /catalog/i.test(s)) || wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    const list = raw.slice(1).map(r => ({
      semester: String(r[0] || '').trim(), short_code: String(r[1] || '').trim(), subject: String(r[2] || '').trim(),
      syllabus_code: String(r[3] || '').trim(), key_topics: String(r[4] || '').trim(), tools: String(r[5] || '').trim(),
    })).filter(r => r.subject && (r.short_code || r.semester));
    if (!list.length) throw new Error('No subjects found. Use the Subject Catalog sheet: Semester, Short Code, Subject, Syllabus Code, Key Topics, Suggested tools.');
    setCat(list); setCatDirty(true); setCatOpen(true);
    setMsg({ ok: true, text: `Read ${list.length} subjects from the file. Check them, then Save catalog.` });
  });
  const updCat = (i: number, patch: Partial<CatalogRow>) => { setCat(cat.map((c, j) => (j === i ? { ...c, ...patch } : c))); setCatDirty(true); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Course Execution Plans</h1>
          <p className="text-xs text-textSecondary">{data?.department || '…'} · faculty fill their plan under My Lesson Plans → subject → Execution Plan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <select aria-label="Department" className={input} value={dept} onChange={e => setDept(e.target.value)}>
              <option value="All">All departments</option>{(DEPTS.includes(dept) || dept === 'All' ? DEPTS : [dept, ...DEPTS]).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <button className={btnPrimary} disabled={!!busy || !rows.some(r => r.progress != null)} onClick={downloadAll}>
            {busy === 'all' ? <BouncingDots size="xs" /> : <FileArchive className="w-3.5 h-3.5 inline mr-1" />}Download all (zip)</button>
        </div>
      </div>

      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([['Subjects', k.total, ''], ['Not started', k.missing, 'text-rose-600'], ['In progress', k.progress, 'text-amber-600'], ['90% or more filled', k.ready, 'text-emerald-600']] as const).map(([l, v, c]) => (
          <div key={l} className={`${card} p-3`}><p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{l}</p><p className={`text-2xl font-black tabular-nums ${c || 'text-textPrimary'}`}>{v}</p></div>
        ))}
      </div>

      {canManage && (
        <div className={`${card}`}>
          <div className="p-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1"><label htmlFor="cep-due" className="block text-[11px] font-bold text-textSecondary uppercase tracking-wider">Submission date</label>
              <input id="cep-due" type="date" className={input} value={due} onChange={e => { setDue(e.target.value); setCatDirty(true); }} /></div>
            <p className="text-xs text-textSecondary flex-1 min-w-[200px]">Subject catalog: <b className="text-textPrimary">{cat.length ? `${cat.length} subject${cat.length === 1 ? '' : 's'}` : 'not added (downloads keep the template sample)'}</b>. Faculty see their subject’s suggested tools, and the catalog goes into sheet 1.</p>
            <button className={btnGhost} onClick={() => setCatOpen(o => !o)}>{catOpen ? 'Hide catalog' : 'Edit catalog'}</button>
            <label className={`${btnGhost} cursor-pointer`}><Upload className="w-3.5 h-3.5 inline mr-1" />Import from Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importCatalog(f); e.target.value = ''; }} /></label>
            <button className={btnPrimary} disabled={!!busy || !catDirty} onClick={saveSettings}>{busy === 'settings' ? <BouncingDots size="xs" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}Save</button>
          </div>
          {catOpen && (
            <div className="border-t border-borderLine p-3 space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs border-collapse">
                  <thead><tr>{CAT_COLS.map(([, l]) => <th key={l} className="px-2 py-1.5 border border-borderLine text-left text-[10px] font-black uppercase text-textSecondary">{l}</th>)}<th className="border border-borderLine w-8" /></tr></thead>
                  <tbody>
                    {cat.map((c, i) => (
                      <tr key={i}>
                        {CAT_COLS.map(([key2, l, w]) => (
                          <td key={key2} className={`p-1 border border-borderLine ${w}`}>
                            <input aria-label={l} className="w-full bg-transparent px-1.5 py-1 text-xs text-textPrimary rounded focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                              placeholder={key2 === 'semester' ? 'II-II' : ''} value={c[key2]} onChange={e => updCat(i, { [key2]: e.target.value })} />
                          </td>
                        ))}
                        <td className="p-1 border border-borderLine"><button aria-label="Remove subject" onClick={() => { setCat(cat.filter((_, j) => j !== i)); setCatDirty(true); }} className="p-1 text-textMuted hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="text-[11px] font-bold text-brand-primary" onClick={() => { setCat([...cat, emptyCat()]); setCatDirty(true); }}><Plus className="w-3 h-3 inline" /> Add subject</button>
            </div>
          )}
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="p-3 border-b border-borderLine flex flex-wrap items-center gap-2">
          {([['all', 'All'], ['missing', `Not started (${k.missing})`], ['progress', `In progress (${k.progress})`], ['ready', `Ready (${k.ready})`]] as const).map(([key2, l]) => (
            <button key={key2} onClick={() => setFilter(key2)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${filter === key2 ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{l}</button>
          ))}
          <div className="relative ml-auto"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input aria-label="Search" className={`${input} pl-8 w-52 max-w-full`} placeholder="Subject or faculty" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
              <tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Faculty</th><th className="px-3 py-2">Filled</th><th className="px-3 py-2">Last saved</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center"><BouncingDots size="sm" className="text-textMuted" /></td></tr>
                : error ? <tr><td colSpan={6} className="p-8 text-center text-rose-600">{(error as any).message}</td></tr>
                : shown.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-textMuted">Nothing here.</td></tr>
                : shown.map(r => (
                  <tr key={r.allotment_id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => nav(`/lesson-plans/execution?allotment=${r.allotment_id}`)}>
                    <td className="px-3 py-2 font-bold text-textPrimary">{r.subject_name}</td>
                    <td className="px-3 py-2 text-textSecondary whitespace-nowrap">{r.semester_label} · {r.section || '—'}{locked ? '' : ` · ${r.department}`}</td>
                    <td className="px-3 py-2 text-textSecondary">{r.faculty_name}</td>
                    <td className="px-3 py-2"><Progress pct={r.progress ?? null} /></td>
                    <td className="px-3 py-2 text-textSecondary whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.progress != null && (
                        <button className="p-1.5 rounded-lg text-textSecondary hover:bg-surface-2" aria-label={`Download ${r.subject_name} ${r.section}`} disabled={!!busy}
                          onClick={e => { e.stopPropagation(); downloadOne(r); }}>{busy === r.allotment_id ? <BouncingDots size="xs" /> : <Download className="w-4 h-4" />}</button>
                      )}
                      <ChevronRight className="w-4 h-4 inline text-textMuted" />
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
