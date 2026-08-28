import React, { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Download, Users, CheckCircle2, Eye,
  Trash2, Plus, RefreshCw, FileSpreadsheet, ChevronRight, Info
} from 'lucide-react';
import { api } from '../../lib/api';
import * as XLSX from 'xlsx';

const DEPT_OPTIONS = [
  { code: '05', label: 'CSE' },
  { code: '32', label: 'CSE (Data Science)' },
  { code: '33', label: 'CSE (AI & ML)' },
  { code: '34', label: 'CSE (BS)' },
  { code: '37', label: 'CSE (CS)' },
  { code: '04', label: 'ECE' },
  { code: '02', label: 'EEE' },
  { code: '03', label: 'Mechanical' },
  { code: '01', label: 'Civil' },
  { code: 'MCA', label: 'MCA' },
  { code: 'MBA', label: 'MBA' },
];

interface StudentRow {
  name: string;
  dept: string;
  dob: string;
  section: string;
}

interface GeneratedStudent {
  name: string;
  roll_number: string;
  email: string;
  department: string;
  dept_code: string;
  section: string;
  dob: string;
  batch: string;
  error?: string;
}

export const FirstYearOnboardingTab: React.FC = () => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const [batchYear, setBatchYear] = useState<string>(String(currentYear));
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input');
  const [rows, setRows] = useState<StudentRow[]>([
    { name: '', dept: 'CSE (Data Science)', dob: '', section: 'A' },
  ]);
  const [generated, setGenerated] = useState<GeneratedStudent[]>([]);
  const [createResult, setCreateResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('existing');

  const { data: existingStudents = [], refetch: refetchExisting } = useQuery({
    queryKey: ['firstYearStudents', batchYear],
    queryFn: () => api.getFirstYearStudents(undefined, batchYear),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateFirstYearRollNumbers(
      rows.filter(r => r.name.trim()).map(r => ({
        name: r.name.trim(),
        dept: r.dept,
        dob: r.dob.replace(/[^0-9]/g, ''),
        section: r.section || 'A',
      })),
      batchYear
    ),
    onSuccess: (res: any) => { setGenerated(res.students || []); setStep('preview'); },
    onError: (err: any) => alert(`Error: ${err.message}`),
  });

  const createMutation = useMutation({
    mutationFn: () => api.bulkCreateFirstYearStudents(generated.filter(s => !s.error)),
    onSuccess: (res: any) => {
      setCreateResult(res);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['firstYearStudents'] });
      refetchExisting();
    },
    onError: (err: any) => alert(`Error: ${err.message}`),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const parsed: StudentRow[] = json.map((row) => ({
          name: row['Name'] || row['name'] || row['Student Name'] || '',
          dept: row['Department'] || row['dept'] || row['Branch'] || '',
          dob: String(row['DOB'] || row['dob'] || row['Date of Birth'] || '').replace(/[^0-9]/g, ''),
          section: row['Section'] || row['section'] || 'A',
        })).filter(r => r.name);
        if (parsed.length === 0) { alert('No valid rows found. Expected columns: Name, Department, DOB, Section'); return; }
        setRows(parsed);
      } catch (err: any) { alert(`Failed to parse: ${err.message}`); }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Department', 'DOB', 'Section'],
      ['Sai Krishna', 'CSE (Data Science)', '15092007', 'A'],
      ['Priya Reddy', 'ECE', '22042007', 'B'],
      ['Ravi Kumar', 'CSE (AI & ML)', '01012007', 'A'],
    ]);
    ws['!cols'] = [{ wch: 25 }, { wch: 22 }, { wch: 12 }, { wch: 9 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'First Year Students');
    XLSX.writeFile(wb, '1st_year_upload_template.xlsx');
  };

  const downloadGenerated = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Roll Number', 'Name', 'Email (Login)', 'Department', 'Section', 'DOB = Initial Password', 'Batch'],
      ...generated.filter(s => !s.error).map(s => [s.roll_number, s.name, s.email, s.department, s.section, s.dob, s.batch]),
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 32 }, { wch: 22 }, { wch: 9 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Generated');
    XLSX.writeFile(wb, '1st_year_generated.xlsx');
  };

  const addRow = () => setRows(r => [...r, { name: '', dept: 'CSE (Data Science)', dob: '', section: 'A' }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof StudentRow, val: any) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const validRows = rows.filter(r => r.name.trim() && r.dept && r.dob);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-textPrimary flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-primary" />
            1st Year Student Onboarding
          </h2>
          <p className="text-xs text-textMuted mt-0.5">
            Auto-generate regular RGMCET roll numbers. Students log in with <code className="font-mono bg-surface px-1 rounded">regno@rgmcet.edu.in</code> / DOB as password.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-textMuted font-bold">Batch:</label>
          <select
            value={batchYear}
            onChange={e => { setBatchYear(e.target.value); }}
            className="bg-surface border border-borderLine rounded-lg px-2 py-1.5 text-sm text-textPrimary"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={String(y)}>{y}–{y + 4}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Info */}
      <div className="bg-brand-soft border border-brand-primary/20 rounded-xl p-3 flex gap-2 text-xs text-textSecondary">
        <Info className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5" />
        <span>
          Regular roll number format: <code className="font-mono bg-surface px-1 rounded">26091A3201</code>
          &nbsp;→ batch <strong>26</strong>, college <strong>09</strong>, regular <strong>1A</strong>, dept code <strong>32</strong>(DS), seq <strong>01</strong>.
          DOB (<code className="font-mono bg-surface px-1 rounded">DDMMYYYY</code>) is stored as the initial login password.
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-borderLine">
        {[{ id: 'existing' as const, label: `📋 Existing 1st Years (${(existingStudents as any[]).length})` }, { id: 'new' as const, label: '➕ Add New Students' }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${activeTab === t.id ? 'bg-brand-primary/10 text-brand-primary border-b-2 border-brand-primary' : 'text-textMuted hover:text-textPrimary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Existing List ── */}
      {activeTab === 'existing' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-textMuted">{(existingStudents as any[]).length} student(s) for batch {batchYear}</span>
            <button onClick={() => refetchExisting()} className="text-xs text-brand-primary flex items-center gap-1 hover:underline"><RefreshCw className="w-3 h-3" /> Refresh</button>
          </div>
          {(existingStudents as any[]).length === 0
            ? <div className="text-center py-10 text-textMuted text-sm">No 1st year students for batch {batchYear} yet.</div>
            : (
              <div className="rounded-xl border border-borderLine overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold">
                    <tr>
                      <th className="px-3 py-2">Roll Number</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Sec</th>
                      <th className="px-3 py-2 text-center">Pwd</th>
                      <th className="px-3 py-2">Mentor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {(existingStudents as any[]).map((s: any) => (
                      <tr key={s.roll_number} className="hover:bg-surface-2/40">
                        <td className="px-3 py-2 font-mono font-bold text-textPrimary">{s.roll_number}</td>
                        <td className="px-3 py-2 text-textPrimary">{s.name}</td>
                        <td className="px-3 py-2 text-textSecondary font-mono text-[10px]">{s.email}</td>
                        <td className="px-3 py-2 text-textSecondary">{s.department}</td>
                        <td className="px-3 py-2 text-center text-textMuted">{s.section}</td>
                        <td className="px-3 py-2 text-center">
                          {s.has_password ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}
                        </td>
                        <td className="px-3 py-2 text-textMuted">{s.faculty_mentor_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ── Add New ── */}
      {activeTab === 'new' && (
        <>
          {/* STEP 1: INPUT */}
          {step === 'input' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-borderLine text-xs font-bold text-textSecondary hover:bg-surface-2">
                  <Download className="w-4 h-4" /> Download Template
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-primary/30 bg-brand-soft text-xs font-bold text-brand-primary hover:bg-brand-primary/15">
                  <Upload className="w-4 h-4" /> Upload Excel
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
              </div>

              <div className="rounded-xl border border-borderLine overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold">
                    <tr>
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2 min-w-[180px]">Name *</th>
                      <th className="px-3 py-2 min-w-[180px]">Department *</th>
                      <th className="px-3 py-2 min-w-[140px]">DOB * (DDMMYYYY)</th>
                      <th className="px-3 py-2 w-24">Section</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-2/30">
                        <td className="px-3 py-1.5 text-textMuted font-mono">{i + 1}</td>
                        <td className="px-2 py-1">
                          <input value={row.name} onChange={e => updateRow(i, 'name', e.target.value)}
                            placeholder="Full Name"
                            className="w-full bg-surface border border-borderLine rounded-lg px-2 py-1.5 text-xs text-textPrimary placeholder-textMuted focus:outline-none focus:border-brand-primary" />
                        </td>
                        <td className="px-2 py-1">
                          <select value={row.dept} onChange={e => updateRow(i, 'dept', e.target.value)}
                            className="w-full bg-surface border border-borderLine rounded-lg px-2 py-1.5 text-xs text-textPrimary">
                            {DEPT_OPTIONS.map(d => <option key={d.code} value={d.label}>{d.label}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input value={row.dob} onChange={e => updateRow(i, 'dob', e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                            placeholder="15092007" maxLength={8}
                            className="w-full bg-surface border border-borderLine rounded-lg px-2 py-1.5 text-xs font-mono text-textPrimary placeholder-textMuted focus:outline-none focus:border-brand-primary" />
                        </td>
                        <td className="px-2 py-1">
                          <select value={row.section} onChange={e => updateRow(i, 'section', e.target.value)}
                            className="w-full bg-surface border border-borderLine rounded-lg px-2 py-1.5 text-xs text-textPrimary">
                            {['A', 'B', 'C', 'D'].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <button onClick={() => removeRow(i)} className="text-rose-400 hover:text-rose-300 p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3">
                <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-textMuted">{validRows.length} valid</span>
                  <button onClick={() => generateMutation.mutate()}
                    disabled={validRows.length === 0 || generateMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary/90 disabled:opacity-50">
                    {generateMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    Preview Roll Numbers <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                  {generated.filter(s => !s.error).length} Student(s) Ready to Create
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => setStep('input')} className="text-xs px-3 py-2 rounded-lg border border-borderLine text-textMuted hover:bg-surface-2">← Back</button>
                  <button onClick={downloadGenerated} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-borderLine text-textSecondary hover:bg-surface-2">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-borderLine overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 border-b border-borderLine text-textMuted font-bold">
                    <tr>
                      <th className="px-3 py-2">Roll Number</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Login Email</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Sec</th>
                      <th className="px-3 py-2">Initial Password (DOB)</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {generated.map((s, i) => (
                      <tr key={i} className={`hover:bg-surface-2/30 ${s.error ? 'bg-rose-500/5' : ''}`}>
                        <td className="px-3 py-2 font-mono font-bold text-textPrimary">{s.roll_number || '—'}</td>
                        <td className="px-3 py-2 text-textPrimary">{s.name}</td>
                        <td className="px-3 py-2 text-textSecondary font-mono text-[10px]">{s.email || '—'}</td>
                        <td className="px-3 py-2 text-textSecondary">{s.department}</td>
                        <td className="px-3 py-2 text-center">{s.section}</td>
                        <td className="px-3 py-2 font-mono text-amber-400 font-bold">{s.dob || '—'}</td>
                        <td className="px-3 py-2">
                          {s.error
                            ? <span className="text-rose-400 text-[10px]">❌ {s.error}</span>
                            : <span className="text-emerald-400 text-[10px] font-bold">✓ Ready</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || generated.filter(s => !s.error).length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-50">
                  {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm & Create {generated.filter(s => !s.error).length} Students
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DONE */}
          {step === 'done' && createResult && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-base font-bold text-textPrimary">{createResult.message}</h3>
                <div className="flex justify-center gap-6 text-xs mt-2">
                  <span className="text-emerald-400 font-bold">✓ {createResult.created} Created</span>
                  <span className="text-amber-400 font-bold">⟳ {createResult.skipped} Skipped</span>
                  {createResult.errors > 0 && <span className="text-rose-400 font-bold">✗ {createResult.errors} Errors</span>}
                </div>
              </div>
              {createResult.error_details?.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400 space-y-1">
                  <p className="font-bold">Errors:</p>
                  {createResult.error_details.map((e: string, i: number) => <p key={i}>• {e}</p>)}
                </div>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => { setStep('input'); setRows([{ name: '', dept: 'CSE (Data Science)', dob: '', section: 'A' }]); setGenerated([]); setCreateResult(null); }}
                  className="px-5 py-2.5 rounded-xl border border-borderLine text-sm font-bold text-textSecondary hover:bg-surface-2">
                  Add More
                </button>
                <button onClick={() => setActiveTab('existing')}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary/90">
                  View All 1st Year Students →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
