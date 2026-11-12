import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Printer, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';

interface DeptRow {
  department: string; attendance_pct: number | null; sessions_posted: number;
  classes_scheduled: number; classes_posted: number; posting_compliance_pct: number | null;
  at_risk_high: number; at_risk_medium: number; new_certifications: number; new_placements: number; highest_package_lpa: number | null;
}
interface MonthlyReport {
  month: string; label: string;
  period: { from: string; to: string; compliance_counted_to: string };
  totals: { attendance_pct: number | null; classes_scheduled: number; classes_posted: number; posting_compliance_pct: number | null;
    at_risk_high: number; at_risk_medium: number; new_certifications: number; new_placements: number };
  departments: DeptRow[];
  lowest_posting_compliance: { faculty_email: string; faculty_name: string; department: string; scheduled: number; posted: number; compliance_pct: number | null }[];
  generated_at: string;
}

const thisMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
const fmtPct = (v: number | null) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`);
const tone = (v: number | null, good: number, ok: number) => v === null ? 'text-textMuted' : v >= good ? 'text-emerald-600' : v >= ok ? 'text-amber-600' : 'text-red-600';

export const MonthlyReportPage: React.FC = () => {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, isError, error } = useQuery<MonthlyReport>({
    queryKey: ['monthlyReport', month],
    queryFn: () => api.getMonthlyReport(month),
  });
  const t = data?.totals;

  return (
    <div className="space-y-5 print:space-y-3 print:text-black">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><FileBarChart className="w-5 h-5 text-brand-primary print:hidden" />Monthly Principal's Report</h1>
          <p className="text-xs text-textMuted mt-0.5">{data ? `${data.label} · ${data.period.from} to ${data.period.to}` : 'Attendance, compliance, risk, certifications and placements'}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <input type="month" value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold" />
          <button onClick={() => window.print()} disabled={!data}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5 disabled:opacity-40">
            <Printer className="w-3.5 h-3.5" /> Print / Save PDF
          </button>
        </div>
      </div>

      {isError && <div className="p-4 rounded-xl bg-red-500/10 text-red-700 text-xs font-semibold">{(error as Error)?.message || 'Could not load the report.'}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4">
        {[
          { label: 'Overall attendance', value: fmtPct(t?.attendance_pct ?? null), cls: tone(t?.attendance_pct ?? null, 85, 75) },
          { label: 'Attendance posted on time', value: fmtPct(t?.posting_compliance_pct ?? null), sub: t ? `${t.classes_posted}/${t.classes_scheduled} classes` : '', cls: tone(t?.posting_compliance_pct ?? null, 95, 85) },
          { label: 'Students at risk', value: t ? `${t.at_risk_high + t.at_risk_medium}` : '—', sub: t ? `${t.at_risk_high} high · ${t.at_risk_medium} medium` : '', cls: 'text-red-600' },
          { label: 'Certifications · Placements', value: t ? `${t.new_certifications} · ${t.new_placements}` : '—', sub: 'new this month', cls: 'text-textPrimary' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-borderLine rounded-2xl shadow-sm p-4 print:shadow-none print:border-slate-300">
            <div className={`text-2xl font-black ${k.cls}`}>{isLoading ? '…' : k.value}</div>
            <div className="text-[11px] font-bold text-textMuted">{k.label}</div>
            {k.sub && <div className="text-[10px] text-textMuted">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="bg-surface border border-borderLine rounded-2xl shadow-sm overflow-hidden print:shadow-none print:border-slate-300">
        <div className="px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary">Department summary</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Department</th><th className="py-2.5 px-3 text-center">Attendance</th><th className="py-2.5 px-3 text-center">Posting compliance</th>
                <th className="py-2.5 px-3 text-center">At risk (high / med)</th><th className="py-2.5 px-3 text-center">New certs</th><th className="py-2.5 px-3 text-center">Placements</th><th className="py-2.5 px-3 text-center">Top package</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={7} className="py-8 text-center text-textMuted">Building report…</td></tr>
                : (data?.departments || []).length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-textMuted">No activity recorded for this month.</td></tr>
                : data!.departments.map(d => (
                  <tr key={d.department}>
                    <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${tone(d.attendance_pct, 85, 75)}`}>{fmtPct(d.attendance_pct)}</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${tone(d.posting_compliance_pct, 95, 85)}`}>
                      {fmtPct(d.posting_compliance_pct)}<span className="text-textMuted font-normal"> ({d.classes_posted}/{d.classes_scheduled})</span>
                    </td>
                    <td className="py-2.5 px-3 text-center"><span className="text-red-600 font-bold">{d.at_risk_high}</span> / <span className="text-amber-600 font-bold">{d.at_risk_medium}</span></td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.new_certifications}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.new_placements}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.highest_package_lpa ? `${d.highest_package_lpa} LPA` : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {(data?.lowest_posting_compliance || []).length > 0 && (
        <div className="bg-surface border border-borderLine rounded-2xl shadow-sm overflow-hidden print:shadow-none print:border-slate-300 print:break-inside-avoid">
          <div className="px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 print:hidden" />Lowest attendance-posting compliance
          </div>
          <table className="w-full text-xs text-left">
            <tbody className="divide-y divide-borderLine">
              {data!.lowest_posting_compliance.map(f => (
                <tr key={f.faculty_email}>
                  <td className="py-2 px-4 font-bold text-textPrimary">{f.faculty_name}</td>
                  <td className="py-2 px-3 text-textSecondary">{f.department}</td>
                  <td className={`py-2 px-3 text-right font-bold ${tone(f.compliance_pct, 95, 85)}`}>{fmtPct(f.compliance_pct)}</td>
                  <td className="py-2 px-4 text-right text-textMuted">{f.posted}/{f.scheduled} classes posted</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="text-[10px] text-textMuted">
          Posting compliance counts timetable classes on working days up to {data.period.compliance_counted_to} (holidays and removed classes excluded).
          At-risk figures reflect the current position. Generated {new Date(data.generated_at).toLocaleString('en-IN')}.
        </p>
      )}
    </div>
  );
};

export default MonthlyReportPage;
