import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus, Search, Link2, Download, X, Check, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';
export const ALUMNI_STATUSES = ['Employed', 'Higher Studies', 'Entrepreneur', 'Preparing', 'Other'];
const statusTone: Record<string, string> = {
  Employed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', 'Higher Studies': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  Entrepreneur: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', Preparing: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', Other: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};
const empty = { name: '', roll_number: '', email: '', phone: '', department: '', batch: '', status: 'Employed', organization: '', role_title: '', location: '', package_lpa: '', institute: '', course: '', country: '', linkedin_url: '' };

function AlumniForm({ initial, onDone }: { initial?: any; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...empty, ...(initial || {}) });
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => (initial?.id ? api.updateAlumni(initial.id, f) : api.createAlumni(f)),
    onSuccess: onDone, onError: (e: any) => setErr(e.message || 'Could not save'),
  });
  const fld = (k: string, ph: string, extra = '') => <input value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={ph} className={`${input} ${extra}`} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${card} w-full max-w-2xl p-5 space-y-3`}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-black text-textPrimary">{initial?.id ? 'Edit alumni' : 'Add alumni'}</h3><button onClick={onDone} className="p-1 text-textMuted"><X className="w-4 h-4" /></button></div>
        <div className="grid sm:grid-cols-3 gap-2">
          {fld('name', 'Name *')}{fld('roll_number', 'Roll number')}{fld('batch', 'Batch (e.g. 2021-2025)')}
          <select value={f.department || ''} onChange={e => setF({ ...f, department: e.target.value })} className={input}><option value="">Department</option>{VALID_DEPARTMENT_NAMES.map(d => <option key={d}>{d}</option>)}</select>
          {fld('email', 'Email')}{fld('phone', 'Phone')}
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className={input}>{ALUMNI_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          {f.status === 'Higher Studies' ? <>{fld('institute', 'Institute')}{fld('course', 'Course (e.g. MS CS)')}</> : <>{fld('organization', 'Organisation')}{fld('role_title', 'Role')}</>}
          {fld('location', 'City')}{fld('country', 'Country')}{fld('package_lpa', 'Package (LPA)')}
          {fld('linkedin_url', 'LinkedIn URL', 'sm:col-span-3')}
        </div>
        {err && <p className="text-[11px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onDone} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine">Cancel</button>
          <button disabled={!String(f.name).trim() || save.isPending} onClick={() => save.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}

export const AlumniPage: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'hod';
  const qc = useQueryClient();
  const [dept, setDept] = useState('All'); const [batch, setBatch] = useState('All'); const [status, setStatus] = useState('All'); const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [importBatch, setImportBatch] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['alumni', dept, batch, status, q], queryFn: () => api.getAlumni({ department: dept, batch, status, search: q }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['alumni'] });
  const doImport = useMutation({ mutationFn: () => api.importAlumniBatch(importBatch.trim(), dept), onSuccess: (r: any) => { setMsg(r?.message); setImportBatch(''); refresh(); }, onError: (e: any) => setMsg(e.message) });
  const s = data?.summary; const rows: any[] = data?.alumni || [];

  const copyLink = async (a: any) => {
    const r = await api.getAlumniSelfLink(a.id);
    const url = `${window.location.origin}${window.location.pathname}#/alumni-update/${r.token}`;
    try { await navigator.clipboard.writeText(url); setCopied(a.id); setTimeout(() => setCopied(null), 2500); } catch { window.prompt('Copy this link', url); }
  };
  const exportCsv = () => {
    const header = ['Name', 'Roll Number', 'Department', 'Batch', 'Status', 'Organisation / Institute', 'Role / Course', 'Location', 'Package (LPA)', 'Email', 'Phone', 'LinkedIn'];
    const lines = rows.map(a => [a.name, a.roll_number, a.department, a.batch, a.status, a.organization || a.institute, a.role_title || a.course, a.location, a.package_lpa, a.email, a.phone, a.linkedin_url]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const u = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = u; el.download = 'alumni.csv'; el.click(); URL.revokeObjectURL(u);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><GraduationCap className="w-5 h-5 text-brand-primary" />Alumni</h1>
          <p className="text-xs text-textMuted mt-0.5">Where our graduates are — employment, higher studies and entrepreneurship (NAAC 5.2 / 5.4)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} disabled={!rows.length} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5 disabled:opacity-40"><Download className="w-3.5 h-3.5" />CSV</button>
          {canEdit && <button onClick={() => setEditing({})} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Add alumni</button>}
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <div className={`${card} p-3`}><div className="text-xl font-black text-textPrimary">{s.total}</div><div className="text-[10px] font-bold text-textMuted">Alumni</div></div>
          {ALUMNI_STATUSES.map(k => <div key={k} className={`${card} p-3`}><div className="text-xl font-black text-textPrimary">{s.by_status?.[k] || 0}</div><div className="text-[10px] font-bold text-textMuted">{k}</div></div>)}
        </div>
      )}
      {s?.top_employers?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center"><span className="text-[11px] font-bold text-textMuted mr-1">Top employers:</span>
          {s.top_employers.map((e: any) => <span key={e.name} className="px-2 py-0.5 rounded-lg bg-surface-2 text-[11px] font-semibold text-textSecondary">{e.name} · {e.n}</span>)}</div>
      )}

      {canEdit && (
        <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
          <Upload className="w-4 h-4 text-textMuted" />
          <span className="text-xs text-textSecondary">Import a passed-out batch</span>
          <input value={importBatch} onChange={e => setImportBatch(e.target.value)} placeholder="e.g. 2021-2025" className={`${input} w-36`} />
          <button disabled={!importBatch.trim() || doImport.isPending} onClick={() => doImport.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine disabled:opacity-40">Import</button>
          <span className="text-[10px] text-textMuted">Placed students are pre-filled from placement records.</span>
          {msg && <span className="text-[11px] font-semibold text-emerald-700 w-full">{msg}</span>}
        </div>
      )}

      <div className={`${card} p-3 flex flex-wrap items-center gap-2`}>
        {user?.role !== 'hod' && <select value={dept} onChange={e => setDept(e.target.value)} className={input}><option value="All">All departments</option>{VALID_DEPARTMENT_NAMES.map(d => <option key={d}>{d}</option>)}</select>}
        <select value={batch} onChange={e => setBatch(e.target.value)} className={input}><option value="All">All batches</option>{(data?.batches || []).map((b: string) => <option key={b}>{b}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} className={input}><option value="All">All statuses</option>{ALUMNI_STATUSES.map(x => <option key={x}>{x}</option>)}</select>
        <div className="relative flex-1 min-w-[160px]"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, roll no., company, institute, city" className={`${input} pl-8 w-full`} /></div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
              <th className="py-2.5 px-4">Alumni</th><th className="py-2.5 px-3">Batch</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3">Where</th><th className="py-2.5 px-3">Location</th>{canEdit && <th className="py-2.5 px-3 text-right">Actions</th>}
            </tr></thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={6} className="py-8 text-center text-textMuted">Loading…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-textMuted">No alumni yet. Import a passed-out batch to get started.</td></tr>
                : rows.map(a => (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4"><div className="font-bold text-textPrimary">{a.name} {a.source === 'self' && <span className="text-[9px] font-bold text-emerald-600">✓ self-updated</span>}</div><div className="text-[10px] text-textMuted">{a.roll_number || '—'} · {a.department || '—'}</div></td>
                    <td className="py-2.5 px-3 text-textSecondary">{a.batch || '—'}</td>
                    <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusTone[a.status]}`}>{a.status}</span></td>
                    <td className="py-2.5 px-3 text-textSecondary">{a.status === 'Higher Studies' ? `${a.course || ''}${a.institute ? ` · ${a.institute}` : ''}` : `${a.organization || '—'}${a.role_title ? ` · ${a.role_title}` : ''}`}
                      {a.linkedin_url && <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="ml-1 text-brand-primary">in</a>}</td>
                    <td className="py-2.5 px-3 text-textSecondary">{[a.location, a.country].filter(Boolean).join(', ') || '—'}</td>
                    {canEdit && <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button onClick={() => copyLink(a)} title="Copy a private link the alum can use to update their own details" className="px-2 py-1 rounded-lg border border-borderLine text-[11px] font-bold inline-flex items-center gap-1 mr-1">
                        {copied === a.id ? <><Check className="w-3 h-3 text-emerald-600" />Copied</> : <><Link2 className="w-3 h-3" />Self-update link</>}</button>
                      <button onClick={() => setEditing(a)} className="px-2 py-1 rounded-lg border border-borderLine text-[11px] font-bold">Edit</button>
                    </td>}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <AlumniForm initial={editing.id ? editing : undefined} onDone={() => { setEditing(null); refresh(); }} />}
    </div>
  );
};

export default AlumniPage;
