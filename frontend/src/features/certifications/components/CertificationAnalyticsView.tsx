import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Users, Search, Download, ExternalLink, ShieldCheck, CheckCircle2, FileText, ChevronRight, X, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { CertificationTypeaheadSearch, CertResult } from './CertificationTypeaheadSearch';

export const CertificationAnalyticsView: React.FC = () => {
  const [selectedCertName, setSelectedCertName] = useState<string | null>(null);

  // Fetch top certifications summary (e.g. AWS: 400, etc.)
  const { data: summary = [], isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['certificationsSummary'],
    queryFn: () => api.getCertificationsSummary().catch(() => []),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Fetch students for selected certification
  const { data: certifiedStudents = [], isLoading: isStudentsLoading } = useQuery({
    queryKey: ['certifiedStudents', selectedCertName],
    queryFn: () => selectedCertName ? api.getCertifiedStudents(selectedCertName).catch(() => []) : Promise.resolve([]),
    enabled: Boolean(selectedCertName),
    staleTime: 0,
  });

  const handleExportCSV = () => {
    if (!certifiedStudents || certifiedStudents.length === 0) return;
    const headers = ['Roll Number', 'Student Name', 'Department', 'Section', 'Year', 'Certificate', 'Issuer', 'Issue Date', 'Source', 'Status'];
    const rows = certifiedStudents.map((s: any) => [
      s.roll_number,
      s.student_name,
      s.department,
      s.section,
      s.year,
      s.certificate_name,
      s.issuer,
      s.issue_date || 'N/A',
      s.source,
      s.verification_status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedCertName || 'Certifications'}_Students.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Search Bar */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary mb-1">
              <Award className="w-4 h-4" />
              <span>Certification Intelligence & Student Count</span>
            </div>
            <h3 className="text-lg font-black text-textPrimary">Student Certification Analytics</h3>
            <p className="text-xs text-textMuted">Live counts of certified students across certifications (AWS, MongoDB, Azure, etc.)</p>
          </div>

          {/* Typeahead Search Bar */}
          <div className="w-full md:w-80">
            <CertificationTypeaheadSearch 
              onSelectCert={(cert) => setSelectedCertName(cert.display_name)}
              placeholder="Type to search (e.g. AWS, MongoDB)..."
            />
          </div>
        </div>

        {/* Quick Summary Cards (e.g. AWS: 400) */}
        <div>
          <div className="text-[11px] font-bold text-textMuted uppercase tracking-wider mb-2.5">
            Top Certifications Breakdown
          </div>
          {isSummaryLoading ? (
            <div className="p-6 text-center text-xs text-textMuted animate-pulse">Loading certification counts...</div>
          ) : summary.length === 0 ? (
            <div className="p-6 text-center text-xs text-textMuted bg-surface-2/40 rounded-xl border border-dashed border-borderLine">
              No certifications recorded yet. As students upload or sync Credly certificates, their counts will appear here.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {summary.map((item: any) => {
                const isSelected = selectedCertName?.toLowerCase() === item.display_name?.toLowerCase();
                return (
                  <button
                    key={item.canonical_name || item.display_name}
                    type="button"
                    onClick={() => setSelectedCertName(item.display_name)}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      isSelected 
                        ? 'bg-brand-soft border-brand-primary ring-2 ring-brand-primary/20 shadow-sm' 
                        : 'bg-surface hover:bg-surface-2 border-borderLine hover:border-brand-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[10px] font-bold text-textMuted uppercase truncate">{item.issuer}</span>
                      <Award className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-brand-primary' : 'text-textMuted'}`} />
                    </div>
                    <div className="text-xs font-black text-textPrimary line-clamp-1" title={item.display_name}>
                      {item.display_name}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-xl font-black text-brand-primary">{item.student_count}</span>
                      <span className="text-[10px] font-bold text-textMuted">students</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected Certification Student List Table */}
      {selectedCertName && (
        <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-xs space-y-3">
          <div className="p-4 bg-surface-2/50 border-b border-borderLine flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center font-black">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-textPrimary">
                  Certified Students: <span className="text-brand-primary">{selectedCertName}</span>
                </h4>
                <p className="text-[10px] text-textMuted">{certifiedStudents.length} student(s) completed this certification</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => setSelectedCertName(null)}
                className="p-1.5 rounded-xl border border-borderLine text-textMuted hover:text-textPrimary hover:bg-surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isStudentsLoading ? (
            <div className="p-12 text-center text-xs text-textMuted animate-pulse flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-primary" /> Loading student list...
            </div>
          ) : certifiedStudents.length === 0 ? (
            <div className="p-10 text-center text-xs text-textMuted">
              No students found for this certification.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#343a40] text-white font-bold text-[10px] uppercase">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">#</th>
                    <th className="px-4 py-3">Roll Number</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-center">Sec / Year</th>
                    <th className="px-4 py-3">Issuer</th>
                    <th className="px-4 py-3 text-center">Source</th>
                    <th className="px-4 py-3 text-center">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {certifiedStudents.map((s: any, idx: number) => (
                    <tr key={`${s.roll_number}-${idx}`} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3 text-center font-bold text-textMuted">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono font-black text-textPrimary">{s.roll_number}</td>
                      <td className="px-4 py-3 font-bold uppercase text-textPrimary">{s.student_name}</td>
                      <td className="px-4 py-3 text-textSecondary">{s.department}</td>
                      <td className="px-4 py-3 text-center text-textMuted">{s.section || '—'} · {s.year || '—'}</td>
                      <td className="px-4 py-3 text-textSecondary">{s.issuer}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.source === 'credly' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-surface-2 text-textSecondary'
                        }`}>
                          {s.source === 'credly' ? 'Credly' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.verification_url ? (
                          <a
                            href={s.verification_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline"
                          >
                            Verify <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-textMuted text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
