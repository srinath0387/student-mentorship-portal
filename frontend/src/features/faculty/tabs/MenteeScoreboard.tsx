import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Star, Zap, BookOpen, Code2, Award, RefreshCw, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../../lib/api';
import { LeaderboardEntry } from '../../../types';

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-green-100 text-green-700',
  3: 'bg-teal-100 text-teal-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-indigo-100 text-indigo-700',
  6: 'bg-violet-100 text-violet-700',
  7: 'bg-purple-100 text-purple-700',
  8: 'bg-amber-100 text-amber-700',
  9: 'bg-orange-100 text-orange-700',
  10: 'bg-yellow-100 text-yellow-800',
};

const RANK_STYLE = (rank: number) => {
  if (rank === 1) return 'bg-amber-100 text-amber-700 border border-amber-300 font-black';
  if (rank === 2) return 'bg-gray-100 text-gray-600 border border-gray-300 font-black';
  if (rank === 3) return 'bg-orange-100 text-orange-700 border border-orange-300 font-black';
  return 'bg-surface border border-borderLine font-bold text-textSecondary';
};

const XP_BAR_COLOR = (score: number) => {
  if (score >= 800) return 'bg-yellow-400';
  if (score >= 600) return 'bg-orange-400';
  if (score >= 400) return 'bg-indigo-400';
  if (score >= 200) return 'bg-teal-400';
  return 'bg-gray-400';
};

function exportToCSV(data: LeaderboardEntry[]) {
  const headers = ['Rank', 'Name', 'Roll No', 'Section', 'Year', 'Total XP', 'Coding', 'GitHub', 'Academics', 'Certs', 'Level', 'Badge'];
  const rows = data.map(e => [e.rank, e.name, e.studentId, e.section, e.year, e.overallScore, e.codingScore, e.githubScore, e.academicsScore, e.certsScore, e.levelTitle, e.badge]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'mentee_scoreboard.csv'; a.click();
  URL.revokeObjectURL(url);
}

const PillarBar: React.FC<{ label: string; score: number; max: number; color: string }> = ({ label, score, max, color }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="w-20 text-textSecondary shrink-0 truncate">{label}</span>
    <div className="flex-1 h-1.5 bg-borderLine rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (score / max) * 100)}%` }} />
    </div>
    <span className="w-10 text-right font-semibold text-textPrimary">{score}</span>
  </div>
);

const ScoreboardRow: React.FC<{ entry: LeaderboardEntry; isExpanded: boolean; onToggle: () => void }> = ({ entry, isExpanded, onToggle }) => {
  const pct = Math.min(100, (entry.overallScore / 1000) * 100);
  return (
    <div className="border border-borderLine rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-background transition-colors text-left"
      >
        {/* Rank */}
        <div className={`w-8 h-8 rounded-full text-xs flex items-center justify-center shrink-0 ${RANK_STYLE(entry.rank)}`}>
          {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
        </div>

        {/* Badge + Name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{entry.badge}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-textPrimary truncate">{entry.name}</p>
            <p className="text-[11px] text-textSecondary">{entry.studentId} · {entry.section} · {entry.year}</p>
          </div>
        </div>

        {/* Level badge */}
        <span className={`hidden sm:flex text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${LEVEL_COLORS[entry.levelNumber] || 'bg-gray-100 text-gray-600'}`}>
          Lv.{entry.levelNumber}
        </span>

        {/* XP + bar */}
        <div className="flex flex-col items-end gap-1 shrink-0 w-28">
          <span className="text-sm font-black text-brand-primary">{entry.overallScore} XP</span>
          <div className="w-full h-1.5 bg-borderLine rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${XP_BAR_COLOR(entry.overallScore)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {isExpanded ? <ChevronUp className="w-4 h-4 text-textSecondary shrink-0" /> : <ChevronDown className="w-4 h-4 text-textSecondary shrink-0" />}
      </button>

      {isExpanded && (
        <div className="px-4 py-3 bg-background border-t border-borderLine space-y-2">
          <p className="text-xs font-bold text-textSecondary mb-2">{entry.levelTitle}</p>
          <PillarBar label="⚔️ Coding" score={entry.codingScore} max={350} color="bg-orange-400" />
          <PillarBar label="🐙 GitHub" score={entry.githubScore} max={200} color="bg-gray-500" />
          <PillarBar label="📚 Academics" score={entry.academicsScore} max={250} color="bg-blue-500" />
          <PillarBar label="🏅 Certs" score={entry.certsScore} max={200} color="bg-emerald-500" />
        </div>
      )}
    </div>
  );
};

const MenteeScoreboard: React.FC = () => {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState('All');

  const { data: leaderboard = [], isLoading, refetch, isFetching } = useQuery<LeaderboardEntry[]>({
    queryKey: ['facultyLeaderboard'],
    queryFn: () => api.getFacultyLeaderboard(),
    staleTime: 5 * 60 * 1000,
  });

  const years = useMemo(() => {
    const all = Array.from(new Set(leaderboard.map(e => e.year))).sort();
    return ['All', ...all];
  }, [leaderboard]);

  const filtered = useMemo(() => {
    let data = leaderboard;
    if (yearFilter !== 'All') data = data.filter(e => e.year === yearFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(e => e.name.toLowerCase().includes(q) || e.studentId.toLowerCase().includes(q));
    }
    return data.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [leaderboard, yearFilter, search]);

  // Summary stats
  const avgXP = filtered.length > 0 ? Math.round(filtered.reduce((s, e) => s + e.overallScore, 0) / filtered.length) : 0;
  const topPerformer = filtered[0];
  const withScores = filtered.filter(e => e.overallScore > 0).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-textPrimary flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Mentee Scoreboard
          </h2>
          <p className="text-xs text-textSecondary mt-0.5">1000-XP RPG System · Coding + GitHub + Academics + Certifications</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-borderLine bg-surface text-textSecondary hover:bg-background transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => exportToCSV(filtered)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-primary text-white hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats row */}
      {!isLoading && leaderboard.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface border border-borderLine rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-brand-primary">{leaderboard.length}</p>
            <p className="text-[11px] text-textSecondary font-semibold">Mentees</p>
          </div>
          <div className="bg-surface border border-borderLine rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-amber-500">{avgXP}</p>
            <p className="text-[11px] text-textSecondary font-semibold">Avg XP</p>
          </div>
          <div className="bg-surface border border-borderLine rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-emerald-500">{withScores}</p>
            <p className="text-[11px] text-textSecondary font-semibold">Scored</p>
          </div>
        </div>
      )}

      {/* Top performer podium */}
      {topPerformer && topPerformer.overallScore > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
          <span className="text-4xl">{topPerformer.badge}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">🏆 Top Mentee</p>
            <p className="text-base font-black text-textPrimary truncate">{topPerformer.name}</p>
            <p className="text-xs text-textSecondary">{topPerformer.levelTitle} · {topPerformer.section}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-amber-600">{topPerformer.overallScore}</p>
            <p className="text-xs text-amber-700 font-semibold">XP</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or roll no…"
          className="flex-1 min-w-[180px] text-sm px-3 py-2 rounded-lg border border-borderLine bg-surface text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border border-borderLine bg-surface text-textPrimary focus:outline-none"
        >
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Leaderboard list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
          <span className="ml-2 text-sm text-textSecondary">Loading scores…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <Star className="w-8 h-8 text-textMuted mb-2" />
          <p className="text-sm font-semibold text-textSecondary">
            {leaderboard.length === 0 ? 'No mentees assigned yet.' : 'No results match your filter.'}
          </p>
          {leaderboard.length > 0 && leaderboard[0]?.overallScore === 0 && (
            <p className="text-xs text-textMuted mt-1">Scores update when students view their profile.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <ScoreboardRow
              key={entry.studentId}
              entry={entry}
              isExpanded={expanded === entry.studentId}
              onToggle={() => setExpanded(prev => prev === entry.studentId ? null : entry.studentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MenteeScoreboard;
