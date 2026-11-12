import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Star, TrendingUp, BookOpen, Users, Briefcase, Award,
  Plus, ChevronDown, ChevronUp, ExternalLink, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { DutyLogModal } from './DutyLogModal';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Pillar {
  label: string;
  score: number;
  max: number;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  breakdown?: string;
}

interface ApiScore {
  total_score: number;
  grade: string;
  pillars: {
    teaching: { score: number; max: number; workload: number; posting: number; attendance: number };
    research: { score: number; max: number; fdp: number; publications: number; certifications: number };
    mentoring: { score: number; max: number; sessions: number; at_risk_followups: number };
    academic_duties: { score: number; max: number };
    industry: { score: number; max: number };
  };
}

interface Duty {
  id: number;
  duty_type: string;
  title: string;
  description?: string;
  duty_date: string;
  proof_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  points_awarded?: number;
  reject_reason?: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function gradeStyle(grade: string) {
  switch (grade) {
    case 'Excellent':
      return { text: 'text-green-700', bg: 'bg-green-100', ring: 'ring-green-300', bar: 'bg-green-500' };
    case 'Good':
      return { text: 'text-blue-700', bg: 'bg-blue-100', ring: 'ring-blue-300', bar: 'bg-blue-500' };
    case 'Average':
      return { text: 'text-amber-700', bg: 'bg-amber-100', ring: 'ring-amber-300', bar: 'bg-amber-500' };
    default:
      return { text: 'text-red-700', bg: 'bg-red-100', ring: 'ring-red-300', bar: 'bg-red-500' };
  }
}

function gradeEmoji(grade: string) {
  switch (grade) {
    case 'Excellent': return '🏆';
    case 'Good': return '🎯';
    case 'Average': return '📊';
    default: return '📈';
  }
}

function statusBadge(status: string) {
  if (status === 'approved')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" />Approved</span>;
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle className="w-3 h-3" />Rejected</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Clock className="w-3 h-3" />Pending</span>;
}

// ── Pillar Progress Bar ───────────────────────────────────────────────────────
function PillarBar({ pillar }: { pillar: Pillar }) {
  const pct = Math.min((pillar.score / pillar.max) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <span className={`p-1 rounded-md ${pillar.bgColor}`}>{pillar.icon}</span>
          {pillar.label}
        </div>
        <span className="text-sm font-semibold text-gray-800">
          {pillar.score}<span className="text-gray-400 font-normal">/{pillar.max}</span>
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${pillar.color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pillar.breakdown && (
        <p className="text-xs text-gray-400 mt-1">{pillar.breakdown}</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  facultyEmail: string;
  readOnly?: boolean;
}

export function FacultyApiScoreCard({ facultyEmail, readOnly = false }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [showDuties, setShowDuties] = useState(false);

  const { data: scoreData, isLoading: scoreLoading, error: scoreError, refetch: refetchScore } = useQuery({
    queryKey: ['faculty-api-score', facultyEmail],
    queryFn: () => api.getFacultyApiScore(facultyEmail),
    enabled: !!facultyEmail,
  });

  const { data: dutiesData, isLoading: dutiesLoading, refetch: refetchDuties } = useQuery({
    queryKey: ['faculty-duties', facultyEmail],
    queryFn: () => api.getFacultyDuties(facultyEmail),
    enabled: !!facultyEmail && showDuties,
  });

  // fetchWithAuth returns the JSON body directly (no axios-style `.data` wrapper)
  const score: ApiScore | null = scoreData && typeof scoreData.total_score === 'number' ? scoreData : null;
  const duties: Duty[] = (Array.isArray(dutiesData?.duties) ? dutiesData.duties : [])
    .map((d: any) => ({ ...d, status: String(d.status || 'pending').toLowerCase() }));

  const handleDutySuccess = () => {
    refetchScore();
    refetchDuties();
  };

  if (scoreLoading) {
    return (
      <div className="bg-white dark:bg-surface rounded-2xl border border-gray-200 dark:border-borderLine shadow-sm p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading API Score…</p>
        </div>
      </div>
    );
  }

  if (scoreError || !score) {
    return (
      <div className="bg-white dark:bg-surface rounded-2xl border border-gray-200 dark:border-borderLine shadow-sm p-6 text-center text-sm text-gray-500 space-y-2">
        <p>Unable to load API score data.</p>
        {scoreError instanceof Error && <p className="text-xs text-gray-400">{scoreError.message}</p>}
        <button
          type="button"
          onClick={() => refetchScore()}
          className="text-xs font-bold text-brand-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const gs = gradeStyle(score.grade);

  const pillars: Pillar[] = [
    {
      label: 'Teaching & Learning',
      score: score.pillars.teaching.score,
      max: score.pillars.teaching.max,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      icon: <BookOpen className="w-3.5 h-3.5 text-blue-600" />,
      breakdown: `Workload ${score.pillars.teaching.workload}pt · Posting ${score.pillars.teaching.posting}pt · Att% ${score.pillars.teaching.attendance}pt`,
    },
    {
      label: 'Research & Certifications',
      score: score.pillars.research.score,
      max: score.pillars.research.max,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      icon: <TrendingUp className="w-3.5 h-3.5 text-purple-600" />,
      breakdown: `FDP ${score.pillars.research.fdp}pt · Publications ${score.pillars.research.publications}pt · Certs ${score.pillars.research.certifications}pt`,
    },
    {
      label: 'Mentoring',
      score: score.pillars.mentoring.score,
      max: score.pillars.mentoring.max,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      icon: <Users className="w-3.5 h-3.5 text-green-600" />,
      breakdown: `Sessions ${score.pillars.mentoring.sessions}pt · At-Risk Follow-up ${score.pillars.mentoring.at_risk_followups}pt`,
    },
    {
      label: 'Academic Duties',
      score: score.pillars.academic_duties.score,
      max: score.pillars.academic_duties.max,
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      icon: <Award className="w-3.5 h-3.5 text-amber-600" />,
      breakdown: 'NAAC · NBA · JNTU · Exam Duty (approved)',
    },
    {
      label: 'Industry & Professional',
      score: score.pillars.industry.score,
      max: score.pillars.industry.max,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      icon: <Briefcase className="w-3.5 h-3.5 text-orange-600" />,
      breakdown: 'Visits · Lectures · Workshops · FDP (approved)',
    },
  ];

  return (
    <>
      <div className="bg-white dark:bg-surface rounded-2xl border border-gray-200 dark:border-borderLine shadow-sm overflow-hidden">
        {/* Top Banner */}
        <div className={`px-6 py-5 ${gs.bg} border-b border-gray-100`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {/* Score Ring */}
              <div className={`relative w-24 h-24 flex-shrink-0`}>
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={score.grade === 'Excellent' ? '#16a34a' : score.grade === 'Good' ? '#2563eb' : score.grade === 'Average' ? '#d97706' : '#dc2626'}
                    strokeWidth="3"
                    strokeDasharray={`${score.total_score} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${gs.text}`}>{score.total_score}</span>
                  <span className="text-xs text-gray-500">/ 100</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Star className={`w-5 h-5 ${gs.text}`} />
                  <span className={`text-xl font-bold ${gs.text}`}>
                    {gradeEmoji(score.grade)} {score.grade}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Academic Performance Index</p>
                <p className="text-xs text-gray-400 mt-0.5">Auto-updated · Approval required for duties</p>
              </div>
            </div>

            {!readOnly && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Log a Duty
              </button>
            )}
          </div>
        </div>

        {/* Pillars */}
        <div className="p-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Score Breakdown</h3>
          {pillars.map(p => (
            <PillarBar key={p.label} pillar={p} />
          ))}
        </div>

        {/* Duties List */}
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowDuties(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>My Submitted Duties</span>
            {showDuties ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDuties && (
            <div className="px-6 pb-6">
              {dutiesLoading ? (
                <div className="text-center py-6 text-sm text-gray-400">Loading duties…</div>
              ) : duties.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No duties submitted yet.</p>
                  {!readOnly && (
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-3 text-indigo-600 text-sm hover:underline"
                    >
                      Submit your first duty →
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {duties.map((d: Duty) => (
                    <div
                      key={d.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 truncate">{d.title}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{d.duty_type}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">
                            {new Date(d.duty_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          {d.points_awarded != null && (
                            <span className="text-xs text-green-600 font-medium">+{d.points_awarded} pts</span>
                          )}
                          {d.reject_reason && (
                            <span className="text-xs text-red-500">Reason: {d.reject_reason}</span>
                          )}
                          {d.proof_url && (
                            <a
                              href={d.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5"
                            >
                              Proof <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">{statusBadge(d.status)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <DutyLogModal
          facultyEmail={facultyEmail}
          onClose={() => setShowModal(false)}
          onSuccess={handleDutySuccess}
        />
      )}
    </>
  );
}
