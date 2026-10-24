import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronUp, Download, RefreshCw, ShieldAlert, TrendingDown } from 'lucide-react';
import { api } from '../../../lib/api';
import { AtRiskStudent } from '../../../types';

interface Props {
  department?: string;
  onViewStudent?: (rollNumber: string) => void;
}

export const AtRiskTab: React.FC<Props> = ({ department, onViewStudent }) => {
  const [sortKey, setSortKey] = useState<'avg_cgpa' | 'attendance_pct'>('avg_cgpa');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery<{ students: AtRiskStudent[]; total: number }>({
    queryKey: ['atRiskStudents', department],
    queryFn: () => api.getAtRiskStudents(department),
    staleTime: 2 * 60 * 1000,
  });

  const students = data?.students || [];

  const filtered = students
    .filter(s => filter === 'all' || s.severity === filter)
    .filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.roll_number.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = sortKey === 'avg_cgpa' ? a.avg_cgpa : (a.attendance_pct ?? 999);
      const bVal = sortKey === 'avg_cgpa' ? b.avg_cgpa : (b.attendance_pct ?? 999);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

  const highRisk = students.filter(s => s.severity === 'high').length;
  const mediumRisk = students.filter(s => s.severity === 'medium').length;

  const handleSort = (key: 'avg_cgpa' | 'attendance_pct') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const exportCSV = () => {
    const rows = [
      ['Roll No', 'Name', 'Year', 'Section', 'Department', 'CGPA', 'Attendance %', 'Risk Reasons', 'Severity'],
      ...filtered.map(s => [
        s.roll_number, s.name, s.year, s.section, s.department,
        s.avg_cgpa.toFixed(2),
        s.attendance_pct !== null ? s.attendance_pct.toFixed(1) + '%' : 'N/A',
        s.risk_reasons.join(' | '),
        s.severity.toUpperCase(),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `at-risk-students-${department || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-white/50">
        <RefreshCw className="animate-spin mr-2" size={20} /> Loading at-risk students…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-red-400" size={22} />
          <h2 className="text-lg font-semibold text-white">At-Risk Students</h2>
          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
            {students.length} students
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center gap-1.5"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{highRisk}</div>
          <div className="text-xs text-red-300 mt-1">🔴 High Risk</div>
          <div className="text-xs text-white/40 mt-0.5">CGPA &lt;5 or Att &lt;65%</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{mediumRisk}</div>
          <div className="text-xs text-amber-300 mt-1">🟡 Medium Risk</div>
          <div className="text-xs text-white/40 mt-0.5">CGPA &lt;6 or Att &lt;75%</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{students.length}</div>
          <div className="text-xs text-blue-300 mt-1">Total Flagged</div>
          <div className="text-xs text-white/40 mt-0.5">Needs attention</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search student name or roll no…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
        />
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {(['all', 'high', 'medium'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                filter === f ? 'bg-red-500/30 text-red-300' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'All' : f === 'high' ? '🔴 High' : '🟡 Medium'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <TrendingDown size={32} className="mx-auto mb-2 opacity-40" />
          {students.length === 0 ? 'No at-risk students found — great news!' : 'No students match the current filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Student</th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Year / Sec</th>
                <th
                  className="px-3 py-2.5 text-left text-white/50 font-medium cursor-pointer hover:text-white/70 select-none"
                  onClick={() => handleSort('avg_cgpa')}
                >
                  <span className="flex items-center gap-1">
                    CGPA {sortKey === 'avg_cgpa' && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
                <th
                  className="px-3 py-2.5 text-left text-white/50 font-medium cursor-pointer hover:text-white/70 select-none"
                  onClick={() => handleSort('attendance_pct')}
                >
                  <span className="flex items-center gap-1">
                    Attendance {sortKey === 'attendance_pct' && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Risk Reasons</th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(student => (
                <tr
                  key={student.roll_number}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          student.severity === 'high' ? 'bg-red-400' : 'bg-amber-400'
                        }`}
                      />
                      <div>
                        <div className="font-medium text-white">{student.name}</div>
                        <div className="text-xs text-white/40">{student.roll_number}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-white/60">{student.year} / {student.section}</td>
                  <td className="px-3 py-2.5">
                    <span className={`font-semibold ${student.avg_cgpa < 5 ? 'text-red-400' : student.avg_cgpa < 6 ? 'text-amber-400' : 'text-white'}`}>
                      {student.avg_cgpa.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {student.attendance_pct !== null ? (
                      <span className={`font-semibold ${
                        student.attendance_pct < 65 ? 'text-red-400' :
                        student.attendance_pct < 75 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {student.attendance_pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {student.risk_reasons.map((r, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-xs whitespace-nowrap">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {onViewStudent && (
                      <button
                        onClick={() => onViewStudent(student.roll_number)}
                        className="text-xs px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                      >
                        View Profile
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-white/30 text-right">
        Showing {filtered.length} of {students.length} flagged students
        {department ? ` in ${department}` : ''}
      </div>
    </div>
  );
};

export default AtRiskTab;
