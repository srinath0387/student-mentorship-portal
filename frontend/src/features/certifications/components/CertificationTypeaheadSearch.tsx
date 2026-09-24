import React, { useState, useEffect, useRef } from 'react';
import { Search, Award, Users, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';

export interface CertResult {
  display_name: string;
  canonical_name: string;
  issuer: string;
  student_count: string | number;
}

interface Props {
  onSelectCert?: (cert: CertResult) => void;
  placeholder?: string;
}

export const CertificationTypeaheadSearch: React.FC<Props> = ({ 
  onSelectCert, 
  placeholder = "Search certifications (e.g. AWS, MongoDB, Azure)..." 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CertResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search trigger (300ms)
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const handler = setTimeout(async () => {
      try {
        const data = await api.searchCertifications(searchTerm.trim());
        setResults(Array.isArray(data) ? data : []);
        setIsOpen(true);
      } catch (err) {
        console.error("Failed to search certs:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (cert: CertResult) => {
    setSearchTerm(cert.display_name);
    setIsOpen(false);
    if (onSelectCert) onSelectCert(cert);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-surface border border-borderLine rounded-2xl text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-brand-primary font-medium transition-all shadow-xs"
        />
        {isLoading && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-primary animate-spin" />
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-surface border border-borderLine rounded-2xl shadow-xl overflow-hidden divide-y divide-borderLine max-h-72 overflow-y-auto">
          {results.map((cert) => (
            <button
              key={cert.canonical_name}
              type="button"
              onClick={() => handleSelect(cert)}
              className="w-full px-4 py-3 text-left hover:bg-surface-2 flex items-center justify-between gap-3 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-textPrimary truncate group-hover:text-brand-primary transition-colors">
                    {cert.display_name}
                  </p>
                  <p className="text-[10px] text-textMuted">Issued by {cert.issuer}</p>
                </div>
              </div>

              {/* Count Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-soft/60 border border-brand-primary/20 text-brand-primary shrink-0">
                <Users className="w-3 h-3" />
                <span className="text-[11px] font-black">{cert.student_count}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-brand-primary/70">
                  {Number(cert.student_count) === 1 ? 'Student' : 'Students'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && searchTerm.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-surface border border-borderLine rounded-2xl p-4 text-center text-xs text-textMuted shadow-xl">
          No certifications found matching "{searchTerm}".
        </div>
      )}
    </div>
  );
};
