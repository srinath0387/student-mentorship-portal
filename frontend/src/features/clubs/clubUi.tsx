import React from 'react';

export const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
export const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
export const label = 'text-[11px] font-bold text-textSecondary uppercase tracking-wider';
export const btnPrimary = 'px-3.5 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-50 hover:opacity-90';
export const btnGhost = 'px-3 py-2 rounded-xl border border-borderLine text-xs font-bold text-textSecondary hover:bg-surface-2 disabled:opacity-50';

export const DEPARTMENTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

export const CATEGORY_EMOJI: Record<string, string> = {
  Technical: '🛠️', Coding: '💻', Cultural: '🎭', Literary: '📚', Sports: '🏅', 'Social Service': '🤝',
  Entrepreneurship: '🚀', Arts: '🎨', Other: '✨',
};

export const STATUS_META: Record<string, { text: string; cls: string }> = {
  approved: { text: 'Member', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  payment_submitted: { text: 'Payment under review', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
  pending_payment: { text: 'Payment due', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  waitlisted: { text: 'Waitlisted', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300' },
  rejected: { text: 'Rejected', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
  expired: { text: 'Seat expired', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  withdrawn: { text: 'Withdrawn', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

export const ROLE_META: Record<string, { text: string; cls: string }> = {
  lead: { text: '★ Lead', cls: 'bg-amber-400 text-amber-950' },
  co_lead: { text: '☆ Co-Lead', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200' },
};

export function StatusChip({ status }: { status: string }) {
  const m = STATUS_META[status] || { text: status, cls: 'bg-surface-2 text-textSecondary' };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${m.cls}`}>{m.text}</span>;
}

export function RoleChip({ role }: { role?: string }) {
  const m = role ? ROLE_META[role] : null;
  return m ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${m.cls}`}>{m.text}</span> : null;
}

export function WindowChip({ club }: { club: any }) {
  const w = club.window;
  const cls = w === 'open' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
    : w === 'upcoming' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const text = w === 'open' ? `Open · closes ${fmtDateTime(club.reg_close)}` : w === 'upcoming' ? `Opens ${fmtDateTime(club.reg_open)}` : 'Registration closed';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${cls}`}>{text}</span>;
}

export function SeatBar({ taken, max, waitlisted = 0 }: { taken: number; max: number; waitlisted?: number }) {
  const pct = Math.min(100, (taken / Math.max(1, max)) * 100);
  const full = taken >= max;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold text-textSecondary">
        <span>{taken} / {max} seats</span>
        <span>{full ? `Full${waitlisted ? ` · ${waitlisted} waitlisted` : ''}` : `${max - taken} left`}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${full ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-brand-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const fmtDateTime = (v: any) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDate = (v: any) => (v ? new Date(String(v).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const todayIso = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
export const money = (n: any) => (Number(n) > 0 ? `₹${Number(n).toLocaleString('en-IN')}` : 'Free');

export function downloadCsv(name: string, header: string[], rows: any[][]) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-10 text-center text-xs text-textMuted">{children}</div>;
}
