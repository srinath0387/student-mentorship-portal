import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  User,
  Mail,
  Building,
  Phone,
  Droplet,
  Linkedin,
  Calendar,
  Clock,
  Briefcase,
  GraduationCap,
  Award,
  BookOpen,
  Tag,
  Loader2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { FacultyFullProfile, FacultyPersonalDetails, FacultyEducation } from '../../../types';
import {
  calculateRgmcetExperience,
  calculateTotalExperience,
  calculateFacultyProfileCompletion,
} from '../../../lib/facultyUtils';
import { formatExternalUrl } from '../../../lib/urlUtils';

interface Props {
  faculty: {
    faculty_id: string;
    name: string;
    email: string;
    department?: string;
    role?: string;
  } | null;
  onClose: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

export const FacultyProfileInspectionModal: React.FC<Props> = ({ faculty, onClose }) => {
  const email = faculty?.email || '';

  const { data: profile, isLoading } = useQuery<FacultyFullProfile>({
    queryKey: ['facultyFullProfile', email],
    queryFn: () => (email ? api.getFacultyFullProfile(email) : Promise.resolve(null)),
    enabled: Boolean(email && !email.startsWith('pending_')),
  });

  const personal: Partial<FacultyPersonalDetails> = profile?.personal || {};
  const education: Partial<FacultyEducation> = profile?.education || {};
  const certifications = profile?.certifications || [];
  const activities = profile?.activities || [];
  const publications = profile?.publications || [];
  const domains = profile?.domains || [];

  const joiningDate = personal.joining_date || '';
  const rgmcetExp = useMemo(() => calculateRgmcetExperience(joiningDate), [joiningDate]);
  const totalExp = useMemo(
    () =>
      calculateTotalExperience(
        joiningDate,
        personal.prior_experience_years || 0,
        personal.prior_experience_months || 0
      ),
    [joiningDate, personal.prior_experience_years, personal.prior_experience_months]
  );

  const completion = useMemo(() => calculateFacultyProfileCompletion(profile), [profile]);

  // Group certifications by Academic Year
  const certsByAcademicYear = useMemo(() => {
    const map: Record<string, typeof certifications> = {};
    certifications.forEach((c) => {
      const yr = c.academic_year || '2024–25';
      if (!map[yr]) map[yr] = [];
      map[yr].push(c);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [certifications]);

  if (!faculty) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-4xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-textSecondary hover:text-textPrimary p-2 rounded-full hover:bg-surface-2 transition-colors"
          title="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Modal Header: Faculty Summary ── */}
        <div className="border-b border-borderLine pb-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-brand-soft text-brand-primary">
              Faculty 360° Profile View (HOD &amp; Admin Review)
            </span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                completion.percentage >= 90
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-300'
              }`}
            >
              {completion.percentage}% Profile Complete
            </span>
          </div>

          <div className="flex items-start gap-4 mt-3">
            <div className="w-14 h-14 rounded-2xl bg-[#031B33] text-brand-primary border border-brand-primary/30 flex items-center justify-center text-lg font-black shrink-0">
              {getInitials(faculty.name)}
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-textPrimary">{faculty.name}</h2>
              <p className="text-xs text-textSecondary">
                {faculty.department || 'CSE (Data Science)'} &bull; ID: {faculty.faculty_id} &bull;{' '}
                <span className="font-semibold text-brand-primary">
                  {personal.designation || (faculty.role === 'hod' ? 'Head of Department' : 'Faculty Mentor')}
                </span>
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-7 h-7 text-brand-primary animate-spin" />
            <p className="text-xs font-semibold text-textSecondary">Loading complete faculty profile...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── 1. Personal & Contact Details ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-brand-primary" />
                <span>Contact &amp; Personal Credentials</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-textSecondary block text-[11px]">Official Email</span>
                  <span className="font-semibold text-textPrimary break-all">{faculty.email || '—'}</span>
                </div>
                <div>
                  <span className="text-textSecondary block text-[11px]">Mobile Number</span>
                  {personal.phone ? (
                    <a href={`tel:${personal.phone}`} className="font-bold text-brand-primary hover:underline flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span>{personal.phone}</span>
                    </a>
                  ) : (
                    <span className="text-textMuted italic">Not provided yet</span>
                  )}
                </div>
                <div>
                  <span className="text-textSecondary block text-[11px]">Blood Group</span>
                  <span className="font-bold text-textPrimary">{personal.blood_group || '—'}</span>
                </div>
                <div>
                  <span className="text-textSecondary block text-[11px]">LinkedIn Profile</span>
                  {personal.linkedin_url ? (
                    <a
                      href={formatExternalUrl(personal.linkedin_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Linkedin className="w-3 h-3" />
                      <span>View Profile</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <span className="text-textMuted italic">Not linked</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── 2. Experience Breakdown (Live Dynamic Computations) ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-brand-primary" />
                <span>Experience Tracking (Live Auto-Computed)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-surface rounded-lg border border-borderLine">
                  <span className="text-[11px] text-textSecondary block">Joining Date at RGMCET</span>
                  <span className="text-sm font-bold text-textPrimary">{joiningDate || '—'}</span>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block font-semibold">Experience in RGMCET</span>
                  <span className="text-sm font-black text-emerald-800 dark:text-emerald-200">{rgmcetExp.text}</span>
                </div>
                <div className="p-3 bg-brand-soft rounded-lg border border-brand-primary/30">
                  <span className="text-[11px] text-brand-primary block font-semibold">Total Overall Experience</span>
                  <span className="text-sm font-black text-brand-primary">{totalExp.text}</span>
                </div>
              </div>
            </div>

            {/* ── 3. Educational Qualifications ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-indigo-500" />
                <span>Educational Qualifications</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-textSecondary block text-[11px]">Highest Qualification</span>
                  <span className="font-bold text-textPrimary">{education.highest_qualification || '—'}</span>
                </div>
                <div>
                  <span className="text-textSecondary block text-[11px]">University / Institute</span>
                  <span className="font-semibold text-textPrimary">{education.university || '—'}</span>
                </div>
                <div>
                  <span className="text-textSecondary block text-[11px]">Year of Passing</span>
                  <span className="font-semibold text-textPrimary">{education.year_of_passing || '—'}</span>
                </div>
                <div>
                  <span className="text-textSecondary block text-[11px]">Specialization</span>
                  <span className="font-semibold text-textPrimary">{education.specialization || '—'}</span>
                </div>
              </div>
            </div>

            {/* ── 4. Certifications Grouped by Academic Year ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Certifications ({certifications.length}) — Grouped by Academic Year</span>
              </h3>
              {certsByAcademicYear.length > 0 ? (
                <div className="space-y-3">
                  {certsByAcademicYear.map(([yr, list]) => (
                    <div key={yr} className="space-y-1.5">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                        Academic Year {yr}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {list.map((c) => (
                          <div key={c.id} className="p-2.5 rounded-lg bg-surface border border-borderLine text-xs">
                            <p className="font-bold text-textPrimary line-clamp-1">{c.title}</p>
                            <p className="text-[11px] text-brand-primary">{c.issuing_body}</p>
                            <p className="text-[10px] text-textSecondary mt-1">Completed: {c.completion_date}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-textSecondary italic">No certifications uploaded yet.</p>
              )}
            </div>

            {/* ── 5. Conferences / Workshops / FDPs ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-sky-500" />
                <span>Conferences, Workshops &amp; FDPs ({activities.length})</span>
              </h3>
              {activities.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activities.map((a) => (
                    <div key={a.id} className="p-2.5 rounded-lg bg-surface border border-borderLine text-xs space-y-1">
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                          {a.type} &bull; {a.level}
                        </span>
                        <span className="text-[10px] text-sky-600 font-bold">{a.academic_year}</span>
                      </div>
                      <p className="font-bold text-textPrimary line-clamp-1">{a.title}</p>
                      <p className="text-[11px] text-textSecondary">Organizer: {a.organizer} ({a.date})</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-textSecondary italic">No conferences or FDPs recorded yet.</p>
              )}
            </div>

            {/* ── 6. Research Publications & Patents ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                <span>Research Publications &amp; Patents ({publications.length})</span>
              </h3>
              {publications.length > 0 ? (
                <div className="space-y-2">
                  {publications.map((p) => (
                    <div key={p.id} className="p-2.5 rounded-lg bg-surface border border-borderLine text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                          {p.category}
                        </span>
                        <span className="font-bold text-textPrimary">{p.title}</span>
                      </div>
                      <p className="text-[11px] text-textSecondary">
                        {p.journal_name} ({p.year}) {p.co_authors && `• Authors: ${p.co_authors}`}
                      </p>
                      {p.doi_link && (
                        <a
                          href={formatExternalUrl(p.doi_link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-brand-primary hover:underline inline-flex items-center gap-1"
                        >
                          <span>DOI Link</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-textSecondary italic">No publications or patents recorded yet.</p>
              )}
            </div>

            {/* ── 7. Domain Expertise ── */}
            <div className="bg-surface-2 border border-borderLine rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-500" />
                <span>Domain &amp; Research Specializations ({domains.length})</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {domains.length > 0 ? (
                  domains.map((d) => (
                    <span
                      key={d}
                      className="px-2.5 py-1 rounded-lg bg-brand-soft text-brand-primary font-bold text-xs border border-brand-primary/20"
                    >
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-textSecondary italic">No domain specializations specified yet.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
