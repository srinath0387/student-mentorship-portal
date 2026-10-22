import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, RefreshCw, Users, TrendingUp } from 'lucide-react';
import { api } from '../../../lib/api';
import { MentoringCompliance } from '../../../types';
import { MeetingLogsView } from '../../../components/MeetingLogsView';

interface Props {
  department?: string;
}

export const MentoringComplianceTab: React.FC<Props> = ({ department }) => {
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery<{ compliance: MentoringCompliance[]; department: string }>({
    queryKey: ['mentoringCompliance', department],
    queryFn: () => api.getMentoringCompliance(department),
    staleTime: 2 * 60 * 1000,
  });

  const { data: deptMeetingLogs = [], isLoading: logsLoading } = useQuery<any[]>({
    queryKey: ['deptMeetingLogs', department],
    queryFn: () => api.getDeptMeetingLogs(department),
    staleTime: 2 * 60 * 1000,
  });

  const compliance = data?.compliance || [];

  const filtered = compliance.filter(f =>
    !search ||
    f.faculty_name.toLowerCase().includes(search.toLowerCase()) ||
    f.faculty_email.toLowerCase().includes(search.toLowerCase())
  );

  const compliant = compliance.filter(f => f.meetings_this_month >= 1).length;
  const totalFaculty = compliance.length;
  const totalMeetings = compliance.reduce((s, f) => s + Number(f.total_meetings), 0);

  const getStatusBadge = (f: MentoringCompliance) => {
    const m = Number(f.meetings_this_month);
    if (m >= 2) return { label: '✅ Active', cls: 'bg-emerald-500/20 text-emerald-400' };
    if (m === 1) return { label: '🟡 Minimal', cls: 'bg-amber-500/20 text-amber-400' };
    return { label: '🔴 No Meetings', cls: 'bg-red-500/20 text-red-400' };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-white/50">
        <RefreshCw className="animate-spin mr-2" size={20} /> Loading compliance data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="text-purple-400" size={22} />
          <h2 className="text-lg font-semibold text-white">Mentoring Compliance</h2>
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs">This Month</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-1.5 text-sm rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{compliant}</div>
          <div className="text-xs text-emerald-300 mt-1">Faculty with Meetings</div>
          <div className="text-xs text-white/40">this month</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{totalFaculty - compliant}</div>
          <div className="text-xs text-red-300 mt-1">No Meetings Yet</div>
          <div className="text-xs text-white/40">this month</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{totalMeetings}</div>
          <div className="text-xs text-blue-300 mt-1">Total Logged</div>
          <div className="text-xs text-white/40">all time</div>
        </div>
      </div>

      {/* Compliance bar */}
      {totalFaculty > 0 && (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex justify-between text-xs text-white/50 mb-2">
            <span>Compliance Rate (this month)</span>
            <span className="font-medium text-white">{Math.round((compliant / totalFaculty) * 100)}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.round((compliant / totalFaculty) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search faculty name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <TrendingUp size={32} className="mx-auto mb-2 opacity-40" />
          No faculty records found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Faculty</th>
                <th className="px-3 py-2.5 text-center text-white/50 font-medium">This Month</th>
                <th className="px-3 py-2.5 text-center text-white/50 font-medium">Total</th>
                <th className="px-3 py-2.5 text-center text-white/50 font-medium">Students Met</th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Last Meeting</th>
                <th className="px-3 py-2.5 text-center text-white/50 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const badge = getStatusBadge(f);
                return (
                  <tr key={f.faculty_email} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-white">{f.faculty_name}</div>
                      <div className="text-xs text-white/40">{f.faculty_email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${Number(f.meetings_this_month) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {f.meetings_this_month}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-white/60">{f.total_meetings}</td>
                    <td className="px-3 py-2.5 text-center text-white/60">{f.students_met}</td>
                    <td className="px-3 py-2.5 text-white/60 text-xs">
                      {f.last_meeting_date
                        ? new Date(f.last_meeting_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : <span className="text-white/30">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Meeting Logs */}
      <div className="space-y-3 mt-6">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          📋 Recent Meeting Logs
          <span className="text-xs font-normal text-white/40">(last 50)</span>
        </h3>
        <MeetingLogsView
          logs={deptMeetingLogs.slice(0, 50)}
          isLoading={logsLoading}
          showStudent={true}
          emptyMessage="No meeting logs found for this department."
        />
      </div>
    </div>
  );
};

export default MentoringComplianceTab;
