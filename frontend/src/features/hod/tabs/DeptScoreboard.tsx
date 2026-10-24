import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, RefreshCw, Download, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { api } from '../../../lib/api';
import { LeaderboardEntry } from '../../../types';
import { useAuth } from '../../../context/AuthContext';

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

const PILLAR_CONFIG = [
  { key: 'codingScore' as keyof LeaderboardEntry, label: '⚔️ Coding', max: 350, color: 'bg-orange-400' },
  { key: 'githubScore' as keyof LeaderboardEntry, label: '🐙 GitHub', max: 200, color: 'bg-gray-500' },
  { key: 'academicsScore' as keyof LeaderboardEntry, label: '📚 Academics', max: 250, color: 'bg-blue-500' },
  { key: 'certsScore' as keyof LeaderboardEntry, label: '🏅 Certs', max: 200, color: 'bg-emerald-500' },
];

function exportToCSV(data: LeaderboardEntry[]) {
  const headers = ['Rank', 'Name', 'Roll No', 'Section', 'Year', 'Dept', 'Total XP', 'Coding', 'GitHub', 'Academics', 'Certs', 'Level', 'Badge', 'Mentor'];
  const rows = data.map(e => [e.rank, e.name, e.studentId, e.section, e.year, e.department, e.overallScore, e.codingScore, e.githubScore, e.academicsScore, e.certsScore, e.levelTitle, e.badge, e.mentorEmail || '']);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'dept_scoreboard.csv'; a.click();
  URL.revokeObjectURL(url);
}

const LevelDistBar: React.FC<{ entries: LeaderboardEntry[] }> = ({ entries }) => {
  if (entries.length === 0) return null;
  const dist: Record<string, number> = {};
  for (const e of entries) {
    const grp = e.levelNumber <= 3 ? 'Beginner' : e.levelNumber <= 6 ? 'Intermediate' : e.levelNumber <= 8 ? 'Advanced' : 'Elite';
    dist[grp] = (dist[grp] || 0) + 1;
  }
  const order = ['Beginner', 'Intermediate', 'Advanced', 'Elite'];
  const colors = ['bg-gray-400', 'bg-blue-400', 'bg-violet-500', 'bg-amber-500'];
  return (
    <div className="bg-surface border border-borderLine rounded-xl p-4 space-y-2">
      <h4 className="text-xs font-bold text-textSecondary uppercase tracking-wider">Level Distribution</h4>
      {order.map((grp, i) => {
        const count = dist[grp] || 0;
        const pct = Math.round((count / entries.length) * 100);
        return (
          <div key={grp} className="flex items-center gap-2 text-xs">
            <span className="w-24 text-textSecondary">{grp}</span>
            <div className="flex-1 h-2 bg-borderLine rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colors[i]}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-16 text-right font-semibold text-textPrimary">{count} ({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
};

const Podium: React.FC<{ top3: LeaderboardEntry[] }> = ({ top3 }) => {
  const [first, second, third] = [top3[0], top3[1], top3[2]];
  if (!first) return null;
  return (
    <div className="flex items-end justify-center gap-2 pt-4">
      {/* 2nd */}
      {second && (
        <div className="flex flex-col items-center gap-1 flex-1">
          <span className="text-2xl">{second.badge}</span>
          <p className="text-xs font-bold text-textPrimary text-center truncate w-full">{second.name.split(' ')[0]}</p>
          <p className="text-sm font-black text-gray-500">{second.overallScore} XP</p>
          <div className="w-full h-16 bg-gray-200 rounded-t-lg flex items-center justify-center">
            <span className="text-2xl font-black text-gray-500">🥈</span>
          </div>
        </div>
      )}
      {/* 1st */}
      <div className="flex flex-col items-center gap-1 flex-1">
        <span className="text-3xl">{first.badge}</span>
        <p className="text-xs font-bold text-textPrimary text-center truncate w-full">{first.name.split(' ')[0]}</p>
        <p className="text-base font-black text-amber-600">{first.overallScore} XP</p>
        <div className="w-full h-24 bg-amber-200 rounded-t-lg flex items-center justify-center">
          <span className="text-3xl font-black text-amber-600">🥇</span>
        </div>
      </div>
      {/* 3rd */}
      {third && (
        <div className="flex flex-col items-center gap-1 flex-1">
          <span className="text-2xl">{third.badge}</span>
          <p className="text-xs font-bold text-textPrimary text-center truncate w-full">{third.name.split(' ')[0]}</p>
          <p className="text-sm font-black text-orange-600">{third.overallScore} XP</p>
          <div className="w-full h-10 bg-orange-200 rounded-t-lg flex items-center justify-center">
            <span className="text-2xl font-black text-orange-600">🥉</span>
          </div>
        </div>
      )}
    </div>
  );
};

const DeptScoreboard: React.FC = () => {
  const { user } = useAuth();
  const [yearFilter, setYearFilter] = useState('All');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'podium'>('list');

  const { data: leaderboard = [], isLoading, refetch, isFetching } = useQuery<LeaderboardEntry[]>({
    queryKey: ['hodLeaderboard', user?.department],
    queryFn: () => api.getHodLeaderboard({ department: user?.department, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const years = useMemo(() => ['All', ...Array.from(new Set(leaderboard.map(e => e.year))).sort()], [leaderboard]);
  const sections = useMemo(() => ['All', ...Array.from(new Set(leaderboard.map(e => e.section))).sort()], [leaderboard]);

  const filtered = useMemo(() => {
    let data = leaderboard;
    if (yearFilter !== 'All') data = data.filter(e => e.year === yearFilter);
    if (sectionFilter !== 'All') data = data.filter(e => e.section === sectionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(e => e.name.toLowerCase().includes(q) || e.studentId.toLowerCase().includes(q));
    }
    return data.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [leaderboard, yearFilter, sectionFilter, search]);

  const avgXP = filtered.length > 0 ? Math.round(filtered.reduce((s, e) => s + e.overallScore, 0) / filtered.length) : 0;
  const withScores = filtered.filter(e => e.overallScore > 0).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-textPrimary flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Department Scoreboard
          </h2>
          <p className="text-xs text-textSecondary mt-0.5">1000-XP RPG · {user?.department}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(v => v === 'list' ? 'podium' : 'list')}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-borderLine bg-surface text-textSecondary hover:bg-background transition-colors"
          >
            {viewMode === 'list' ? '🏆 Podium View' : '📋 List View'}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-borderLine bg-surface text-textSecondary hover:bg-background disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => exportToCSV(filtered)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-primary text-white hover:opacity-90"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && leaderboard.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface border border-borderLine rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-brand-primary">{leaderboard.length}</p>
            <p className="text-[11px] text-textSecondary font-semibold">Students</p>
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

      {/* Level Distribution */}
      {!isLoading && filtered.length > 0 && <LevelDistBar entries={filtered} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student…"
          className="flex-1 min-w-[160px] text-sm px-3 py-2 rounded-lg border border-borderLine bg-surface text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-borderLine bg-surface text-textPrimary focus:outline-none">
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-borderLine bg-surface text-textPrimary focus:outline-none">
          {sections.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
          <span className="ml-2 text-sm text-textSecondary">Loading department scores…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <Trophy className="w-8 h-8 text-textMuted mb-2" />
          <p className="text-sm font-semibold text-textSecondary">
            {leaderboard.length === 0 ? 'No scores yet. Scores compute when students view their profile.' : 'No students match your filter.'}
          </p>
        </div>
      ) : viewMode === 'podium' ? (
        <div className="bg-surface border border-borderLine rounded-xl p-6">
          <Podium top3={filtered.filter(e => e.overallScore > 0).slice(0, 3)} />
          {filtered.filter(e => e.overallScore > 0).length < 1 && (
            <p className="text-center text-sm text-textSecondary mt-4">No scored students yet.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <div key={entry.studentId} className="border border-borderLine rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(prev => prev === entry.studentId ? null : entry.studentId)}
                className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-background transition-colors text-left"
              >
                {/* Rank */}
                <div className={`w-8 h-8 rounded-full text-xs flex items-center justify-center shrink-0 ${
                  entry.rank === 1 ? 'bg-amber-100 text-amber-700 border border-amber-300 font-black' :
                  entry.rank === 2 ? 'bg-gray-100 text-gray-600 border border-gray-300 font-black' :
                  entry.rank === 3 ? 'bg-orange-100 text-orange-700 border border-orange-300 font-black' :
                  'bg-surface border border-borderLine font-bold text-textSecondary'
                }`}>
                  {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                </div>

                <span className="text-lg shrink-0">{entry.badge}</span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-textPrimary truncate">{entry.name}</p>
                  <p className="text-[11px] text-textSecondary">{entry.studentId} · {entry.section} · {entry.year}</p>
                </div>

                <span className={`hidden sm:flex text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${LEVEL_COLORS[entry.levelNumber] || 'bg-gray-100 text-gray-600'}`}>
                  Lv.{entry.levelNumber}
                </span>

                <div className="flex flex-col items-end gap-1 shrink-0 w-28">
                  <span className="text-sm font-black text-brand-primary">{entry.overallScore} XP</span>
                  <div className="w-full h-1.5 bg-borderLine rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${entry.overallScore >= 800 ? 'bg-yellow-400' : entry.overallScore >= 600 ? 'bg-orange-400' : entry.overallScore >= 400 ? 'bg-indigo-400' : entry.overallScore >= 200 ? 'bg-teal-400' : 'bg-gray-400'}`}
                      style={{ width: `${Math.min(100, (entry.overallScore / 1000) * 100)}%` }}
                    />
                  </div>
                </div>

                {expanded === entry.studentId ? <ChevronUp className="w-4 h-4 text-textSecondary shrink-0" /> : <ChevronDown className="w-4 h-4 text-textSecondary shrink-0" />}
              </button>

              {expanded === entry.studentId && (
                <div className="px-4 py-3 bg-background border-t border-borderLine space-y-2">
                  <p className="text-xs font-bold text-textSecondary mb-2">{entry.levelTitle} {entry.mentorEmail && `· Mentor: ${entry.mentorEmail}`}</p>
                  {PILLAR_CONFIG.map(p => (
                    <div key={p.key} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-textSecondary shrink-0">{p.label}</span>
                      <div className="flex-1 h-1.5 bg-borderLine rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${p.color}`} style={{ width: `${Math.min(100, ((entry[p.key] as number) / p.max) * 100)}%` }} />
                      </div>
                      <span className="w-14 text-right font-semibold text-textPrimary">{entry[p.key]} / {p.max}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeptScoreboard;
