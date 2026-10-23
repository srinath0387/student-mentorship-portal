import React, { useState, useEffect } from 'react';
import { Target, Sparkles, Building, Check, Edit2, Save, X, BookOpen, Award, Loader2 } from 'lucide-react';
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

export const PlacementPreferencesTab: React.FC<PlacementPreferencesTabProps> = ({
  placement,
  scoreData,
  readOnly = false,
  onRefresh,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [career, setCareer] = useState(placement?.preferred_career || '');
  const [specializations, setSpecializations] = useState<string[]>(
    placement?.dream_company || []
  );
  const [newInput, setNewInput] = useState('');
  const [higherStudies, setHigherStudies] = useState(placement?.higher_studies_interest || false);
  const [needFromDept, setNeedFromDept] = useState(placement?.need_from_department || '');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const activeRollNo = user?.rollNumber || '';

  // Sync form state when placement data loads asynchronously (fixes blank page on initial load)
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
    if (readOnly) return;
    if (!activeRollNo) return; // auth not ready yet — prevent malformed API call
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
    } catch (e: any) {
      alert('Failed to save academic preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Academic Preferences Form */}
      <div className="bg-surface border border-borderLine rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-borderLine pb-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-textPrimary">Academic Performance & Specialization Goals</h3>
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
          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Preferred Specialization / Career Track</label>
            {isEditing ? (
              <input
                type="text"
                value={career}
                onChange={(e) => setCareer(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background"
              />
            ) : (
              <p className="text-sm font-semibold text-textPrimary">{career}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">Key Technical Focus Areas</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {specializations.map((spec) => (
                <span key={spec} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-brand-primary text-white">
                  <BookOpen className="w-3 h-3" />
                  <span>{spec}</span>
                  {isEditing && (
                    <button type="button" onClick={() => handleRemoveSpec(spec)} className="hover:text-red-200 ml-1">
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>

            {isEditing && (
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={newInput}
                  onChange={(e) => setNewInput(e.target.value)}
                  placeholder="Add specialization (e.g. Cybersecurity)"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-borderLine bg-background"
                />
                <PillButton variant="secondary" size="sm" type="button" onClick={handleAddSpec}>
                  Add
                </PillButton>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Higher Studies / Research Plans</label>
            {isEditing ? (
              <select
                value={higherStudies ? 'yes' : 'no'}
                onChange={(e) => setHigherStudies(e.target.value === 'yes')}
                className="w-full max-w-xs px-3 py-2 text-sm rounded-lg border border-borderLine bg-background"
              >
                <option value="no">No - Focused on Core Academic Projects</option>
                <option value="yes">Yes - Planning MS / M.Tech / Research</option>
              </select>
            ) : (
              <p className="text-sm font-medium text-textPrimary">
                {higherStudies ? 'Yes - Interested in Higher Studies & Research' : 'No - Focused on Core Academic Projects'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">Support Needed From Department</label>
            {isEditing ? (
              <textarea
                value={needFromDept}
                onChange={(e) => setNeedFromDept(e.target.value)}
                rows={2}
                placeholder="e.g. Access to advanced cloud labs, research mentorship..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-borderLine bg-background"
              />
            ) : (
              <p className="text-sm font-medium text-textPrimary">
                {needFromDept || 'Not specified'}
              </p>
            )}
          </div>

          {isEditing && (
            <div className="flex justify-end pt-4 border-t border-borderLine">
              <PillButton
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving}
                icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              >
                {saving ? 'Saving Preferences...' : 'Save Preferences'}
              </PillButton>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Calculated Intelligence Card */}
      <div className="bg-surface border border-brand-primary/30 rounded-xl p-6 shadow-sm relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-primary" />
            <h3 className="text-base font-bold text-textPrimary">🎮 RPG Employability Score</h3>
          </div>
          {scoreData?.badge && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-soft text-brand-primary px-2.5 py-1 rounded-full border border-brand-primary/20">
              {scoreData.badge} {scoreData.levelTitle}
            </span>
          )}
        </div>

        {/* XP Bar */}
        {scoreData && (
          <div className="mb-5">
            <div className="flex items-end justify-between mb-1">
              <span className="text-3xl font-black text-brand-primary">{scoreData.overallScore}<span className="text-base font-semibold text-textSecondary"> / 1000 XP</span></span>
              <span className="text-xs text-textSecondary">{scoreData.nextLevelXp ? `${scoreData.nextLevelXp} XP to next level` : '🏆 Max Level!'}</span>
            </div>
            <div className="w-full h-3 bg-borderLine rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreData.overallScore >= 800 ? 'bg-yellow-400' : scoreData.overallScore >= 600 ? 'bg-orange-400' : scoreData.overallScore >= 400 ? 'bg-indigo-400' : scoreData.overallScore >= 200 ? 'bg-teal-400' : 'bg-gray-400'}`}
                style={{ width: `${scoreData.progressPercentage || Math.min(100, (scoreData.overallScore / 1000) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 4 Pillars */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="p-3 rounded-xl bg-background border border-borderLine text-center">
            <p className="text-[11px] font-semibold text-textSecondary uppercase mb-1">⚔️ Coding</p>
            <p className="text-xl font-black text-orange-500">{scoreData?.codingScore ?? 0}</p>
            <p className="text-[10px] text-textMuted">/ 350</p>
          </div>
          <div className="p-3 rounded-xl bg-background border border-borderLine text-center">
            <p className="text-[11px] font-semibold text-textSecondary uppercase mb-1">🐙 GitHub</p>
            <p className="text-xl font-black text-gray-600">{scoreData?.githubScore ?? 0}</p>
            <p className="text-[10px] text-textMuted">/ 200</p>
          </div>
          <div className="p-3 rounded-xl bg-background border border-borderLine text-center">
            <p className="text-[11px] font-semibold text-textSecondary uppercase mb-1">📚 Academics</p>
            <p className="text-xl font-black text-blue-500">{scoreData?.academicsScore ?? 0}</p>
            <p className="text-[10px] text-textMuted">/ 250</p>
          </div>
          <div className="p-3 rounded-xl bg-background border border-borderLine text-center">
            <p className="text-[11px] font-semibold text-textSecondary uppercase mb-1">🏅 Certs</p>
            <p className="text-xl font-black text-emerald-500">{scoreData?.certsScore ?? 0}</p>
            <p className="text-[10px] text-textMuted">/ 200</p>
          </div>
        </div>

        {/* Quest Tips */}
        <div>
          <h4 className="text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">⚡ Quest Tips to Level Up</h4>
          <ul className="space-y-1.5 text-xs text-textPrimary">
            {((scoreData?.quests && scoreData.quests.length > 0 ? scoreData.quests : scoreData?.feedback && scoreData.feedback.length > 0 ? scoreData.feedback : ['Complete your profile to generate quest tips'])).map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
