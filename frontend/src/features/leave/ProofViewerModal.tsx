import React from 'react';
import { X, ExternalLink, Download, FileText, Image as ImageIcon } from 'lucide-react';

interface ProofViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  proofUrl: string | null;
  studentName?: string;
  rollNumber?: string;
  title?: string;
}

export const ProofViewerModal: React.FC<ProofViewerModalProps> = ({
  isOpen,
  onClose,
  proofUrl,
  studentName,
  rollNumber,
  title = 'Student Proof Document / Certificate',
}) => {
  if (!isOpen || !proofUrl) return null;

  const isPdf = proofUrl.startsWith('data:application/pdf') || proofUrl.toLowerCase().endsWith('.pdf');
  const isImage =
    proofUrl.startsWith('data:image/') ||
    proofUrl.toLowerCase().endsWith('.png') ||
    proofUrl.toLowerCase().endsWith('.jpg') ||
    proofUrl.toLowerCase().endsWith('.jpeg') ||
    proofUrl.toLowerCase().endsWith('.webp');

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = proofUrl;
    link.download = `proof_${rollNumber || 'document'}_${Date.now()}.${isPdf ? 'pdf' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = () => {
    // If it's a data URL, opening directly via window.open might be blocked by browser security.
    // Convert base64 data URL to Blob URL for clean browser preview
    if (proofUrl.startsWith('data:')) {
      try {
        const parts = proofUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || (isPdf ? 'application/pdf' : 'image/png');
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        return;
      } catch (err) {
        console.error('Failed to create blob URL:', err);
      }
    }
    window.open(proofUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-in fade-in">
      <div className="bg-surface border border-borderLine rounded-2xl max-w-4xl w-full h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-borderLine bg-surface-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center shrink-0">
              {isPdf ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-textPrimary truncate">{title}</h3>
              {studentName && (
                <p className="text-xs text-textSecondary truncate">
                  {studentName} {rollNumber ? `(${rollNumber})` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenNewTab}
              className="px-3 py-1.5 rounded-xl bg-surface border border-borderLine hover:bg-surface-2 text-textPrimary text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="Open in new window"
            >
              <ExternalLink className="w-3.5 h-3.5 text-brand-primary" />
              <span className="hidden sm:inline">Open in Tab</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl border border-borderLine text-textMuted hover:text-textPrimary hover:bg-surface transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 bg-slate-950 p-3 sm:p-6 overflow-auto flex items-center justify-center">
          {isPdf ? (
            <iframe
              src={proofUrl}
              title="Proof PDF Viewer"
              className="w-full h-full rounded-xl border border-borderLine bg-white"
            />
          ) : (
            <div className="max-w-full max-h-full flex items-center justify-center p-2">
              <img
                src={proofUrl}
                alt="Student Proof"
                className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg border border-borderLine"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
