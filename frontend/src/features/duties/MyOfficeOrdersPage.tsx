import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { DutyOrder, OfficeOrderModal, bodyLabel, fmtLong } from './OfficeOrderModal';

/** Faculty / HOD: office orders appointing me to institutional bodies, ready to print. */
export default function MyOfficeOrdersPage() {
  const { data: orders = [], isLoading } = useQuery<DutyOrder[]>({ queryKey: ['myOfficeOrders'], queryFn: () => api.getMyOfficeOrders() });
  const [viewing, setViewing] = useState<DutyOrder | null>(null);
  const active = orders.filter(o => o.status === 'Active');
  const past = orders.filter(o => o.status !== 'Active');

  const Card = ({ o }: { o: DutyOrder }) => (
    <div className={`bg-surface border rounded-2xl p-5 shadow-sm flex flex-col gap-3 ${o.status === 'Active' ? 'border-brand-primary/30' : 'border-borderLine opacity-80'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono text-textMuted">{o.order_no}</p>
          <h3 className="text-base font-black text-textPrimary mt-0.5">{o.position}</h3>
          <p className="text-xs text-textSecondary">{bodyLabel(o)}</p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${o.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{o.status}</span>
      </div>
      <p className="text-xs text-textSecondary">
        With effect from <b className="text-textPrimary">{fmtLong(o.effective_from)}</b>
        {o.effective_to ? <> up to <b className="text-textPrimary">{fmtLong(o.effective_to)}</b></> : ''}
        {o.status === 'Relieved' && o.relieved_on ? <> · relieved from {fmtLong(o.relieved_on)}</> : ''}
      </p>
      <button onClick={() => setViewing(o)} className="self-start px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold inline-flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5" />View / print order
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-xs font-semibold mb-2"><BadgeCheck className="w-3.5 h-3.5" />Institutional Duties</div>
        <h1 className="text-2xl font-extrabold text-textPrimary">My Office Orders</h1>
        <p className="text-xs text-textSecondary mt-1">Appointments issued to you by the Principal — IIC, ISTE, NSS, NCC, IQAC and other bodies.</p>
      </div>
      {isLoading ? <p className="text-xs text-textMuted">Loading…</p> : orders.length === 0 ? (
        <div className="bg-surface border border-dashed border-borderLine rounded-2xl p-10 text-center text-sm text-textMuted">No office orders have been issued to you yet.</div>
      ) : (
        <>
          {active.length > 0 && <div className="grid md:grid-cols-2 gap-4">{active.map(o => <Card key={o.id} o={o} />)}</div>}
          {past.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-textMuted">Past appointments</p>
              <div className="grid md:grid-cols-2 gap-4">{past.map(o => <Card key={o.id} o={o} />)}</div>
            </div>
          )}
        </>
      )}
      {viewing && <OfficeOrderModal order={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
