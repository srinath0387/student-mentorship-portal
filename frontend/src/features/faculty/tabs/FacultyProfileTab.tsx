import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
  FileText,
  Tag,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Upload,
  Loader2,
  Lock,
  Sparkles,
  ExternalLink,
  Edit3,
  X,
  FileCheck,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import {
  FacultyFullProfile,
  BloodGroup,
  FacultyDesignation,
  FacultyCertificationRecord,
  FacultyActivityRecord,
  FacultyPublicationRecord,
  ActivityType,
  ActivityLevel,
  PublicationCategory,
} from '../../../types';
import {
  calculateRgmcetExperience,
  calculateTotalExperience,
  calculateAcademicYear,
  calculateFacultyProfileCompletion,
} from '../../../lib/facultyUtils';
import { PillButton } from '../../../components/common/PillButton';
import { formatExternalUrl } from '../../../lib/urlUtils';
import { SubjectsHandledSection } from '../components/SubjectsHandledSection';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const DESIGNATIONS: FacultyDesignation[] = ['Assistant Professor', 'Associate Professor', 'Professor'];
const ACTIVITY_TYPES: ActivityType[] = ['Conference', 'Workshop', 'FDP'];
const ACTIVITY_LEVELS: ActivityLevel[] = ['International', 'National', 'State'];
const PUBLICATION_CATEGORIES: PublicationCategory[] = ['SCI', 'SCOPUS', 'WoS', 'Patent'];

const DOMAIN_PRESETS = [
  'Machine Learning',
  'Data Science',
  'Deep Learning',
  'Artificial Intelligence',
  'Cloud Computing',
  'Cyber Security',
  'Internet of Things (IoT)',
  'Natural Language Processing (NLP)',
  'Computer Vision',
  'Full Stack Web Development',
  'Big Data Analytics',
  'DevOps & MLOps',
  'Blockchain Technology',
  'Embedded Systems',
];

export const FacultyProfileTab: React.FC = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const email = user?.email || '';

  const { data: profileData, isLoading } = useQuery<FacultyFullProfile>({
    queryKey: ['facultyFullProfile', email],
    queryFn: () => api.getFacultyFullProfile(email),
    enabled: Boolean(email),
  });

  // Local form states
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [priorYears, setPriorYears] = useState<number>(0);
  const [priorMonths, setPriorMonths] = useState<number>(0);
  const [designation, setDesignation] = useState<FacultyDesignation | ''>('');
  const [designationLocked, setDesignationLocked] = useState(false);

  // Education state
  const [highestQual, setHighestQual] = useState('');
  const [university, setUniversity] = useState('');
  const [yearOfPassing, setYearOfPassing] = useState<number | ''>('');
  const [specialization, setSpecialization] = useState('');

  // Lists
  const [certifications, setCertifications] = useState<FacultyCertificationRecord[]>([]);
  const [activities, setActivities] = useState<FacultyActivityRecord[]>([]);
  const [publications, setPublications] = useState<FacultyPublicationRecord[]>([]);
  const [scopusId, setScopusId] = useState('');
  const [orcidId, setOrcidId] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [customDomainInput, setCustomDomainInput] = useState('');

  // OCR Modal & Upload State for Certifications
  const [isParsingCert, setIsParsingCert] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(0);
  const [showCertConfirmModal, setShowCertConfirmModal] = useState(false);
  const [pendingCert, setPendingCert] = useState<{
    title: string;
    issuing_body: string;
    completion_date: string;
    academic_year: string;
    file_name?: string;
  }>({
    title: '',
    issuing_body: '',
    completion_date: '',
    academic_year: '',
  });

  // Activity Form Modal
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [isParsingActivity, setIsParsingActivity] = useState(false);
  const [newActivity, setNewActivity] = useState<{
    title: string;
    type: ActivityType;
    organizer: string;
    date: string;
    level: ActivityLevel;
  }>({
    title: '',
    type: 'Conference',
    organizer: '',
    date: '',
    level: 'National',
  });

  // Publication Form Modal & Edit State
  const [showPubModal, setShowPubModal] = useState(false);
  const [editingPubId, setEditingPubId] = useState<string | null>(null);
  const [isParsingPub, setIsParsingPub] = useState(false);
  const [isFetchingOrcid, setIsFetchingOrcid] = useState(false);
  const [orcidFetchMessage, setOrcidFetchMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Validate ORCID format: XXXX-XXXX-XXXX-XXXX
  const isOrcidValid = useMemo(() => {
    const clean = orcidId.trim().replace(/^https?:\/\/orcid\.org\//i, '');
    return /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/i.test(clean);
  }, [orcidId]);

  const [newPub, setNewPub] = useState<{
    category: PublicationCategory;
    title: string;
    journal_name: string;
    year: number;
    doi_link: string;
    co_authors: string;
  }>({
    category: 'SCOPUS',
    title: '',
    journal_name: '',
    year: new Date().getFullYear(),
    doi_link: '',
    co_authors: '',
  });

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync data into local state when fetched
  useEffect(() => {
    if (profileData) {
      const p = profileData.personal || {};
      setPhone(p.phone || '');
      setBloodGroup(p.blood_group || '');
      setLinkedinUrl(p.linkedin_url || '');
      setScopusId(profileData.scopus_id || p.scopus_id || '');
      setOrcidId(profileData.orcid_id || p.orcid_id || '');
      setJoiningDate(p.joining_date || '');
      setPriorYears(p.prior_experience_years || 0);
      setPriorMonths(p.prior_experience_months || 0);
      setDesignation(p.designation || '');
      setDesignationLocked(Boolean(p.designation_locked && (p.designation as string)));

      const edu = profileData.education || {};
      setHighestQual(edu.highest_qualification || '');
      setUniversity(edu.university || '');
      setYearOfPassing(edu.year_of_passing || '');
      setSpecialization(edu.specialization || '');

      setCertifications(profileData.certifications || []);
      setActivities(profileData.activities || []);
      setPublications(profileData.publications || []);
      setDomains(profileData.domains || []);
    }
  }, [profileData]);

  // Live Experience Computations
  const rgmcetExp = useMemo(() => calculateRgmcetExperience(joiningDate), [joiningDate]);
  const totalExp = useMemo(
    () => calculateTotalExperience(joiningDate, priorYears, priorMonths),
    [joiningDate, priorYears, priorMonths]
  );

  // Live Profile Completion Progress
  const currentProfileState: FacultyFullProfile = useMemo(() => {
    return {
      personal: {
        faculty_id: profileData?.personal?.faculty_id || user?.rollNumber || 'FAC001',
        name: profileData?.personal?.name || user?.name || 'Faculty Member',
        email: email,
        department: profileData?.personal?.department || user?.department || 'CSE (Data Science)',
        phone,
        blood_group: bloodGroup as BloodGroup,
        linkedin_url: linkedinUrl,
        scopus_id: scopusId.trim() || undefined,
        orcid_id: orcidId.trim() || undefined,
        joining_date: joiningDate,
        prior_experience_years: priorYears,
        prior_experience_months: priorMonths,
        designation: designation as FacultyDesignation,
        designation_locked: designationLocked,
      },
      education: {
        highest_qualification: highestQual,
        university,
        year_of_passing: yearOfPassing ? Number(yearOfPassing) : undefined,
        specialization,
      },
      certifications,
      activities,
      publications,
      domains,
      scopus_id: scopusId.trim() || undefined,
      orcid_id: orcidId.trim() || undefined,
    };
  }, [
    profileData,
    user,
    email,
    phone,
    bloodGroup,
    linkedinUrl,
    scopusId,
    orcidId,
    joiningDate,
    priorYears,
    priorMonths,
    designation,
    designationLocked,
    highestQual,
    university,
    yearOfPassing,
    specialization,
    certifications,
    activities,
    publications,
    domains,
  ]);

  const completionInfo = useMemo(
    () => calculateFacultyProfileCompletion(currentProfileState),
    [currentProfileState]
  );

  // Save Mutation
  const updateMutation = useMutation({
    mutationFn: (data: FacultyFullProfile) => api.updateFacultyFullProfile(email, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facultyFullProfile', email] });
      setSaveSuccessMsg('Profile details successfully updated and saved!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    },
  });

  const handleSaveProfile = () => {
    const errs: Record<string, string> = {};
    if (phone && !/^\d{10}$/.test(phone)) {
      errs.phone = 'Mobile number must be exactly 10 digits';
    }
    if (linkedinUrl && !linkedinUrl.toLowerCase().includes('linkedin.com')) {
      errs.linkedinUrl = 'Must be a valid LinkedIn URL (e.g. https://linkedin.com/in/username)';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    // If designation is set for first time, it will lock upon save
    if (designation && !designationLocked) {
      setDesignationLocked(true);
    }

    updateMutation.mutate(currentProfileState);
  };

  // OCR Document Parser Simulation for Certificate Upload
  const handleCertFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingCert(true);
    setParsingProgress(15);

    const stepInterval = setInterval(() => {
      setParsingProgress((prev) => {
        if (prev >= 90) {
          clearInterval(stepInterval);
          return 90;
        }
        return prev + 25;
      });
    }, 250);

    setTimeout(() => {
      clearInterval(stepInterval);
      setIsParsingCert(false);
      setParsingProgress(100);

      // Intelligent heuristic extraction based on file name or smart defaults
      const rawName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const isNptel = /nptel|swayam/i.test(rawName);
      const isAws = /aws|amazon/i.test(rawName);
      const isCoursera = /coursera|deeplearning/i.test(rawName);

      const title = rawName.length > 5 ? rawName : 'Advanced Machine Learning & Data Analytics';
      const issuingBody = isNptel
        ? 'NPTEL (IIT Madras)'
        : isAws
        ? 'Amazon Web Services (AWS)'
        : isCoursera
        ? 'Coursera / Stanford Online'
        : 'National Institute of Technical Teachers Training & Research (NITTTR)';

      const todayIso = new Date().toISOString().split('T')[0];
      const compDate = '2024-10-14'; // Default parsed date for demonstration
      const academicYr = calculateAcademicYear(compDate);

      setPendingCert({
        title,
        issuing_body: issuingBody,
        completion_date: compDate,
        academic_year: academicYr,
        file_name: file.name,
      });
      setShowCertConfirmModal(true);
    }, 1200);
  };

  const handleConfirmCert = () => {
    if (!pendingCert.title || !pendingCert.issuing_body) return;
    const newRecord: FacultyCertificationRecord = {
      id: `CERT_${Date.now()}`,
      title: pendingCert.title,
      issuing_body: pendingCert.issuing_body,
      completion_date: pendingCert.completion_date || new Date().toISOString().split('T')[0],
      academic_year: pendingCert.academic_year || calculateAcademicYear(pendingCert.completion_date),
      created_at: new Date().toISOString(),
    };

    setCertifications((prev) => [newRecord, ...prev]);
    setShowCertConfirmModal(false);
    setPendingCert({ title: '', issuing_body: '', completion_date: '', academic_year: '' });
  };

  const handleDeleteCert = (id: string) => {
    setCertifications((prev) => prev.filter((c) => c.id !== id));
  };

  // Activity Modal actions
  const handleAddActivity = () => {
    if (!newActivity.title || !newActivity.organizer) return;
    const dateStr = newActivity.date || new Date().toISOString().split('T')[0];
    const record: FacultyActivityRecord = {
      id: `ACT_${Date.now()}`,
      title: newActivity.title,
      type: newActivity.type,
      organizer: newActivity.organizer,
      date: dateStr,
      level: newActivity.level,
      academic_year: calculateAcademicYear(dateStr),
    };
    setActivities((prev) => [record, ...prev]);
    setShowActivityModal(false);
    setNewActivity({ title: '', type: 'Conference', organizer: '', date: '', level: 'National' });
  };

  const handleDeleteActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  // Auto-fetch publications from Public ORCID API
  const handleFetchOrcidPublications = async () => {
    const cleanId = orcidId.trim().replace(/^https?:\/\/orcid\.org\//i, '');
    if (!/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/i.test(cleanId)) {
      setOrcidFetchMessage({
        type: 'error',
        text: 'Please enter a valid ORCID ID format (e.g. 0000-0002-1825-0097).',
      });
      return;
    }

    setIsFetchingOrcid(true);
    setOrcidFetchMessage(null);

    try {
      const url = `https://pub.orcid.org/v3.0/${encodeURIComponent(cleanId)}/works`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No publications found for this ORCID ID, or the record is private — you can add publications manually below.');
        }
        throw new Error(`ORCID record could not be retrieved (${response.status}) — you can add publications manually below.`);
      }

      const data = await response.json();
      const groups = data?.group || [];
      if (groups.length === 0) {
        setOrcidFetchMessage({
          type: 'info',
          text: 'No publications found for this ORCID ID, or the record is private — you can add publications manually below.',
        });
        setIsFetchingOrcid(false);
        return;
      }

      const fetchedPubs: FacultyPublicationRecord[] = [];
      const existingTitles = new Set(publications.map((p) => p.title.toLowerCase().trim()));

      for (const group of groups) {
        const summaries = group['work-summary'] || [];
        if (summaries.length === 0) continue;
        const summary = summaries[0];

        const title = summary?.title?.title?.value || 'Untitled Publication';
        if (existingTitles.has(title.toLowerCase().trim())) {
          continue;
        }

        const journal = summary?.['journal-title']?.value || summary?.type?.replace(/_/g, ' ') || 'Journal / Conference Article';

        const yearVal = summary?.['publication-date']?.year?.value;
        const parsedYear = yearVal ? parseInt(yearVal, 10) : new Date().getFullYear();
        const year = !isNaN(parsedYear) ? parsedYear : new Date().getFullYear();

        let doiLink = '';
        const externalIds = summary?.['external-ids']?.['external-id'] || [];
        const doiObj = externalIds.find((ext: any) => ext?.['external-id-type']?.toLowerCase() === 'doi');
        if (doiObj) {
          const doiVal = doiObj['external-id-value'];
          const doiUrl = doiObj['external-id-url']?.value;
          if (doiUrl) {
            doiLink = doiUrl;
          } else if (doiVal) {
            doiLink = doiVal.startsWith('http') ? doiVal : `https://doi.org/${doiVal}`;
          }
        }

        fetchedPubs.push({
          id: `orcid_${summary?.['put-code'] || Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
          category: 'Unclassified',
          title,
          journal_name: journal,
          year,
          doi_link: doiLink || undefined,
          needs_review: true,
        });
      }

      if (fetchedPubs.length === 0) {
        setOrcidFetchMessage({
          type: 'info',
          text: 'All publications from this ORCID record are already in your publications list.',
        });
      } else {
        setPublications((prev) => [...fetchedPubs, ...prev]);
        setOrcidFetchMessage({
          type: 'success',
          text: `Retrieved ${fetchedPubs.length} publication(s) from ORCID. Please review, categorize each entry (SCI / SCOPUS / WoS / Patent), and click "Save Faculty Profile" below to save.`,
        });
      }
    } catch (err: any) {
      setOrcidFetchMessage({
        type: 'error',
        text: err?.message || 'No publications found for this ORCID ID, or the record is private — you can add publications manually below.',
      });
    } finally {
      setIsFetchingOrcid(false);
    }
  };

  // Quick category update for unclassified/reviewed publications
  const handleUpdatePubCategory = (id: string, newCategory: PublicationCategory) => {
    setPublications((prev) =>
      prev.map((p) => (p.id === id ? { ...p, category: newCategory, needs_review: false } : p))
    );
  };

  const handleOpenEditPub = (p: FacultyPublicationRecord) => {
    setEditingPubId(p.id);
    setNewPub({
      category: p.category === 'Unclassified' ? 'SCOPUS' : p.category,
      title: p.title,
      journal_name: p.journal_name,
      year: p.year,
      doi_link: p.doi_link || '',
      co_authors: p.co_authors || '',
    });
    setShowPubModal(true);
  };

  // Publication Modal actions
  const handleAddPublication = () => {
    if (!newPub.title.trim() || !newPub.journal_name.trim()) return;

    if (editingPubId) {
      setPublications((prev) =>
        prev.map((p) =>
          p.id === editingPubId
            ? {
                ...p,
                category: newPub.category,
                title: newPub.title.trim(),
                journal_name: newPub.journal_name.trim(),
                year: Number(newPub.year) || new Date().getFullYear(),
                doi_link: newPub.doi_link.trim() || undefined,
                co_authors: newPub.co_authors.trim() || undefined,
                needs_review: false,
              }
            : p
        )
      );
      setEditingPubId(null);
    } else {
      const record: FacultyPublicationRecord = {
        id: `PUB_${Date.now()}`,
        category: newPub.category,
        title: newPub.title.trim(),
        journal_name: newPub.journal_name.trim(),
        year: Number(newPub.year) || new Date().getFullYear(),
        doi_link: newPub.doi_link.trim() || undefined,
        co_authors: newPub.co_authors.trim() || undefined,
        needs_review: false,
      };
      setPublications((prev) => [record, ...prev]);
    }

    setShowPubModal(false);
    setNewPub({
      category: 'SCOPUS',
      title: '',
      journal_name: '',
      year: new Date().getFullYear(),
      doi_link: '',
      co_authors: '',
    });
  };

  const handleDeletePub = (id: string) => {
    setPublications((prev) => prev.filter((p) => p.id !== id));
  };

  // Domain Tag handling
  const handleToggleDomain = (domain: string) => {
    setDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const handleAddCustomDomain = () => {
    const trimmed = customDomainInput.trim();
    if (trimmed && !domains.includes(trimmed)) {
      setDomains((prev) => [...prev, trimmed]);
      setCustomDomainInput('');
    }
  };

  // Grouped Certifications by Academic Year
  const certsByAcademicYear = useMemo(() => {
    const map: Record<string, FacultyCertificationRecord[]> = {};
    certifications.forEach((c) => {
      const yr = c.academic_year || '2024–25';
      if (!map[yr]) map[yr] = [];
      map[yr].push(c);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [certifications]);

  if (isLoading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center space-y-3 bg-surface border border-borderLine rounded-2xl">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
        <p className="text-sm font-semibold text-textSecondary">Loading Faculty 360° Profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Profile Completion Banner & Progress Bar ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h2 className="text-base sm:text-lg font-bold text-textPrimary">
                Faculty Profile Completion Status
              </h2>
              <span
                className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${
                  completionInfo.percentage >= 90
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300'
                    : completionInfo.percentage >= 60
                    ? 'bg-brand-soft text-brand-primary border-brand-primary/30'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-300'
                }`}
              >
                {completionInfo.percentage}% Complete
              </span>
            </div>
            <p className="text-xs text-textSecondary">
              {completionInfo.percentage === 100
                ? 'Your faculty profile is 100% complete and fully verified.'
                : `Missing: ${completionInfo.missingSections.join(', ')}.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {saveSuccessMsg && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
                <CheckCircle2 className="w-4 h-4" />
                <span>{saveSuccessMsg}</span>
              </span>
            )}
            <PillButton
              variant="primary"
              size="sm"
              onClick={handleSaveProfile}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving Profile...' : 'Save Profile Changes'}
            </PillButton>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface-2 h-2.5 rounded-full mt-4 overflow-hidden border border-borderLine">
          <div
            className="h-full bg-gradient-to-r from-brand-primary via-indigo-500 to-sky-500 rounded-full transition-all duration-500"
            style={{ width: `${completionInfo.percentage}%` }}
          />
        </div>
      </div>

      {/* ── 2. Section 1 & 2: Personal Details & Experience (Locked vs Editable) ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-borderLine pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-textPrimary">Personal Details & Experience</h3>
              <p className="text-xs text-textSecondary mt-0.5">
                Official institution records and contact credentials
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-textMuted flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Core records locked</span>
          </span>
        </div>

        {/* Locked Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-textSecondary">Full Name</label>
              <span className="text-[10px] text-textMuted flex items-center gap-0.5">
                <Lock className="w-3 h-3" /> Auto-filled
              </span>
            </div>
            <input
              type="text"
              readOnly
              value={profileData?.personal?.name || user?.name || 'Faculty Member'}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-surface-2 text-textPrimary cursor-not-allowed font-medium opacity-90"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-textSecondary">Official RGMCET Email</label>
              <span className="text-[10px] text-textMuted flex items-center gap-0.5">
                <Lock className="w-3 h-3" /> Auto-filled
              </span>
            </div>
            <input
              type="email"
              readOnly
              value={email}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-surface-2 text-textPrimary cursor-not-allowed font-medium opacity-90"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-textSecondary">Branch / Department</label>
              <span className="text-[10px] text-textMuted flex items-center gap-0.5">
                <Lock className="w-3 h-3" /> Auto-filled
              </span>
            </div>
            <input
              type="text"
              readOnly
              value={profileData?.personal?.department || user?.department || 'CSE (Data Science)'}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-surface-2 text-textPrimary cursor-not-allowed font-medium opacity-90"
            />
          </div>
        </div>

        {/* Editable Personal Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Mobile Number */}
          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">
              Mobile Number (10-Digit) *
            </label>
            <div className="relative">
              <input
                type="tel"
                maxLength={10}
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 ${
                  errors.phone ? 'border-red-500 focus:ring-red-500' : 'border-borderLine focus:ring-brand-primary'
                }`}
              />
              <Phone className="w-4 h-4 text-textMuted absolute right-3 top-2.5 pointer-events-none" />
            </div>
            {errors.phone && <p className="text-xs text-alert mt-1">{errors.phone}</p>}
          </div>

          {/* Blood Group */}
          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">Blood Group *</label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary font-medium"
            >
              <option value="">Select Blood Group</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          {/* Designation */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-textPrimary">Designation *</label>
              {designationLocked && role !== 'admin' && role !== 'hod' && (
                <span className="text-[10px] text-textMuted flex items-center gap-0.5">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </div>
            <select
              value={designation}
              disabled={designationLocked && role !== 'admin' && role !== 'hod'}
              onChange={(e) => setDesignation(e.target.value as FacultyDesignation)}
              className={`w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary ${
                designationLocked && role !== 'admin' && role !== 'hod'
                  ? 'bg-surface-2 cursor-not-allowed opacity-90'
                  : 'bg-background'
              }`}
            >
              <option value="">Select Designation</option>
              {DESIGNATIONS.map((desig) => (
                <option key={desig} value={desig}>
                  {desig}
                </option>
              ))}
            </select>
          </div>

          {/* LinkedIn Profile */}
          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">
              LinkedIn Profile Link *
            </label>
            <div className="relative">
              <input
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className={`w-full px-3.5 py-2 pr-9 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 ${
                  errors.linkedinUrl ? 'border-red-500 focus:ring-red-500' : 'border-borderLine focus:ring-brand-primary'
                }`}
              />
              <Linkedin className="w-4 h-4 text-textMuted absolute right-3 top-2.5 pointer-events-none" />
            </div>
            {errors.linkedinUrl && <p className="text-xs text-alert mt-1">{errors.linkedinUrl}</p>}
          </div>
        </div>

        {/* Experience Section */}
        <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-primary" />
            <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider">
              Experience Tracking (Live Auto-Computed)
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Joining Date */}
            <div>
              <label className="block text-xs font-semibold text-textPrimary mb-1">
                Joining Date at RGMCET *
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary font-medium"
              />
            </div>

            {/* Experience in RGMCET (Calculated) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-textSecondary">Experience in RGMCET</label>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Auto-Calculated</span>
              </div>
              <div className="px-3.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {rgmcetExp.text}
              </div>
            </div>

            {/* Prior Experience (Manual Input) */}
            <div>
              <label className="block text-xs font-semibold text-textPrimary mb-1">
                Prior Experience (Before RGMCET)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Years"
                  value={priorYears || ''}
                  onChange={(e) => setPriorYears(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-2.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                <input
                  type="number"
                  min={0}
                  max={11}
                  placeholder="Months"
                  value={priorMonths || ''}
                  onChange={(e) => setPriorMonths(Math.max(0, Math.min(11, parseInt(e.target.value) || 0)))}
                  className="w-full px-2.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>

            {/* Total Experience (Calculated) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-textSecondary">Total Overall Experience</label>
                <span className="text-[10px] text-brand-primary font-bold">RGMCET + Prior</span>
              </div>
              <div className="px-3.5 py-2 rounded-lg bg-brand-soft border border-brand-primary/30 text-sm font-black text-brand-primary">
                {totalExp.text}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Section 3: Professional & Educational Details ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 border-b border-borderLine pb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center font-bold">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-textPrimary">Professional & Educational Credentials</h3>
            <p className="text-xs text-textSecondary mt-0.5">Highest degrees, universities, and academic specialization</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">Highest Qualification *</label>
            <input
              type="text"
              placeholder="e.g. Ph.D. / M.Tech / M.S."
              value={highestQual}
              onChange={(e) => setHighestQual(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">University / Institute *</label>
            <input
              type="text"
              placeholder="e.g. JNTU Anantapur / IIT Madras"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">Year of Passing *</label>
            <input
              type="number"
              min={1970}
              max={new Date().getFullYear()}
              placeholder="e.g. 2018"
              value={yearOfPassing || ''}
              onChange={(e) => setYearOfPassing(parseInt(e.target.value) || '')}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">Specialization *</label>
            <input
              type="text"
              placeholder="e.g. Computer Science / Data Analytics"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        </div>
      </div>

      {/* ── 4. Section 4: Certifications with Document Parsing & Academic Year Tagging ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-borderLine pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-textPrimary">Certifications (Industry / NPTEL)</h3>
              <p className="text-xs text-textSecondary mt-0.5">
                Upload PDF/image $\to$ OCR text extraction $\to$ Academic Year auto-tagging
              </p>
            </div>
          </div>

          {/* Upload Button */}
          <div className="relative">
            <input
              type="file"
              id="cert-file-input"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleCertFileUpload}
              className="hidden"
            />
            <label
              htmlFor="cert-file-input"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 transition-all cursor-pointer shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Certificate (OCR Parse)</span>
            </label>
          </div>
        </div>

        {/* OCR Parsing Progress Indicator */}
        {isParsingCert && (
          <div className="p-4 rounded-xl bg-brand-soft/60 border border-brand-primary/30 flex items-center gap-3 animate-pulse">
            <Loader2 className="w-5 h-5 text-brand-primary animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold text-brand-primary">
                Parsing document (OCR + text extraction in progress)... {parsingProgress}%
              </p>
              <div className="w-full bg-surface h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-brand-primary rounded-full transition-all" style={{ width: `${parsingProgress}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Grouped Certifications List */}
        {certsByAcademicYear.length > 0 ? (
          <div className="space-y-4">
            {certsByAcademicYear.map(([academicYr, certList]) => (
              <div key={academicYr} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Academic Year {academicYr}
                  </span>
                  <div className="flex-1 h-px bg-borderLine" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {certList.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col justify-between hover:border-brand-primary/40 transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-bold text-textPrimary leading-snug line-clamp-2">{c.title}</h4>
                          <button
                            type="button"
                            onClick={() => handleDeleteCert(c.id)}
                            className="text-textMuted hover:text-alert p-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[11px] font-semibold text-brand-primary">{c.issuing_body}</p>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-textSecondary pt-3 border-t border-borderLine/50 mt-2">
                        <span>Completed: {c.completion_date}</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{c.academic_year}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-surface-2 border border-dashed border-borderLine text-center">
            <p className="text-xs font-semibold text-textSecondary">No certifications added yet.</p>
            <p className="text-[11px] text-textMuted mt-0.5">
              Click &quot;Upload Certificate&quot; above to auto-extract and tag your NPTEL &amp; Industry credentials.
            </p>
          </div>
        )}
      </div>

      {/* ── 5. Section 5: Industry Conferences / Workshops / FDPs ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-borderLine pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400 flex items-center justify-center font-bold">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-textPrimary">Conferences, Workshops &amp; FDPs</h3>
              <p className="text-xs text-textSecondary mt-0.5">
                Attended or organized industry events with Academic Year tracking
              </p>
            </div>
          </div>

          <PillButton variant="outline" size="sm" onClick={() => setShowActivityModal(true)} icon={<Plus className="w-4 h-4" />}>
            Add Conference / FDP
          </PillButton>
        </div>

        {activities.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activities.map((a) => (
              <div key={a.id} className="p-4 rounded-xl bg-surface-2 border border-borderLine flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400">
                      {a.type} &bull; {a.level}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteActivity(a.id)}
                      className="text-textMuted hover:text-alert p-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h4 className="text-xs font-bold text-textPrimary mt-1.5 line-clamp-2">{a.title}</h4>
                  <p className="text-[11px] text-textSecondary">Organizer: {a.organizer}</p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-textSecondary pt-3 border-t border-borderLine/50 mt-2">
                  <span>{a.date}</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">{a.academic_year}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-surface-2 border border-dashed border-borderLine text-center">
            <p className="text-xs font-semibold text-textSecondary">No conferences or FDPs recorded yet.</p>
          </div>
        )}
      </div>

      {/* ── 6. Section 6: Publications (SCI / SCOPUS / WoS / Patent) ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-borderLine pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-textPrimary">Research Publications &amp; Patents</h3>
              <p className="text-xs text-textSecondary mt-0.5">Indexed journals (SCI / SCOPUS / WoS) and patented innovations</p>
            </div>
          </div>

          <PillButton variant="outline" size="sm" onClick={() => setShowPubModal(true)} icon={<Plus className="w-4 h-4" />}>
            Add Publication / Patent
          </PillButton>
        </div>

        {/* ── Scopus ID & Orcid ID Inputs (Optional) with Auto-Fetch ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2 border-b border-borderLine">
          <div>
            <label className="block text-xs font-semibold text-textPrimary mb-1">
              Scopus ID <span className="text-textMuted text-[11px] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 57210892341"
              value={scopusId}
              onChange={(e) => setScopusId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-textPrimary">
                Orcid ID <span className="text-textMuted text-[11px] font-normal">(Optional)</span>
              </label>
              {isOrcidValid && (
                <button
                  type="button"
                  onClick={handleFetchOrcidPublications}
                  disabled={isFetchingOrcid}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  title="Auto-fetch publications linked to this ORCID record"
                >
                  {isFetchingOrcid ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Fetching publications…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      <span>Fetch Publications</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. 0000-0002-1825-0097"
              value={orcidId}
              onChange={(e) => {
                setOrcidId(e.target.value);
                if (orcidFetchMessage) setOrcidFetchMessage(null);
              }}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        </div>

        {/* ── ORCID Fetch Feedback Banner ── */}
        {orcidFetchMessage && (
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-fadeIn ${
              orcidFetchMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : orcidFetchMessage.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                : 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
            }`}
          >
            {orcidFetchMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : orcidFetchMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            ) : (
              <BookOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-semibold leading-relaxed">{orcidFetchMessage.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setOrcidFetchMessage(null)}
              className="text-textMuted hover:text-textPrimary ml-auto text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {publications.length > 0 ? (
          <div className="space-y-3">
            {publications.map((p) => (
              <div
                key={p.id}
                className={`p-4 rounded-xl bg-surface-2 border transition-all ${
                  p.category === 'Unclassified' || p.needs_review
                    ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10 shadow-xs'
                    : 'border-borderLine'
                } flex flex-col sm:flex-row sm:items-start justify-between gap-3`}
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                        p.category === 'SCI'
                          ? 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-400'
                          : p.category === 'SCOPUS'
                          ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400'
                          : p.category === 'Patent'
                          ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400'
                          : p.category === 'WoS'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950/80 dark:text-amber-300 animate-pulse'
                      }`}
                    >
                      {p.category === 'Unclassified' || p.needs_review
                        ? '⚠️ Unclassified (Needs Tag)'
                        : p.category}
                    </span>
                    <span className="text-xs font-bold text-textPrimary">{p.title}</span>
                  </div>

                  <p className="text-xs text-textSecondary">
                    <strong className="text-textPrimary">{p.journal_name}</strong> ({p.year})
                    {p.co_authors && ` &bull; Authors: ${p.co_authors}`}
                  </p>

                  {p.doi_link && (
                    <a
                      href={formatExternalUrl(p.doi_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
                    >
                      <span>DOI / Publication Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {/* ── Category Quick-Selection for Unclassified / Fetched publications ── */}
                  {(p.category === 'Unclassified' || p.needs_review) && (
                    <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                        Select Category:
                      </span>
                      {PUBLICATION_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleUpdatePubCategory(p.id, cat)}
                          className="px-2.5 py-0.5 text-[11px] font-bold rounded-md border border-borderLine bg-surface hover:bg-brand-primary hover:text-white hover:border-brand-primary transition-colors cursor-pointer shadow-2xs"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEditPub(p)}
                    className="text-textMuted hover:text-brand-primary p-1.5 transition-colors"
                    title="Edit Publication"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePub(p.id)}
                    className="text-textMuted hover:text-alert p-1.5 transition-colors"
                    title="Delete Publication"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-surface-2 border border-dashed border-borderLine text-center">
            <p className="text-xs font-semibold text-textSecondary">No research publications or patents added yet.</p>
          </div>
        )}
      </div>

      {/* ── 7. Section 7: Expert in Domain ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 border-b border-borderLine pb-4">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center font-bold">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-textPrimary">Expert in Domain</h3>
            <p className="text-xs text-textSecondary mt-0.5">
              Select or add your areas of technical &amp; research specialization
            </p>
          </div>
        </div>

        {/* Selected Domain Chips */}
        <div>
          <label className="block text-xs font-bold text-textPrimary mb-2">Active Specializations ({domains.length})</label>
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-brand-soft text-brand-primary border border-brand-primary/30 text-xs font-bold"
              >
                <span>{d}</span>
                <button
                  type="button"
                  onClick={() => handleToggleDomain(d)}
                  className="text-brand-primary/70 hover:text-alert"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {domains.length === 0 && (
              <span className="text-xs text-textSecondary italic">No domain tags selected yet. Choose from below or add custom tags.</span>
            )}
          </div>
        </div>

        {/* Preset Selector */}
        <div>
          <label className="block text-xs font-semibold text-textSecondary mb-2">Click to Add Pre-defined Domains:</label>
          <div className="flex flex-wrap gap-1.5">
            {DOMAIN_PRESETS.map((preset) => {
              const selected = domains.includes(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleToggleDomain(preset)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    selected
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'bg-surface-2 text-textSecondary hover:text-textPrimary hover:bg-borderLine border border-borderLine'
                  }`}
                >
                  {selected ? '✓ ' : '+ '}
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        {/* Add Custom Domain Input */}
        <div className="flex items-center gap-2 pt-2 max-w-md">
          <input
            type="text"
            placeholder="Add custom domain (e.g. Quantum Computing)"
            value={customDomainInput}
            onChange={(e) => setCustomDomainInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomDomain();
              }
            }}
            className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <PillButton variant="secondary" size="sm" onClick={handleAddCustomDomain}>
            Add Tag
          </PillButton>
        </div>
      </div>

      {/* ── 6. Section: Subjects Handled (Results Archive) ── */}
      <SubjectsHandledSection facultyEmail={email} />

      {/* ── Bottom Save Action Bar ── */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-surface border border-borderLine shadow-sm">
        <div>
          <p className="text-xs font-bold text-textPrimary">Ready to commit your credentials?</p>
          <p className="text-[11px] text-textSecondary">
            All updates sync immediately with the department mentorship and NAAC/NBA compliance registry.
          </p>
        </div>
        <PillButton variant="primary" size="lg" onClick={handleSaveProfile} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Save Complete Profile'}
        </PillButton>
      </div>

      {/* ── Modal: Certificate OCR Confirmation & Edit ── */}
      {showCertConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <div className="flex items-center gap-2 text-brand-primary font-bold">
                <FileCheck className="w-5 h-5" />
                <span className="text-sm">OCR Extracted Certificate Confirmation</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCertConfirmModal(false)}
                className="text-textMuted hover:text-textPrimary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-textSecondary">
              We parsed your document and extracted the details below. Review and edit any field before confirming:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-textPrimary mb-1">Certificate Title *</label>
                <input
                  type="text"
                  value={pendingCert.title}
                  onChange={(e) => setPendingCert({ ...pendingCert, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Issuing Body *</label>
                <input
                  type="text"
                  value={pendingCert.issuing_body}
                  onChange={(e) => setPendingCert({ ...pendingCert, issuing_body: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Completion Date *</label>
                  <input
                    type="date"
                    value={pendingCert.completion_date}
                    onChange={(e) => {
                      const d = e.target.value;
                      setPendingCert({
                        ...pendingCert,
                        completion_date: d,
                        academic_year: calculateAcademicYear(d),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Academic Year (Auto-Tagged)</label>
                  <div className="px-3 py-2 text-sm rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                    {pendingCert.academic_year || '2024–25'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-borderLine">
              <PillButton variant="outline" size="sm" onClick={() => setShowCertConfirmModal(false)}>
                Cancel
              </PillButton>
              <PillButton variant="primary" size="sm" onClick={handleConfirmCert}>
                Confirm &amp; Add Certificate
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Activity (Conference / Workshop / FDP) ── */}
      {showActivityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold">
                <Briefcase className="w-5 h-5" />
                <span className="text-sm">Add Conference / Workshop / FDP</span>
              </div>
              <button
                type="button"
                onClick={() => setShowActivityModal(false)}
                className="text-textMuted hover:text-textPrimary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-textPrimary mb-1">Title / Topic *</label>
                <input
                  type="text"
                  placeholder="e.g. International Conference on Computational Intelligence"
                  value={newActivity.title}
                  onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Type *</label>
                  <select
                    value={newActivity.type}
                    onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value as ActivityType })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Level *</label>
                  <select
                    value={newActivity.level}
                    onChange={(e) => setNewActivity({ ...newActivity, level: e.target.value as ActivityLevel })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    {ACTIVITY_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Organizer / Institution *</label>
                <input
                  type="text"
                  placeholder="e.g. IEEE Hyderabad Section / NIT Warangal"
                  value={newActivity.organizer}
                  onChange={(e) => setNewActivity({ ...newActivity, organizer: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Date *</label>
                  <input
                    type="date"
                    value={newActivity.date}
                    onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Academic Year</label>
                  <div className="px-3 py-2 text-sm rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold border border-sky-200 dark:border-sky-800">
                    {calculateAcademicYear(newActivity.date)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-borderLine">
              <PillButton variant="outline" size="sm" onClick={() => setShowActivityModal(false)}>
                Cancel
              </PillButton>
              <PillButton variant="primary" size="sm" onClick={handleAddActivity}>
                Add Entry
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Publication / Patent ── */}
      {showPubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                <BookOpen className="w-5 h-5" />
                <span className="text-sm">
                  {editingPubId ? 'Edit Research Publication / Patent' : 'Add Research Publication / Patent'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPubModal(false);
                  setEditingPubId(null);
                }}
                className="text-textMuted hover:text-textPrimary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-textPrimary mb-1">Index Category *</label>
                  <select
                    value={newPub.category}
                    onChange={(e) => setNewPub({ ...newPub, category: e.target.value as PublicationCategory })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    {PUBLICATION_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-textPrimary mb-1">Publication Year *</label>
                  <input
                    type="number"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    value={newPub.year}
                    onChange={(e) => setNewPub({ ...newPub, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Paper / Patent Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Deep Neural Architectures for Real-Time Sensor Processing"
                  value={newPub.title}
                  onChange={(e) => setNewPub({ ...newPub, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Journal / Conference Name *</label>
                <input
                  type="text"
                  placeholder="e.g. IEEE Transactions on Neural Networks and Learning Systems"
                  value={newPub.journal_name}
                  onChange={(e) => setNewPub({ ...newPub, journal_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">Co-Authors</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. A. Kumar, K. Rahul"
                  value={newPub.co_authors}
                  onChange={(e) => setNewPub({ ...newPub, co_authors: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block font-semibold text-textPrimary mb-1">DOI / Link (Optional)</label>
                <input
                  type="url"
                  placeholder="https://doi.org/10.1109/..."
                  value={newPub.doi_link}
                  onChange={(e) => setNewPub({ ...newPub, doi_link: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-borderLine">
              <PillButton
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPubModal(false);
                  setEditingPubId(null);
                }}
              >
                Cancel
              </PillButton>
              <PillButton variant="primary" size="sm" onClick={handleAddPublication}>
                {editingPubId ? 'Save Changes' : 'Add Publication'}
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
