import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';

const SHEET_HELP: Record<string, string> = {
  'Student Strength': 'Students by department and year',
  'Student-Faculty Ratio': 'Ratio and PhD share per department (NAAC 2.4, NBA 5)',
  'Faculty': 'Designation, qualification, experience (NAAC 2.4)',
  'FDPs & Workshops': 'FDPs, workshops and conferences in the year (NAAC 6.3)',
  'Publications & Patents': 'Research output in the year (NAAC 3.4)',
  'Faculty Certifications': 'Industry / NPTEL certifications of faculty',
  'Student Certifications': 'Value-added and certification courses (NAAC 1.3)',
  'Placements': 'Offers in the year (NAAC 5.2, NBA 4)',
  'Attendance': 'Current-semester attendance and students below 75%',
  'Student Feedback': 'Feedback on teaching (NAAC 1.4)',
};

function academicYears(): string[] {
  const d = new Date(); const start = d.getMonth() + 1 >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return [0, 1, 2, 3, 4].map(k => `${start - k}–${String(start - k + 1).slice(-2)}`);
}

export const AccreditationPage: React.FC = () => {
  const { user } = useAuth();
  const locked = user?.role === 'hod' ? user.department || '' : '';
  const [ay, setAy] = useState(academicYears()[0]);
  const [dept, setDept] = useState(locked || 'All');
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['accreditationPack', ay, dept],
    queryFn: () => api.getAccreditationPack(ay, dept),
    staleTime: 5 * 60 * 1000,
  });
  const sheets: Record<string, any[]> = data?.sheets || {};

  const download = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const cover = [
        { 'RGMCET — Accreditation Data Pack': `Academic year ${data.academic_year}` },
        { 'RGMCET — Accreditation Data Pack': `Department: ${data.department}` },
        { 'RGMCET — Accreditation Data Pack': `Generated: ${new Date(data.generated_at).toLocaleString('en-IN')}` },
        ...Object.entries(sheets).map(([name, rows]) => ({ 'RGMCET — Accreditation Data Pack': `${name}: ${rows.length} rows — ${SHEET_HELP[name] || ''}` })),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cover), 'Summary');
      for (const [name, rows] of Object.entries(sheets)) {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No records for this selection' }]);
        const keys = Object.keys(rows[0] || { Note: '' });
        ws['!cols'] = keys.map(k => ({ wch: Math.min(48, Math.max(k.length, ...rows.slice(0, 200).map(r => String(r[k] ?? '').length)) + 2) }));
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      }
      XLSX.writeFile(wb, `Accreditation_${data.department.replace(/[^A-Za-z0-9]+/g, '_')}_${data.academic_year.replace('–', '-')}.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><Award className="w-5 h-5 text-brand-primary" />NAAC / NBA Data Pack</h1>
          <p className="text-xs text-textMuted mt-0.5">One workbook with the tables accreditation teams ask for, built from live data</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={ay} onChange={e => setAy(e.target.value)} className={input}>{academicYears().map(y => <option key={y} value={y}>Academic year {y}</option>)}</select>
          <select value={dept} disabled={Boolean(locked)} onChange={e => setDept(e.target.value)} className={input}>
            <option value="All">All departments</option>{VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={download} disabled={!data || busy} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Download Excel
          </button>
        </div>
      </div>

      {isError && <div className="p-4 rounded-xl bg-red-500/10 text-red-700 text-xs font-semibold">{(error as Error)?.message || 'Could not build the data pack.'}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.keys(SHEET_HELP).map(name => (
          <div key={name} className={`${card} p-4 flex items-start gap-3`}>
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-black text-textPrimary">{name}</div>
              <div className="text-[11px] text-textMuted">{SHEET_HELP[name]}</div>
              <div className="text-lg font-black text-textPrimary mt-1">{isLoading ? '…' : (sheets[name]?.length ?? 0)} <span className="text-[11px] font-semibold text-textMuted">rows</span></div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-textMuted">
        Faculty activities, publications and certifications come from faculty profiles — the pack is only as complete as those profiles.
        Encourage faculty to keep “My Faculty Profile” up to date before an accreditation visit.
      </p>
    </div>
  );
};

export default AccreditationPage;
