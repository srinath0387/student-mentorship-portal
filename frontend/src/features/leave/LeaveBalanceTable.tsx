import React from 'react';

export interface LeaveBalance { quota: number; used: number; in_process?: number; remaining: number }
export type LeaveBalances = Record<string, LeaveBalance>;

const ELIGIBLE = [
  { key: 'Casual Leave', short: 'CL', label: 'Casual Leave' },
  { key: 'SP CL', short: 'Sp. CL', label: 'Special Casual Leave' },
  { key: 'Academic Leave', short: 'AL', label: 'Academic Leave' },
];

const n = (v: number | undefined) => {
  const x = Number(v || 0);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
};

/**
 * Leave eligibility table: Total Granted, Availed (sanctioned), Applied (awaiting approval),
 * Balance per leave type, a Total row (remaining total), and LOP / other leave availed.
 * variant="print" renders black-on-white for letters and printed statements.
 */
export const LeaveBalanceTable: React.FC<{ balances: LeaveBalances; year?: number | string; variant?: 'screen' | 'print'; asOn?: string }> = ({ balances, year, variant = 'screen', asOn }) => {
  const rows = ELIGIBLE.map(t => ({ ...t, b: balances?.[t.key] || { quota: 0, used: 0, in_process: 0, remaining: 0 } }));
  const tot = rows.reduce((a, r) => ({ quota: a.quota + Number(r.b.quota || 0), used: a.used + Number(r.b.used || 0), inp: a.inp + Number(r.b.in_process || 0), rem: a.rem + Number(r.b.remaining || 0) }), { quota: 0, used: 0, inp: 0, rem: 0 });
  const lop = balances?.['Paid Leave'];
  const print = variant === 'print';
  const th = print ? 'p-1.5 border border-slate-400 bg-slate-100 font-bold text-slate-900' : 'py-2 px-3 font-bold text-textMuted uppercase text-[10px] tracking-wider';
  const td = print ? 'p-1.5 border border-slate-300 text-slate-900' : 'py-2 px-3 text-textPrimary';
  const caption = `Leave eligibility${year ? ` — calendar year ${year}` : ''}${asOn ? ` (as on ${asOn})` : ''}`;

  return (
    <div className={print ? 'space-y-1.5' : 'bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden'}>
      <p className={print ? 'font-bold text-slate-900 uppercase text-[11px] tracking-wider' : 'px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary'}>{caption}</p>
      <div className={print ? '' : 'overflow-x-auto'}>
        <table className={`w-full text-[11px] ${print ? 'border-collapse border border-slate-400' : ''}`}>
          <thead>
            <tr className={print ? '' : 'bg-surface-2 border-b border-borderLine'}>
              <th className={`${th} text-left`}>Leave type</th>
              <th className={`${th} text-center`}>Total granted</th>
              <th className={`${th} text-center`}>Availed (sanctioned)</th>
              <th className={`${th} text-center`}>Applied (awaiting approval)</th>
              <th className={`${th} text-center`}>Balance</th>
            </tr>
          </thead>
          <tbody className={print ? '' : 'divide-y divide-borderLine'}>
            {rows.map(r => (
              <tr key={r.key}>
                <td className={`${td} text-left`}><b>{r.short}</b> <span className={print ? 'text-slate-600' : 'text-textMuted'}>· {r.label}</span></td>
                <td className={`${td} text-center`}>{n(r.b.quota)}</td>
                <td className={`${td} text-center`}>{n(r.b.used)}</td>
                <td className={`${td} text-center`}>{n(r.b.in_process)}</td>
                <td className={`${td} text-center font-bold ${!print && r.b.remaining <= 1 ? 'text-red-600' : ''}`}>{n(r.b.remaining)}</td>
              </tr>
            ))}
            <tr className={print ? 'bg-slate-50' : 'bg-surface-2/60'}>
              <td className={`${td} text-left font-black`}>Total (CL + Sp. CL + AL)</td>
              <td className={`${td} text-center font-black`}>{n(tot.quota)}</td>
              <td className={`${td} text-center font-black`}>{n(tot.used)}</td>
              <td className={`${td} text-center font-black`}>{n(tot.inp)}</td>
              <td className={`${td} text-center font-black ${print ? '' : 'text-brand-primary'}`}>{n(tot.rem)}</td>
            </tr>
            {lop && (Number(lop.used) > 0 || Number(lop.in_process) > 0) && (
              <tr>
                <td className={`${td} text-left`}><b>LOP</b> <span className={print ? 'text-slate-600' : 'text-textMuted'}>· Paid / loss-of-pay leave</span></td>
                <td className={`${td} text-center`}>—</td>
                <td className={`${td} text-center`}>{n(lop.used)}</td>
                <td className={`${td} text-center`}>{n(lop.in_process)}</td>
                <td className={`${td} text-center`}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {print && <p className="text-[9px] text-slate-500">Availed = sanctioned by the Principal. Balance = Total granted − Availed − Applied (awaiting approval).</p>}
    </div>
  );
};

export default LeaveBalanceTable;
