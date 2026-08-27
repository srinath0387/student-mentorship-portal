import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Percent,
  Award,
  Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../../lib/api';
import { FacultySubjectHandledRecord } from '../../../types';

interface SubjectsHandledSectionProps {
  facultyEmail: string;
  isReadOnly?: boolean;
}

export const SubjectsHandledSection: React.FC<SubjectsHandledSectionProps> = ({
  facultyEmail,
  isReadOnly = false,
}) => {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parsedRows, setParsedRows] = useState<Partial<FacultySubjectHandledRecord>[]>([]);

  // Manual Form State
  const [formYearBatch, setFormYearBatch] = useState('I B.Tech. II Sem. & 2025');
  const [formSection, setFormSection] = useState('A');
  const [formSubject, setFormSubject] = useState('');
  const [formBranch, setFormBranch] = useState('CSE (DS)');
  const [formRegistered, setFormRegistered] = useState<number | ''>('');
  const [formAppeared, setFormAppeared] = useState<number | ''>('');
  const [formFailed, setFormFailed] = useState<number | ''>(0);
  const [formPassPct, setFormPassPct] = useState<number | ''>('');
  const [formHighest, setFormHighest] = useState<number | ''>(10);

  // Auto-calculate Pass Percentage when Appeared and Failed change
  const handleAppearedChange = (val: number | '') => {
    setFormAppeared(val);
    if (typeof val === 'number' && val > 0 && typeof formFailed === 'number') {
      const calculated = Math.round(((val - formFailed) / val) * 10000) / 100;
      setFormPassPct(Math.max(0, Math.min(100, calculated)));
    }
  };

  const handleFailedChange = (val: number | '') => {
    setFormFailed(val);
    if (typeof formAppeared === 'number' && formAppeared > 0 && typeof val === 'number') {
      const calculated = Math.round(((formAppeared - val) / formAppeared) * 10000) / 100;
      setFormPassPct(Math.max(0, Math.min(100, calculated)));
    }
  };

  // Query
  const { data: records = [], isLoading } = useQuery<FacultySubjectHandledRecord[]>({
    queryKey: ['facultySubjectsHandled', facultyEmail],
    queryFn: () => (facultyEmail ? api.getFacultySubjectsHandled(facultyEmail) : Promise.resolve([])),
    enabled: Boolean(facultyEmail),
  });

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (data: any | any[]) => api.saveFacultySubjectsHandled(facultyEmail, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facultySubjectsHandled', facultyEmail] });
      setShowAddModal(false);
      setShowUploadModal(false);
      setParsedRows([]);
      resetForm();
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFacultySubjectHandled(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facultySubjectsHandled', facultyEmail] });
    },
  });

  const resetForm = () => {
    setFormYearBatch('I B.Tech. II Sem. & 2025');
    setFormSection('A');
    setFormSubject('');
    setFormBranch('CSE (DS)');
    setFormRegistered('');
    setFormAppeared('');
    setFormFailed(0);
    setFormPassPct('');
    setFormHighest(10);
  };

  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formYearBatch || !formSubject) return;

    const reg = Number(formRegistered) || 0;
    const app = Number(formAppeared) || reg;
    const fail = Number(formFailed) || 0;
    let pct = Number(formPassPct);
    if (isNaN(pct) && app > 0) {
      pct = Math.round(((app - fail) / app) * 10000) / 100;
    }

    saveMutation.mutate({
      year_batch: formYearBatch,
      section: formSection,
      subject: formSubject,
      branch: formBranch,
      registered: reg,
      appeared: app,
      failed: fail,
      pass_percentage: isNaN(pct) ? 100 : pct,
      highest_marks: Number(formHighest) || 0,
    });
  };

  // Excel / CSV / Document Upload Parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (!rawData || rawData.length < 2) {
          setUploadError('Spreadsheet is empty or lacks header rows.');
          return;
        }

        // Expected Columns: Year (Batch), Section, Subject, Branch, Registered, Appeared, Failed, Pass (%), Highest
        const parsed: Partial<FacultySubjectHandledRecord>[] = [];
        const headerRow = rawData[0].map((h: any) => String(h || '').toLowerCase().trim());

        const yearIdx = headerRow.findIndex((h) => h.includes('year') || h.includes('batch') || h.includes('sem'));
        const secIdx = headerRow.findIndex((h) => h.includes('section') || h.includes('sec'));
        const subjIdx = headerRow.findIndex((h) => h.includes('subject') || h.includes('course') || h.includes('title'));
        const branchIdx = headerRow.findIndex((h) => h.includes('branch') || h.includes('dept') || h.includes('department'));
        const regIdx = headerRow.findIndex((h) => h.includes('registered') || h.includes('total'));
        const appIdx = headerRow.findIndex((h) => h.includes('appeared') || h.includes('present'));
        const failIdx = headerRow.findIndex((h) => h.includes('failed') || h.includes('fail'));
        const passIdx = headerRow.findIndex((h) => h.includes('pass') || h.includes('%'));
        const highIdx = headerRow.findIndex((h) => h.includes('highest') || h.includes('max') || h.includes('top'));

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0 || !row.some(Boolean)) continue;

          const year_batch = yearIdx !== -1 ? String(row[yearIdx] || '').trim() : String(row[0] || '').trim();
          const section = secIdx !== -1 ? String(row[secIdx] || 'A').trim().toUpperCase() : 'A';
          const subject = subjIdx !== -1 ? String(row[subjIdx] || '').trim() : String(row[1] || '').trim();
          const branch = branchIdx !== -1 ? String(row[branchIdx] || 'CSE (DS)').trim() : 'CSE (DS)';
          const registered = parseInt(regIdx !== -1 ? row[regIdx] : row[2]) || 0;
          const appeared = parseInt(appIdx !== -1 ? row[appIdx] : row[3]) || registered;
          const failed = parseInt(failIdx !== -1 ? row[failIdx] : row[4]) || 0;
          let pass_percentage = parseFloat(passIdx !== -1 ? row[passIdx] : row[5]);
          if (isNaN(pass_percentage) && appeared > 0) {
            pass_percentage = Math.round(((appeared - failed) / appeared) * 10000) / 100;
          }
          const highest_marks = parseFloat(highIdx !== -1 ? row[highIdx] : row[6]) || 0;

          if (year_batch && subject) {
            parsed.push({
              year_batch,
              section,
              subject,
              branch,
              registered,
              appeared,
              failed,
              pass_percentage: isNaN(pass_percentage) ? 100 : pass_percentage,
              highest_marks,
            });
          }
        }

        if (parsed.length === 0) {
          setUploadError('No valid subject rows found. Please verify column headers: Year (Batch), Section, Subject, Branch, Registered, Appeared, Failed, Pass (%), Highest.');
          return;
        }

        setParsedRows(parsed);
      } catch (err: any) {
        setUploadError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadSampleTemplate = () => {
    const wsData = [
      ['Year (Batch)', 'Section', 'Subject', 'Branch', 'Registered', 'Appeared', 'Failed', 'Pass (%)', 'Highest'],
      ['I B.Tech. II Sem. & 2025', 'A', 'DS Lab', 'CSE (DS)', 71, 70, 0, 100.0, 10],
      ['II B.Tech. I Sem. & 2024', 'B', 'Operating Systems', 'CSE', 68, 65, 2, 96.92, 9.8],
      ['III B.Tech. I Sem. & 2024', 'A', 'Machine Learning', 'CSE (AIML)', 64, 64, 1, 98.44, 10],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subjects_Handled');
    XLSX.writeFile(wb, 'Subjects_Handled_Sample_Template.xlsx');
  };

  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-sm shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-textPrimary">Subjects Handled (Results Archive)</h3>
            <p className="text-xs text-textSecondary mt-0.5">
              Subject results handled across batches, pass percentages, and highest scores.
            </p>
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3 py-1.5 rounded-xl border border-borderLine bg-surface-2 hover:bg-surface text-xs font-bold text-textPrimary flex items-center gap-1.5 transition-all shadow-xs"
            >
              <Upload className="w-3.5 h-3.5 text-brand-primary" />
              <span>Upload Document</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Record</span>
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-textMuted">
          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading subjects handled records...
        </div>
      ) : records.length === 0 ? (
        <div className="py-10 text-center text-xs text-textMuted bg-surface-2/40 rounded-xl border border-dashed border-borderLine space-y-2">
          <FileText className="w-8 h-8 text-textMuted mx-auto" />
          <p className="font-bold text-textPrimary">No Subject Result Records Uploaded Yet</p>
          <p className="text-[11px] text-textSecondary max-w-md mx-auto">
            Upload your PDF/Excel result sheets or add manual entries to maintain your permanent subjects handled archive.
          </p>
          {!isReadOnly && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 px-3 py-1.5 rounded-lg bg-brand-primary text-white font-bold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add First Subject
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borderLine">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
              <tr>
                <th className="py-2.5 px-3.5">#</th>
                <th className="py-2.5 px-3.5">Year (Batch)</th>
                <th className="py-2.5 px-3.5">Section</th>
                <th className="py-2.5 px-3.5">Subject</th>
                <th className="py-2.5 px-3.5">Branch</th>
                <th className="py-2.5 px-3.5 text-center">Registered</th>
                <th className="py-2.5 px-3.5 text-center">Appeared</th>
                <th className="py-2.5 px-3.5 text-center">Failed</th>
                <th className="py-2.5 px-3.5 text-center">Pass (%)</th>
                <th className="py-2.5 px-3.5 text-center">Highest</th>
                {!isReadOnly && <th className="py-2.5 px-3.5 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {records.map((r, idx) => {
                const pass = Number(r.pass_percentage);
                const isPassGood = pass >= 90;
                const isPassWarn = pass >= 75 && pass < 90;

                return (
                  <tr key={r.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-2.5 px-3.5 font-mono text-textMuted">{idx + 1}</td>
                    <td className="py-2.5 px-3.5 font-bold text-textPrimary whitespace-nowrap">{r.year_batch}</td>
                    <td className="py-2.5 px-3.5 font-mono font-bold text-textSecondary">{r.section}</td>
                    <td className="py-2.5 px-3.5 font-semibold text-textPrimary">{r.subject}</td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-2 border border-borderLine text-textSecondary">
                        {r.branch}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-center font-mono">{r.registered}</td>
                    <td className="py-2.5 px-3.5 text-center font-mono">{r.appeared}</td>
                    <td className="py-2.5 px-3.5 text-center font-mono text-rose-400">{r.failed}</td>
                    <td className="py-2.5 px-3.5 text-center font-mono font-black">
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          isPassGood
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isPassWarn
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {Number(r.pass_percentage).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-center font-mono font-bold text-emerald-400">{r.highest_marks}</td>
                    {!isReadOnly && (
                      <td className="py-2.5 px-3.5 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete ${r.subject} (${r.year_batch}) record?`)) {
                              deleteMutation.mutate(r.id);
                            }
                          }}
                          className="p-1 rounded-lg text-textMuted hover:text-alert hover:bg-alert-soft transition-all"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL: Add Single Record ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-primary" /> Add Subject Handled Record
              </h4>
              <button onClick={() => setShowAddModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSingle} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Year (Batch) *</label>
                  <input
                    type="text"
                    required
                    value={formYearBatch}
                    onChange={(e) => setFormYearBatch(e.target.value)}
                    placeholder="e.g. I B.Tech. II Sem. & 2025"
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-medium focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Section *</label>
                  <input
                    type="text"
                    required
                    value={formSection}
                    onChange={(e) => setFormSection(e.target.value)}
                    placeholder="e.g. A"
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-medium focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Subject Name *</label>
                  <input
                    type="text"
                    required
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="e.g. DS Lab or Operating Systems"
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-medium focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Branch / Dept *</label>
                  <input
                    type="text"
                    required
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    placeholder="e.g. CSE (DS)"
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-medium focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Registered</label>
                  <input
                    type="number"
                    min="0"
                    value={formRegistered}
                    onChange={(e) => setFormRegistered(e.target.value ? Number(e.target.value) : '')}
                    placeholder="71"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-borderLine bg-background text-textPrimary font-mono text-center"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Appeared</label>
                  <input
                    type="number"
                    min="0"
                    value={formAppeared}
                    onChange={(e) => handleAppearedChange(e.target.value ? Number(e.target.value) : '')}
                    placeholder="70"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-borderLine bg-background text-textPrimary font-mono text-center"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Failed</label>
                  <input
                    type="number"
                    min="0"
                    value={formFailed}
                    onChange={(e) => handleFailedChange(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-borderLine bg-background text-textPrimary font-mono text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Pass Percentage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formPassPct}
                    onChange={(e) => setFormPassPct(e.target.value ? Number(e.target.value) : '')}
                    placeholder="100.00"
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono font-bold text-center focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-textSecondary block mb-1">Highest Marks / Grade</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formHighest}
                    onChange={(e) => setFormHighest(e.target.value ? Number(e.target.value) : '')}
                    placeholder="10.0"
                    className="w-full px-3 py-2 rounded-xl border border-borderLine bg-background text-textPrimary font-mono font-bold text-center focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-borderLine">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary/90 transition-all shadow-sm"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Bulk Document / Excel Upload ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h4 className="text-base font-bold text-textPrimary flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-400" /> Upload Subjects Handled Results File
              </h4>
              <button onClick={() => setShowUploadModal(false)} className="text-textMuted hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-textSecondary">
              Upload your results sheet (.xlsx, .xls, .csv). Columns expected: <strong>Year (Batch), Section, Subject, Branch, Registered, Appeared, Failed, Pass (%), Highest</strong>.
            </p>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-2 border border-borderLine">
              <span className="text-xs text-textSecondary">Need sample layout?</span>
              <button
                onClick={handleDownloadSampleTemplate}
                className="px-3 py-1 rounded-lg bg-surface border border-borderLine hover:bg-surface-2 text-xs font-bold text-brand-primary inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Download Template (.xlsx)
              </button>
            </div>

            <div className="border-2 border-dashed border-borderLine rounded-xl p-6 text-center hover:border-brand-primary transition-all">
              <Upload className="w-8 h-8 text-brand-primary mx-auto mb-2" />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="block w-full text-xs text-textSecondary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white hover:file:bg-brand-primary/90 cursor-pointer"
              />
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-alert-soft border border-alert/20 text-alert text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-textPrimary">
                  <span>Parsed {parsedRows.length} Subject Record(s) Preview:</span>
                  <span className="text-emerald-400">Ready to save</span>
                </div>

                <div className="max-h-48 overflow-y-auto rounded-xl border border-borderLine">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-textMuted font-bold border-b border-borderLine">
                      <tr>
                        <th className="py-1.5 px-2.5">Year</th>
                        <th className="py-1.5 px-2.5">Sec</th>
                        <th className="py-1.5 px-2.5">Subject</th>
                        <th className="py-1.5 px-2.5">Branch</th>
                        <th className="py-1.5 px-2.5 text-center">Appeared</th>
                        <th className="py-1.5 px-2.5 text-center">Pass %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine font-mono">
                      {parsedRows.map((r, i) => (
                        <tr key={i}>
                          <td className="py-1.5 px-2.5 font-sans font-medium text-textPrimary">{r.year_batch}</td>
                          <td className="py-1.5 px-2.5">{r.section}</td>
                          <td className="py-1.5 px-2.5 font-sans font-bold text-textPrimary">{r.subject}</td>
                          <td className="py-1.5 px-2.5 font-sans">{r.branch}</td>
                          <td className="py-1.5 px-2.5 text-center">{r.appeared}</td>
                          <td className="py-1.5 px-2.5 text-center text-emerald-400 font-bold">{r.pass_percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    onClick={() => setParsedRows([])}
                    className="px-4 py-2 rounded-xl border border-borderLine text-textSecondary font-bold text-xs"
                  >
                    Clear
                  </button>
                  <button
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate(parsedRows)}
                    className="px-5 py-2 rounded-xl bg-brand-primary text-white font-bold text-xs hover:bg-brand-primary/90 transition-all shadow-sm"
                  >
                    {saveMutation.isPending ? 'Saving...' : `Confirm & Save ${parsedRows.length} Records`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
