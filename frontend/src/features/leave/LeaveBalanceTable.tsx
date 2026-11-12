import React from 'react';

export interface LeaveBalance { quota: number; used: number; in_process?: number; remaining: number }
export type LeaveBalances = Record<string, LeaveBalance>;

const TYPES = [
  { key: 'Casual Leave', short: 'CL', label: 'Casual Leave' },
  { key: 'SP CL', short: 'Sp. CL', label: 'Special CL' },
  { key: 'Academic Leave', short: 'AL', label: 'Academic Leave' },
];

const n = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  const x = Number(v);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
};

/**
 * Leave eligibility table — leave types across (CL, Sp. CL, AL, Total, LOP),
 * figures down: Total granted, Availed (sanctioned), Applied (awaiting approval),
 * Balance (granted − availed) and Remaining (balance − awaiting approval).
 * variant="print" renders black-on-white for letters and printed statements.
 */
export const LeaveBalanceTable: React.FC<{ balances: LeaveBalances; year?: number | string; variant?: 'screen' | 'print'; asOn?: string }> = ({ balances, year, variant = 'screen', asOn }) => {
  const cols = TYPES.map(t => {
    const b = balances?.[t.key] || { quota: 0, used: 0, in_process: 0, remaining: 0 };
    const granted = Number(b.quota || 0); const availed = Number(b.used || 0); const pending = Number(b.in_process || 0);
    return { ...t, granted, availed, pending, balance: Math.max(0, granted - availed), remaining: Math.max(0, granted - availed - pending) };
  });
  const total = cols.reduce((a, c) => ({ granted: a.granted + c.granted, availed: a.availed + c.availed, pending: a.pending + c.pending, balance: a.balance + c.balance, remaining: a.remaining + c.remaining }),
    { granted: 0, availed: 0, pending: 0, balance: 0, remaining: 0 });
  const lop = balances?.['Paid Leave'];
  const showLop = Boolean(lop && (Number(lop.used) > 0 || Number(lop.in_process) > 0));

  const rows: { label: string; hint: string; key: 'granted' | 'availed' | 'pending' | 'balance' | 'remaining'; strong?: boolean; lop: number | null }[] = [
    { label: 'Total granted', hint: 'eligible for the year', key: 'granted', lop: null },
    { label: 'Availed', hint: 'sanctioned', key: 'availed', lop: lop ? Number(lop.used) : 0 },
    { label: 'Applied', hint: 'awaiting approval', key: 'pending', lop: lop ? Number(lop.in_process || 0) : 0 },
    { label: 'Balance', hint: 'granted − availed', key: 'balance', strong: true, lop: null },
    { label: 'Remaining', hint: 'balance − applied', key: 'remaining', strong: true, lop: null },
  ];

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
              <th className={`${th} text-left`}>Leaves</th>
              {cols.map(c => (
                <th key={c.key} className={`${th} text-center`}>
                  {c.short}<span className={`block font-normal normal-case tracking-normal text-[9px] ${print ? 'text-slate-600' : 'text-textMuted'}`}>{c.label}</span>
                </th>
              ))}
              <th className={`${th} text-center`}>Total<span className={`block font-normal normal-case tracking-normal text-[9px] ${print ? 'text-slate-600' : 'text-textMuted'}`}>CL + Sp. CL + AL</span></th>
              {showLop && <th className={`${th} text-center`}>LOP<span className={`block font-normal normal-case tracking-normal text-[9px] ${print ? 'text-slate-600' : 'text-textMuted'}`}>loss of pay</span></th>}
            </tr>
          </thead>
          <tbody className={print ? '' : 'divide-y divide-borderLine'}>
            {rows.map(r => (
              <tr key={r.key} className={r.strong ? (print ? 'bg-slate-50' : 'bg-surface-2/60') : ''}>
                <td className={`${td} text-left`}><b>{r.label}</b> <span className={print ? 'text-slate-600' : 'text-textMuted'}>({r.hint})</span></td>
                {cols.map(c => (
                  <td key={c.key} className={`${td} text-center ${r.strong ? 'font-black' : ''} ${!print && r.key === 'remaining' && c.remaining <= 1 ? 'text-red-600' : ''}`}>{n(c[r.key])}</td>
                ))}
                <td className={`${td} text-center font-black ${!print && r.key === 'remaining' ? 'text-brand-primary' : ''}`}>{n(total[r.key])}</td>
                {showLop && <td className={`${td} text-center`}>{n(r.lop)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {print && <p className="text-[9px] text-slate-500">Availed = sanctioned by the Principal. Balance = Total granted − Availed. Remaining = Balance − Applied (awaiting approval).</p>}
    </div>
  );
};

export default LeaveBalanceTable;
