import React, { useState, useEffect } from 'react';
import { Target, Sparkles, Edit2, Save, X, BookOpen, Loader2, Zap, Code2, Github, GraduationCap, Award } from 'lucide-react';
import { PlacementProfile, ScoreBreakdown } from '../../../types';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { PillButton } from '../../../components/common/PillButton';

interface PlacementPreferencesTabProps {
  placement?: PlacementProfile | null;
  scoreData?: ScoreBreakdown | null;
  readOnly?: boolean;
  onRefresh: () => void;
}

// ── Level color config ────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<number, { bg: string; border: string; text: string; glow: string; barColor: string }> = {
  1:  { bg: 'from-gray-50 to-gray-100',     border: 'border-gray-300',    text: 'text-gray-600',    glow: '',                          barColor: '#9ca3af' },
  2:  { bg: 'from-green-50 to-emerald-100', border: 'border-emerald-300', text: 'text-emerald-700', glow: 'shadow-emerald-200',        barColor: '#34d399' },
  3:  { bg: 'from-teal-50 to-cyan-100',     border: 'border-teal-300',    text: 'text-teal-700',    glow: 'shadow-teal-200',           barColor: '#2dd4bf' },
  4:  { bg: 'from-blue-50 to-blue-100',     border: 'border-blue-300',    text: 'text-blue-700',    glow: 'shadow-blue-200',           barColor: '#60a5fa' },
  5:  { bg: 'from-indigo-50 to-indigo-100', border: 'border-indigo-300',  text: 'text-indigo-700',  glow: 'shadow-indigo-200',         barColor: '#818cf8' },
  6:  { bg: 'from-violet-50 to-purple-100', border: 'border-violet-300',  text: 'text-violet-700',  glow: 'shadow-violet-200',         barColor: '#a78bfa' },
  7:  { bg: 'from-purple-50 to-fuchsia-100',border: 'border-purple-400',  text: 'text-purple-700',  glow: 'shadow-purple-200',         barColor: '#c084fc' },
  8:  { bg: 'from-amber-50 to-yellow-100',  border: 'border-amber-400',   text: 'text-amber-700',   glow: 'shadow-amber-200',          barColor: '#fbbf24' },
  9:  { bg: 'from-orange-50 to-red-100',    border: 'border-orange-400',  text: 'text-orange-700',  glow: 'shadow-orange-200',         barColor: '#fb923c' },
  10: { bg: 'from-yellow-50 to-amber-200',  border: 'border-yellow-500',  text: 'text-yellow-800',  glow: 'shadow-yellow-300 shadow-lg',barColor: '#f59e0b' },
};

// ── SVG Progress Ring ─────────────────────────────────────────────────────────
const ProgressRing: React.FC<{
  score: number; max: number; color: string; size?: number; stroke?: number;
  icon: React.ReactNode; label: string; emoji: string;
}> = ({ score, max, color, size = 80, stroke = 7, icon, label, emoji }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, score / max);
  const offset = circ * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
        </svg>
        {/* Center icon */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg leading-none">{emoji}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-black text-textPrimary leading-none">{score}</p>
        <p className="text-[10px] text-textMuted font-medium">/ {max}</p>
        <p className="text-[10px] font-semibold text-textSecondary mt-0.5">{label}</p>
      </div>
    </div>
  );
};

// ── Quest Card ────────────────────────────────────────────────────────────────
const QuestCard: React.FC<{ text: string; idx: number }> = ({ text, idx }) => {
  // Parse XP from text e.g. "(+50 XP)"
  const xpMatch = text.match(/\(\+(\d+)\s*XP\)/i);
  const xp = xpMatch ? parseInt(xpMatch[1]) : null;
  const cleanText = text.replace(/\(\+\d+\s*XP\)/i, '').trim();
  const icons = ['⚔️', '🐙', '📚', '🏅', '🚀', '💡', '🔥'];
  const colors = [
    'border-orange-200 bg-orange-50',
    'border-gray-200 bg-gray-50',
    'border-blue-200 bg-blue-50',
    'border-emerald-200 bg-emerald-50',
    'border-violet-200 bg-violet-50',
    'border-amber-200 bg-amber-50',
    'border-teal-200 bg-teal-50',
  ];
  const xpColors = ['bg-orange-100 text-orange-700', 'bg-gray-100 text-gray-600', 'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-teal-100 text-teal-700'];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${colors[idx % colors.length]}`}>
      <span className="text-xl shrink-0">{icons[idx % icons.length]}</span>
      <p className="flex-1 text-sm font-medium text-textPrimary">{cleanText}</p>
      {xp && (
        <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full ${xpColors[idx % xpColors.length]}`}>
          +{xp} XP
        </span>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const PlacementPreferencesTab: React.FC<PlacementPreferencesTabProps> = ({
  placement,
  scoreData,
  readOnly = false,
  onRefresh,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [career, setCareer] = useState(placement?.preferred_career || '');
  const [specializations, setSpecializations] = useState<string[]>(placement?.dream_company || []);
  const [newInput, setNewInput] = useState('');
  const [higherStudies, setHigherStudies] = useState(placement?.higher_studies_interest || false);
  const [needFromDept, setNeedFromDept] = useState(placement?.need_from_department || '');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const activeRollNo = user?.rollNumber || '';

  useEffect(() => {
    if (placement && !isEditing) {
      setCareer(placement.preferred_career || '');
      setSpecializations(placement.dream_company || []);
      setHigherStudies(placement.higher_studies_interest || false);
      setNeedFromDept(placement.need_from_department || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement]);

  const handleAddSpec = () => {
    if (newInput.trim() && !specializations.includes(newInput.trim())) {
      setSpecializations([...specializations, newInput.trim()]);
      setNewInput('');
    }
  };

  const handleRemoveSpec = (item: string) => {
    setSpecializations(specializations.filter((c) => c !== item));
  };

  const handleSave = async () => {
    if (readOnly || !activeRollNo) return;
    setSaving(true);
    try {
      await api.updatePlacementProfile(activeRollNo, {
        preferred_career: career,
        dream_company: specializations,
        higher_studies_interest: higherStudies,
        need_from_department: needFromDept,
      });
      setIsEditing(false);
      onRefresh();
    } catch {
      alert('Failed to save academic preferences');
    } finally {
      setSaving(false);
    }
  };

  // RPG level config
  const lvl = scoreData?.levelNumber || 1;
  const cfg = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[1];
  const xpToNext = scoreData?.nextLevelXp ?? 0;
  const progress = scoreData?.progressPercentage ?? Math.min(100, ((scoreData?.overallScore ?? 0) / 1000) * 100);

  // Quest items — use scoreData.quests, fall back to feedback, then defaults
  const quests: string[] = (scoreData?.quests && scoreData.quests.length > 0)
    ? scoreData.quests
    : (scoreData?.feedback && scoreData.feedback.length > 0)
      ? scoreData.feedback
      : [
          'Link your LeetCode profile to start earning Coding XP (+up to 350 XP)',
          'Link your GitHub profile to earn GitHub XP (+up to 200 XP)',
          'Add semester GPA records to earn Academics XP (+up to 250 XP)',
          'Add certifications from AWS, Google, or NPTEL (+up to 200 XP)',
        ];

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — LEVEL BADGE BANNER
      ══════════════════════════════════════════════════════════════════════ */}
      <div className={`bg-gradient-to-br ${cfg.bg} border ${cfg.border} rounded-2xl p-6 shadow-sm ${cfg.glow}`}>
        {/* Top row — badge + level title + XP */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-4">
            {/* Giant badge */}
            <div className={`text-5xl leading-none`}>{scoreData?.badge || '🐣'}</div>
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${cfg.text} opacity-70`}>
                Level {lvl} · RPG Score
              </p>
              <h2 className={`text-xl font-black ${cfg.text} leading-tight`}>
                {scoreData?.levelTitle || 'Apprentice Novice'}
              </h2>
              <p className="text-sm font-semibold text-textSecondary mt-0.5">
                {scoreData?.overallScore ?? 0}
                <span className="text-textMuted font-normal"> / 1000 XP</span>
              </p>
            </div>
          </div>

          {/* Next level chip */}
          {xpToNext > 0 ? (
            <div className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border ${cfg.border} bg-white/60`}>
              <Zap className={`w-4 h-4 ${cfg.text}`} />
              <span className={`text-sm font-black ${cfg.text}`}>Next Level in {xpToNext} XP</span>
            </div>
          ) : (
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border border-yellow-400 bg-yellow-50">
              <span className="text-sm font-black text-yellow-700">👑 MAX LEVEL!</span>
            </div>
          )}
        </div>

        {/* XP Progress bar */}
        <div>
          <div className="flex justify-between text-xs font-semibold text-textSecondary mb-1.5">
            <span>{scoreData?.overallScore ?? 0} XP earned</span>
            <span>{progress.toFixed(0)}% to max</span>
          </div>
          <div className="w-full h-4 bg-white/50 border border-white/80 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${cfg.barColor}aa, ${cfg.barColor})`,
                boxShadow: `0 0 8px ${cfg.barColor}80`,
              }}
            />
          </div>
          {/* Segment markers */}
          <div className="flex justify-between mt-1 px-0.5">
            {[0, 100, 200, 350, 500, 650, 750, 850, 950, 1000].map((mark) => (
              <div key={mark} className="flex flex-col items-center">
                <div className="w-px h-1.5 bg-textMuted/30" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — 4 CATEGORY PROGRESS RINGS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-4 h-4 text-brand-primary" />
          <h3 className="text-sm font-bold text-textPrimary uppercase tracking-wider">Score Breakdown</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 justify-items-center">
          <ProgressRing
            score={scoreData?.codingScore ?? 0} max={350}
            color="#f97316" emoji="⚔️" label="Coding"
            icon={<Code2 />}
          />
          <ProgressRing
            score={scoreData?.githubScore ?? 0} max={200}
            color="#6b7280" emoji="🐙" label="GitHub"
            icon={<Github />}
          />
          <ProgressRing
            score={scoreData?.academicsScore ?? 0} max={250}
            color="#3b82f6" emoji="📚" label="Academics"
            icon={<GraduationCap />}
          />
          <ProgressRing
            score={scoreData?.certsScore ?? 0} max={200}
            color="#10b981" emoji="🏅" label="Certs"
            icon={<Award />}
          />
        </div>

        {/* Pillar detail rows */}
        <div className="mt-6 space-y-2.5">
          {[
            { label: '⚔️ Coding', score: scoreData?.codingScore ?? 0, max: 350, color: '#f97316', bg: 'bg-orange-100', text: 'text-orange-700' },
            { label: '🐙 GitHub', score: scoreData?.githubScore ?? 0, max: 200, color: '#6b7280', bg: 'bg-gray-100', text: 'text-gray-700' },
            { label: '📚 Academics', score: scoreData?.academicsScore ?? 0, max: 250, color: '#3b82f6', bg: 'bg-blue-100', text: 'text-blue-700' },
            { label: '🏅 Certifications', score: scoreData?.certsScore ?? 0, max: 200, color: '#10b981', bg: 'bg-emerald-100', text: 'text-emerald-700' },
          ].map((p) => (
            <div key={p.label} className="flex items-center gap-3">
              <span className="w-32 text-xs font-semibold text-textSecondary shrink-0">{p.label}</span>
              <div className="flex-1 h-2.5 bg-borderLine rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (p.score / p.max) * 100)}%`, backgroundColor: p.color }}
                />
              </div>
              <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>
                {p.score} / {p.max}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — QUESTS TO LEVEL UP
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-textPrimary uppercase tracking-wider">⚡ Quests to Level Up</h3>
          <span className="text-xs text-textMuted">— complete these to earn more XP</span>
        </div>
        <div className="space-y-2.5">
          {quests.map((q, i) => (
            <QuestCard key={i} text={q} idx={i} />
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — ACADEMIC PREFERENCES FORM
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface border border-borderLine rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-borderLine pb-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-textPrimary">Academic Performance &amp; Specialization Goals</h3>
            <p className="text-xs text-textSecondary">Specify your core technical focus, higher studies plans, and department support needs</p>
          </div>
          {!readOnly && (
            !isEditing ? (
              <PillButton variant="outline" size="sm" onClick={() => setIsEditing(true)} icon={<Edit2 className="w-3.5 h-3.5" />}>
                Edit Goals
              </PillButton>
            ) : (
              <PillButton variant="outline" size="sm" onClick={() => setIsEditing(false)} icon={<X className="w-3.5 h-3.5" />}>
                Cancel
              </PillButton>
            )
          )}
        </div>

        <div className="space-y-6">
          {/* Career Track */}
          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Preferred Specialization / Career Track</label>
            {isEditing ? (
              <input type="text" value={career} onChange={(e) => setCareer(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            ) : (
              <p className="text-sm font-semibold text-textPrimary">{career || <span className="text-textMuted italic">Not specified</span>}</p>
            )}
          </div>

          {/* Technical Focus Areas */}
          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">Key Technical Focus Areas</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {specializations.map((spec) => (
                <span key={spec} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-brand-primary text-white">
                  <BookOpen className="w-3 h-3" />
                  <span>{spec}</span>
                  {isEditing && (
                    <button type="button" onClick={() => handleRemoveSpec(spec)} className="hover:text-red-200 ml-1">×</button>
                  )}
                </span>
              ))}
              {specializations.length === 0 && !isEditing && (
                <p className="text-sm text-textMuted italic">No focus areas added yet</p>
              )}
            </div>
            {isEditing && (
              <div className="flex gap-2">
                <input type="text" value={newInput} onChange={(e) => setNewInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSpec()}
                  placeholder="Add focus area (e.g. Machine Learning)"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                <button onClick={handleAddSpec} className="px-3 py-2 text-xs font-bold rounded-lg bg-brand-primary text-white hover:opacity-90">Add</button>
              </div>
            )}
          </div>

          {/* Higher Studies */}
          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">Higher Studies Interest</label>
            {isEditing ? (
              <div className="flex gap-4">
                {[true, false].map((v) => (
                  <button key={String(v)} type="button" onClick={() => setHigherStudies(v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-colors ${
                      higherStudies === v ? 'border-brand-primary bg-brand-soft text-brand-primary' : 'border-borderLine bg-background text-textSecondary'
                    }`}>
                    {higherStudies === v && <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />}
                    {v ? 'Yes, interested' : 'No, placement focus'}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-textPrimary">{higherStudies ? '✅ Yes — interested in higher studies' : '🎯 No — focused on placement'}</p>
            )}
          </div>

          {/* Need from Dept */}
          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Support Needed from Department</label>
            {isEditing ? (
              <textarea value={needFromDept} onChange={(e) => setNeedFromDept(e.target.value)} rows={3}
                placeholder="e.g. More guest lectures on cloud computing, mock interview sessions..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-none" />
            ) : (
              <p className="text-sm text-textPrimary">{needFromDept || <span className="text-textMuted italic">Not specified</span>}</p>
            )}
          </div>

          {isEditing && (
            <div className="flex justify-end pt-4 border-t border-borderLine">
              <PillButton variant="primary" size="md" onClick={handleSave} disabled={saving}
                icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
                {saving ? 'Saving...' : 'Save Preferences'}
              </PillButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
