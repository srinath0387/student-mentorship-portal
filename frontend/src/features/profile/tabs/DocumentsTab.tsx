import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Trash2, Eye, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '../../../lib/api';
import { StudentDocument, STUDENT_DOC_TYPES, STUDENT_SEMESTERS } from '../../../types';

const MAX_FILE_SIZE_MB = 20;

const STATUS_CONFIG = {
  Pending:  { label: 'Pending Review', color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/20',   Icon: Clock },
  Verified: { label: 'Verified',       color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: CheckCircle2 },
  Rejected: { label: 'Rejected',       color: 'text-red-500',     bg: 'bg-red-500/10 border-red-500/20',       Icon: XCircle },
};

interface Props {
  rollNumber: string;
  readOnly?: boolean;
  isAdminView?: boolean;
}

export const DocumentsTab: React.FC<Props> = ({ rollNumber, readOnly = false, isAdminView = false }) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm]       = useState(false);
  const [docType, setDocType]         = useState('');
  const [semester, setSemester]       = useState('');
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile]               = useState<File | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [approvingId, setApprovingId]         = useState<number | null>(null);
  const [rejectNote, setRejectNote]           = useState('');
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);

  const { data: documents = [], isLoading } = useQuery<StudentDocument[]>({
    queryKey: ['studentDocuments', rollNumber],
    queryFn: () => api.getStudentDocuments(rollNumber),
    enabled: Boolean(rollNumber),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => api.deleteStudentDocument(rollNumber, docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studentDocuments', rollNumber] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ docId, status, note }: { docId: number; status: 'Verified' | 'Rejected'; note?: string }) =>
      api.updateDocumentStatus(rollNumber, docId, status, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studentDocuments', rollNumber] });
      setApprovingId(null);
      setShowRejectModal(null);
      setRejectNote('');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setUploadError(`File size exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
      setFile(null);
      return;
    }
    setFile(f);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!docType || !semester || !title.trim() || !file) {
      setUploadError('Please fill all required fields and select a file.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const { uploadUrl, fileKey } = await api.getUploadUrl(rollNumber, file.name, 'documents');
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!s3Res.ok) throw new Error('File upload to storage failed.');
      await api.createStudentDocument(rollNumber, {
        doc_type: docType,
        semester,
        title: title.trim(),
        description: description.trim() || undefined,
        file_key: fileKey,
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
      });
      qc.invalidateQueries({ queryKey: ['studentDocuments', rollNumber] });
      setShowForm(false);
      setDocType(''); setSemester(''); setTitle(''); setDescription(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc: StudentDocument) => {
    try {
      const { viewUrl } = await api.getDocumentViewUrl(rollNumber, doc.id);
      window.open(viewUrl, '_blank');
    } catch {
      alert('Could not open document. Please try again.');
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-gray-400">Loading documents...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-textPrimary">Documents</h2>
          <p className="text-xs text-textMuted mt-0.5">Upload and manage your academic documents</p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Document
          </button>
        )}
      </div>

      {/* Upload Form */}
      {showForm && !readOnly && (
        <div className="bg-surface-2 border border-borderLine rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-textPrimary text-sm">New Document Upload</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-textMuted mb-1 font-medium">Document Type *</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">Select type...</option>
                {STUDENT_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-textMuted mb-1 font-medium">Semester *</label>
              <select
                value={semester}
                onChange={e => setSemester(e.target.value)}
                className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">Select semester...</option>
                {STUDENT_SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-textMuted mb-1 font-medium">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. CSP Project Report — AI Chatbot"
              className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-textMuted mb-1 font-medium">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description..."
              className="w-full bg-surface border border-borderLine text-textPrimary text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-textMuted mb-1 font-medium">File * (PDF, DOC, DOCX, ZIP — max 20 MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.zip"
              onChange={handleFileChange}
              className="w-full text-xs text-textSecondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-primary file:text-white hover:file:bg-brand-primary/90"
            />
            {file && <p className="text-xs text-textMuted mt-1">{file.name} ({Math.round(file.size / 1024)} KB)</p>}
          </div>
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={() => { setShowForm(false); setUploadError(null); }}
              className="px-4 py-2 bg-surface border border-borderLine hover:bg-surface-2 text-textSecondary text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-textPrimary mb-4 text-sm">Reject Document</h3>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (shown to student)..."
              className="w-full bg-surface-2 border border-borderLine text-textPrimary text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => statusMutation.mutate({ docId: showRejectModal, status: 'Rejected', note: rejectNote })}
                disabled={statusMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => { setShowRejectModal(null); setRejectNote(''); }}
                className="px-4 py-2 bg-surface border border-borderLine hover:bg-surface-2 text-textSecondary text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-12 text-textMuted">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No documents uploaded yet.</p>
          {!readOnly && <p className="text-xs mt-1">Click "Upload Document" to get started.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const cfg = STATUS_CONFIG[doc.verification_status];
            const StatusIcon = cfg.Icon;
            return (
              <div key={doc.id} className="bg-surface-2 border border-borderLine rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-textPrimary text-sm">{doc.title}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-textMuted flex-wrap">
                      <span className="font-medium">{doc.doc_type}</span>
                      <span>•</span>
                      <span>{doc.semester}</span>
                      <span>•</span>
                      <span>{doc.file_name}</span>
                      {doc.file_size_kb && <><span>•</span><span>{doc.file_size_kb} KB</span></>}
                    </div>
                    {doc.description && <p className="text-xs text-textMuted mt-1">{doc.description}</p>}
                    {doc.admin_note && (
                      <p className="text-xs text-red-400 mt-1 font-medium">Note: {doc.admin_note}</p>
                    )}
                    {doc.verified_by && (
                      <p className="text-xs text-textMuted mt-1">
                        {doc.verification_status === 'Verified' ? '✓ Verified' : 'Reviewed'} by {doc.verified_by}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleView(doc)}
                      className="p-2 text-textMuted hover:text-brand-primary hover:bg-brand-soft rounded-lg transition-colors"
                      title="View document"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {isAdminView && doc.verification_status === 'Pending' && (
                      <>
                        <button
                          onClick={() => { setApprovingId(doc.id); statusMutation.mutate({ docId: doc.id, status: 'Verified' }); }}
                          disabled={statusMutation.isPending && approvingId === doc.id}
                          className="p-2 text-textMuted hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="Verify"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowRejectModal(doc.id)}
                          className="p-2 text-textMuted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {!readOnly && !isAdminView && doc.verification_status === 'Pending' && (
                      <button
                        onClick={() => {
                          if (confirm('Delete this document?')) deleteMutation.mutate(doc.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-2 text-textMuted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DocumentsTab;
