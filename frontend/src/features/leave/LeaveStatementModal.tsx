import React from 'react';
import { Printer, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LeaveBalanceTable, LeaveBalances } from './LeaveBalanceTable';
import { PrintPortal } from '../../components/common/PrintPortal';

interface Props {
  onClose: () => void;
  facultyName?: string;
  facultyEmail: string;
  year?: number;
  balances: LeaveBalances;
  leaves: any[];
}

const fmt = (d: any) => (d ? new Date(String(d).slice(0, 10)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const SHORT: Record<string, string> = { 'Casual Leave': 'CL', 'SP CL': 'Sp. CL', 'Academic Leave': 'AL', 'Paid Leave': 'LOP' };

/** Printable leave statement: eligibility table + the year's leave register. */
export const LeaveStatementModal: React.FC<Props> = ({ onClose, facultyName, facultyEmail, year, balances, leaves }) => {
  const { user } = useAuth();
  const name = user?.name || facultyName || facultyEmail;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const sorted = [...leaves].sort((a, b) => String(a.from_date).localeCompare(String(b.from_date)));
  const statusOf = (l: any) => l.principal_status === 'Approved' || l.is_deducted ? 'Sanctioned'
    : l.status === 'Rejected' || l.hod_status === 'Rejected' || l.principal_status === 'Rejected' ? 'Rejected' : 'Awaiting approval';

  return (
    <PrintPortal>
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-surface border border-borderLine rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none">
        <div className="p-4 border-b border-borderLine bg-surface-2 flex items-center justify-between print:hidden">
          <span className="text-sm font-bold text-textPrimary">Leave statement {year}</span>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" />Print / Save PDF</button>
            <button onClick={onClose} className="p-1.5 rounded-xl border border-borderLine text-textMuted"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 print:p-0 print:bg-white print:overflow-visible">
          <div className="bg-white text-slate-900 p-8 rounded-xl max-w-2xl mx-auto space-y-5 border border-slate-200 print:border-none print:p-0 print:rounded-none">
            <div className="border-b-2 border-slate-900 pb-3 text-center">
              <h1 className="text-base font-black uppercase tracking-wide">Rajeev Gandhi Memorial College of Engineering &amp; Technology</h1>
              <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">(Autonomous) • Nandyal, Andhra Pradesh</p>
              <div className="mt-2 py-1 px-3 bg-slate-100 rounded flex justify-between text-xs font-bold">
                <span>FACULTY LEAVE STATEMENT — {year}</span><span>DATE: {today}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p><b>Name:</b> {name}</p>
              <p><b>Email:</b> {facultyEmail}</p>
              <p><b>Department:</b> {user?.department || '—'}</p>
              <p><b>Calendar year:</b> {year}</p>
            </div>

            <LeaveBalanceTable balances={balances} year={year} variant="print" asOn={today} />

            <div className="space-y-1.5">
              <p className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">Leave register — {year}</p>
              <table className="w-full text-[11px] border-collapse border border-slate-400">
                <thead><tr>
                  {['#', 'Type', 'From', 'To', 'Days', 'Reason', 'Status'].map(h => <th key={h} className="p-1.5 border border-slate-400 bg-slate-100 font-bold text-left">{h}</th>)}
                </tr></thead>
                <tbody>
                  {sorted.length === 0 ? <tr><td colSpan={7} className="p-2 border border-slate-300 text-center text-slate-500">No leaves applied this year.</td></tr>
                    : sorted.map((l, i) => (
                      <tr key={l.id || i}>
                        <td className="p-1.5 border border-slate-300">{i + 1}</td>
                        <td className="p-1.5 border border-slate-300 font-bold">{SHORT[l.leave_type] || l.leave_type}</td>
                        <td className="p-1.5 border border-slate-300 whitespace-nowrap">{fmt(l.from_date)}</td>
                        <td className="p-1.5 border border-slate-300 whitespace-nowrap">{fmt(l.to_date)}</td>
                        <td className="p-1.5 border border-slate-300 text-center">{l.num_days}</td>
                        <td className="p-1.5 border border-slate-300">{l.reason}</td>
                        <td className="p-1.5 border border-slate-300">{statusOf(l)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="pt-10 grid grid-cols-3 gap-4 text-xs text-center">
              {['Signature of Faculty', 'Head of Department', 'Principal'].map(s => (
                <div key={s}><div className="border-b border-slate-400 pb-6" /><p className="font-bold mt-1">{s}</p></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </PrintPortal>
  );
};

export default LeaveStatementModal;
