import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Download, Save, Plus, Trash2, ChevronDown, ChevronUp,
  CheckCircle, AlertCircle, XCircle, Eye, Edit3,
  Briefcase, Award, Code2, User, Link2, Star, Zap,
  GraduationCap, Globe, Music, Users, RefreshCw, Trophy, Github, Check
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Project {
  id: string; title: string; description: string; tech_stack: string[];
  github_url?: string; demo_url?: string; duration?: string;
}
interface ExtraCurr {
  id: string; title: string; role: string; year: string;
}
interface ResumeLinks {
  linkedin?: string; github?: string; portfolio?: string; leetcode?: string; hackerrank?: string;
  codechef?: string; gfg?: string;
}
interface ResumeData {
  objective?: string;
  projects?: Project[];
  languages?: string[];
  hobbies?: string[];
  extra_curr?: ExtraCurr[];
  links?: ResumeLinks;
  include_coding?: boolean;
}

interface CodingProfileRecord {
  id?: string;
  platform: string;
  handle: string;
  streak?: number;
  repositories_count?: number;
  commits_count?: number;
  prs_merged?: number;
  score_rating?: number;
  easy_count?: number;
  medium_count?: number;
  hard_count?: number;
  contest_rating?: number;
  stars_count?: number;
  top_language?: string;
}

// ─── Helpers to Extract Coding Stats ─────────────────────────────────────────
function getPlatformProfile(profiles: CodingProfileRecord[] | undefined, name: string): CodingProfileRecord | undefined {
  if (!profiles || !Array.isArray(profiles)) return undefined;
  return profiles.find(p => p.platform?.toLowerCase() === name.toLowerCase());
}

// ─── ATS Score Calculator ─────────────────────────────────────────────────────
function calcATS(full: any, rd: ResumeData): number {
  let score = 0;
  if (rd.objective && rd.objective.trim().length > 30) score += 10;
  if ((full?.techSkills?.length ?? 0) >= 3) score += 15;
  if ((full?.certifications?.length ?? 0) > 0) score += 15;
  if ((rd.projects?.length ?? 0) > 0) score += 15;
  if ((full?.internships?.length ?? 0) > 0 || (rd.extra_curr?.length ?? 0) > 0) score += 15;
  const hasAcademics = (full?.academics?.length ?? 0) > 0;
  if (hasAcademics) score += 10;
  
  // Coding profiles score: LeetCode/GitHub synced profiles
  const profiles: CodingProfileRecord[] = full?.codingProfiles || [];
  const lc = getPlatformProfile(profiles, 'leetcode');
  const gh = getPlatformProfile(profiles, 'github');
  if (profiles.length > 0) {
    let codingPoints = 5;
    if ((lc?.score_rating ?? 0) > 0 || (lc?.easy_count ?? 0) + (lc?.medium_count ?? 0) > 0) codingPoints += 5;
    if ((gh?.repositories_count ?? 0) > 0 || (gh?.streak ?? 0) > 0) codingPoints += 5;
    score += Math.min(codingPoints, 15);
  }

  if ((full?.achievements?.length ?? 0) > 0) score += 10;
  return Math.min(score, 100);
}

function ATSBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600 bg-green-50 border-green-200'
    : score >= 50 ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
    : 'text-red-600 bg-red-50 border-red-200';
  const Icon = score >= 80 ? CheckCircle : score >= 50 ? AlertCircle : XCircle;
  const label = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Work';
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>ATS Score: {score}/100 — {label}</span>
    </div>
  );
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, tip }: { title: string; icon: any; children: React.ReactNode; tip?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-soft flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-brand-primary" />
          </div>
          <span className="text-sm font-bold text-textPrimary">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-textMuted" /> : <ChevronDown className="w-4 h-4 text-textMuted" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-borderLine">
          {tip && <p className="text-xs text-brand-primary bg-brand-soft rounded-lg px-3 py-2 mt-3 mb-4">{tip}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Chip Input ───────────────────────────────────────────────────────────────
function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-soft text-brand-primary text-xs font-semibold rounded-lg">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-red-500 transition-colors">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder={placeholder || 'Type and press Enter'}
          className="flex-1 px-3 py-2 text-xs bg-surface border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
        <button onClick={add} className="px-3 py-2 bg-brand-soft text-brand-primary text-xs font-bold rounded-xl hover:bg-brand-primary hover:text-white transition-colors">Add</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResumeBuilderPage() {
  const { user } = useAuth();
  const rollNo = user?.rollNumber || '';
  const qc = useQueryClient();

  const { data: fullData, isLoading } = useQuery({
    queryKey: ['resumeFull', rollNo],
    queryFn: () => api.getResumeFull(rollNo),
    enabled: !!rollNo,
  });

  const { data: savedResumeData } = useQuery({
    queryKey: ['resumeData', rollNo],
    queryFn: () => api.getResumeData(rollNo),
    enabled: !!rollNo,
  });

  // Local editable state
  const [rd, setRd] = useState<ResumeData>({
    objective: '', projects: [], languages: [], hobbies: [], extra_curr: [], links: {}, include_coding: true
  });
  const [activeTemplate, setActiveTemplate] = useState<'classic' | 'modern' | 'minimal'>('classic');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [autofilledNotice, setAutofilledNotice] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Synced coding profiles
  const codingProfiles: CodingProfileRecord[] = fullData?.codingProfiles || [];
  const lcProfile = getPlatformProfile(codingProfiles, 'leetcode');
  const ghProfile = getPlatformProfile(codingProfiles, 'github');
  const hrProfile = getPlatformProfile(codingProfiles, 'hackerrank');
  const ccProfile = getPlatformProfile(codingProfiles, 'codechef');
  const gfgProfile = getPlatformProfile(codingProfiles, 'geeksforgeeks');
  const cfProfile = getPlatformProfile(codingProfiles, 'codeforces');

  // Autofill links helper from coding profiles
  const autoPopulateLinks = (currentLinks: ResumeLinks = {}): ResumeLinks => {
    const updated = { ...currentLinks };
    if (!updated.github && ghProfile?.handle) {
      updated.github = ghProfile.handle.startsWith('http') ? ghProfile.handle : `github.com/${ghProfile.handle}`;
    }
    if (!updated.leetcode && lcProfile?.handle) {
      updated.leetcode = lcProfile.handle.startsWith('http') ? lcProfile.handle : `leetcode.com/${lcProfile.handle}`;
    }
    if (!updated.hackerrank && hrProfile?.handle) {
      updated.hackerrank = hrProfile.handle.startsWith('http') ? hrProfile.handle : `hackerrank.com/${hrProfile.handle}`;
    }
    if (!updated.codechef && ccProfile?.handle) {
      updated.codechef = ccProfile.handle.startsWith('http') ? ccProfile.handle : `codechef.com/users/${ccProfile.handle}`;
    }
    if (!updated.gfg && gfgProfile?.handle) {
      updated.gfg = gfgProfile.handle.startsWith('http') ? gfgProfile.handle : `geeksforgeeks.org/user/${gfgProfile.handle}`;
    }
    return updated;
  };

  // Merge saved data when loaded & auto-populate missing GitHub/LeetCode links
  useEffect(() => {
    if (savedResumeData) {
      const mergedLinks = autoPopulateLinks(savedResumeData.links || {});
      setRd({
        objective: savedResumeData.objective || '',
        projects: savedResumeData.projects || [],
        languages: savedResumeData.languages || [],
        hobbies: savedResumeData.hobbies || [],
        extra_curr: savedResumeData.extra_curr || [],
        links: mergedLinks,
        include_coding: savedResumeData.include_coding !== false,
      });
    } else if (fullData) {
      setRd(prev => ({
        ...prev,
        links: autoPopulateLinks(prev.links),
      }));
    }
  }, [savedResumeData, fullData]);

  const atsScore = calcATS(fullData, rd);

  const handleManualAutofill = () => {
    const newLinks = autoPopulateLinks(rd.links);
    setRd(prev => ({ ...prev, links: newLinks }));
    setAutofilledNotice(true);
    setTimeout(() => setAutofilledNotice(false), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.upsertResumeData(rollNo, rd);
      qc.invalidateQueries({ queryKey: ['resumeData', rollNo] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    setSaving(false);
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');
      const el = previewRef.current;
      if (!el) return;
      setView('preview');
      await new Promise(r => setTimeout(r, 300));
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      let y = 0;
      const pageH = pdf.internal.pageSize.getHeight();
      while (y < pdfH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -y, pdfW, pdfH);
        y += pageH;
      }
      const name = (fullData?.student?.name || 'Student').replace(/\s+/g, '_');
      const date = new Date().toISOString().slice(0, 10);
      pdf.save(`${name}_Resume_${date}.pdf`);
    } catch (e) { console.error(e); }
    setDownloading(false);
  };

  // ─── Project helpers ─────────────────────────────────────────────────────
  const addProject = () => setRd(r => ({
    ...r, projects: [...(r.projects || []), {
      id: Date.now().toString(), title: '', description: '', tech_stack: []
    }]
  }));
  const updateProject = (id: string, field: keyof Project, val: any) =>
    setRd(r => ({ ...r, projects: (r.projects || []).map(p => p.id === id ? { ...p, [field]: val } : p) }));
  const removeProject = (id: string) =>
    setRd(r => ({ ...r, projects: (r.projects || []).filter(p => p.id !== id) }));

  // ─── Extra-curr helpers ──────────────────────────────────────────────────
  const addEC = () => setRd(r => ({
    ...r, extra_curr: [...(r.extra_curr || []), { id: Date.now().toString(), title: '', role: '', year: '' }]
  }));
  const updateEC = (id: string, field: keyof ExtraCurr, val: string) =>
    setRd(r => ({ ...r, extra_curr: (r.extra_curr || []).map(e => e.id === id ? { ...e, [field]: val } : e) }));
  const removeEC = (id: string) =>
    setRd(r => ({ ...r, extra_curr: (r.extra_curr || []).filter(e => e.id !== id) }));

  const student = fullData?.student;
  const cgpa = fullData?.academics?.length
    ? (fullData.academics.reduce((s: number, a: any) => s + parseFloat(a.semester_gpa || 0), 0) / fullData.academics.length).toFixed(2)
    : null;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
    </div>
  );

  // ─── TEMPLATES ───────────────────────────────────────────────────────────
  const ResumePreview = () => {
    const s = student;
    if (!s) return <div className="text-center text-textMuted text-sm py-10">No student data found.</div>;

    const baseStyle: React.CSSProperties = { fontFamily: 'Georgia, serif', background: '#fff', color: '#1a1a1a', padding: '32px', maxWidth: '794px', margin: '0 auto', fontSize: '11px', lineHeight: '1.5' };

    // Resolve header links
    const ghLink = rd.links?.github || (ghProfile?.handle ? `github.com/${ghProfile.handle}` : '');
    const lcLink = rd.links?.leetcode || (lcProfile?.handle ? `leetcode.com/${lcProfile.handle}` : '');
    const liLink = rd.links?.linkedin || '';
    const portLink = rd.links?.portfolio || '';

    // Check if we have active coding profiles to display
    const hasCodingProfiles = rd.include_coding !== false && (
      Boolean(lcProfile?.handle) ||
      Boolean(ghProfile?.handle) ||
      Boolean(ccProfile?.handle) ||
      Boolean(hrProfile?.handle) ||
      Boolean(gfgProfile?.handle) ||
      Boolean(cfProfile?.handle)
    );

    // ─── 1. CLASSIC TEMPLATE ───────────────────────────────────────────────
    if (activeTemplate === 'classic') return (
      <div style={baseStyle}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #1a1a1a', paddingBottom: '12px', marginBottom: '14px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>{s.name}</h1>
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#444' }}>
            {s.email} {s.phone ? `· ${s.phone}` : ''} {s.department ? `· ${s.department}` : ''}
          </div>
          {(liLink || ghLink || lcLink || portLink) && (
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#1d4ed8', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' }}>
              {liLink && <span>LinkedIn: {liLink}</span>}
              {ghLink && <span>GitHub: {ghLink}</span>}
              {lcLink && <span>LeetCode: {lcLink}</span>}
              {portLink && <span>Portfolio: {portLink}</span>}
            </div>
          )}
        </div>

        {/* Objective */}
        {rd.objective && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Professional Summary</h2>
            <p style={{ margin: 0 }}>{rd.objective}</p>
          </div>
        )}

        {/* Education */}
        {(fullData?.academics?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Education</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>{s.department} — {s.programme || 'B.Tech'}</strong>
                <div style={{ color: '#555' }}>RGM College of Engineering & Technology</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>CGPA: <strong>{cgpa}</strong></div>
                <div style={{ color: '#555' }}>Year {s.current_year || fullData.academics.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Technical Skills */}
        {(fullData?.techSkills?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Technical Skills</h2>
            <p style={{ margin: 0 }}>{fullData.techSkills.map((t: any) => t.skill_name).join(' · ')}</p>
          </div>
        )}

        {/* Competitive Programming & Coding Profiles */}
        {hasCodingProfiles && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>
              Competitive Programming & Technical Profiles
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
              {lcProfile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span>
                    <strong>LeetCode:</strong> @{lcProfile.handle} — <strong>{(lcProfile.score_rating ?? 0)}</strong> Problems Solved
                    {((lcProfile.easy_count ?? 0) + (lcProfile.medium_count ?? 0) + (lcProfile.hard_count ?? 0) > 0) && (
                      <span style={{ color: '#555' }}> ({lcProfile.easy_count ?? 0} Easy, {lcProfile.medium_count ?? 0} Med, {lcProfile.hard_count ?? 0} Hard)</span>
                    )}
                    {(lcProfile.contest_rating ?? 0) > 0 && (
                      <span style={{ color: '#166534' }}> · Rating: {lcProfile.contest_rating}</span>
                    )}
                  </span>
                  <span style={{ color: '#555', fontSize: '10px' }}>leetcode.com/{lcProfile.handle}</span>
                </div>
              )}
              {ghProfile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span>
                    <strong>GitHub:</strong> @{ghProfile.handle} — <strong>{(ghProfile.repositories_count ?? 0)}</strong> Public Repositories
                    {(ghProfile.stars_count ?? 0) > 0 && <span> · {ghProfile.stars_count} Stars</span>}
                    {(ghProfile.streak ?? 0) > 0 && <span style={{ color: '#c2410c' }}> · {ghProfile.streak}-Day Active Streak</span>}
                  </span>
                  <span style={{ color: '#555', fontSize: '10px' }}>github.com/{ghProfile.handle}</span>
                </div>
              )}
              {ccProfile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span><strong>CodeChef:</strong> @{ccProfile.handle} {(ccProfile.contest_rating ?? 0) > 0 ? `· Rating: ${ccProfile.contest_rating}` : ''} {(ccProfile.stars_count ?? 0) > 0 ? `· ${ccProfile.stars_count}★` : ''}</span>
                  <span style={{ color: '#555', fontSize: '10px' }}>codechef.com/users/{ccProfile.handle}</span>
                </div>
              )}
              {hrProfile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span><strong>HackerRank:</strong> @{hrProfile.handle} {(hrProfile.score_rating ?? 0) > 0 ? `· Score: ${hrProfile.score_rating}` : ''}</span>
                  <span style={{ color: '#555', fontSize: '10px' }}>hackerrank.com/{hrProfile.handle}</span>
                </div>
              )}
              {gfgProfile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span><strong>GeeksforGeeks:</strong> @{gfgProfile.handle} {(gfgProfile.score_rating ?? 0) > 0 ? `· Problems: ${gfgProfile.score_rating}` : ''}</span>
                  <span style={{ color: '#555', fontSize: '10px' }}>geeksforgeeks.org/user/{gfgProfile.handle}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects */}
        {(rd.projects?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Projects</h2>
            {rd.projects?.map((p, i) => (
              <div key={p.id} style={{ marginBottom: i < (rd.projects?.length ?? 0) - 1 ? '8px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{p.title || 'Project'}</strong>
                  {p.duration && <span style={{ color: '#555' }}>{p.duration}</span>}
                </div>
                {(p.tech_stack?.length ?? 0) > 0 && <div style={{ color: '#555', fontSize: '10px' }}>Tech Stack: {p.tech_stack.join(', ')}</div>}
                {p.description && <p style={{ margin: '3px 0 0 0' }}>{p.description}</p>}
                {(p.github_url || p.demo_url) && (
                  <div style={{ fontSize: '10px', color: '#1d4ed8', marginTop: '2px' }}>
                    {p.github_url && <span>GitHub: {p.github_url} </span>}
                    {p.demo_url && <span>· Demo: {p.demo_url}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Internships */}
        {(fullData?.internships?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Internships & Experience</h2>
            {fullData.internships.map((i: any) => (
              <div key={i.id} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{i.company_name}</strong>
                  <span style={{ color: '#555' }}>{i.start_date?.slice(0, 7)} – {i.end_date?.slice(0, 7) || 'Present'}</span>
                </div>
                <div>{i.role || i.designation}</div>
                {i.description && <p style={{ margin: '2px 0 0 8px', color: '#333' }}>{i.description}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Certifications */}
        {(fullData?.certifications?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Certifications</h2>
            {fullData.certifications.slice(0, 5).map((c: any) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span>{c.certification_name} — <em>{c.platform || c.issuer}</em></span>
                {c.date_completed && <span style={{ color: '#555' }}>{c.date_completed?.slice(0, 7)}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Achievements */}
        {(fullData?.achievements?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Achievements & Honors</h2>
            {fullData.achievements.slice(0, 4).map((a: any) => (
              <div key={a.id} style={{ marginBottom: '3px' }}>• <strong>{a.title}</strong>{a.description ? ` — ${a.description}` : ''}</div>
            ))}
          </div>
        )}

        {/* Extra-curricular */}
        {(rd.extra_curr?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Extra-Curricular Activities</h2>
            {rd.extra_curr?.map(e => (
              <div key={e.id} style={{ marginBottom: '2px' }}>• <strong>{e.title}</strong>{e.role ? ` — ${e.role}` : ''}{e.year ? ` (${e.year})` : ''}</div>
            ))}
          </div>
        )}

        {/* Languages & Soft Skills */}
        <div style={{ display: 'flex', gap: '24px' }}>
          {(rd.languages?.length ?? 0) > 0 && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Languages</h2>
              <p style={{ margin: 0 }}>{rd.languages?.join(' · ')}</p>
            </div>
          )}
          {(fullData?.softSkills?.length ?? 0) > 0 && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Soft Skills</h2>
              <p style={{ margin: 0 }}>{fullData.softSkills.map((s: any) => s.skill_name).join(' · ')}</p>
            </div>
          )}
        </div>

        {/* Hobbies */}
        {(rd.hobbies?.length ?? 0) > 0 && (
          <div style={{ marginTop: '10px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '6px' }}>Interests & Hobbies</h2>
            <p style={{ margin: 0 }}>{rd.hobbies?.join(' · ')}</p>
          </div>
        )}
      </div>
    );

    // ─── 2. MODERN TEMPLATE ────────────────────────────────────────────────
    if (activeTemplate === 'modern') return (
      <div style={{ fontFamily: 'Arial, sans-serif', background: '#fff', color: '#1a1a1a', maxWidth: '794px', margin: '0 auto', fontSize: '11px', lineHeight: '1.5', display: 'flex' }}>
        {/* Left sidebar */}
        <div style={{ width: '220px', background: '#1e293b', color: '#e2e8f0', padding: '28px 16px', flexShrink: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: '24px', fontWeight: 700, color: '#fff' }}>
              {s.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.name}</div>
            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{s.department}</div>
          </div>

          {/* Contact */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#60a5fa', marginBottom: '6px' }}>Contact</div>
            <div style={{ fontSize: '9.5px', color: '#cbd5e1', wordBreak: 'break-all' }}>{s.email}</div>
            {s.phone && <div style={{ fontSize: '9.5px', color: '#cbd5e1', marginTop: '2px' }}>{s.phone}</div>}
            {liLink && <div style={{ fontSize: '9px', color: '#93c5fd', marginTop: '2px', wordBreak: 'break-all' }}>in/{liLink.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, '')}</div>}
            {ghLink && <div style={{ fontSize: '9px', color: '#93c5fd', marginTop: '2px', wordBreak: 'break-all' }}>gh/{ghLink.replace(/https?:\/\/(www\.)?github\.com\//, '')}</div>}
            {lcLink && <div style={{ fontSize: '9px', color: '#93c5fd', marginTop: '2px', wordBreak: 'break-all' }}>lc/{lcLink.replace(/https?:\/\/(www\.)?leetcode\.com\//, '')}</div>}
          </div>

          {/* Coding Highlights Badge in Sidebar */}
          {hasCodingProfiles && (
            <div style={{ marginBottom: '16px', background: '#0f172a', padding: '8px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#fbbf24', marginBottom: '6px' }}>Coding Stats</div>
              {lcProfile && (
                <div style={{ marginBottom: '4px', fontSize: '9.5px' }}>
                  <span style={{ color: '#94a3b8' }}>LeetCode:</span> <strong style={{ color: '#4ade80' }}>{lcProfile.score_rating ?? 0}</strong> Solved
                  {(lcProfile.contest_rating ?? 0) > 0 && <span style={{ color: '#94a3b8', fontSize: '8.5px' }}> · R: {lcProfile.contest_rating}</span>}
                </div>
              )}
              {ghProfile && (
                <div style={{ fontSize: '9.5px' }}>
                  <span style={{ color: '#94a3b8' }}>GitHub:</span> <strong style={{ color: '#60a5fa' }}>{ghProfile.repositories_count ?? 0}</strong> Repos
                  {(ghProfile.stars_count ?? 0) > 0 && <span style={{ color: '#fbbf24' }}> · ⭐{ghProfile.stars_count}</span>}
                </div>
              )}
            </div>
          )}

          {/* Technical Skills */}
          {(fullData?.techSkills?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#60a5fa', marginBottom: '6px' }}>Technical Skills</div>
              {fullData.techSkills.map((t: any) => (
                <div key={t.id} style={{ background: '#334155', borderRadius: '4px', padding: '2px 6px', marginBottom: '3px', fontSize: '9.5px', color: '#e2e8f0' }}>{t.skill_name}</div>
              ))}
            </div>
          )}

          {/* Soft Skills */}
          {(fullData?.softSkills?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#60a5fa', marginBottom: '6px' }}>Soft Skills</div>
              {fullData.softSkills.map((s: any) => (
                <div key={s.id} style={{ fontSize: '9.5px', color: '#cbd5e1', marginBottom: '2px' }}>• {s.skill_name}</div>
              ))}
            </div>
          )}

          {/* Languages */}
          {(rd.languages?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#60a5fa', marginBottom: '6px' }}>Languages</div>
              {rd.languages?.map(l => <div key={l} style={{ fontSize: '9.5px', color: '#cbd5e1', marginBottom: '2px' }}>• {l}</div>)}
            </div>
          )}

          {/* Certifications in sidebar */}
          {(fullData?.certifications?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#60a5fa', marginBottom: '6px' }}>Certifications</div>
              {fullData.certifications.slice(0, 4).map((c: any) => (
                <div key={c.id} style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '9.5px', color: '#e2e8f0' }}>{c.certification_name}</div>
                  <div style={{ fontSize: '9px', color: '#94a3b8' }}>{c.platform || c.issuer}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, padding: '28px 24px' }}>
          {rd.objective && (
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>Professional Summary</h2>
              <p style={{ margin: 0, color: '#374151' }}>{rd.objective}</p>
            </div>
          )}

          {/* Education */}
          {(fullData?.academics?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>Education</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div><strong>{s.programme || 'B.Tech'} in {s.department}</strong><div style={{ color: '#6b7280' }}>RGM College of Engineering & Technology</div></div>
                <div style={{ textAlign: 'right' }}><div>CGPA: <strong>{cgpa}</strong></div></div>
              </div>
            </div>
          )}

          {/* Coding & Technical Profiles Section */}
          {hasCodingProfiles && (
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>
                Competitive Programming & Profiles
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                {lcProfile && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ color: '#0f172a' }}>LeetCode (@{lcProfile.handle})</strong>
                      <span style={{ color: '#2563eb', fontSize: '10px' }}>leetcode.com/{lcProfile.handle}</span>
                    </div>
                    <div style={{ marginTop: '2px', color: '#475569', fontSize: '10.5px' }}>
                      <strong>{lcProfile.score_rating ?? 0} Problems Solved</strong>
                      {((lcProfile.easy_count ?? 0) + (lcProfile.medium_count ?? 0) + (lcProfile.hard_count ?? 0) > 0) && (
                        <span> — <span style={{ color: '#16a34a' }}>{lcProfile.easy_count ?? 0} Easy</span> · <span style={{ color: '#ea580c' }}>{lcProfile.medium_count ?? 0} Med</span> · <span style={{ color: '#dc2626' }}>{lcProfile.hard_count ?? 0} Hard</span></span>
                      )}
                      {(lcProfile.contest_rating ?? 0) > 0 && <span style={{ color: '#059669', fontWeight: 600 }}> · Contest Rating: {lcProfile.contest_rating}</span>}
                    </div>
                  </div>
                )}
                {ghProfile && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ color: '#0f172a' }}>GitHub (@{ghProfile.handle})</strong>
                      <span style={{ color: '#2563eb', fontSize: '10px' }}>github.com/{ghProfile.handle}</span>
                    </div>
                    <div style={{ marginTop: '2px', color: '#475569', fontSize: '10.5px' }}>
                      <strong>{ghProfile.repositories_count ?? 0} Public Repositories</strong>
                      {(ghProfile.stars_count ?? 0) > 0 && <span> · {ghProfile.stars_count} Stars</span>}
                      {(ghProfile.streak ?? 0) > 0 && <span style={{ color: '#ea580c' }}> · {ghProfile.streak}-Day Active Streak</span>}
                    </div>
                  </div>
                )}
                {ccProfile && (
                  <div style={{ fontSize: '10.5px', color: '#334155' }}>
                    • <strong>CodeChef:</strong> @{ccProfile.handle} {(ccProfile.contest_rating ?? 0) > 0 ? `· Rating: ${ccProfile.contest_rating}` : ''} {(ccProfile.stars_count ?? 0) > 0 ? `· ${ccProfile.stars_count}★` : ''}
                  </div>
                )}
                {hrProfile && (
                  <div style={{ fontSize: '10.5px', color: '#334155' }}>
                    • <strong>HackerRank:</strong> @{hrProfile.handle} {(hrProfile.score_rating ?? 0) > 0 ? `· Score: ${hrProfile.score_rating}` : ''}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Projects */}
          {(rd.projects?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>Projects</h2>
              {rd.projects?.map((p, i) => (
                <div key={p.id} style={{ marginBottom: i < (rd.projects?.length ?? 0) - 1 ? '10px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ color: '#1e293b' }}>{p.title}</strong>
                    {p.duration && <span style={{ color: '#6b7280', fontSize: '10px' }}>{p.duration}</span>}
                  </div>
                  {(p.tech_stack?.length ?? 0) > 0 && <div style={{ color: '#3b82f6', fontSize: '10px', marginTop: '1px' }}>Stack: {p.tech_stack.join(', ')}</div>}
                  {p.description && <p style={{ margin: '3px 0 0 0', color: '#374151' }}>{p.description}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Internships */}
          {(fullData?.internships?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>Experience & Internships</h2>
              {fullData.internships.map((i: any) => (
                <div key={i.id} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{i.company_name}</strong><span style={{ color: '#6b7280', fontSize: '10px' }}>{i.start_date?.slice(0,7)} – {i.end_date?.slice(0,7) || 'Present'}</span></div>
                  <div style={{ color: '#3b82f6', fontStyle: 'italic' }}>{i.role || i.designation}</div>
                  {i.description && <p style={{ margin: '2px 0 0 0', color: '#374151' }}>{i.description}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Achievements */}
          {(fullData?.achievements?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>Achievements</h2>
              {fullData.achievements.slice(0, 4).map((a: any) => (
                <div key={a.id} style={{ marginBottom: '3px' }}>▸ <strong>{a.title}</strong>{a.description ? ` — ${a.description}` : ''}</div>
              ))}
            </div>
          )}

          {/* Extra-curricular */}
          {(rd.extra_curr?.length ?? 0) > 0 && (
            <div>
              <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #3b82f6', paddingBottom: '3px', marginBottom: '8px' }}>Extra-Curricular</h2>
              {rd.extra_curr?.map(e => <div key={e.id} style={{ marginBottom: '2px' }}>• <strong>{e.title}</strong>{e.role ? ` — ${e.role}` : ''}{e.year ? ` (${e.year})` : ''}</div>)}
            </div>
          )}
        </div>
      </div>
    );

    // ─── 3. MINIMAL TEMPLATE ───────────────────────────────────────────────
    return (
      <div style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', background: '#fff', color: '#111', maxWidth: '794px', margin: '0 auto', fontSize: '11px', lineHeight: '1.6', padding: '36px 48px' }}>
        <div style={{ borderBottom: '1.5px solid #111', paddingBottom: '10px', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 300, margin: 0, letterSpacing: '3px', textTransform: 'uppercase' }}>{s.name}</h1>
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#555', letterSpacing: '0.5px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <span>{s.email}</span>
            {s.phone && <span>{s.phone}</span>}
            {liLink && <span>{liLink}</span>}
            {ghLink && <span>{ghLink}</span>}
            {lcLink && <span>{lcLink}</span>}
          </div>
        </div>

        {rd.objective && <><div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '4px' }}>Summary</div><p style={{ margin: '0 0 14px 0' }}>{rd.objective}</p></>}

        {(fullData?.academics?.length ?? 0) > 0 && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '4px' }}>Education</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div><strong>{s.programme || 'B.Tech'}, {s.department}</strong> · RGM College of Engineering & Technology</div>
            <div>CGPA: <strong>{cgpa}</strong></div>
          </div>
        </>)}

        {(fullData?.techSkills?.length ?? 0) > 0 && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '4px' }}>Technical Skills</div>
          <p style={{ margin: '0 0 14px 0' }}>{fullData.techSkills.map((t: any) => t.skill_name).join('  ·  ')}</p>
        </>)}

        {/* Coding Profiles & Problem Solving (ATS format) */}
        {hasCodingProfiles && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '6px' }}>Competitive Programming & Profiles</div>
          <div style={{ marginBottom: '14px', lineHeight: '1.7' }}>
            {lcProfile && (
              <div>
                • <strong>LeetCode:</strong> leetcode.com/{lcProfile.handle} — <strong>{lcProfile.score_rating ?? 0}</strong> problems solved
                {((lcProfile.easy_count ?? 0) + (lcProfile.medium_count ?? 0) + (lcProfile.hard_count ?? 0) > 0) && (
                  <span> ({lcProfile.easy_count ?? 0} Easy, {lcProfile.medium_count ?? 0} Medium, {lcProfile.hard_count ?? 0} Hard)</span>
                )}
                {(lcProfile.contest_rating ?? 0) > 0 && <span>, Contest Rating {lcProfile.contest_rating}</span>}
              </div>
            )}
            {ghProfile && (
              <div>
                • <strong>GitHub:</strong> github.com/{ghProfile.handle} — <strong>{ghProfile.repositories_count ?? 0}</strong> public repositories
                {(ghProfile.stars_count ?? 0) > 0 && <span>, {ghProfile.stars_count} stars</span>}
                {(ghProfile.streak ?? 0) > 0 && <span>, {ghProfile.streak}-day active commit streak</span>}
              </div>
            )}
            {ccProfile && (
              <div>• <strong>CodeChef:</strong> codechef.com/users/{ccProfile.handle} {(ccProfile.contest_rating ?? 0) > 0 ? `— Rating ${ccProfile.contest_rating}` : ''}</div>
            )}
            {hrProfile && (
              <div>• <strong>HackerRank:</strong> hackerrank.com/{hrProfile.handle} {(hrProfile.score_rating ?? 0) > 0 ? `— Score ${hrProfile.score_rating}` : ''}</div>
            )}
          </div>
        </>)}

        {(rd.projects?.length ?? 0) > 0 && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '6px' }}>Projects</div>
          {rd.projects?.map((p, i) => (
            <div key={p.id} style={{ marginBottom: i < (rd.projects?.length ?? 0) - 1 ? '10px' : '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{p.title}</strong>{p.duration && <span style={{ color: '#666' }}>{p.duration}</span>}</div>
              {(p.tech_stack?.length ?? 0) > 0 && <div style={{ color: '#555', fontSize: '10px' }}>Tech: {p.tech_stack.join(', ')}</div>}
              {p.description && <div style={{ marginTop: '2px' }}>{p.description}</div>}
            </div>
          ))}
        </>)}

        {(fullData?.internships?.length ?? 0) > 0 && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '6px' }}>Experience & Internships</div>
          {fullData.internships.map((i: any, idx: number) => (
            <div key={i.id} style={{ marginBottom: idx < fullData.internships.length - 1 ? '10px' : '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{i.company_name}</strong><span style={{ color: '#666' }}>{i.start_date?.slice(0,7)} – {i.end_date?.slice(0,7) || 'Present'}</span></div>
              <div style={{ color: '#555' }}>{i.role || i.designation}</div>
            </div>
          ))}
        </>)}

        {(fullData?.certifications?.length ?? 0) > 0 && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '6px' }}>Certifications</div>
          {fullData.certifications.slice(0, 5).map((c: any) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span>{c.certification_name} · <em style={{ color: '#555' }}>{c.platform || c.issuer}</em></span>
              {c.date_completed && <span style={{ color: '#666' }}>{c.date_completed?.slice(0,7)}</span>}
            </div>
          ))}
          <div style={{ height: '10px' }} />
        </>)}

        {(fullData?.achievements?.length ?? 0) > 0 && (<>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '6px' }}>Achievements</div>
          {fullData.achievements.slice(0, 4).map((a: any) => <div key={a.id} style={{ marginBottom: '3px' }}>— {a.title}{a.description ? `: ${a.description}` : ''}</div>)}
          <div style={{ height: '10px' }} />
        </>)}

        <div style={{ display: 'flex', gap: '32px' }}>
          {(rd.languages?.length ?? 0) > 0 && (<div><div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '4px' }}>Languages</div><div>{rd.languages?.join('  ·  ')}</div></div>)}
          {(rd.hobbies?.length ?? 0) > 0 && (<div><div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#777', marginBottom: '4px' }}>Interests</div><div>{rd.hobbies?.join('  ·  ')}</div></div>)}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-textPrimary flex items-center gap-2"><FileText className="w-5 h-5 text-brand-primary" /> Resume Builder</h1>
          <p className="text-xs text-textMuted mt-0.5">Build a professional, ATS-optimized resume — auto-filled from your profile and live coding stats.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ATSBadge score={atsScore} />
          <button onClick={() => setView(v => v === 'edit' ? 'preview' : 'edit')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-borderLine rounded-xl hover:bg-surface-2 transition-colors">
            {view === 'edit' ? <><Eye className="w-3.5 h-3.5" /> Preview</> : <><Edit3 className="w-3.5 h-3.5" /> Edit</>}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-brand-soft text-brand-primary border border-brand-primary/20 rounded-xl hover:bg-brand-primary hover:text-white transition-colors">
            {saved ? <><CheckCircle className="w-3.5 h-3.5" /> Saved!</> : saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </button>
          <button onClick={handleDownloadPDF} disabled={downloading} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-hover transition-colors">
            {downloading ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Download className="w-3.5 h-3.5" /> Download PDF</>}
          </button>
        </div>
      </div>

      {/* ATS Tips bar */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
        <strong>ATS Tips:</strong> Technical recruiters prioritize resumes with verified <strong>LeetCode problem counts</strong> and <strong>GitHub project links</strong>. Keep descriptions quantified with impact metrics.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── LEFT: Editor ─────────────────────────────────────────────────── */}
        {view === 'edit' && (
          <div className="space-y-4">
            {/* Template Picker */}
            <div className="bg-surface border border-borderLine rounded-2xl p-4">
              <p className="text-xs font-bold text-textPrimary mb-3">Choose Template</p>
              <div className="grid grid-cols-3 gap-2">
                {(['classic', 'modern', 'minimal'] as const).map(t => (
                  <button key={t} onClick={() => setActiveTemplate(t)}
                    className={`py-3 px-2 rounded-xl border-2 text-xs font-bold capitalize transition-all ${activeTemplate === t ? 'border-brand-primary bg-brand-soft text-brand-primary' : 'border-borderLine text-textSecondary hover:border-brand-primary/40'}`}>
                    {t === 'classic' ? '📄 Classic' : t === 'modern' ? '🎨 Modern' : '✨ Minimal'}
                    <div className="text-[9px] font-normal mt-0.5 opacity-70">{t === 'classic' ? 'ATS #1 Standard' : t === 'modern' ? 'Two-Column UI' : 'Ultra-Clean Tech'}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Competitive Programming & Coding Profiles Sync */}
            <Section title="Coding Profiles & Stats (LeetCode & GitHub)" icon={Trophy} tip="💡 Synced from your departmental coding profiles. These stats provide proof of hands-on technical competence for ATS screening.">
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between p-2.5 bg-surface-2 border border-borderLine rounded-xl">
                  <span className="text-xs font-bold text-textPrimary">Show Coding Profiles on Resume</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rd.include_coding !== false}
                      onChange={e => setRd(r => ({ ...r, include_coding: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-borderLine peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* LeetCode Card */}
                  <div className="bg-surface-2 border border-borderLine rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5" /> LeetCode
                      </span>
                      {lcProfile ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Connected</span>
                      ) : (
                        <span className="text-[10px] text-textMuted">Not set</span>
                      )}
                    </div>
                    {lcProfile ? (
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-textPrimary">@{lcProfile.handle}</p>
                        <p className="text-textSecondary">
                          Solved: <strong className="text-brand-primary">{lcProfile.score_rating ?? 0}</strong>
                          {((lcProfile.easy_count ?? 0) + (lcProfile.medium_count ?? 0) + (lcProfile.hard_count ?? 0) > 0) && (
                            <span className="text-[11px] text-textMuted"> ({lcProfile.easy_count ?? 0}E, {lcProfile.medium_count ?? 0}M, {lcProfile.hard_count ?? 0}H)</span>
                          )}
                        </p>
                        {(lcProfile.contest_rating ?? 0) > 0 && (
                          <p className="text-[11px] text-emerald-600 font-medium">Contest Rating: {lcProfile.contest_rating}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-textMuted">Add your LeetCode handle in Profile → Coding Profiles.</p>
                    )}
                  </div>

                  {/* GitHub Card */}
                  <div className="bg-surface-2 border border-borderLine rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-textPrimary flex items-center gap-1.5">
                        <Github className="w-3.5 h-3.5" /> GitHub
                      </span>
                      {ghProfile ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Connected</span>
                      ) : (
                        <span className="text-[10px] text-textMuted">Not set</span>
                      )}
                    </div>
                    {ghProfile ? (
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-textPrimary">@{ghProfile.handle}</p>
                        <p className="text-textSecondary">
                          Public Repos: <strong className="text-brand-primary">{ghProfile.repositories_count ?? 0}</strong>
                        </p>
                        {(ghProfile.stars_count ?? 0) > 0 && (
                          <p className="text-[11px] text-amber-500 font-medium">⭐ {ghProfile.stars_count} Stars</p>
                        )}
                        {(ghProfile.streak ?? 0) > 0 && (
                          <p className="text-[11px] text-orange-500 font-medium">🔥 {ghProfile.streak}-Day Streak</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-textMuted">Add your GitHub handle in Profile → Coding Profiles.</p>
                    )}
                  </div>
                </div>

                {/* Additional coding handles */}
                {(ccProfile || hrProfile || gfgProfile) && (
                  <div className="p-2.5 bg-surface-2 border border-borderLine rounded-xl text-xs space-y-1">
                    <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider">Other Synced Profiles:</span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ccProfile && <span className="px-2 py-0.5 bg-surface border border-borderLine rounded-md text-[11px]">CodeChef: <strong>@{ccProfile.handle}</strong></span>}
                      {hrProfile && <span className="px-2 py-0.5 bg-surface border border-borderLine rounded-md text-[11px]">HackerRank: <strong>@{hrProfile.handle}</strong></span>}
                      {gfgProfile && <span className="px-2 py-0.5 bg-surface border border-borderLine rounded-md text-[11px]">GFG: <strong>@{gfgProfile.handle}</strong></span>}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Objective */}
            <Section title="Professional Summary / Objective" icon={User} tip="💡 ATS Tip: 2-3 sentences. Include your target role, top skills, and years of experience.">
              <textarea
                rows={4}
                value={rd.objective || ''}
                onChange={e => setRd(r => ({ ...r, objective: e.target.value }))}
                placeholder="A motivated B.Tech CSE student with expertise in React, Node.js, and cloud development. Seeking to leverage 2+ internship experiences to contribute to innovative software teams…"
                className="w-full mt-3 px-3 py-2 text-xs bg-surface border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none"
              />
              <div className={`text-[10px] mt-1 text-right ${(rd.objective?.length ?? 0) > 30 ? 'text-green-600 font-semibold' : 'text-textMuted'}`}>
                {rd.objective?.length || 0} chars {(rd.objective?.length ?? 0) > 30 ? '✓' : '(aim for 100+)'}
              </div>
            </Section>

            {/* Profile Links */}
            <Section title="Profile Links" icon={Link2} tip="💡 Links are auto-populated from your coding profiles and displayed in the resume header.">
              <div className="mt-2 mb-3 flex items-center justify-between">
                <span className="text-xs text-textMuted">Contact Links</span>
                <button
                  type="button"
                  onClick={handleManualAutofill}
                  className="flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline"
                >
                  <RefreshCw className="w-3 h-3" /> Auto-fill from coding profiles
                </button>
              </div>

              {autofilledNotice && (
                <div className="mb-3 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-lg text-xs flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Links auto-filled from your coding profiles!
                </div>
              )}

              <div className="space-y-2">
                {(['linkedin', 'github', 'leetcode', 'portfolio', 'hackerrank'] as const).map(key => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-textMuted w-24 capitalize">{key}</span>
                    <input
                      value={rd.links?.[key] || ''}
                      onChange={e => setRd(r => ({ ...r, links: { ...r.links, [key]: e.target.value } }))}
                      placeholder={key === 'linkedin' ? 'linkedin.com/in/username' : key === 'github' ? 'github.com/username' : key === 'leetcode' ? 'leetcode.com/username' : 'https://…'}
                      className="flex-1 px-3 py-1.5 text-xs bg-surface border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* Projects */}
            <Section title="Projects" icon={Code2} tip="💡 ATS Tip: Use action verbs. Mention tech stack explicitly. Include impact metrics if possible.">
              <div className="mt-3 space-y-3">
                {rd.projects?.map(p => (
                  <div key={p.id} className="bg-surface-2 border border-borderLine rounded-xl p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={p.title} onChange={e => updateProject(p.id, 'title', e.target.value)} placeholder="Project Title" className="flex-1 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                      <input value={p.duration || ''} onChange={e => updateProject(p.id, 'duration', e.target.value)} placeholder="Duration (e.g. Jan-Mar 2024)" className="w-36 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                      <button onClick={() => removeProject(p.id)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <textarea value={p.description} onChange={e => updateProject(p.id, 'description', e.target.value)} placeholder="Describe what you built, the impact, and technologies used…" rows={2} className="w-full px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none" />
                    <ChipInput values={p.tech_stack || []} onChange={v => updateProject(p.id, 'tech_stack', v)} placeholder="Tech (React, Node.js…)" />
                    <div className="flex gap-2">
                      <input value={p.github_url || ''} onChange={e => updateProject(p.id, 'github_url', e.target.value)} placeholder="GitHub URL" className="flex-1 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                      <input value={p.demo_url || ''} onChange={e => updateProject(p.id, 'demo_url', e.target.value)} placeholder="Demo URL" className="flex-1 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                    </div>
                  </div>
                ))}
                <button onClick={addProject} className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-borderLine rounded-xl text-xs text-textMuted hover:border-brand-primary hover:text-brand-primary transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Project
                </button>
              </div>
            </Section>

            {/* Languages */}
            <Section title="Languages Known" icon={Globe}>
              <div className="mt-3">
                <ChipInput values={rd.languages || []} onChange={v => setRd(r => ({ ...r, languages: v }))} placeholder="e.g. English, Telugu, Hindi…" />
              </div>
            </Section>

            {/* Hobbies */}
            <Section title="Interests & Hobbies" icon={Music}>
              <div className="mt-3">
                <ChipInput values={rd.hobbies || []} onChange={v => setRd(r => ({ ...r, hobbies: v }))} placeholder="e.g. Photography, Chess…" />
              </div>
            </Section>

            {/* Extra-curricular */}
            <Section title="Extra-Curricular Activities" icon={Users}>
              <div className="mt-3 space-y-2">
                {rd.extra_curr?.map(e => (
                  <div key={e.id} className="flex gap-2 items-center">
                    <input value={e.title} onChange={v => updateEC(e.id, 'title', v.target.value)} placeholder="Activity / Club / Event" className="flex-1 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                    <input value={e.role} onChange={v => updateEC(e.id, 'role', v.target.value)} placeholder="Role" className="w-28 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                    <input value={e.year} onChange={v => updateEC(e.id, 'year', v.target.value)} placeholder="Year" className="w-16 px-2 py-1.5 text-xs bg-surface border border-borderLine rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                    <button onClick={() => removeEC(e.id)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={addEC} className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-borderLine rounded-xl text-xs text-textMuted hover:border-brand-primary hover:text-brand-primary transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Activity
                </button>
              </div>
            </Section>

            {/* Auto-filled sections notice */}
            <div className="bg-surface border border-borderLine rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-textPrimary">Auto-filled from your Profile & Stats ✓</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Technical Skills', count: fullData?.techSkills?.length, icon: Code2 },
                  { label: 'Coding Profiles', count: codingProfiles.length, icon: Trophy },
                  { label: 'Certifications', count: fullData?.certifications?.length, icon: Award },
                  { label: 'Achievements', count: fullData?.achievements?.length, icon: Star },
                  { label: 'Soft Skills', count: fullData?.softSkills?.length, icon: Zap },
                  { label: 'Internships', count: fullData?.internships?.length, icon: Briefcase },
                  { label: 'Academic Records', count: fullData?.academics?.length, icon: GraduationCap },
                ].map(({ label, count, icon: Icon }) => (
                  <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${count > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-surface-2 text-textMuted border border-borderLine'}`}>
                    <Icon className="w-3 h-3" />
                    <span>{label}: <strong>{count || 0}</strong></span>
                    {count > 0 ? <CheckCircle className="w-3 h-3 ml-auto" /> : <AlertCircle className="w-3 h-3 ml-auto text-amber-400" />}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-textMuted">Data syncs in real-time from the department database.</p>
            </div>
          </div>
        )}

        {/* ── RIGHT: Live Preview ────────────────────────────────────────── */}
        <div className={view === 'edit' ? '' : 'xl:col-span-2'}>
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-borderLine">
              <span className="text-xs font-bold text-textPrimary">Live Preview — {activeTemplate.charAt(0).toUpperCase() + activeTemplate.slice(1)} Template</span>
              <span className="text-[10px] text-textMuted bg-surface-2 px-2 py-1 rounded-lg">A4 · ATS-Optimized</span>
            </div>
            <div className="overflow-auto max-h-[850px]" ref={previewRef} style={{ background: '#fff' }}>
              <ResumePreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
