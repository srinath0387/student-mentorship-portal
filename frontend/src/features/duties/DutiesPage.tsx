import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, FileText, Loader2, Plus, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { DutyOrder, OfficeOrderModal, bodyLabel, fmtLong } from './OfficeOrderModal';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

type Catalog = { code: string; name: string; positions: string[] }[];

function AssignForm({ catalog, onIssued, onClose }: { catalog: Catalog; onIssued: (o: DutyOrder) => void; onClose: () => void }) {
  const { data: faculty = [] } = useQuery<any[]>({ queryKey: ['allFacultyForDuties'], queryFn: () => api.getAllFaculty() });
  const [q, setQ] = useState('');
  const [f, setF] = useState({ faculty_email: '', duty_code: catalog[0]?.code || 'IIC', duty_name: '', position: '', effective_from: today(), effective_to: '', responsibilities: '' });
  const [err, setErr] = useState<string | null>(null);
  const cat = catalog.find(c => c.code === f.duty_code);
  const linked = faculty.filter((x: any) => x.email && !String(x.email).startsWith('pending_'));
  const matches = q.trim()
    ? linked.filter((x: any) => `${x.name} ${x.email} ${x.department}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  const chosen = linked.find((x: any) => x.email === f.faculty_email);
  const issue = useMutation({
    mutationFn: () => api.assignDuty({ ...f, effective_to: f.effective_to || null }),
    onSuccess: (o: DutyOrder) => onIssued(o),
    onError: (e: any) => setErr(e.message || 'Could not issue the order'),
  });
  const ready = f.faculty_email && f.position.trim() && f.effective_from && (f.duty_code !== 'OTHER' || f.duty_name.trim());

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-textPrimary">Assign a duty &amp; issue office order</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5 relative">
          <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">Faculty member</label>
          {chosen ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-brand-primary/40 bg-brand-soft/40 text-xs">
              <span><b className="text-textPrimary">{chosen.name}</b> <span className="text-textMuted">· {chosen.department}</span></span>
              <button onClick={() => { setF({ ...f, faculty_email: '' }); setQ(''); }} className="text-textMuted hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or department" className={`${input} w-full pl-8`} />
              </div>
              {matches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-borderLine rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {matches.map((m: any) => (
                    <button key={m.email} onClick={() => { setF({ ...f, faculty_email: m.email }); setQ(''); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-2 border-b border-borderLine last:border-0">
                      <b className="text-textPrimary">{m.name}</b> <span className="text-textMuted">· {m.department} · {m.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">Institutional body</label>
          <select value={f.duty_code} onChange={e => setF({ ...f, duty_code: e.target.value, position: '' })} className={`${input} w-full`}>
            {catalog.map(c => <option key={c.code} value={c.code}>{c.code === 'OTHER' ? 'Other (type name)…' : `${c.code} — ${c.name}`}</option>)}
          </select>
          {f.duty_code === 'OTHER' && (
            <input value={f.duty_name} onChange={e => setF({ ...f, duty_name: e.target.value })} placeholder="Committee / cell name, e.g. Library Committee" className={`${input} w-full`} />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">Position</label>
          <input list="duty-positions" value={f.position} onChange={e => setF({ ...f, position: e.target.value })} placeholder="e.g. College Coordinator" className={`${input} w-full`} />
          <datalist id="duty-positions">{(cat?.positions || []).map(p => <option key={p} value={p} />)}</datalist>
          <div className="flex flex-wrap gap-1">
            {(cat?.positions || []).map(p => (
              <button key={p} onClick={() => setF({ ...f, position: p })}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${f.position === p ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:text-textPrimary'}`}>{p}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">With effect from</label>
            <input type="date" value={f.effective_from} onChange={e => setF({ ...f, effective_from: e.target.value })} className={`${input} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">Up to <span className="normal-case font-normal">(optional)</span></label>
            <input type="date" value={f.effective_to} min={f.effective_from} onChange={e => setF({ ...f, effective_to: e.target.value })} className={`${input} w-full`} />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">Responsibilities <span className="normal-case font-normal">(optional, one per line — printed on the order)</span></label>
        <textarea rows={3} value={f.responsibilities} onChange={e => setF({ ...f, responsibilities: e.target.value })}
          placeholder={'Conduct IIC quarterly activities as per the MoE calendar\nUpload activity reports on the IIC portal'} className={`${input} w-full font-normal`} />
      </div>

      {chosen && f.position && (
        <p className="text-xs text-textSecondary bg-surface-2 rounded-xl px-3 py-2">
          Preview: <i>“With effect from {fmtLong(f.effective_from)}, {chosen.name}, Department of {chosen.department}, is hereby appointed as <b>{f.position}</b> of the <b>{f.duty_code === 'OTHER' ? (f.duty_name || '…') : `${cat?.name} (${f.duty_code})`}</b>…”</i>
        </p>
      )}
      {err && <p className="text-xs text-red-600 font-semibold">{err}</p>}
      <div className="flex justify-end">
        <button disabled={!ready || issue.isPending} onClick={() => { setErr(null); issue.mutate(); }}
          className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
          {issue.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}Issue office order
        </button>
      </div>
    </div>
  );
}

/** Principal / director: appoint faculty to IIC, ISTE, NSS, NCC, IQAC…; everyone else in oversight sees the register. */
export default function DutiesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cat } = useQuery({ queryKey: ['dutyCatalog'], queryFn: () => api.getDutyCatalog(), staleTime: Infinity });
  const { data: orders = [], isLoading } = useQuery<DutyOrder[]>({ queryKey: ['duties'], queryFn: () => api.getDuties() });
  const canIssue = Boolean(cat?.issuers?.includes(user?.role || ''));
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<DutyOrder | null>(null);
  const [body, setBody] = useState<string>('');
  const [status, setStatus] = useState<'Active' | 'Relieved' | 'Cancelled' | 'All'>('Active');
  const [q, setQ] = useState('');
  const [relieveId, setRelieveId] = useState<number | null>(null);
  const [relieveOn, setRelieveOn] = useState(today());

  const setStatusM = useMutation({
    mutationFn: ({ id, s, on }: { id: number; s: 'Relieved' | 'Cancelled'; on?: string }) => api.setDutyStatus(id, s, on),
    onSuccess: () => { setRelieveId(null); qc.invalidateQueries({ queryKey: ['duties'] }); },
  });

  const active = orders.filter(o => o.status === 'Active');
  const coverage = useMemo(() => {
    const m = new Map<string, { code: string; label: string; count: number; heads: string[] }>();
    for (const c of cat?.catalog || []) if (c.code !== 'OTHER') m.set(c.code, { code: c.code, label: c.name, count: 0, heads: [] });
    for (const o of active) {
      const key = o.duty_code === 'OTHER' ? `OTHER:${o.duty_name}` : o.duty_code;
      const e = m.get(key) || { code: key, label: o.duty_name, count: 0, heads: [] };
      e.count++; if (e.heads.length < 2) e.heads.push(o.faculty_name || o.faculty_email);
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0));
  }, [cat, active]);

  const rows = orders.filter(o =>
    (status === 'All' || o.status === status) &&
    (!body || (body.startsWith('OTHER:') ? o.duty_code === 'OTHER' && `OTHER:${o.duty_name}` === body : o.duty_code === body)) &&
    (!q.trim() || `${o.faculty_name} ${o.faculty_email} ${o.department} ${o.position} ${o.order_no}`.toLowerCase().includes(q.trim().toLowerCase())));

  const vacant = coverage.filter(c => c.count === 0).length;
  const kpis = [
    { label: 'Active appointments', value: active.length },
    { label: 'Faculty holding duties', value: new Set(active.map(o => o.faculty_email.toLowerCase())).size },
    { label: 'Bodies staffed', value: coverage.filter(c => c.count > 0).length },
    { label: 'Bodies without a coordinator', value: vacant, warn: vacant > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className={`${card} p-6 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-xs font-semibold mb-2"><BadgeCheck className="w-3.5 h-3.5" />Institutional Duties</div>
          <h1 className="text-2xl font-extrabold text-textPrimary">Duties &amp; Office Orders</h1>
          <p className="text-xs text-textSecondary mt-1">{canIssue ? 'Appoint faculty to IIC, ISTE, NSS, NCC, IQAC and other bodies — each appointment issues a numbered office order.' : 'Register of institutional appointments and office orders.'}</p>
        </div>
        {canIssue && !showForm && (
          <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold inline-flex items-center gap-1.5 self-start"><Plus className="w-4 h-4" />Assign duty</button>
        )}
      </div>

      {showForm && cat && (
        <AssignForm catalog={cat.catalog} onClose={() => setShowForm(false)}
          onIssued={o => { setShowForm(false); qc.invalidateQueries({ queryKey: ['duties'] }); setViewing(o); }} />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`${card} p-4`}>
            <p className={`text-2xl font-black ${k.warn ? 'text-amber-600' : 'text-textPrimary'}`}>{k.value}</p>
            <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">Coverage by body</h3>
          {body && <button onClick={() => setBody('')} className="text-[11px] font-bold text-brand-primary">Clear filter</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {coverage.map(c => (
            <button key={c.code} onClick={() => setBody(body === c.code ? '' : c.code)}
              className={`text-left p-3 rounded-xl border transition-all ${body === c.code ? 'border-brand-primary bg-brand-soft/50 ring-2 ring-brand-primary/30' : c.count ? 'border-borderLine hover:border-brand-primary/50' : 'border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-950/20'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-textPrimary">{c.code.startsWith('OTHER:') ? c.label : c.code}</span>
                <span className={`text-[10px] font-black px-1.5 rounded ${c.count ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{c.count || 'vacant'}</span>
              </div>
              <p className="text-[10px] text-textMuted truncate mt-0.5">{c.heads.length ? c.heads.join(', ') : c.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-4 border-b border-borderLine flex flex-wrap gap-2 items-center justify-between">
          <div className="flex rounded-xl border border-borderLine overflow-hidden text-[11px] font-bold">
            {(['Active', 'Relieved', 'Cancelled', 'All'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 ${status === s ? 'bg-brand-primary text-white' : 'text-textSecondary'}`}>{s}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search faculty, position, order no." className={`${input} pl-8 w-64`} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-[10px] font-bold text-textMuted uppercase tracking-wider text-left">
                <th className="py-2.5 px-4">Order no.</th><th className="py-2.5 px-4">Faculty</th><th className="py-2.5 px-4">Body</th>
                <th className="py-2.5 px-4">Position</th><th className="py-2.5 px-4">W.e.f.</th><th className="py-2.5 px-4">Status</th><th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading && <tr><td colSpan={7} className="py-10 text-center text-textMuted">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-textMuted">{orders.length ? 'No orders match the filters.' : canIssue ? 'No duties assigned yet — use “Assign duty” to issue the first office order.' : 'No duties assigned yet.'}</td></tr>
              )}
              {rows.map(o => (
                <tr key={o.id} className="hover:bg-surface-2/50">
                  <td className="py-3 px-4 font-mono text-[11px] text-textSecondary whitespace-nowrap">{o.order_no}</td>
                  <td className="py-3 px-4"><p className="font-bold text-textPrimary">{o.faculty_name || o.faculty_email}</p><p className="text-[10px] text-textMuted">{o.department}</p></td>
                  <td className="py-3 px-4 text-textSecondary" title={bodyLabel(o)}><b className="text-textPrimary">{o.duty_code === 'OTHER' ? o.duty_name : o.duty_code}</b></td>
                  <td className="py-3 px-4 text-textPrimary font-semibold">{o.position}</td>
                  <td className="py-3 px-4 whitespace-nowrap text-textSecondary">{fmtLong(o.effective_from)}{o.effective_to ? <span className="block text-[10px] text-textMuted">to {fmtLong(o.effective_to)}</span> : null}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${o.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : o.status === 'Relieved' ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{o.status}</span>
                    {o.status === 'Relieved' && <span className="block text-[10px] text-textMuted mt-0.5">from {fmtLong(o.relieved_on)}</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-1.5 items-center">
                      <button onClick={() => setViewing(o)} className="px-2.5 py-1 rounded-lg border border-borderLine text-[11px] font-bold text-brand-primary hover:bg-brand-soft inline-flex items-center gap-1"><FileText className="w-3 h-3" />Order</button>
                      {canIssue && o.status === 'Active' && (relieveId === o.id ? (
                        <>
                          <input type="date" value={relieveOn} min={String(o.effective_from).slice(0, 10)} onChange={e => setRelieveOn(e.target.value)} className={`${input} py-1`} />
                          <button onClick={() => setStatusM.mutate({ id: o.id, s: 'Relieved', on: relieveOn })} className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-bold">Relieve</button>
                          <button onClick={() => setRelieveId(null)} className="p-1 text-textMuted"><X className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setRelieveId(o.id); setRelieveOn(today()); }} className="px-2.5 py-1 rounded-lg border border-borderLine text-[11px] font-bold text-textSecondary hover:text-textPrimary">Relieve…</button>
                          <button onClick={() => { if (window.confirm(`Cancel order ${o.order_no}? Use this only for an order issued in error.`)) setStatusM.mutate({ id: o.id, s: 'Cancelled' }); }}
                            className="px-2.5 py-1 rounded-lg border border-borderLine text-[11px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Cancel</button>
                        </>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && <OfficeOrderModal order={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
