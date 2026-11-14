import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star, Trophy, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  RefreshCw, Loader2, AlertCircle, BookOpen, Users, Briefcase, Award, TrendingUp,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ApiScore {
  email: string;
  name: string;
  department: string;
  designation?: string;
  total_score: number;
  grade: string;
  pillars: {
    teaching: { score: number; max: number };
    research: { score: number; max: number };
    mentoring: { score: number; max: number };
    academic_duties: { score: number; max: number };
    industry: { score: number; max: number };
  };
}

interface PendingDuty {
  id: number;
  faculty_email: string;
  faculty_name?: string;
  faculty_dept?: string;
  duty_type: string;
  title: string;
  description?: string;
  duty_date: string;
  proof_url?: string;
  status: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function gradeColor(grade: string) {
  switch (grade) {
    case 'Excellent': return 'bg-green-100 text-green-700 border-green-200';
    case 'Good':      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Average':   return 'bg-amber-100 text-amber-700 border-amber-200';
    default:          return 'bg-red-100 text-red-700 border-red-200';
  }
}

function gradeBar(grade: string) {
  switch (grade) {
    case 'Excellent': return 'bg-green-500';
    case 'Good':      return 'bg-blue-500';
    case 'Average':   return 'bg-amber-500';
    default:          return 'bg-red-500';
  }
}

const PILLAR_META = [
  { key: 'teaching',       label: 'Teaching',        icon: <BookOpen className="w-3 h-3" />,  color: 'text-blue-600',  bg: 'bg-blue-500'   },
  { key: 'research',       label: 'Research',         icon: <TrendingUp className="w-3 h-3" />, color: 'text-purple-600', bg: 'bg-purple-500' },
  { key: 'mentoring',      label: 'Mentoring',        icon: <Users className="w-3 h-3" />,     color: 'text-green-600',  bg: 'bg-green-500'  },
  { key: 'academic_duties',label: 'Academic Duties',  icon: <Award className="w-3 h-3" />,     color: 'text-amber-600',  bg: 'bg-amber-500'  },
  { key: 'industry',       label: 'Industry',         icon: <Briefcase className="w-3 h-3" />, color: 'text-rose-600',   bg: 'bg-rose-500'   },
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export function FacultyApiPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = user?.isSuperAdmin === true || user?.department === '*';
  const userDept = isSuperAdmin ? '' : (user?.department || '');

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'pending'>('leaderboard');
  const [deptFilter, setDeptFilter] = useState(userDept);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Approve/reject state
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [pointsInput, setPointsInput] = useState<Record<number, string>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  // ── Leaderboard query ──────────────────────────────────────────────────────
  const { data: scores = [], isLoading: scoresLoading, refetch: refetchScores } = useQuery({
    queryKey: ['faculty-api-scores', deptFilter],
    queryFn: () => api.getFacultyApiScores(deptFilter ? { department: deptFilter } : undefined),
    staleTime: 60000,
    select: (data: any) => {
      const arr: ApiScore[] = Array.isArray(data) ? data : (data?.scores ?? []);
      return [...arr].sort((a, b) => b.total_score - a.total_score);
    },
  });

  // ── Pending duties query ───────────────────────────────────────────────────
  const { data: pending = [], isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['faculty-api-pending'],
    queryFn: () => api.getPendingFacultyDuties(),
    staleTime: 30000,
    select: (data: any) => Array.isArray(data) ? data : (data?.duties ?? []),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: ({ id, points }: { id: number; points?: number }) =>
      api.approveFacultyDuty(id, points),
    onSuccess: () => {
      setApprovingId(null);
      setActionError('');
      qc.invalidateQueries({ queryKey: ['faculty-api-pending'] });
      qc.invalidateQueries({ queryKey: ['faculty-api-scores'] });
    },
    onError: (err: any) => setActionError(err.message || 'Approval failed'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.rejectFacultyDuty(id, reason),
    onSuccess: () => {
      setRejectingId(null);
      setRejectReason('');
      setActionError('');
      qc.invalidateQueries({ queryKey: ['faculty-api-pending'] });
    },
    onError: (err: any) => setActionError(err.message || 'Rejection failed'),
  });

  // ── Leaderboard Tab ───────────────────────────────────────────────────────
  const LeaderboardTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        {isSuperAdmin ? (
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold"
          >
            <option value="">All Departments</option>
            {VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : (
          <span className="px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
            {userDept}
          </span>
        )}
        <button
          onClick={() => refetchScores()}
          className="ml-auto p-2 rounded-xl border border-borderLine hover:bg-surface-2 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5 text-textSecondary" />
        </button>
        <span className="text-xs text-textMuted font-semibold">
          {scores.length} faculty
        </span>
      </div>

      {scoresLoading ? (
        <div className="p-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-3" />
          <p className="text-sm text-textSecondary">Loading scores…</p>
        </div>
      ) : scores.length === 0 ? (
        <div className="p-16 text-center bg-surface border border-borderLine rounded-2xl">
          <Star className="w-10 h-10 text-textMuted mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold text-textSecondary">No API scores yet</p>
        </div>
      ) : (
        <div className="bg-surface border border-borderLine rounded-2xl overflow-x-auto shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine">
                <th className="px-4 py-3 text-left font-bold text-textSecondary w-8">#</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Faculty</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Dept</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Score / 100</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Grade</th>
                <th className="px-4 py-3 text-center font-bold text-textSecondary">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {scores.map((f, idx) => (
                <>
                  <tr
                    key={f.email}
                    className="hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => setExpandedEmail(expandedEmail === f.email ? null : f.email)}
                  >
                    <td className="px-4 py-3 font-black text-textMuted">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-textPrimary">{f.name || f.email}</p>
                      <p className="text-textMuted text-[10px]">{f.email}</p>
                    </td>
                    <td className="px-4 py-3 text-textSecondary">{f.department}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden border border-borderLine">
                          <div
                            className={`h-full rounded-full ${gradeBar(f.grade)}`}
                            style={{ width: `${Math.min(f.total_score, 100)}%` }}
                          />
                        </div>
                        <span className="font-black text-textPrimary">{f.total_score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${gradeColor(f.grade)}`}>
                        {f.grade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {expandedEmail === f.email
                        ? <ChevronUp className="w-4 h-4 text-textMuted mx-auto" />
                        : <ChevronDown className="w-4 h-4 text-textMuted mx-auto" />}
                    </td>
                  </tr>

                  {/* Expanded pillar breakdown */}
                  {expandedEmail === f.email && f.pillars && (
                    <tr key={`${f.email}-expanded`} className="bg-surface-2">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          {PILLAR_META.map(p => {
                            const pillar = f.pillars[p.key as keyof typeof f.pillars];
                            if (!pillar) return null;
                            const pct = pillar.max > 0 ? (pillar.score / pillar.max) * 100 : 0;
                            return (
                              <div key={p.key} className="bg-surface border border-borderLine rounded-xl p-3">
                                <div className={`flex items-center gap-1.5 mb-2 ${p.color} font-bold text-[10px] uppercase`}>
                                  {p.icon} {p.label}
                                </div>
                                <div className="text-sm font-black text-textPrimary">
                                  {pillar.score.toFixed(1)} <span className="text-xs font-normal text-textMuted">/ {pillar.max}</span>
                                </div>
                                <div className="mt-1.5 w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${p.bg}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Pending Approvals Tab ─────────────────────────────────────────────────
  const PendingTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-textMuted font-semibold">
          {(pending as PendingDuty[]).length} pending duties awaiting approval
        </span>
        <button
          onClick={() => refetchPending()}
          className="p-2 rounded-xl border border-borderLine hover:bg-surface-2 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5 text-textSecondary" />
        </button>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {actionError}
        </div>
      )}

      {pendingLoading ? (
        <div className="p-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-3" />
          <p className="text-sm text-textSecondary">Loading pending duties…</p>
        </div>
      ) : (pending as PendingDuty[]).length === 0 ? (
        <div className="p-16 text-center bg-surface border border-borderLine rounded-2xl">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold text-textSecondary">All duties reviewed — inbox is clear!</p>
        </div>
      ) : (
        <div className="bg-surface border border-borderLine rounded-2xl overflow-x-auto shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine">
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Faculty</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Duty Type</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Title</th>
                <th className="px-4 py-3 text-left font-bold text-textSecondary">Date</th>
                <th className="px-4 py-3 text-center font-bold text-textSecondary">Points</th>
                <th className="px-4 py-3 text-center font-bold text-textSecondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {(pending as PendingDuty[]).map((duty) => (
                <tr key={duty.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-bold text-textPrimary">{duty.faculty_name || duty.faculty_email}</p>
                    <p className="text-textMuted text-[10px]">{duty.faculty_dept}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                      {duty.duty_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-textPrimary max-w-[200px] truncate" title={duty.title}>{duty.title}</p>
                    {duty.description && <p className="text-textMuted text-[10px] max-w-[200px] truncate">{duty.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-textSecondary whitespace-nowrap">
                    {new Date(duty.duty_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      placeholder="Pts"
                      value={pointsInput[duty.id] ?? ''}
                      onChange={e => setPointsInput(prev => ({ ...prev, [duty.id]: e.target.value }))}
                      className="w-16 px-2 py-1 text-xs text-center rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {/* Approve */}
                      {approvingId === duty.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                      ) : (
                        <button
                          onClick={() => {
                            setApprovingId(duty.id);
                            setActionError('');
                            const pts = pointsInput[duty.id] ? Number(pointsInput[duty.id]) : undefined;
                            approveMut.mutate({ id: duty.id, points: pts });
                          }}
                          disabled={approveMut.isPending || rejectMut.isPending}
                          className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50"
                          title="Approve"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Reject */}
                      {rejectingId === duty.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Reason *"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            className="w-28 px-2 py-1 text-xs rounded-lg border border-red-300 focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              if (!rejectReason.trim()) { setActionError('Reason is required'); return; }
                              setActionError('');
                              rejectMut.mutate({ id: duty.id, reason: rejectReason.trim() });
                            }}
                            disabled={rejectMut.isPending}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            {rejectMut.isPending ? '…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                            className="text-textMuted hover:text-textPrimary"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setRejectingId(duty.id); setActionError(''); }}
                          disabled={approveMut.isPending || rejectMut.isPending}
                          className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}

                      {/* Proof link */}
                      {duty.proof_url && (
                        <a
                          href={duty.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-surface-2 text-textSecondary hover:text-brand-primary border border-borderLine transition-colors"
                          title="View Proof"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary flex items-center gap-2">
            <Star className="w-6 h-6 text-brand-primary" />
            Faculty API Score
          </h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Academic Performance Index — leaderboard & duty approvals
          </p>
        </div>
        {/* Pending badge */}
        {(pending as PendingDuty[]).length > 0 && (
          <button
            onClick={() => setActiveTab('pending')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors"
          >
            <AlertCircle className="w-4 h-4" />
            {(pending as PendingDuty[]).length} Pending
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-borderLine w-fit">
        {[
          { key: 'leaderboard', label: '🏆 Leaderboard' },
          { key: 'pending',     label: `⏳ Pending Approvals${(pending as PendingDuty[]).length > 0 ? ` (${(pending as PendingDuty[]).length})` : ''}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as typeof activeTab)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === t.key
                ? 'bg-surface shadow-sm text-brand-primary border border-borderLine'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'leaderboard' ? <LeaderboardTab /> : <PendingTab />}
    </div>
  );
}
