import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, CheckCircle2, XCircle, Download, Eye, Search,
  Filter, ChevronDown, ChevronUp, FileText, AlertCircle, Loader2,
  RefreshCw, Clock,
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { STUDENT_DOC_TYPES } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudentDoc {
  id: number;
  roll_number: string;
  student_name?: string;
  department?: string;
  section?: string;
  year?: string;
  doc_type: string;
  semester: string;
  title: string;
  description?: string;
  file_name: string;
  file_size_kb?: number;
  verification_status: 'Pending' | 'Verified' | 'Rejected';
  admin_note?: string;
  verified_by?: string;
  verified_at?: string;
  uploaded_at: string;
  download_url?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  Pending: { label: 'Pending Review', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
  Verified: { label: 'Verified', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  Rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
};

const ACADEMIC_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

function DocStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.Pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function DocumentsManagementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role || '';
  const isFaculty = role === 'faculty';
  // isSuperAdmin = truly global admin (dept='*'); dept-admins (admin-EEE) are scoped like HOD
  const isSuperAdmin = user?.isSuperAdmin === true || user?.department === '*';
  const isAdmin = role === 'admin'; // kept for UI conditionals (approve button etc.)
  const userDept = isSuperAdmin ? '' : (user?.department || '');

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pending' | 'Verified' | 'Rejected'>('all');
  const [filterYear, setFilterYear] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterSem, setFilterSem] = useState('');

  // Approve/reject state
  const [actionDoc, setActionDoc] = useState<{ doc: StudentDoc; action: 'approve' | 'reject' } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Download state
  const [zipDownloading, setZipDownloading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Fetch documents list — always scoped to own dept unless super-admin
  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ['documents-management', filterYear, filterDept, filterDocType, userDept],
    queryFn: () => api.getDocumentZipUrls({
      academic_year: filterYear || undefined,
      // Super-admin can filter by any dept; everyone else is locked to their own dept
      department: isSuperAdmin ? (filterDept || undefined) : (userDept || undefined),
      doc_type: filterDocType || undefined,
    }),
    staleTime: 30000,
  });

  const allDocs: StudentDoc[] = (rawData?.files ?? []).map((f: any) => ({
    id: f.id,
    roll_number: f.roll_number,
    student_name: f.student_name,
    department: f.department,
    section: f.section,
    year: f.academic_year,
    doc_type: f.doc_type,
    semester: f.semester || '',
    title: f.title,
    file_name: f.file_name,
    file_size_kb: f.file_size_kb,
    verification_status: f.verification_status || 'Pending',
    admin_note: f.admin_note,
    verified_by: f.verified_by,
    verified_at: f.verified_at,
    uploaded_at: f.uploaded_at || '',
    download_url: f.download_url,
    zip_path: f.zip_path,
  }));

  // Client-side filtering
  const filtered = allDocs.filter(doc => {
    if (filterStatus !== 'all' && doc.verification_status !== filterStatus) return false;
    if (filterSem && doc.semester !== filterSem) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !doc.roll_number.toLowerCase().includes(q) &&
        !(doc.student_name || '').toLowerCase().includes(q) &&
        !doc.title.toLowerCase().includes(q) &&
        !doc.doc_type.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const pendingCount = allDocs.filter(d => d.verification_status === 'Pending').length;
  const verifiedCount = allDocs.filter(d => d.verification_status === 'Verified').length;
  const rejectedCount = allDocs.filter(d => d.verification_status === 'Rejected').length;

  // ── Approve / Reject ───────────────────────────────────────────────────────
  const handleAction = async () => {
    if (!actionDoc) return;
    setActionLoading(true);
    setActionError('');
    try {
      const status = actionDoc.action === 'approve' ? 'Verified' : 'Rejected';
      await api.updateDocumentStatus(actionDoc.doc.roll_number, actionDoc.doc.id, status, adminNote);
      setActionDoc(null);
      setAdminNote('');
      qc.invalidateQueries({ queryKey: ['documents-management'] });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Bulk ZIP Download ──────────────────────────────────────────────────────
  const handleBulkDownload = async (docsToDownload: StudentDoc[]) => {
    setZipDownloading(true);
    const zip = new JSZip();
    for (const doc of docsToDownload) {
      if (!doc.download_url) continue;
      try {
        const resp = await fetch(doc.download_url);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const folder = `${(doc.department || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '')}/${doc.year || 'Unknown'}/${doc.roll_number}`;
        zip.file(`${folder}/${doc.doc_type}_${doc.file_name}`, blob);
      } catch { /* skip */ }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `Documents_${new Date().toISOString().split('T')[0]}.zip`);
    setZipDownloading(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-brand-primary" />
            Student Documents
          </h1>
          <p className="text-xs text-textSecondary mt-0.5">
            {isFaculty ? 'Review and approve documents uploaded by your mentees' :
             'Review, approve, and download student-uploaded documents'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-borderLine hover:bg-surface-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-textSecondary" />
          </button>
          <button
            onClick={() => handleBulkDownload(filtered.filter(d => d.download_url))}
            disabled={zipDownloading || filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {zipDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download ZIP ({filtered.length})
          </button>
        </div>
      </div>

      {/* ── Summary Chips ── */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Pending', count: pendingCount, color: 'bg-amber-50 border-amber-200 text-amber-700', key: 'Pending' },
          { label: 'Verified', count: verifiedCount, color: 'bg-green-50 border-green-200 text-green-700', key: 'Verified' },
          { label: 'Rejected', count: rejectedCount, color: 'bg-red-50 border-red-200 text-red-700', key: 'Rejected' },
          { label: 'All', count: allDocs.length, color: 'bg-surface border-borderLine text-textPrimary', key: 'all' },
        ].map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilterStatus(chip.key as typeof filterStatus)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all ${chip.color} ${filterStatus === chip.key ? 'ring-2 ring-brand-primary/40' : ''}`}
          >
            {chip.label}
            <span className="bg-white/60 px-1.5 py-0.5 rounded-full font-black">{chip.count}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-borderLine bg-background">
            <Search className="w-3.5 h-3.5 text-textMuted flex-shrink-0" />
            <input
              type="text"
              placeholder="Search student, roll no, title…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs focus:outline-none text-textPrimary placeholder:text-textMuted"
            />
          </div>

          {/* Year */}
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
            <option value="">All Years</option>
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Doc Type */}
          <select value={filterDocType} onChange={e => setFilterDocType(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
            <option value="">All Doc Types</option>
            {STUDENT_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Semester */}
          <select value={filterSem} onChange={e => setFilterSem(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
            <option value="">All Semesters</option>
            {SEMESTERS.map(s => <option key={s} value={s}>Sem {s}</option>)}
          </select>

          {/* Dept (Super-Admin: free-text filter; dept-scoped roles: show locked badge) */}
          {isSuperAdmin ? (
            <input
              type="text"
              placeholder="Department…"
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none"
            />
          ) : userDept ? (
            <span className="px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              {userDept}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-3" />
            <p className="text-sm text-textSecondary">Loading documents…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <FolderOpen className="w-12 h-12 text-textMuted mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold text-textSecondary">No documents found</p>
            <p className="text-xs text-textMuted mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2 border-b border-borderLine">
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Student</th>
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Document</th>
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Type</th>
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Sem</th>
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Status</th>
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Uploaded</th>
                  <th className="px-4 py-3 text-left font-bold text-textSecondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {filtered.map(doc => (
                  <>
                    <tr
                      key={doc.id}
                      className={`hover:bg-surface-2 transition-colors ${
                        doc.verification_status === 'Pending' ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Student */}
                      <td className="px-4 py-3">
                        <p className="font-bold text-textPrimary">{doc.student_name || doc.roll_number}</p>
                        <p className="text-textMuted">{doc.roll_number} · {doc.department}</p>
                        {doc.year && <p className="text-textMuted">{doc.year} · Sec {doc.section}</p>}
                      </td>

                      {/* Document */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-semibold text-textPrimary truncate">{doc.title}</p>
                        <p className="text-textMuted truncate">{doc.file_name}</p>
                        {doc.file_size_kb && <p className="text-textMuted">{doc.file_size_kb} KB</p>}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-lg bg-brand-soft text-brand-primary font-semibold text-[11px]">
                          {doc.doc_type}
                        </span>
                      </td>

                      {/* Semester */}
                      <td className="px-4 py-3 text-textSecondary">{doc.semester || '—'}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <DocStatusBadge status={doc.verification_status} />
                        {doc.verified_by && (
                          <p className="text-textMuted mt-1">by {doc.verified_by.split('@')[0]}</p>
                        )}
                      </td>

                      {/* Uploaded */}
                      <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* View / Download */}
                          {doc.download_url && (
                            <a
                              href={doc.download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg border border-borderLine hover:bg-surface-2 text-indigo-600 transition-colors"
                              title="View / Download"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {/* Expand for note */}
                          <button
                            onClick={() => setExpandedRow(expandedRow === doc.id ? null : doc.id)}
                            className="p-1.5 rounded-lg border border-borderLine hover:bg-surface-2 text-textSecondary transition-colors"
                            title="Details"
                          >
                            {expandedRow === doc.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {/* Approve */}
                          {doc.verification_status !== 'Verified' && (
                            <button
                              onClick={() => { setActionDoc({ doc, action: 'approve' }); setAdminNote(''); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition-colors"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                          )}

                          {/* Reject */}
                          {doc.verification_status !== 'Rejected' && (
                            <button
                              onClick={() => { setActionDoc({ doc, action: 'reject' }); setAdminNote(''); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 transition-colors"
                              title="Reject"
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row — notes */}
                    {expandedRow === doc.id && (
                      <tr key={`${doc.id}-expanded`} className="bg-surface-2">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-1 text-xs">
                            {doc.description && (
                              <p><span className="font-semibold text-textPrimary">Description:</span> <span className="text-textSecondary">{doc.description}</span></p>
                            )}
                            {doc.admin_note && (
                              <p><span className="font-semibold text-textPrimary">Admin Note:</span> <span className="text-textSecondary">{doc.admin_note}</span></p>
                            )}
                            {doc.verified_at && (
                              <p><span className="font-semibold text-textPrimary">Reviewed at:</span> <span className="text-textSecondary">{new Date(doc.verified_at).toLocaleString('en-IN')}</span></p>
                            )}
                            {!doc.description && !doc.admin_note && (
                              <p className="text-textMuted italic">No additional details.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Approve / Reject Modal ── */}
      {actionDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className={`px-6 py-4 border-b ${actionDoc.action === 'approve' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-2">
                {actionDoc.action === 'approve'
                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                  : <XCircle className="w-5 h-5 text-red-600" />}
                <h2 className="text-base font-bold text-gray-900">
                  {actionDoc.action === 'approve' ? 'Approve Document' : 'Reject Document'}
                </h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                <strong>{actionDoc.doc.student_name || actionDoc.doc.roll_number}</strong> — {actionDoc.doc.title}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {actionDoc.action === 'reject' ? 'Reason for Rejection *' : 'Note (optional)'}
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder={actionDoc.action === 'reject' ? 'State the reason for rejection…' : 'Add a note (optional)…'}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {actionError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setActionDoc(null); setAdminNote(''); setActionError(''); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  disabled={actionLoading || (actionDoc.action === 'reject' && !adminNote.trim())}
                  className={`flex items-center gap-2 px-5 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-50 transition-colors ${
                    actionDoc.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {actionDoc.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
