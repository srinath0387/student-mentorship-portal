import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Plus, Download, CheckCircle2, Search, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';
const STATUS = ['Eligible', 'Applied', 'Shortlisted', 'Selected', 'Rejected'];
const statusTone: Record<string, string> = {
  Eligible: 'text-textMuted', Applied: 'text-sky-700 dark:text-sky-300', Shortlisted: 'text-amber-700 dark:text-amber-400',
  Selected: 'text-emerald-700 dark:text-emerald-400', Rejected: 'text-red-700 dark:text-red-400',
};
const d10 = (v: any) => (v ? String(v).slice(0, 10) : '—');

function NewDriveForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ company_name: '', role_title: '', package_lpa: '', drive_date: '', last_date: '', min_cgpa: '6', max_backlogs: '0',
    departments: [] as string[], batches: '', required_skills: '', exclude_placed: false, description: '' });
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createPlacementDrive({ ...f, package_lpa: f.package_lpa ? Number(f.package_lpa) : null, min_cgpa: Number(f.min_cgpa) || 0, max_backlogs: Number(f.max_backlogs) || 0 }),
    onSuccess: onDone,
    onError: (e: any) => setErr(e.message || 'Could not create drive'),
  });
  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input value={f.company_name} onChange={e => setF({ ...f, company_name: e.target.value })} placeholder="Company *" className={input} />
        <input value={f.role_title} onChange={e => setF({ ...f, role_title: e.target.value })} placeholder="Role (e.g. Systems Engineer)" className={input} />
        <input value={f.package_lpa} onChange={e => setF({ ...f, package_lpa: e.target.value })} placeholder="Package (LPA)" type="number" step="0.1" className={input} />
        <div className="flex items-center gap-1.5"><span className="text-[11px] text-textMuted">Drive</span><input type="date" value={f.drive_date} onChange={e => setF({ ...f, drive_date: e.target.value })} className={`${input} flex-1`} /></div>
        <div className="flex items-center gap-1.5"><span className="text-[11px] text-textMuted">Min CGPA</span><input value={f.min_cgpa} onChange={e => setF({ ...f, min_cgpa: e.target.value })} type="number" step="0.1" className={`${input} flex-1`} /></div>
        <div className="flex items-center gap-1.5"><span className="text-[11px] text-textMuted">Max backlogs</span><input value={f.max_backlogs} onChange={e => setF({ ...f, max_backlogs: e.target.value })} type="number" className={`${input} flex-1`} /></div>
        <input value={f.batches} onChange={e => setF({ ...f, batches: e.target.value })} placeholder="Batches, comma-separated (e.g. 2023-2027)" className={input} />
        <div className="flex items-center gap-1.5"><span className="text-[11px] text-textMuted">Apply by</span><input type="date" value={f.last_date} onChange={e => setF({ ...f, last_date: e.target.value })} className={`${input} flex-1`} /></div>
      </div>
      <input value={f.required_skills} onChange={e => setF({ ...f, required_skills: e.target.value })} placeholder="Preferred skills, comma-separated (used to rank students, e.g. Java, SQL, Python)" className={`${input} w-full`} />
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] text-textMuted self-center mr-1">Departments (none = all):</span>
        {VALID_DEPARTMENT_NAMES.map(d => (
          <button key={d} type="button" onClick={() => setF({ ...f, departments: f.departments.includes(d) ? f.departments.filter(x => x !== d) : [...f.departments, d] })}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${f.departments.includes(d) ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{d}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-textSecondary"><input type="checkbox" checked={f.exclude_placed} onChange={e => setF({ ...f, exclude_placed: e.target.checked })} />Exclude students who are already placed</label>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button disabled={!f.company_name.trim() || create.isPending} onClick={() => create.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40">Create drive</button>
        <button onClick={onDone} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine">Cancel</button>
      </div>
    </div>
  );
}

function DriveDetail({ driveId, canEdit }: { driveId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['driveEligible', driveId], queryFn: () => api.getDriveEligible(driveId) });
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const setStatus = useMutation({
    mutationFn: (v: { roll: string; status: string }) => api.setDriveApplicationStatus(driveId, v.roll, v.status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['driveEligible', driveId] }); qc.invalidateQueries({ queryKey: ['placementDrives'] }); },
  });
  const students: any[] = data?.students || [];
  const shown = useMemo(() => students.filter(s => (filter === 'All' || s.application_status === filter) &&
    (!q || s.roll_number.toLowerCase().includes(q.toLowerCase()) || (s.name || '').toLowerCase().includes(q.toLowerCase()))), [students, filter, q]);
  const exportCsv = () => {
    const header = ['Roll Number', 'Name', 'Email', 'Department', 'Batch', 'CGPA', 'Backlogs', 'Skills matched', 'Status'];
    const lines = shown.map(s => [s.roll_number, s.name, s.email, s.department, s.batch, s.cgpa, s.backlogs, `${s.skills_matched.length}/${s.skills_required}`, s.application_status]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${data?.drive?.company_name || 'drive'}-students.csv`; a.click(); URL.revokeObjectURL(url);
  };
  if (isLoading) return <div className="p-8 text-center text-xs text-textMuted">Matching students…</div>;
  if (isError) return <div className="p-8 text-center text-xs text-red-600">{(error as Error)?.message}</div>;
  const f = data.funnel;
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 border-b border-borderLine">
        {[['Eligible', f.eligible], ['Applied', f.applied], ['Shortlisted', f.shortlisted], ['Selected', f.selected], ['Rejected', f.rejected]].map(([k, v]) => (
          <button key={k as string} onClick={() => setFilter(filter === k ? 'All' : (k === 'Eligible' ? 'All' : k as string))}
            className={`rounded-xl p-2 text-left border ${filter === k ? 'border-brand-primary' : 'border-borderLine'}`}>
            <div className={`text-xl font-black ${statusTone[k as string] || 'text-textPrimary'}`}>{v as number}</div>
            <div className="text-[10px] font-bold text-textMuted">{k}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-borderLine">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Roll no. or name" className={`${input} pl-8 w-full`} />
        </div>
        <button onClick={exportCsv} disabled={shown.length === 0} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5 disabled:opacity-40"><Download className="w-3.5 h-3.5" />Export CSV</button>
      </div>
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs text-left">
          <thead className="sticky top-0">
            <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
              <th className="py-2.5 px-4">Student</th><th className="py-2.5 px-3">Dept · Batch</th><th className="py-2.5 px-3 text-center">CGPA</th>
              <th className="py-2.5 px-3 text-center">Skills</th><th className="py-2.5 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLine">
            {shown.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-textMuted">No students for this selection.</td></tr>
              : shown.map(s => (
                <tr key={s.roll_number}>
                  <td className="py-2 px-4"><div className="font-mono font-bold text-textPrimary">{s.roll_number}</div><div className="text-textSecondary">{s.name}</div></td>
                  <td className="py-2 px-3 text-textSecondary">{s.department}<div className="text-[10px] text-textMuted">{s.batch}</div></td>
                  <td className="py-2 px-3 text-center font-bold text-textPrimary">{Number(s.cgpa).toFixed(2)}</td>
                  <td className="py-2 px-3 text-center" title={s.skills_matched.join(', ')}>
                    {s.skills_required > 0 ? <span className={s.skills_matched.length === s.skills_required ? 'text-emerald-600 font-bold' : 'text-textSecondary'}>{s.skills_matched.length}/{s.skills_required}</span> : '—'}
                  </td>
                  <td className="py-2 px-3">
                    {canEdit ? (
                      <select value={s.application_status} disabled={setStatus.isPending}
                        onChange={e => setStatus.mutate({ roll: s.roll_number, status: e.target.value })}
                        className={`px-2 py-1 text-[11px] rounded-lg border border-borderLine bg-background font-bold ${statusTone[s.application_status]}`}>
                        {STATUS.map(x => <option key={x}>{x}</option>)}
                      </select>
                    ) : <span className={`font-bold ${statusTone[s.application_status]}`}>{s.application_status}</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffDrives({ isAdmin, canEdit }: { isAdmin: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: drives = [], isLoading } = useQuery<any[]>({ queryKey: ['placementDrives'], queryFn: () => api.getPlacementDrives() });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const toggle = useMutation({
    mutationFn: (d: any) => api.updatePlacementDrive(d.id, { status: d.status === 'Open' ? 'Closed' : 'Open' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['placementDrives'] }),
  });
  const active = drives.find(d => d.id === selected) || drives[0] || null;
  return (
    <div className="space-y-4">
      {isAdmin && (creating ? <NewDriveForm onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['placementDrives'] }); }} />
        : <button onClick={() => setCreating(true)} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />New placement drive</button>)}
      <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-2">
          {isLoading ? <p className="text-xs text-textMuted">Loading…</p>
            : drives.length === 0 ? <div className={`${card} p-6 text-center text-xs text-textMuted`}>No drives yet.</div>
            : drives.map(d => (
              <button key={d.id} onClick={() => setSelected(d.id)} className={`${card} w-full p-3 text-left ${active?.id === d.id ? 'ring-2 ring-brand-primary' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-textPrimary">{d.company_name}</span>
                  <span className={`text-[10px] font-bold ${d.status === 'Open' ? 'text-emerald-600' : 'text-textMuted'}`}>{d.status}</span>
                </div>
                <div className="text-[11px] text-textSecondary">{d.role_title || '—'}{d.package_lpa ? ` · ${Number(d.package_lpa)} LPA` : ''}</div>
                <div className="text-[10px] text-textMuted mt-1">Drive {d10(d.drive_date)} · CGPA ≥ {Number(d.min_cgpa)} · backlogs ≤ {d.max_backlogs}</div>
                <div className="text-[10px] text-textMuted">{d.applied} applied · {d.shortlisted} shortlisted · <b className="text-emerald-600">{d.selected} selected</b></div>
              </button>
            ))}
        </div>
        {active && (
          <div className={`${card} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-borderLine flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-textPrimary">{active.company_name} — {active.role_title || 'Drive'}</div>
                <div className="text-[11px] text-textMuted">
                  {(active.departments || []).length ? active.departments.join(', ') : 'All departments'}{(active.batches || []).length ? ` · ${active.batches.join(', ')}` : ''}
                  {(active.required_skills || []).length ? ` · prefers ${active.required_skills.join(', ')}` : ''}
                </div>
              </div>
              {isAdmin && <button onClick={() => toggle.mutate(active)} className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-borderLine">{active.status === 'Open' ? 'Close drive' : 'Reopen'}</button>}
            </div>
            <DriveDetail driveId={active.id} canEdit={canEdit} />
          </div>
        )}
      </div>
    </div>
  );
}

function StudentDrives() {
  const qc = useQueryClient();
  const { data: drives = [], isLoading } = useQuery<any[]>({ queryKey: ['myPlacementDrives'], queryFn: () => api.getMyPlacementDrives() });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const apply = useMutation({
    mutationFn: (id: number) => api.applyPlacementDrive(id),
    onSuccess: (r: any) => { setMsg({ ok: true, text: r?.message || 'Applied.' }); qc.invalidateQueries({ queryKey: ['myPlacementDrives'] }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Could not apply.' }),
  });
  if (isLoading) return <div className={`${card} p-8 text-center text-xs text-textMuted`}>Loading drives…</div>;
  return (
    <div className="space-y-3">
      {msg && <div className={`px-4 py-2.5 rounded-xl text-xs font-semibold ${msg.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{msg.text}</div>}
      {drives.length === 0 ? <div className={`${card} p-8 text-center text-xs text-textMuted`}>No open drives you are eligible for right now.</div>
        : drives.map(d => (
          <div key={d.id} className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <div className="text-sm font-black text-textPrimary">{d.company_name} <span className="text-textSecondary font-semibold">· {d.role_title || 'Drive'}</span></div>
              <div className="text-[11px] text-textMuted">{d.package_lpa ? `${Number(d.package_lpa)} LPA · ` : ''}Drive {d10(d.drive_date)}{d.last_date ? ` · apply by ${d10(d.last_date)}` : ''}</div>
              {d.skills_required > 0 && <div className="text-[11px] text-textSecondary">Preferred skills you have: {d.skills_matched.length}/{d.skills_required}</div>}
            </div>
            {d.my_status === 'Eligible'
              ? <button disabled={apply.isPending} onClick={() => apply.mutate(d.id)} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5">
                  {apply.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Apply</button>
              : <span className={`text-xs font-bold inline-flex items-center gap-1 ${statusTone[d.my_status]}`}><CheckCircle2 className="w-3.5 h-3.5" />{d.my_status}</span>}
          </div>
        ))}
    </div>
  );
}

export const PlacementDrivesPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || '';
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><Briefcase className="w-5 h-5 text-brand-primary" />Placement Drives</h1>
        <p className="text-xs text-textMuted mt-0.5">
          {role === 'student' ? 'Drives you are eligible for — apply before the last date' : 'Company drives, instant eligibility lists and the shortlist-to-offer funnel'}
        </p>
      </div>
      {role === 'student' ? <StudentDrives /> : <StaffDrives isAdmin={role === 'admin'} canEdit={role === 'admin' || role === 'hod'} />}
    </div>
  );
};

export default PlacementDrivesPage;
