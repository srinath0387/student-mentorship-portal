import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

const DEPARTMENTS = VALID_DEPARTMENT_NAMES;
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
import {
  Users,
  Search,
  Filter,
  Award,
  TrendingUp,
  BookOpen,
  CheckCircle2,
  Edit2,
  FileBarChart,
  Eye,
  ShieldCheck,
  X,
  Plus,
  Upload,
  AlertCircle,
  User,
  Camera,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GraduationCap,
  Briefcase,
  Microscope,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StudentProfile } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { PillButton } from '../../components/common/PillButton';
import { ProfilePhotoUploadModal } from '../../components/common/ProfilePhotoUploadModal';
import { PersonalInfoTab } from '../profile/tabs/PersonalInfoTab';
import { AcademicsTab } from '../profile/tabs/AcademicsTab';
import { CodingProfilesTab } from '../profile/tabs/CodingProfilesTab';
import { TechSkillsTab } from '../profile/tabs/TechSkillsTab';
import { CertificationsTab } from '../profile/tabs/CertificationsTab';
import { SoftSkillsTab } from '../profile/tabs/SoftSkillsTab';
import { AchievementsTab } from '../profile/tabs/AchievementsTab';
import { PlacementPreferencesTab } from '../profile/tabs/PlacementPreferencesTab';
import { BulkImportModal } from '../admin/components/BulkImportModal';
import { PlacementEligibilitySection } from '../hod/components/PlacementEligibilitySection';
import { FacultyProfileTab } from './tabs/FacultyProfileTab';
import { calculateFacultyProfileCompletion } from '../../lib/facultyUtils';
import { FacultyAttendancePage } from '../attendance/faculty/FacultyAttendancePage';
import { FacultyLeaveTab } from '../leave/FacultyLeaveTab';

// Helper: compute academic standing from CGPA
const getStanding = (cgpa: number | string | undefined | null) => {
  const val = Number(cgpa) || 0;
  if (val >= 8.0) return { label: `Distinction (${val.toFixed(2)})`, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' };
  if (val >= 6.5) return { label: `First Class (${val.toFixed(2)})`, color: 'bg-brand-soft text-brand-primary dark:bg-indigo-950/40 dark:text-indigo-400 border border-brand-primary/20' };
  if (val >= 5.5) return { label: `Second Class (${val.toFixed(2)})`, color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800' };
  if (val > 4.5 && val < 5.5) return { label: `Pass (${val.toFixed(2)})`, color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200 dark:border-sky-800' };
  if (val > 0)   return { label: `At Risk (${val.toFixed(2)})`, color: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800' };
  return { label: 'No Data', color: 'bg-background text-textSecondary border border-borderLine' };
};

export const FacultyDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const activeTab = searchParams.get('tab') || 'mentees';

  // Use the logged-in faculty's ID from auth context
  const facultyId = user?.rollNumber || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [selectedMentee, setSelectedMentee] = useState<StudentProfile | null>(null);
  const [inspectMentee, setInspectMentee] = useState<StudentProfile | null>(null);
  const [inspectTab, setInspectTab] = useState('personal-info');
  const [remarkInput, setRemarkInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Fetch mentees by email — resolves across ALL faculty records for this person
  // Handles the case where CSV created FAC_KRATHI but registration created a different faculty_id
  const { data: mentees = [], refetch } = useQuery({
    queryKey: ['facultyMentees', user?.email],
    queryFn: () => user?.email ? api.getMenteesByEmail(user.email) : Promise.resolve([]),
    enabled: Boolean(user?.email),
  });

  const { data: facultyProfile } = useQuery({
    queryKey: ['facultyFullProfile', user?.email],
    queryFn: () => (user?.email ? api.getFacultyFullProfile(user.email) : Promise.resolve(null)),
    enabled: Boolean(user?.email),
  });

  const completionInfo = useMemo(
    () => calculateFacultyProfileCompletion(facultyProfile),
    [facultyProfile]
  );

  const { data: deptReport } = useQuery({
    queryKey: ['deptReport', user?.department],
    queryFn: () => api.getDepartmentReport(user?.department),
  });

  // ── Class Incharge (1st-Year Sections) Query ──
  const { data: inchargeSections = [] } = useQuery({
    queryKey: ['facultyInchargeSections', user?.email],
    queryFn: () => api.getFacultyInchargeSections(),
    enabled: Boolean(user?.email),
  });

  const [selectedInchargeIdx, setSelectedInchargeIdx] = useState<number>(0);
  const activeIncharge = inchargeSections[selectedInchargeIdx] || inchargeSections[0] || null;

  const { data: inchargeAnalytics, isLoading: inchargeAnalyticsLoading } = useQuery({
    queryKey: ['inchargeSectionAnalytics', activeIncharge?.semester_label, activeIncharge?.department, activeIncharge?.section],
    queryFn: () =>
      activeIncharge
        ? api.getInchargeSectionAnalytics({
            semester: activeIncharge.semester_label,
            department: activeIncharge.department,
            section: activeIncharge.section,
          })
        : Promise.resolve(null),
    enabled: Boolean(activeIncharge),
  });

  // ── Academic Overview ──────────────────────────────────────────────────────
  const { data: subjectsHandled = [] } = useQuery({
    queryKey: ['subjectsHandled', user?.email],
    queryFn: () => user?.email ? api.getFacultySubjectsHandled(user.email) : Promise.resolve([]),
    enabled: Boolean(user?.email),
  });

  const academicStats = useMemo(() => {
    const pubs  = (facultyProfile?.publications  ?? []) as any[];
    const acts  = (facultyProfile?.activities    ?? []) as any[];
    const certs = (facultyProfile?.certifications ?? []) as any[];
    const subs  = subjectsHandled as any[];
    return {
      publications  : pubs.filter((p) => p.category !== 'Patent').length,
      patents       : pubs.filter((p) => p.category === 'Patent').length,
      fdps          : acts.filter((a) => a.type === 'FDP').length,
      conferences   : acts.filter((a) => a.type === 'Conference').length,
      workshops     : acts.filter((a) => a.type === 'Workshop').length,
      certifications: certs.length,
      subjectsTotal : subs.length,
      subjectsUnique: new Set(subs.map((s) => s.subject)).size,
      pubList  : pubs.filter((p) => p.category !== 'Patent'),
      patList  : pubs.filter((p) => p.category === 'Patent'),
      fdpList  : acts.filter((a) => a.type === 'FDP'),
      confList : acts.filter((a) => a.type === 'Conference'),
      wsList   : acts.filter((a) => a.type === 'Workshop'),
      certList : certs,
      subList  : subs,
    };
  }, [facultyProfile, subjectsHandled]);

  const [activeOverviewCard, setActiveOverviewCard] = useState<string | null>(null);
  const toggleOverviewCard = (label: string) =>
    setActiveOverviewCard((prev) => (prev === label ? null : label));

  // Compute real stat card values
  const topStandingCount = useMemo(
    () => mentees.filter((m: any) => Number(m.cgpa) >= 8.0).length,
    [mentees]
  );
  const realAvgGpa = useMemo(() => {
    const withCgpa = mentees.filter((m: any) => Number(m.cgpa) > 0);
    if (withCgpa.length === 0) return 0;
    return (withCgpa.reduce((s: number, m: any) => s + Number(m.cgpa), 0) / withCgpa.length).toFixed(2);
  }, [mentees]);

  // Year-wise breakdown — comes from API response via yearBreakdown property attached to the array
  const yearBreakdown = useMemo(() => {
    const bd = (mentees as any).yearBreakdown;
    if (bd) return bd as Record<string, number>;
    // Fallback: compute locally
    return {
      '1st Year': mentees.filter((m: any) => m.year === '1st Year').length,
      '2nd Year': mentees.filter((m: any) => m.year === '2nd Year').length,
      '3rd Year': mentees.filter((m: any) => m.year === '3rd Year').length,
      '4th Year': mentees.filter((m: any) => m.year === '4th Year').length,
    };
  }, [mentees]);

  // Queries for inspected mentee sub-resources
  const menteeId = inspectMentee?.roll_number || '';
  const { data: inspectAcademics = [] } = useQuery({
    queryKey: ['inspectAcademics', menteeId],
    queryFn: () => api.getAcademics(menteeId),
    enabled: Boolean(inspectMentee),
  });

  const { data: inspectCoding = [] } = useQuery({
    queryKey: ['inspectCoding', menteeId],
    queryFn: () => api.getCodingProfiles(menteeId),
    enabled: Boolean(inspectMentee),
  });

  const { data: inspectSkills = [] } = useQuery({
    queryKey: ['inspectSkills', menteeId],
    queryFn: () => api.getTechSkills(menteeId),
    enabled: Boolean(inspectMentee),
  });

  const { data: inspectCerts = [] } = useQuery({
    queryKey: ['inspectCerts', menteeId],
    queryFn: () => api.getCertifications(menteeId),
    enabled: Boolean(inspectMentee),
  });

  const { data: inspectSoft = [] } = useQuery({
    queryKey: ['inspectSoft', menteeId],
    queryFn: () => api.getSoftSkills(menteeId),
    enabled: Boolean(inspectMentee),
  });

  const { data: inspectAchievements = [] } = useQuery({
    queryKey: ['inspectAchievements', menteeId],
    queryFn: () => api.getAchievements(menteeId),
    enabled: Boolean(inspectMentee),
  });

  // Fetch full student profile for inspected mentee — mentees list only has summary columns,
  // so linkedin_url, address and other fields can be missing.
  const { data: inspectFullProfile } = useQuery({
    queryKey: ['inspectStudentProfile', menteeId],
    queryFn: () => api.getStudentProfile(menteeId),
    enabled: Boolean(inspectMentee) && Boolean(menteeId),
  });

  const filteredMentees = mentees.filter((m) => {
      const q = searchQuery.toLowerCase();
    const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.roll_number.toLowerCase().includes(q);
    const matchesSection = !sectionFilter || m.section === sectionFilter;
    const matchesYear = !yearFilter || m.year === yearFilter;
    return matchesSearch && matchesSection && matchesYear;
  });

  // Group filtered mentees by year for collapsible sections
  const YEAR_ORDER = ['4th Year', '3rd Year', '2nd Year', '1st Year'];
  const groupedByYear = YEAR_ORDER.map(year => ({
    year,
    mentees: filteredMentees.filter(m => m.year === year),
  })).filter(g => g.mentees.length > 0);
  // Also collect any mentees with unexpected year values
  const knownYears = new Set(YEAR_ORDER);
  const otherMentees = filteredMentees.filter(m => !knownYears.has(m.year));
  if (otherMentees.length > 0) groupedByYear.push({ year: 'Other', mentees: otherMentees });

  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const toggleYear = (year: string) => setCollapsedYears(prev => {
    const next = new Set(prev);
    if (next.has(year)) next.delete(year); else next.add(year);
    return next;
  });

  const handleSaveRemark = async () => {
    if (!selectedMentee) return;
    setSaving(true);
    try {
      await api.updateStudentProfile(selectedMentee.roll_number, {
        remarks: remarkInput,
      } as any);
      setSelectedMentee(null);
      setRemarkInput('');
      refetch();
    } catch (e: any) {
      alert('Failed to save remarks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-brand-primary to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md border-2 border-surface ring-2 ring-brand-primary/20">
              {facultyProfile?.personal?.photo_url ? (
                <img
                  src={facultyProfile.personal.photo_url}
                  alt={user?.name || 'Faculty'}
                  className="w-full h-full object-cover"
                />
              ) : (
                (user?.name || 'F')
                  .split(' ')
                  .filter(Boolean)
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase() || 'F'
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowPhotoModal(true)}
              className="absolute -bottom-1 -right-1 p-1.5 rounded-lg bg-surface border border-borderLine text-textMuted shadow-xs hover:text-textPrimary hover:border-brand-primary transition-all cursor-pointer"
              title="Upload / Change Profile Photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Faculty & Mentor Portal</span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-textPrimary leading-tight">{user?.name || 'Faculty Member'}</h1>
            <p className="text-xs text-textSecondary mt-0.5">
              {user?.department} • ID: {user?.rollNumber || facultyProfile?.faculty_id || 'FAC'}
            </p>
          </div>
        </div>
        <PillButton variant="outline" size="sm" onClick={() => setShowBulkImportModal(true)} icon={<Upload className="w-4 h-4 text-brand-primary" />}>
          Bulk Import CSV
        </PillButton>
      </div>

      {/* ── Incomplete Profile Prompt Banner ── */}
      {!completionInfo.isComplete && activeTab !== 'profile' && (
        <div className="bg-gradient-to-r from-amber-500/10 via-brand-primary/10 to-indigo-500/10 border border-amber-500/30 dark:border-amber-500/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-textPrimary">Your Profile is Incomplete</h3>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300">
                  {completionInfo.percentage}% Complete
                </span>
              </div>
              <p className="text-xs text-textSecondary mt-0.5">
                Please update your joining date, educational qualifications, NPTEL/industry certifications, and domain expertise.
              </p>
            </div>
          </div>
          <PillButton
            variant="primary"
            size="sm"
            onClick={() => setSearchParams({ tab: 'profile' })}
            icon={<User className="w-3.5 h-3.5" />}
          >
            Complete Profile Now
          </PillButton>
        </div>
      )}

      {/* ── Academic Overview Cards & Interactive Details ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-textPrimary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
              Academic & Research Portfolio Overview
            </h2>
            <p className="text-xs text-textSecondary mt-0.5">
              Click any card to inspect detailed records, papers, events, and subjects
            </p>
          </div>
          {activeOverviewCard && (
            <button
              onClick={() => setActiveOverviewCard(null)}
              className="text-xs font-semibold text-textSecondary hover:text-textPrimary inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-2 border border-borderLine transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Collapse Details</span>
            </button>
          )}
        </div>

        {/* 7 Interactive Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            {
              id: 'publications',
              label: 'Publications',
              value: academicStats.publications,
              icon: <BookOpen className="w-4 h-4 text-purple-500" />,
              color: 'text-purple-600 dark:text-purple-400',
              badgeBg: 'bg-purple-500/10 border-purple-500/20',
              sub: 'SCI / Scopus / WoS',
            },
            {
              id: 'patents',
              label: 'Patents',
              value: academicStats.patents,
              icon: <Microscope className="w-4 h-4 text-emerald-500" />,
              color: 'text-emerald-600 dark:text-emerald-400',
              badgeBg: 'bg-emerald-500/10 border-emerald-500/20',
              sub: 'Granted / Published',
            },
            {
              id: 'fdps',
              label: 'FDPs',
              value: academicStats.fdps,
              icon: <GraduationCap className="w-4 h-4 text-blue-500" />,
              color: 'text-blue-600 dark:text-blue-400',
              badgeBg: 'bg-blue-500/10 border-blue-500/20',
              sub: 'Faculty Dev.',
            },
            {
              id: 'conferences',
              label: 'Conferences',
              value: academicStats.conferences,
              icon: <Award className="w-4 h-4 text-amber-500" />,
              color: 'text-amber-600 dark:text-amber-400',
              badgeBg: 'bg-amber-500/10 border-amber-500/20',
              sub: 'National / Int.',
            },
            {
              id: 'workshops',
              label: 'Workshops',
              value: academicStats.workshops,
              icon: <Briefcase className="w-4 h-4 text-pink-500" />,
              color: 'text-pink-600 dark:text-pink-400',
              badgeBg: 'bg-pink-500/10 border-pink-500/20',
              sub: 'Attended / Organ.',
            },
            {
              id: 'certifications',
              label: 'Certifications',
              value: academicStats.certifications,
              icon: <ShieldCheck className="w-4 h-4 text-teal-500" />,
              color: 'text-teal-600 dark:text-teal-400',
              badgeBg: 'bg-teal-500/10 border-teal-500/20',
              sub: 'NPTEL & Industry',
            },
            {
              id: 'subjects',
              label: 'Subjects Handled',
              value: academicStats.subjectsTotal,
              icon: <FileBarChart className="w-4 h-4 text-indigo-500" />,
              color: 'text-indigo-600 dark:text-indigo-400',
              badgeBg: 'bg-indigo-500/10 border-indigo-500/20',
              sub: `${academicStats.subjectsUnique} Unique`,
            },
          ].map((card) => {
            const isSelected = activeOverviewCard === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => toggleOverviewCard(card.id)}
                className={`relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all group ${
                  isSelected
                    ? 'border-brand-primary bg-brand-soft/30 shadow-sm ring-2 ring-brand-primary/20'
                    : 'border-borderLine bg-surface hover:bg-surface-2 hover:border-brand-primary/40'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`p-2 rounded-lg border ${card.badgeBg}`}>
                    {card.icon}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                    isSelected ? 'bg-brand-primary text-white' : 'text-textSecondary group-hover:text-textPrimary'
                  }`}>
                    {isSelected ? 'Viewing' : 'View'}
                  </span>
                </div>
                <div className="mt-3">
                  <div className={`text-2xl font-black ${card.color}`}>
                    {card.value}
                  </div>
                  <div className="text-xs font-bold text-textPrimary mt-0.5 line-clamp-1">
                    {card.label}
                  </div>
                  <div className="text-[10px] text-textSecondary mt-0.5 font-medium">
                    {card.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Expandable Details Panel ── */}
        {activeOverviewCard && (
          <div className="border border-borderLine rounded-xl bg-surface-2 p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
            {/* Details Panel Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-borderLine">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-surface border border-borderLine text-textPrimary">
                  {activeOverviewCard === 'publications' && <BookOpen className="w-5 h-5 text-purple-500" />}
                  {activeOverviewCard === 'patents' && <Microscope className="w-5 h-5 text-emerald-500" />}
                  {activeOverviewCard === 'fdps' && <GraduationCap className="w-5 h-5 text-blue-500" />}
                  {activeOverviewCard === 'conferences' && <Award className="w-5 h-5 text-amber-500" />}
                  {activeOverviewCard === 'workshops' && <Briefcase className="w-5 h-5 text-pink-500" />}
                  {activeOverviewCard === 'certifications' && <ShieldCheck className="w-5 h-5 text-teal-500" />}
                  {activeOverviewCard === 'subjects' && <FileBarChart className="w-5 h-5 text-indigo-500" />}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-textPrimary">
                    {activeOverviewCard === 'publications' && `Research Publications (${academicStats.publications})`}
                    {activeOverviewCard === 'patents' && `Patents (${academicStats.patents})`}
                    {activeOverviewCard === 'fdps' && `Faculty Development Programs (${academicStats.fdps})`}
                    {activeOverviewCard === 'conferences' && `Conferences (${academicStats.conferences})`}
                    {activeOverviewCard === 'workshops' && `Workshops (${academicStats.workshops})`}
                    {activeOverviewCard === 'certifications' && `Certifications (${academicStats.certifications})`}
                    {activeOverviewCard === 'subjects' && `Subjects Handled (${academicStats.subjectsTotal} Total Instances, ${academicStats.subjectsUnique} Unique)`}
                  </h3>
                  <p className="text-xs text-textSecondary">
                    {activeOverviewCard === 'subjects'
                      ? 'Detailed semester exam performance and pass percentage results'
                      : 'Records fetched from your faculty profile portfolio'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSearchParams({ tab: 'profile' })}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Manage in Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOverviewCard(null)}
                  className="p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface border border-borderLine transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content: Publications */}
            {activeOverviewCard === 'publications' && (
              academicStats.pubList.length > 0 ? (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {academicStats.pubList.map((p: any) => (
                    <div key={p.id || p.title} className="p-3.5 rounded-xl bg-surface border border-borderLine space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                            {p.category || 'Research Article'}
                          </span>
                          <span className="text-xs font-bold text-textPrimary line-clamp-1">{p.title}</span>
                        </div>
                        {p.year && (
                          <span className="text-[11px] font-bold text-textSecondary px-2 py-0.5 rounded bg-surface-2 border border-borderLine">
                            Year: {p.year}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-textSecondary">
                        <span className="font-semibold text-textPrimary">{p.journal_name}</span>
                        {p.co_authors && <span> &bull; Authors: {p.co_authors}</span>}
                      </p>
                      {p.doi_link && (
                        <div className="pt-1">
                          <a
                            href={p.doi_link.startsWith('http') ? p.doi_link : `https://${p.doi_link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <span>DOI / Link</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No research publications recorded yet.</p>
                  <p className="mt-1">Add SCI, Scopus, or WoS papers under the Profile tab.</p>
                </div>
              )
            )}

            {/* Content: Patents */}
            {activeOverviewCard === 'patents' && (
              academicStats.patList.length > 0 ? (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {academicStats.patList.map((p: any) => (
                    <div key={p.id || p.title} className="p-3.5 rounded-xl bg-surface border border-borderLine space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                            Patent
                          </span>
                          <span className="text-xs font-bold text-textPrimary">{p.title}</span>
                        </div>
                        {p.year && (
                          <span className="text-[11px] font-bold text-textSecondary px-2 py-0.5 rounded bg-surface-2 border border-borderLine">
                            Year: {p.year}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-textSecondary">
                        {p.journal_name && <span>{p.journal_name} &bull; </span>}
                        {p.co_authors && <span>Inventors: {p.co_authors}</span>}
                      </p>
                      {p.doi_link && (
                        <div className="pt-1">
                          <a
                            href={p.doi_link.startsWith('http') ? p.doi_link : `https://${p.doi_link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <span>Patent Details / Link</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No patents recorded yet.</p>
                  <p className="mt-1">Add patents published or granted under the Faculty Profile tab.</p>
                </div>
              )
            )}

            {/* Content: FDPs */}
            {activeOverviewCard === 'fdps' && (
              academicStats.fdpList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {academicStats.fdpList.map((a: any) => {
                    const startDate = a.from_date || a.date;
                    const endDate = a.to_date || a.date;
                    const isRange = startDate && endDate && startDate !== endDate;
                    return (
                      <div key={a.id || a.title} className="p-3 rounded-xl bg-surface border border-borderLine text-xs space-y-2 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              {a.level || 'National'} {a.role_type && `• ${a.role_type}`}
                            </span>
                            {a.academic_year && (
                              <span className="text-[10px] font-bold text-blue-600">{a.academic_year}</span>
                            )}
                          </div>
                          <p className="font-bold text-textPrimary line-clamp-2">{a.title}</p>
                          <p className="text-[11px] text-textSecondary"><span className="font-medium">Organizer:</span> {a.organizer}</p>
                        </div>
                        <div className="pt-2 border-t border-borderLine/50 flex items-center justify-between text-[10px]">
                          <span className="text-textSecondary">
                            {isRange ? `${startDate} to ${endDate}` : startDate || 'Date N/A'}
                            {a.no_of_days > 0 && <span className="ml-1 font-bold text-blue-600">({a.no_of_days} days)</span>}
                          </span>
                          {a.document_url && (
                            <a
                              href={a.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-primary font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Certificate</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No Faculty Development Programs recorded yet.</p>
                </div>
              )
            )}

            {/* Content: Conferences */}
            {activeOverviewCard === 'conferences' && (
              academicStats.confList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {academicStats.confList.map((a: any) => {
                    const startDate = a.from_date || a.date;
                    const endDate = a.to_date || a.date;
                    const isRange = startDate && endDate && startDate !== endDate;
                    return (
                      <div key={a.id || a.title} className="p-3 rounded-xl bg-surface border border-borderLine text-xs space-y-2 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {a.level || 'Conference'} {a.role_type && `• ${a.role_type}`}
                            </span>
                            {a.academic_year && (
                              <span className="text-[10px] font-bold text-amber-600">{a.academic_year}</span>
                            )}
                          </div>
                          <p className="font-bold text-textPrimary line-clamp-2">{a.title}</p>
                          <p className="text-[11px] text-textSecondary"><span className="font-medium">Organizer:</span> {a.organizer}</p>
                        </div>
                        <div className="pt-2 border-t border-borderLine/50 flex items-center justify-between text-[10px]">
                          <span className="text-textSecondary">
                            {isRange ? `${startDate} to ${endDate}` : startDate || 'Date N/A'}
                            {a.no_of_days > 0 && <span className="ml-1 font-bold text-amber-600">({a.no_of_days} days)</span>}
                          </span>
                          {a.document_url && (
                            <a
                              href={a.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-primary font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Certificate</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No conference records recorded yet.</p>
                </div>
              )
            )}

            {/* Content: Workshops */}
            {activeOverviewCard === 'workshops' && (
              academicStats.wsList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {academicStats.wsList.map((a: any) => {
                    const startDate = a.from_date || a.date;
                    const endDate = a.to_date || a.date;
                    const isRange = startDate && endDate && startDate !== endDate;
                    return (
                      <div key={a.id || a.title} className="p-3 rounded-xl bg-surface border border-borderLine text-xs space-y-2 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300">
                              {a.level || 'Workshop'} {a.role_type && `• ${a.role_type}`}
                            </span>
                            {a.academic_year && (
                              <span className="text-[10px] font-bold text-pink-600">{a.academic_year}</span>
                            )}
                          </div>
                          <p className="font-bold text-textPrimary line-clamp-2">{a.title}</p>
                          <p className="text-[11px] text-textSecondary"><span className="font-medium">Organizer:</span> {a.organizer}</p>
                        </div>
                        <div className="pt-2 border-t border-borderLine/50 flex items-center justify-between text-[10px]">
                          <span className="text-textSecondary">
                            {isRange ? `${startDate} to ${endDate}` : startDate || 'Date N/A'}
                            {a.no_of_days > 0 && <span className="ml-1 font-bold text-pink-600">({a.no_of_days} days)</span>}
                          </span>
                          {a.document_url && (
                            <a
                              href={a.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-primary font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Certificate</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No workshop records recorded yet.</p>
                </div>
              )
            )}

            {/* Content: Certifications */}
            {activeOverviewCard === 'certifications' && (
              academicStats.certList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {academicStats.certList.map((c: any) => (
                    <div key={c.id || c.title} className="p-3 rounded-xl bg-surface border border-borderLine text-xs space-y-1.5 flex flex-col justify-between">
                      <div>
                        {c.academic_year && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                            {c.academic_year}
                          </span>
                        )}
                        <p className="font-bold text-textPrimary mt-1 line-clamp-2">{c.title}</p>
                        <p className="text-[11px] text-brand-primary font-medium">{c.issuing_body}</p>
                      </div>
                      <div className="pt-2 border-t border-borderLine/50 flex items-center justify-between text-[10px] text-textSecondary">
                        <span>Completed: {c.completion_date || 'N/A'}</span>
                        {c.certificate_url && (
                          <a
                            href={c.certificate_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-primary font-bold hover:underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No certifications recorded yet.</p>
                </div>
              )
            )}

            {/* Content: Subjects Handled */}
            {activeOverviewCard === 'subjects' && (
              academicStats.subList.length > 0 ? (
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-borderLine rounded-xl bg-surface">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-2 text-textSecondary font-bold sticky top-0 border-b border-borderLine">
                      <tr>
                        <th className="py-2.5 px-3">Subject Name</th>
                        <th className="py-2.5 px-3">Year / Batch / Sem</th>
                        <th className="py-2.5 px-3">Sec</th>
                        <th className="py-2.5 px-3">Branch</th>
                        <th className="py-2.5 px-3 text-center">Reg / App</th>
                        <th className="py-2.5 px-3 text-center">Failed</th>
                        <th className="py-2.5 px-3 text-center">Pass %</th>
                        <th className="py-2.5 px-3 text-center">Highest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {academicStats.subList.map((s: any, idx: number) => {
                        const passPct = Number(s.pass_percentage) || 0;
                        const passBadgeColor =
                          passPct >= 85
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : passPct >= 65
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';

                        return (
                          <tr key={s.id || idx} className="hover:bg-surface-2/60 transition-colors">
                            <td className="py-2 px-3 font-bold text-textPrimary">
                              {s.subject}
                            </td>
                            <td className="py-2 px-3 text-textSecondary">{s.year_batch || '—'}</td>
                            <td className="py-2 px-3 font-semibold text-textPrimary">{s.section || '—'}</td>
                            <td className="py-2 px-3 text-textSecondary">{s.branch || '—'}</td>
                            <td className="py-2 px-3 text-center text-textSecondary">
                              {s.registered || '—'} / {s.appeared || '—'}
                            </td>
                            <td className="py-2 px-3 text-center font-semibold text-rose-600">
                              {s.failed ?? 0}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded font-black text-[11px] ${passBadgeColor}`}>
                                {s.pass_percentage != null ? `${s.pass_percentage}%` : '—'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-bold text-brand-primary">
                              {s.highest_marks != null ? s.highest_marks : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-textSecondary">
                  <p>No subject performance records added yet.</p>
                  <p className="mt-1">Add subject results and pass percentages in the Profile tab under Subjects Handled.</p>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Sub-Tab Switcher */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <nav className="flex px-2 pt-2 pb-0 gap-1 border-b border-borderLine">
            <button
              onClick={() => setSearchParams({ tab: 'mentees' })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                activeTab === 'mentees'
                  ? 'border-brand-primary text-brand-primary bg-brand-soft'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
              }`}
            >
              <span>Assigned Mentee Directory ({mentees.length})</span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'attendance' })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                activeTab === 'attendance'
                  ? 'border-brand-primary text-brand-primary bg-brand-soft'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
              }`}
            >
              <span>📋 Attendance Records</span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'leaves' })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                activeTab === 'leaves'
                  ? 'border-brand-primary text-brand-primary bg-brand-soft'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
              }`}
            >
              <span>🌴 Leave & Duties</span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'profile' })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                activeTab === 'profile'
                  ? 'border-brand-primary text-brand-primary bg-brand-soft'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>My Faculty Profile</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  completionInfo.isComplete
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {completionInfo.percentage}%
              </span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'analytics' })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                activeTab === 'analytics'
                  ? 'border-brand-primary text-brand-primary bg-brand-soft'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
              }`}
            >
              <span>Department CGPA Analytics</span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'placement' })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                activeTab === 'placement'
                  ? 'border-brand-primary text-brand-primary bg-brand-soft'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
              }`}
            >
              <span>🎯 Placement Eligibility (T&P Drive)</span>
            </button>
            {inchargeSections.length > 0 && (
              <button
                onClick={() => setSearchParams({ tab: 'incharge' })}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all rounded-t-lg ${
                  activeTab === 'incharge'
                    ? 'border-pink-500 text-pink-500 bg-pink-500/10'
                    : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-pink-500" />
                <span>Class Incharge ({inchargeSections.length} Sections)</span>
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* Tab: Class Incharge Section Intelligence (1st-Year Only) */}
      {activeTab === 'incharge' && activeIncharge && (
        <div className="space-y-6">
          {/* Section Picker if assigned to multiple */}
          {inchargeSections.length > 1 && (
            <div className="flex gap-2 bg-surface-2 p-1.5 rounded-xl border border-borderLine max-w-md">
              {inchargeSections.map((sec: any, idx: number) => (
                <button
                  key={sec.id}
                  onClick={() => setSelectedInchargeIdx(idx)}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
                    selectedInchargeIdx === idx
                      ? 'bg-pink-600 text-white shadow-sm'
                      : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  {sec.department} Sem {sec.semester_label} (Sec {sec.section})
                </button>
              ))}
            </div>
          )}

          {/* Section Hero Banner */}
          <div className="bg-gradient-to-r from-pink-950/30 via-surface to-surface border border-pink-500/30 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 text-pink-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Award className="w-3.5 h-3.5" />
                Official 1st-Year Class Incharge Intelligence
              </div>
              <h2 className="text-xl md:text-2xl font-black text-textPrimary">
                {activeIncharge.department} — Semester {activeIncharge.semester_label} (Section {activeIncharge.section})
              </h2>
              <p className="text-xs text-textSecondary mt-1">
                Full view-only oversight across all theory and lab subjects, aggregate student attendance, and risk alerts for this section.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-surface-2 px-4 py-2.5 rounded-xl border border-borderLine text-center">
                <span className="text-[10px] uppercase font-bold text-textSecondary block">Section Attendance Avg</span>
                <span className="text-xl font-black text-pink-400">
                  {inchargeAnalytics?.sectionAverage || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Low Attendance Warning Alert */}
          {inchargeAnalytics?.lowAttendanceCount > 0 && (
            <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-red-300">
                  Attendance Deficit Warning: {inchargeAnalytics.lowAttendanceCount} Student(s) Below 75%
                </h4>
                <p className="text-[11px] text-textSecondary mt-0.5">
                  These 1st-year students require academic mentoring or parent notification to avoid condonation shortages.
                </p>
              </div>
            </div>
          )}

          {/* Section Subjects Matrix */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider">
              Enrolled Subjects in Section ({inchargeAnalytics?.subjects?.length || 0})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inchargeAnalytics?.subjects?.map((sub: any) => (
                <div key={sub.id} className="bg-surface-2 p-3 rounded-xl border border-borderLine text-xs">
                  <div className="font-bold text-textPrimary">{sub.subject_name}</div>
                  <div className="text-[11px] text-textSecondary mt-0.5">
                    Faculty: <span className="font-semibold text-brand-primary">{sub.faculty_name || sub.faculty_email}</span>
                  </div>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-background border border-borderLine text-[10px] font-bold text-textSecondary">
                    {sub.subject_type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section Students Table */}
          <div className="bg-surface border border-borderLine rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-borderLine flex items-center justify-between">
              <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider">
                Section Roster & Attendance Tracking ({inchargeAnalytics?.students?.length || 0} Students)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                  <tr>
                    <th className="py-3 px-4">Roll / Adm No</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4 text-center">Classes Held</th>
                    <th className="py-3 px-4 text-center">Attended</th>
                    <th className="py-3 px-4 text-center">Overall %</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {inchargeAnalyticsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-textMuted">
                        Loading section analytics...
                      </td>
                    </tr>
                  ) : !inchargeAnalytics?.students || inchargeAnalytics.students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-textMuted">
                        No students enrolled in this section yet.
                      </td>
                    </tr>
                  ) : (
                    inchargeAnalytics.students.map((st: any) => (
                      <tr key={st.roll_number} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-pink-400">
                          {st.roll_number}
                        </td>
                        <td className="py-3 px-4 font-bold text-textPrimary">
                          {st.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-textSecondary">
                          {st.email}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-textPrimary">
                          {st.total_held}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-400">
                          {st.total_attended}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-black ${
                              st.overall_percentage < 75 ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {st.overall_percentage}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {st.overall_percentage < 75 ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-[10px]">
                              Deficit (&lt;75%)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px]">
                              Normal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Attendance Records & Tracking */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <FacultyAttendancePage />
        </div>
      )}

      {/* Tab 1: Assigned Mentee Directory */}
      {activeTab === 'mentees' && (
        <div className="space-y-6">
          {/* Stat Cards — Total + Year Breakdown + Top GPA */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Mentees */}
        <StatCard
          icon={<Users className="w-5 h-5" />}
          iconBgColor="bg-brand-soft text-brand-primary"
          accentColor="brand"
          label="Total Mentees"
          value={mentees.length}
          subtext="Under your guidance"
        />
        {/* 1st Year */}
        <div
          role="button"
          tabIndex={0}
          title="Click to filter 1st Year mentees"
          onClick={() => setYearFilter(prev => prev === '1st Year' ? '' : '1st Year')}
          onKeyDown={e => e.key === 'Enter' && setYearFilter(prev => prev === '1st Year' ? '' : '1st Year')}
          className={`cursor-pointer rounded-xl transition-all ring-2 ${
            yearFilter === '1st Year' ? 'ring-yellow-400 scale-[1.03]' : 'ring-transparent hover:ring-yellow-200'
          }`}
        >
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            iconBgColor="bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
            accentColor="amber"
            label="1st Year"
            value={yearBreakdown['1st Year'] ?? 0}
            subtext={yearFilter === '1st Year' ? '▶ Filtered' : 'Click to filter'}
          />
        </div>
        {/* 2nd Year */}
        <div
          role="button"
          tabIndex={0}
          title="Click to filter 2nd Year mentees"
          onClick={() => setYearFilter(prev => prev === '2nd Year' ? '' : '2nd Year')}
          onKeyDown={e => e.key === 'Enter' && setYearFilter(prev => prev === '2nd Year' ? '' : '2nd Year')}
          className={`cursor-pointer rounded-xl transition-all ring-2 ${
            yearFilter === '2nd Year' ? 'ring-orange-400 scale-[1.03]' : 'ring-transparent hover:ring-orange-200'
          }`}
        >
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            iconBgColor="bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
            accentColor="amber"
            label="2nd Year"
            value={yearBreakdown['2nd Year'] ?? 0}
            subtext={yearFilter === '2nd Year' ? '▶ Filtered' : 'Click to filter'}
          />
        </div>
        {/* 3rd Year */}
        <div
          role="button"
          tabIndex={0}
          title="Click to filter 3rd Year mentees"
          onClick={() => setYearFilter(prev => prev === '3rd Year' ? '' : '3rd Year')}
          onKeyDown={e => e.key === 'Enter' && setYearFilter(prev => prev === '3rd Year' ? '' : '3rd Year')}
          className={`cursor-pointer rounded-xl transition-all ring-2 ${
            yearFilter === '3rd Year' ? 'ring-blue-400 scale-[1.03]' : 'ring-transparent hover:ring-blue-200'
          }`}
        >
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            iconBgColor="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            accentColor="indigo"
            label="3rd Year"
            value={yearBreakdown['3rd Year'] ?? 0}
            subtext={yearFilter === '3rd Year' ? '▶ Filtered' : 'Click to filter'}
          />
        </div>
        {/* 4th Year */}
        <div
          role="button"
          tabIndex={0}
          title="Click to filter 4th Year mentees"
          onClick={() => setYearFilter(prev => prev === '4th Year' ? '' : '4th Year')}
          onKeyDown={e => e.key === 'Enter' && setYearFilter(prev => prev === '4th Year' ? '' : '4th Year')}
          className={`cursor-pointer rounded-xl transition-all ring-2 ${
            yearFilter === '4th Year' ? 'ring-green-400 scale-[1.03]' : 'ring-transparent hover:ring-green-200'
          }`}
        >
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            iconBgColor="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            accentColor="success"
            label="4th Year"
            value={yearBreakdown['4th Year'] ?? 0}
            subtext={yearFilter === '4th Year' ? '▶ Filtered' : 'Click to filter'}
          />
        </div>
        {/* Top GPA */}
        <StatCard
          icon={<Award className="w-5 h-5" />}
          iconBgColor="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          accentColor="amber"
          label="Distinction (8.0+)"
          value={topStandingCount}
          subtext={`Avg GPA: ${realAvgGpa || '—'}`}
        />
      </div>

      {/* Mentee Directory — Year-Grouped */}
        <div className="bg-surface border border-borderLine rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-bold text-textPrimary">Assigned Mentee Directory</h3>
              <p className="text-xs text-textSecondary">Grouped by academic year — click a year to expand/collapse</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-borderLine bg-background text-xs w-56">
                <Search className="w-4 h-4 text-textSecondary shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or reg no..."
                  className="w-full bg-transparent focus:outline-none text-textPrimary"
                />
              </div>

              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary font-medium">
                <option value="">All Academic Years</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>

              <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary font-medium">
                <option value="">All Sections</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>
          </div>

          {filteredMentees.length === 0 && (
            <div className="py-12 text-center text-textSecondary text-xs">
              No mentees found matching the filters.
            </div>
          )}

          {/* Year Groups */}
          <div className="space-y-4">
            {groupedByYear.map(({ year, mentees: yearMentees }) => {
              const isCollapsed = collapsedYears.has(year);
              const atRiskCount = yearMentees.filter(m => Number((m as any).cgpa) > 0 && Number((m as any).cgpa) < 6.0).length;
              const avgCgpa = yearMentees.filter(m => Number((m as any).cgpa) > 0).length > 0
                ? (yearMentees.reduce((s, m) => s + Number((m as any).cgpa || 0), 0) / yearMentees.filter(m => Number((m as any).cgpa) > 0).length).toFixed(2)
                : '—';

              return (
                <div key={year} className="border border-borderLine rounded-xl overflow-hidden">
                  {/* Year Header */}
                  <button
                    onClick={() => toggleYear(year)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-background hover:bg-brand-soft/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-textPrimary">{year}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand-primary font-semibold">
                        {yearMentees.length} students
                      </span>
                      <span className="text-[11px] text-textSecondary">Avg CGPA: {avgCgpa}</span>
                      {atRiskCount > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold">
                          ⚠️ {atRiskCount} at risk
                        </span>
                      )}
                      {yearMentees.filter(m => !(m as any).registered).length > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold">
                          🕐 {yearMentees.filter(m => !(m as any).registered).length} not registered
                        </span>
                      )}
                    </div>
                    <span className="text-textSecondary text-sm">{isCollapsed ? '▶' : '▼'}</span>
                  </button>

                  {/* Mentee Table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-borderLine bg-background text-[11px] font-semibold text-textSecondary uppercase tracking-wider">
                            <th className="py-3 px-4">Student</th>
                            <th className="py-3 px-4">Registration No</th>
                            <th className="py-3 px-4">Dept / Batch / Sec</th>
                            <th className="py-3 px-4">CGPA</th>
                            <th className="py-3 px-4">Academic Standing</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLine text-sm">
                          {yearMentees.map((mentee) => {
                            const isRegistered = (mentee as any).registered !== false;

                            // Unregistered student row
                            if (!isRegistered) {
                              return (
                                <tr key={mentee.roll_number} className="bg-amber-50/30 hover:bg-amber-50/50 transition-colors">
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-bold flex items-center justify-center text-xs">?</div>
                                      <div>
                                        <p className="font-semibold text-amber-700 leading-tight text-xs">Not Registered Yet</p>
                                        <p className="text-[11px] text-amber-500">Student has not created an account</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 font-bold text-amber-600 text-xs">{mentee.roll_number}</td>
                                  <td className="py-3.5 px-4 text-xs text-textSecondary">—</td>
                                  <td className="py-3.5 px-4 text-xs text-textSecondary">—</td>
                                  <td className="py-3.5 px-4">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-amber-50 text-amber-600 border-amber-200">
                                      🕐 Pending Registration
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-right">
                                    <span className="text-[11px] text-textSecondary italic">No profile yet</span>
                                  </td>
                                </tr>
                              );
                            }

                            // Registered student row
                            const cgpa = Number((mentee as any).cgpa);
                            const isAtRisk = cgpa > 0 && cgpa < 6.0;
                            return (
                              <tr key={mentee.roll_number} className={`hover:bg-background/50 transition-colors ${isAtRisk ? 'bg-red-50/30' : ''}`}>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs ${isAtRisk ? 'bg-red-100 text-red-600' : 'bg-brand-primary text-white'}`}>
                                      {mentee.name.split(' ').map((n: string) => n[0]).join('')}
                                    </div>
                                    <div>
                                      <p className="font-semibold text-textPrimary leading-tight">
                                        {isAtRisk && <span title="At risk: CGPA below 6.0">⚠️ </span>}{mentee.name}
                                      </p>
                                      <p className="text-[11px] text-textSecondary">{mentee.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-bold text-brand-primary text-xs">{mentee.roll_number}</td>
                                <td className="py-3.5 px-4 text-xs">{mentee.department} • {mentee.batch} • Sec {mentee.section}</td>
                                <td className="py-3.5 px-4 text-sm font-bold text-textPrimary">{cgpa > 0 ? cgpa.toFixed(2) : '—'}</td>
                                <td className="py-3.5 px-4">
                                  {(() => {
                                    const standing = getStanding((mentee as any).cgpa);
                                    return (
                                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${standing.color}`}>
                                        {standing.label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setInspectMentee(mentee)}
                                      className="p-1.5 rounded-lg border border-borderLine text-brand-primary hover:bg-brand-soft"
                                      title="View 360° Profile"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => { setSelectedMentee(mentee); setRemarkInput(''); }}
                                      className="p-1.5 rounded-lg border border-borderLine text-textPrimary hover:bg-background"
                                      title="Add Faculty Remarks"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {/* Tab: Leave & Covering Duties */}
      {activeTab === 'leaves' && <FacultyLeaveTab />}

      {/* Tab: My Faculty Profile */}
      {activeTab === 'profile' && <FacultyProfileTab />}

      {/* Tab 2: Department Skill Analytics */}
      {activeTab === 'analytics' && (
        <div className="bg-surface border border-borderLine rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-textPrimary">Department Tech Skill Analytics ({user?.department || 'Department'})</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-background border border-borderLine rounded-xl">
              <h4 className="font-bold text-textPrimary mb-2">Top Verified Tools</h4>
              <ul className="space-y-1 text-textSecondary">
                <li>• Claude Code & CrewAI (5/5 rating)</li>
                <li>• React & TypeScript (5/5 rating)</li>
                <li>• AWS Lambda & S3 (4/5 rating)</li>
              </ul>
            </div>
            <div className="p-4 bg-background border border-borderLine rounded-xl">
              <h4 className="font-bold text-textPrimary mb-2">Academic Grade Breakdown</h4>
              <p className="text-textSecondary">O Grade: 45% students</p>
              <p className="text-textSecondary">A+ Grade: 40% students</p>
              <p className="text-textSecondary">A Grade: 15% students</p>
            </div>
            <div className="p-4 bg-background border border-borderLine rounded-xl">
              <h4 className="font-bold text-textPrimary mb-2">Attendance Average</h4>
              <p className="text-2xl font-black text-success">95.4%</p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Remarks Modal */}
      {selectedMentee && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-base font-bold text-textPrimary mb-1">Evaluate Mentee: {selectedMentee.name}</h3>
            <p className="text-xs text-textSecondary mb-4">Roll Number: {selectedMentee.roll_number}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Faculty / Mentor Remarks</label>
                <textarea
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                  rows={4}
                  placeholder="Enter academic observation, coding feedback, or performance notes..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <PillButton variant="outline" size="sm" onClick={() => setSelectedMentee(null)}>
                  Cancel
                </PillButton>
                <PillButton variant="primary" size="sm" onClick={handleSaveRemark} disabled={saving}>
                  Save Remarks
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mentee 360 Inspection Modal */}
      {inspectMentee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-4xl w-full shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button onClick={() => setInspectMentee(null)} className="absolute top-4 right-4 text-textSecondary hover:text-textPrimary p-2 rounded-full hover:bg-background">
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-borderLine pb-4 mb-6">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-brand-soft text-brand-primary">Faculty Mentee Inspection</span>
              <h3 className="text-xl font-bold text-textPrimary mt-1">
                Mentee 360° Profile: {inspectMentee.name} ({inspectMentee.roll_number})
              </h3>
              <p className="text-xs text-textSecondary">{inspectMentee.department} • {inspectMentee.year} • {inspectMentee.email}</p>
            </div>

            {/* Inspect Tabs Selector */}
            <div className="flex space-x-2 border-b border-borderLine pb-px mb-6 overflow-x-auto text-xs font-semibold">
              {['personal-info', 'academics', 'coding-profiles', 'tech-skills', 'certifications', 'soft-skills', 'achievements', 'placement-preferences'].map((t) => (
                <button
                  key={t}
                  onClick={() => setInspectTab(t)}
                  className={`px-3 py-2 rounded-t-lg transition-all capitalize whitespace-nowrap ${
                    inspectTab === t ? 'bg-brand-soft text-brand-primary font-bold border-b-2 border-brand-primary' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  {t === 'placement-preferences' ? 'Academic Goals' : t.replace('-', ' ')}
                </button>
              ))}
            </div>

            {/* Inspect Tab Body */}
            <div>
              {inspectTab === 'personal-info' && <PersonalInfoTab readOnly={true} student={inspectFullProfile ?? inspectMentee} onRefresh={refetch} />}
              {inspectTab === 'academics' && <AcademicsTab readOnly={true} academics={inspectAcademics} onRefresh={refetch} />}
              {inspectTab === 'coding-profiles' && (
                <CodingProfilesTab
                  studentName={inspectMentee.name}
                  studentRollNumber={inspectMentee.roll_number}
                  readOnly={true}
                  profiles={inspectCoding}
                  onRefresh={refetch}
                />
              )}
              {inspectTab === 'tech-skills' && <TechSkillsTab readOnly={true} skills={inspectSkills} onRefresh={refetch} />}
              {inspectTab === 'certifications' && <CertificationsTab readOnly={true} certifications={inspectCerts} onRefresh={refetch} />}
              {inspectTab === 'soft-skills' && <SoftSkillsTab readOnly={true} softSkills={inspectSoft} onRefresh={refetch} />}
              {inspectTab === 'achievements' && <AchievementsTab readOnly={true} achievements={inspectAchievements} onRefresh={refetch} />}
              {inspectTab === 'placement-preferences' && <PlacementPreferencesTab readOnly={true} placement={null} scoreData={null} onRefresh={refetch} />}
            </div>
          </div>
        </div>
      )}
      {/* Tab 3: Placement Eligibility Engine */}
      {activeTab === 'placement' && (
        <PlacementEligibilitySection students={mentees} />
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onSuccess={refetch}
      />

      {/* Manual photo upload modal triggered via camera button */}
      <ProfilePhotoUploadModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        role="faculty"
        userId={user?.email || ''}
        userName={user?.name || ''}
        currentPhotoUrl={facultyProfile?.personal?.photo_url}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
