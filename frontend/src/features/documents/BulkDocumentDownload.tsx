import { useState } from 'react';
import { FolderDown, Download, Loader2, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { api } from '../../lib/api';
import { STUDENT_DOC_TYPES } from '../../types';

const ACADEMIC_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

interface Props {
  department?: string; // pre-filled for HOD (their own dept)
  showDeptFilter?: boolean; // true for Admin view
}

export function BulkDocumentDownload({ department, showDeptFilter = false }: Props) {
  const [academicYear, setAcademicYear] = useState('');
  const [docType, setDocType] = useState('');
  const [deptFilter, setDeptFilter] = useState(department || '');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'downloading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [lastZipName, setLastZipName] = useState('');

  const handleDownload = async () => {
    setStatus('fetching');
    setErrorMsg('');
    setProgress({ current: 0, total: 0 });

    try {
      const res = await api.getDocumentZipUrls({
        academic_year: academicYear || undefined,
        department: deptFilter || undefined,
        doc_type: docType || undefined,
      });

      const files: any[] = res?.files ?? [];
      if (files.length === 0) {
        setStatus('error');
        setErrorMsg('No documents found for the selected filters.');
        return;
      }

      setStatus('downloading');
      setProgress({ current: 0, total: files.length });

      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });

        if (!file.download_url) {
          // No presigned URL (dev mode) — skip
          continue;
        }

        try {
          const resp = await fetch(file.download_url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          const zipPath = file.zip_path || `${file.roll_number}_${file.file_name}`;
          zip.file(zipPath, blob);
        } catch {
          // skip individual failures
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const yearPart = academicYear ? academicYear.replace(/\s+/g, '_') : 'All_Years';
      const deptPart = (deptFilter || department || 'All_Depts').replace(/[^a-zA-Z0-9]/g, '_');
      const zipName = `Student_Documents_${deptPart}_${yearPart}.zip`;
      setLastZipName(zipName);
      saveAs(content, zipName);
      setStatus('done');
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Download failed. Please try again.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
          <FolderDown className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Bulk Document Download</h3>
          <p className="text-xs text-gray-500 mt-0.5">Download student documents as a ZIP, organized by dept / year / student</p>
        </div>
      </div>

      {/* Filters */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Academic Year</label>
            <select
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Years</option>
              {ACADEMIC_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Document Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Document Type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Types</option>
              {STUDENT_DOC_TYPES.map((t: string) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Department (Admin only) */}
          {showDeptFilter && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Department</label>
              <input
                type="text"
                placeholder="e.g. CSE"
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Download Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleDownload}
            disabled={status === 'fetching' || status === 'downloading'}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            {status === 'fetching' || status === 'downloading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {status === 'fetching' ? 'Fetching file list…' : `Downloading ${progress.current}/${progress.total}…`}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download as ZIP
              </>
            )}
          </button>

          {/* ZIP info */}
          <p className="text-xs text-gray-400">
            ZIP structure: <code className="bg-gray-100 px-1 rounded">Department / Year / RollNo / DocType_FileName</code>
          </p>
        </div>

        {/* Progress Bar */}
        {status === 'downloading' && progress.total > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Packing files…</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Status messages */}
        {status === 'done' && (
          <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-xl text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>ZIP downloaded successfully: <strong>{lastZipName}</strong></span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Info box */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Note:</strong> Only approved and pending documents are included. Max 500 files per download.
            Large downloads may take a few minutes depending on file sizes.
          </div>
        </div>
      </div>
    </div>
  );
}
