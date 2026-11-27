/**
 * Faculty Comprehensive Profiles — HOD / Principal view of a department: how far each profile is filled,
 * open any one, download one or all (zip), and a consolidated Excel for department leadership.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ChevronRight, Download, FileArchive, FileSpreadsheet, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { BouncingDots } from '../../components/common/BouncingDots';
import { buildCompProfileXlsx, consolidatedXlsx, emptyProfile, merge, profileFileName } from './compProfile';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;
const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];

export default function CompProfilesDeptPage() {
  const { user } = useAuth();
  const locked = user?.role === 'hod';
  const [dept, setDept] = useState('All');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['deptCompProfiles', locked ? 'own' : dept], queryFn: () => api.getDeptCompProfiles(locked ? undefined : dept) });
  const rows: any[] = data?.rows || [];
  const shown = useMemo(() => rows.filter(r => !q.trim() || `${r.name} ${r.email} ${r.department}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  const k = { total: rows.length, started: rows.filter(r => r.progress != null).length, done: rows.filter(r => r.progress >= 80).length };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Something went wrong' }); } finally { setBusy(null); }
  };
  const full = async () => {
    const f = await api.getDeptCompProfiles(locked ? undefined : dept, true);
    return { ...f, rows: f.rows.filter((r: any) => r.data).map((r: any) => ({ ...r, data: merge(r.data, emptyProfile()) })) };
  };
  const downloadAll = () => run('zip', async () => {
    const f = await full();
    if (!f.rows.length) throw new Error('No profiles have been saved yet.');
    const zip = new JSZip(); const used = new Set<string>();
    for (const r of f.rows) {
      let name = profileFileName(r.data, r.name || r.email);
      for (let i = 2; used.has(name); i++) name = name.replace(/( \(\d+\))?\.xlsx$/, ` (${i}).xlsx`);
      used.add(name);
      zip.file(name, await buildCompProfileXlsx(r.data, { author: r.name, hideRatings: !f.can_see_ratings }));
    }
    saveAs(await zip.generateAsync({ type: 'blob' }), `Faculty Comprehensive Profiles - ${f.department}.zip`);
    setMsg({ ok: true, text: `Downloaded ${f.rows.length} profile${f.rows.length === 1 ? '' : 's'}.` });
  });
  const downloadConsolidated = () => run('cons', async () => {
    const f = await full();
    if (!f.rows.length) throw new Error('No profiles have been saved yet.');
    await consolidatedXlsx(f.rows, f.department);
  });
  const downloadOne = (r: any) => run(r.email, async () => {
    const d = await api.getCompProfileOf(r.email);
    if (!d.saved) throw new Error('This profile has not been saved yet.');
    const p = merge(d.saved.data, emptyProfile());
    saveAs(await buildCompProfileXlsx(p, { author: r.name, hideRatings: !d.can_see_ratings }), profileFileName(p, r.name || r.email));
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Faculty Comprehensive Profiles</h1>
          <p className="text-xs text-textSecondary">{data?.department || '…'} · strengths, teaching, mentoring, research and connections of every faculty member. Faculty fill theirs under My Comprehensive Profile.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!locked && <select aria-label="Department" className={input} value={dept} onChange={e => setDept(e.target.value)}><option value="All">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>}
          <button className={btnGhost} disabled={!!busy || !k.started} onClick={downloadConsolidated}>{busy === 'cons' ? <BouncingDots size="xs" /> : <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />}Consolidated Excel</button>
          <button className={btnPrimary} disabled={!!busy || !k.started} onClick={downloadAll}>{busy === 'zip' ? <BouncingDots size="xs" /> : <FileArchive className="w-3.5 h-3.5 inline mr-1" />}Download all (zip)</button>
        </div>
      </div>
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}
      {data && !data.can_see_ratings && <p className="text-[11px] text-textMuted">Ratings of named students (Top 5 Mentees) are left out here; only the faculty member and their HOD see them.</p>}

      <div className="grid grid-cols-3 gap-3">
        {([['Faculty', k.total, ''], ['Started', k.started, 'text-amber-600'], ['80% or more filled', k.done, 'text-emerald-600']] as const).map(([l, v, c]) => (
          <div key={l} className={`${card} p-3`}><p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{l}</p><p className={`text-2xl font-black tabular-nums ${c || 'text-textPrimary'}`}>{v}</p></div>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-3 border-b border-borderLine flex items-center gap-2">
          <div className="relative ml-auto"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input aria-label="Search" className={`${input} pl-8 w-56 max-w-full`} placeholder="Faculty name or email" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
              <tr><th className="px-3 py-2">Faculty</th>{!locked && <th className="px-3 py-2">Department</th>}<th className="px-3 py-2">Filled</th><th className="px-3 py-2">Last saved</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={5} className="p-8 text-center"><BouncingDots size="sm" className="text-textMuted" /></td></tr>
                : error ? <tr><td colSpan={5} className="p-8 text-center text-rose-600">{(error as any).message}</td></tr>
                : shown.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-textMuted">Nothing here.</td></tr>
                : shown.map(r => (
                  <tr key={r.email} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2"><Link to={`/faculty-profile/comprehensive?email=${encodeURIComponent(r.email)}`} className="font-bold text-textPrimary hover:underline">{r.name || r.email}</Link>
                      <p className="text-[10px] text-textMuted">{r.email}</p></td>
                    {!locked && <td className="px-3 py-2 text-textSecondary">{r.department}</td>}
                    <td className="px-3 py-2">{r.progress == null ? <span className="text-[11px] font-bold text-textMuted">Not started</span> : (
                      <div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-surface-2 overflow-hidden"><div className={`h-full rounded-full ${r.progress >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${r.progress}%` }} /></div>
                        <span className="text-[11px] font-bold text-textSecondary tabular-nums">{r.progress}%</span></div>)}</td>
                    <td className="px-3 py-2 text-textSecondary whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.progress != null && <button className="p-1.5 rounded-lg text-textSecondary hover:bg-surface-2" aria-label={`Download ${r.name}`} disabled={!!busy} onClick={() => downloadOne(r)}>
                        {busy === r.email ? <BouncingDots size="xs" /> : <Download className="w-4 h-4" />}</button>}
                      <Link to={`/faculty-profile/comprehensive?email=${encodeURIComponent(r.email)}`} aria-label={`Open ${r.name}`}><ChevronRight className="w-4 h-4 inline text-textMuted" /></Link>
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
