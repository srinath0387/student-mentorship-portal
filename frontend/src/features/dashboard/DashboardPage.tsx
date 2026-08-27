import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  Award,
  Code2,
  CheckCircle2,
  TrendingUp,
  Bell,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Github,
  BarChart2,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { calculateProfileCompletion } from '../../lib/profileCompletion';
import { GreetingHero } from '../../components/common/GreetingHero';
import { StatCard } from '../../components/common/StatCard';
import { NudgeCard } from '../../components/common/NudgeCard';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/common/EmptyState';
import { ProgressRing } from '../../components/common/ProgressRing';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const activeRollNo = user?.rollNumber || '';

  // Queries for real data — disabled when activeRollNo is empty to prevent malformed API calls (GAP-09)
  const { data: student } = useQuery({ queryKey: ['studentProfile', activeRollNo], queryFn: () => api.getStudentProfile(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: academics = [] } = useQuery({ queryKey: ['academics', activeRollNo], queryFn: () => api.getAcademics(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: codingProfiles = [] } = useQuery({ queryKey: ['codingProfiles', activeRollNo], queryFn: () => api.getCodingProfiles(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: techSkills = [] } = useQuery({ queryKey: ['techSkills', activeRollNo], queryFn: () => api.getTechSkills(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: certifications = [] } = useQuery({ queryKey: ['certifications', activeRollNo], queryFn: () => api.getCertifications(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: softSkills = [] } = useQuery({ queryKey: ['softSkills', activeRollNo], queryFn: () => api.getSoftSkills(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: achievements = [] } = useQuery({ queryKey: ['achievements', activeRollNo], queryFn: () => api.getAchievements(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: placement } = useQuery({ queryKey: ['placementProfile', activeRollNo], queryFn: () => api.getPlacementProfile(activeRollNo), enabled: Boolean(activeRollNo) });
  const { data: scoreData } = useQuery({ queryKey: ['employabilityScore', activeRollNo], queryFn: () => api.getEmployabilityScore(activeRollNo), enabled: Boolean(activeRollNo), staleTime: 0, refetchOnMount: 'always' });
  const { data: attendanceSummary } = useQuery({ queryKey: ['studentAttendanceSummary', activeRollNo], queryFn: () => api.getStudentAttendance(activeRollNo), enabled: Boolean(activeRollNo) });

  // Calculate live completion % & signature nudge cards using shared util
  const completionStatus = calculateProfileCompletion(
    student,
    academics,
    codingProfiles,
    techSkills,
    certifications,
    softSkills,
    achievements,
    placement
  );

  // Cumulative CGPA and Semester GPA analytics (robust parsing for strings/numbers from DB)
  const validAcademics = (academics || [])
    .filter((a) => a && a.semester_gpa != null && !isNaN(Number(a.semester_gpa)) && Number(a.semester_gpa) > 0)
    .sort((a, b) => Number(a.semester) - Number(b.semester));

  const cumulativeCgpa = validAcademics.length > 0
    ? (validAcademics.reduce((sum, a) => sum + Number(a.semester_gpa), 0) / validAcademics.length).toFixed(2)
    : null;

  const avgAttendance = attendanceSummary?.overall_percentage != null
    ? attendanceSummary.overall_percentage
    : validAcademics.length > 0
    ? Math.round(
        validAcademics.reduce(
          (sum, a) => sum + (a.attendance_pct != null && !isNaN(Number(a.attendance_pct)) ? Number(a.attendance_pct) : 0),
          0
        ) / validAcademics.length
      )
    : null;

  const liveOverallPct = attendanceSummary?.overall_percentage != null
    ? attendanceSummary.overall_percentage
    : avgAttendance != null
    ? avgAttendance
    : null;

  const latestSemGpa = validAcademics.length > 0
    ? Number(validAcademics[validAcademics.length - 1].semester_gpa).toFixed(2)
    : null;

  // Radar chart data from tech skills
  const radarData = techSkills.slice(0, 6).map((skill) => ({
    subject: skill.specific_tool,
    A: skill.self_rating,
    fullMark: 5,
  }));

  const handleNudgeClick = (tabSlug: string) => {
    navigate(`/profile?tab=${tabSlug}`);
  };

  const displayName = user?.name || student?.name || 'Student';

  return (
    <div className="space-y-6">
      {/* ── Parent View Indicator Banner ── */}
      {role === 'parent' && (
        <div className="bg-brand-soft border border-brand-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-primary text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
              👁️
            </div>
            <div>
              <p className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                Parent View Mode (Strictly Read-Only)
              </p>
              <p className="text-xs text-textSecondary mt-0.5">
                Monitoring 360° academic performance, cumulative attendance, and placement preparation for <strong className="text-textPrimary">{student?.name || user?.name || activeRollNo}</strong> ({activeRollNo}).
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20 self-start sm:self-auto shrink-0">
            Read-Only Mode
          </span>
        </div>
      )}

      {/* 1. Greeting Hero */}
      <GreetingHero
        name={displayName}
        completionPercentage={completionStatus.totalPercentage}
        onEditProfile={() => navigate('/profile')}
      />

      {/* 60/40 Split Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Column (60% ~ 7 cols in 12 grid) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              icon={<CalendarCheck className="w-5 h-5" />}
              iconBgColor={
                liveOverallPct == null
                  ? 'bg-surface-2 text-textSecondary'
                  : liveOverallPct >= 75
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : liveOverallPct >= 65
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
              }
              accentColor={
                liveOverallPct == null ? 'brand' : liveOverallPct >= 75 ? 'emerald' : liveOverallPct >= 65 ? 'amber' : 'alert'
              }
              label="Overall Attendance"
              value={liveOverallPct != null ? `${liveOverallPct}%` : '0.0%'}
              subtext={
                attendanceSummary?.total_periods_held
                  ? `${attendanceSummary.total_periods_attended} / ${attendanceSummary.total_periods_held} Periods Held`
                  : 'Live Attendance Register'
              }
              onClick={() => navigate('/attendance')}
            />
            <StatCard
              icon={<GraduationCap className="w-5 h-5" />}
              iconBgColor="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              accentColor="emerald"
              label="Cumulative CGPA"
              value={cumulativeCgpa ? `${cumulativeCgpa} / 10.0` : '0.00 / 10.0'}
              subtext={validAcademics.length > 0 ? `Across ${validAcademics.length} semester${validAcademics.length > 1 ? 's' : ''}` : 'Click to add semester marks'}
              onClick={role !== 'parent' ? () => navigate('/profile?tab=academics') : undefined}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              iconBgColor="bg-brand-soft text-brand-primary"
              accentColor="brand"
              label="Employability Score"
              value={`${scoreData?.overallScore ?? 0}/100`}
              subtext="Computed from GPA & coding activity"
              onClick={role !== 'parent' ? () => navigate('/profile?tab=placement-preferences') : undefined}
            />
            <StatCard
              icon={<BookOpen className="w-5 h-5" />}
              iconBgColor="bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
              accentColor="sky"
              label="Latest Sem GPA"
              value={latestSemGpa ? `${latestSemGpa} GPA` : '0.00 GPA'}
              subtext={liveOverallPct != null ? `Avg Attendance: ${liveOverallPct}%` : 'Semester performance'}
              onClick={role !== 'parent' ? () => navigate('/profile?tab=academics') : undefined}
            />
            <StatCard
              icon={<Code2 className="w-5 h-5" />}
              iconBgColor="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
              accentColor="indigo"
              label="Coding Profiles"
              value={`${codingProfiles.length} / 6`}
              subtext="Linked technical handles"
              onClick={role !== 'parent' ? () => navigate('/profile?tab=coding-profiles') : undefined}
            />
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              iconBgColor="bg-success-soft text-success"
              accentColor="success"
              label="Certifications Earned"
              value={certifications.filter((c) => !c.suggested).length}
              subtext={`${certifications.filter((c) => c.suggested).length} recommended certs`}
              onClick={role !== 'parent' ? () => navigate('/profile?tab=certifications') : undefined}
            />
          </div>

          {/* ── DEDICATED OVERALL ATTENDANCE & LIVE SUBJECT REGISTER CARD ── */}
          <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                  liveOverallPct == null || liveOverallPct >= 75
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : liveOverallPct >= 65
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-textPrimary">Semester Attendance & Live Subject Register</h3>
                    {liveOverallPct != null && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        liveOverallPct >= 75
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : liveOverallPct >= 65
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {liveOverallPct >= 75 ? '✓ Exam Eligible (≥75%)' : liveOverallPct >= 65 ? '⚠️ Condonation Risk (<75%)' : '🚨 Ineligible (<65%)'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-textSecondary mt-0.5">
                    Real-time period-by-period tracking across all registered theory and laboratory courses.
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate('/attendance')}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1 shrink-0 self-start sm:self-auto"
              >
                <span>View Day-Wise Matrix</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Visual Aggregate Bar & Stat Summary */}
            <div className="p-4 rounded-xl bg-surface-2 border border-borderLine space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">Overall Aggregate</p>
                  <p className="text-2xl font-black font-mono text-textPrimary mt-0.5">
                    {liveOverallPct != null ? `${liveOverallPct}%` : '0.0%'}
                  </p>
                </div>

                {attendanceSummary && (
                  <div className="text-right text-xs">
                    <p className="text-textSecondary">
                      Attended: <strong className="text-emerald-400 font-mono">{attendanceSummary.total_periods_attended}</strong> / {attendanceSummary.total_periods_held} Periods Held
                    </p>
                    <p className="text-[11px] text-rose-400 font-mono">
                      {attendanceSummary.total_periods_held - attendanceSummary.total_periods_attended} Absence{(attendanceSummary.total_periods_held - attendanceSummary.total_periods_attended) === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
              </div>

              {/* Dual Progress Bar */}
              <div className="h-3 w-full rounded-full bg-surface overflow-hidden flex border border-borderLine/50">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, liveOverallPct ?? 0)}%` }}
                  title={`Present: ${liveOverallPct ?? 0}%`}
                />
                <div
                  className="bg-rose-500/80 h-full transition-all duration-500"
                  style={{ width: `${Math.max(0, 100 - (liveOverallPct ?? 0))}%` }}
                  title={`Absent: ${Math.max(0, 100 - (liveOverallPct ?? 0))}%`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-textSecondary pt-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Present: <strong>{liveOverallPct ?? 0}%</strong>
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Absent: <strong>{liveOverallPct != null ? (Math.round((100 - liveOverallPct) * 10) / 10) : 0}%</strong>
                </span>
                <span className="font-semibold text-textMuted">
                  Required: 75.0%
                </span>
              </div>
            </div>

            {/* Subject Breakdown Table / List */}
            {attendanceSummary?.subjects && attendanceSummary.subjects.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-borderLine">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-textMuted font-bold uppercase tracking-wider border-b border-borderLine">
                    <tr>
                      <th className="py-2.5 px-3.5">Subject</th>
                      <th className="py-2.5 px-3.5">Type</th>
                      <th className="py-2.5 px-3.5">Faculty</th>
                      <th className="py-2.5 px-3.5 text-center">Attended / Held</th>
                      <th className="py-2.5 px-3.5 text-center">Attendance %</th>
                      <th className="py-2.5 px-3.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {attendanceSummary.subjects.map((sub: any) => {
                      const subPct = sub.percentage;
                      const isSubGood = subPct >= 75;
                      const isSubWarn = subPct >= 65 && subPct < 75;

                      return (
                        <tr key={sub.allotment_id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="py-2.5 px-3.5 font-bold text-textPrimary">{sub.subject_name}</td>
                          <td className="py-2.5 px-3.5">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              sub.subject_type === 'Lab'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            }`}>
                              {sub.subject_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-textSecondary font-medium">{sub.faculty_name}</td>
                          <td className="py-2.5 px-3.5 text-center font-mono font-bold">
                            <span className="text-emerald-400">{sub.periods_attended}</span> / <span className="text-textSecondary">{sub.periods_held}</span>
                          </td>
                          <td className="py-2.5 px-3.5 text-center font-mono font-black">
                            <span className={`px-2 py-0.5 rounded-md ${
                              isSubGood
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : isSubWarn
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {subPct}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            {isSubGood ? (
                              <span className="text-emerald-400 font-bold text-[11px] inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Eligible
                              </span>
                            ) : (
                              <span className="text-rose-400 font-bold text-[11px] inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Deficit
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-textMuted bg-surface-2/40 rounded-xl border border-dashed border-borderLine">
                No attendance session records published yet for your registered courses.
              </div>
            )}
          </div>

          {/* Semester GPA & CGPA Progress Summary Card */}
          <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                  🎓
                </div>
                <div>
                  <h3 className="text-sm font-bold text-textPrimary">Semester GPA & CGPA History</h3>
                  <p className="text-xs text-textSecondary mt-0.5">
                    Cumulative CGPA: <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{cumulativeCgpa || '0.00'}</strong> (Scale of 10.0)
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/profile?tab=academics')}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                <span>Full Grade Sheet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {validAcademics.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {validAcademics.map((sem) => (
                  <div key={sem.semester} className="p-3.5 rounded-xl bg-surface-2 border border-borderLine text-center">
                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Semester {sem.semester}</span>
                    <p className="text-xl font-black text-brand-primary mt-1">{Number(sem.semester_gpa).toFixed(2)}</p>
                    <span className="text-[11px] text-textSecondary font-medium block mt-0.5">
                      {sem.attendance_pct ? `${sem.attendance_pct}% Attendance` : 'SGPA'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface-2 border border-dashed border-borderLine text-center">
                <p className="text-xs font-bold text-textPrimary">No Semester Grades Recorded Yet</p>
                <p className="text-[11px] text-textSecondary mt-1">
                  Add your Semester marks and attendance in the Academics tab to generate your CGPA trend.
                </p>
                {role !== 'parent' && (
                  <button
                    onClick={() => navigate('/profile?tab=academics')}
                    className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-all"
                  >
                    Add Academic Record
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Skill Snapshot Radar Chart Card */}
          <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-textPrimary">Skill Snapshot</h3>
                <p className="text-xs text-textSecondary mt-0.5">Radar of top technical self-ratings</p>
              </div>
              <button
                onClick={() => navigate('/profile?tab=tech-skills')}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {radarData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="var(--color-borderLine)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--color-textSecondary)', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 5]} stroke="var(--color-borderLine)" />
                    <Radar
                      name="Rating"
                      dataKey="A"
                      stroke="#5B4FE9"
                      fill="#5B4FE9"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<Code2 className="w-6 h-6" />}
                title="No Skills Added"
                description="Add your technical skills and tools in your profile to render the radar chart snapshot."
                action={
                  role !== 'parent' ? (
                    <button
                      onClick={() => navigate('/profile?tab=tech-skills')}
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-brand-primary text-white"
                    >
                      Add Skills Now
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>

          {/* Recent Achievements Card */}
          <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-textPrimary">Recent Achievements</h3>
                <p className="text-xs text-textSecondary mt-0.5">Hackathons, projects, and industry events</p>
              </div>
              <button
                onClick={() => navigate('/profile?tab=achievements')}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                <span>View Timeline</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {achievements.length > 0 ? (
              <div className="space-y-2.5">
                {achievements.slice(0, 3).map((item) => (
                  <div key={item.id || item.title} className="p-3.5 rounded-xl border border-borderLine bg-surface-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-brand-soft text-brand-primary">
                          {item.type}
                        </span>
                        <span className="text-[10px] text-textMuted">{item.achievement_date || '2024'}</span>
                      </div>
                      <h4 className="text-xs font-bold text-textPrimary">{item.title}</h4>
                      <p className="text-[11px] text-textSecondary line-clamp-1 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Award className="w-6 h-6" />}
                title="No Achievements Yet"
                description="Document your hackathons, conferences, and capstone projects to showcase your growth."
              />
            )}
          </div>
        </div>

        {/* Right Column (40% ~ 5 cols in 12 grid) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Completion Ring Card */}
          <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs text-center">
            <h3 className="text-sm font-bold text-textPrimary mb-1">Profile Completion</h3>
            <p className="text-xs text-textSecondary mb-4">Complete all 8 sections to maximize evaluation</p>
            <div className="py-2">
              <ProgressRing percentage={completionStatus.totalPercentage} size={110} strokeWidth={10} />
            </div>
            <p className="text-xs font-medium text-textSecondary mt-3">
              <span className="font-bold text-textPrimary">{completionStatus.sectionsCompleteCount}</span> of {completionStatus.totalSectionsCount} sections completed
            </p>
          </div>

          {/* Coding Snapshot Widget */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#FFA116]" />
                Coding Snapshot
              </h3>
              <button onClick={() => navigate('/profile?tab=coding-profiles')}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2.5">
              {codingProfiles.find((p) => p.platform === 'LeetCode') ? (
                <div className="p-3 rounded-xl bg-surface-2 border border-borderLine flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-[11px]" style={{ background: '#FFA116' }}>LC</div>
                    <div>
                      <p className="text-xs font-bold text-textPrimary">LeetCode</p>
                      <p className="text-[11px] text-textMuted">@{codingProfiles.find((p) => p.platform === 'LeetCode')?.handle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold" style={{ color: '#FFA116' }}>{codingProfiles.find((p) => p.platform === 'LeetCode')?.score_rating}</p>
                    <p className="text-[10px] text-textMuted">Rating</p>
                  </div>
                </div>
              ) : (
                role !== 'parent' && (
                  <button onClick={() => navigate('/profile?tab=coding-profiles')}
                    className="w-full p-3 rounded-xl border border-dashed border-borderLine text-xs text-textSecondary hover:border-[#FFA116] hover:text-[#FFA116] transition-all text-left flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#FFA116]/10 flex items-center justify-center text-[#FFA116] font-black text-[10px]">LC</div>
                    Connect LeetCode &rarr;
                  </button>
                )
              )}
              {codingProfiles.find((p) => p.platform === 'GitHub') ? (
                <div className="p-3 rounded-xl bg-surface-2 border border-borderLine flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-textPrimary flex items-center justify-center">
                      <Github className="w-4 h-4 text-surface" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-textPrimary">GitHub</p>
                      <p className="text-[11px] text-textMuted">@{codingProfiles.find((p) => p.platform === 'GitHub')?.handle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-textPrimary">{codingProfiles.find((p) => p.platform === 'GitHub')?.repositories_count}</p>
                    <p className="text-[10px] text-textMuted">Repos</p>
                  </div>
                </div>
              ) : (
                role !== 'parent' && (
                  <button onClick={() => navigate('/profile?tab=coding-profiles')}
                    className="w-full p-3 rounded-xl border border-dashed border-borderLine text-xs text-textSecondary hover:border-borderStrong hover:text-textPrimary transition-all text-left flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center">
                      <Github className="w-3.5 h-3.5 text-textSecondary" />
                    </div>
                    Connect GitHub &rarr;
                  </button>
                )
              )}
              <button onClick={() => navigate('/coding-analytics')}
                className="w-full py-2 text-xs font-bold text-brand-primary hover:underline flex items-center justify-center gap-1">
                <BarChart2 className="w-3.5 h-3.5" /> View Program Leaderboard
              </button>
            </div>
          </div>

          {/* Complete Your Profile nudges — hidden for parent (read-only) */}
          {role !== 'parent' && (
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                <span>Complete Your Profile</span>
              </h3>
              <span className="text-[10px] font-bold text-alert bg-alert-soft px-2.5 py-1 rounded-full">
                {completionStatus.nudges.length} Prompts
              </span>
            </div>

            {completionStatus.nudges.length > 0 ? (
              <div className="space-y-2.5">
                {completionStatus.nudges.map((nudge) => (
                  <NudgeCard
                    key={nudge.id}
                    title={nudge.title}
                    message={nudge.message}
                    ctaText={nudge.ctaText}
                    onClick={() => handleNudgeClick(nudge.tabSlug)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-success-soft border border-success/20 rounded-xl p-5 text-center">
                <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                <h4 className="text-sm font-bold text-textPrimary">Profile 100% complete! 🎉</h4>
                <p className="text-xs text-textSecondary mt-1">All sections, coding profiles, and academic data are up to date.</p>
              </div>
            )}
          </div>
          )}

          {/* Announcements Card */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-brand-primary" />
              <h3 className="text-sm font-bold text-textPrimary">Announcements</h3>
            </div>
            <EmptyState
              icon={<Bell className="w-5 h-5" />}
              title="No Announcements"
              description="Check back later for important department notices, exam schedules, and university news."
            />
          </div>
        </div>
      </div>
    </div>
  );
};
