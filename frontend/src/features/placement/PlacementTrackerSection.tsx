import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CheckCircle2, Plus, RefreshCw, Trash2, Trophy, TrendingUp, Building2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { StudentPlacement, PlacementSummary } from '../../types';

interface Props {
  isHodView?: boolean;
  isAdminView?: boolean;
  isStudentView?: boolean;
  department?: string;
  studentRollNumber?: string;
}

const PLACEMENT_TYPES = ['On-Campus', 'Off-Campus', 'CGAP', 'Internship'] as const;

const PlacementForm: React.FC<{
  onSubmit: (data: any) => void;
  isLoading: boolean;
  onCancel: () => void;
}> = ({ onSubmit, isLoading, onCancel }) => {
  const [form, setForm] = useState({
    company_name: '', role_title: '', package_lpa: '', offer_date: '', placement_type: 'On-Campus',
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, package_lpa: form.package_lpa ? parseFloat(form.package_lpa) : undefined });
  };
  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-white flex items-center gap-2">
        <Plus size={16} className="text-emerald-400" /> Report Placement
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/50 mb-1 block">Company Name *</label>
          <input
            required
            value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
            placeholder="e.g. TCS, Infosys, Google"
            className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Role / Job Title *</label>
          <input
            required
            value={form.role_title}
            onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))}
            placeholder="e.g. Software Engineer"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Package (LPA)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.package_lpa}
            onChange={e => setForm(f => ({ ...f, package_lpa: e.target.value }))}
            placeholder="e.g. 6.5"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Offer Date</label>
          <input
            type="date"
            value={form.offer_date}
            onChange={e => setForm(f => ({ ...f, offer_date: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Type</label>
          <select
            value={form.placement_type}
            onChange={e => setForm(f => ({ ...f, placement_type: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
          >
            {PLACEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-white/10 text-white/70 hover:bg-white/20">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 text-sm rounded-lg bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40 font-medium flex items-center gap-2"
        >
          {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Submit
        </button>
      </div>
    </form>
  );
};

export const PlacementTrackerSection: React.FC<Props> = ({
  isHodView = false,
  isAdminView = false,
  isStudentView = false,
  department,
  studentRollNumber,
}) => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: placements = [], isLoading, refetch, isFetching } = useQuery<StudentPlacement[]>({
    queryKey: ['studentPlacements', department, studentRollNumber],
    queryFn: () => api.getStudentPlacements({
      department,
      roll_number: studentRollNumber,
    }),
    staleTime: 0,
  });

  const { data: summary } = useQuery<PlacementSummary>({
    queryKey: ['hodPlacementSummary', department],
    queryFn: () => api.getHodPlacementSummary(department),
    enabled: isHodView || isAdminView,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createStudentPlacement(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studentPlacements'] });
      qc.invalidateQueries({ queryKey: ['hodPlacementSummary'] });
      setShowForm(false);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.verifyPlacement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studentPlacements'] });
      qc.invalidateQueries({ queryKey: ['hodPlacementSummary'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteStudentPlacement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studentPlacements'] });
      qc.invalidateQueries({ queryKey: ['hodPlacementSummary'] });
    },
  });

  const typeColor: Record<string, string> = {
    'On-Campus': 'bg-blue-500/20 text-blue-400',
    'Off-Campus': 'bg-purple-500/20 text-purple-400',
    'CGAP': 'bg-orange-500/20 text-orange-400',
    'Internship': 'bg-cyan-500/20 text-cyan-400',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="text-yellow-400" size={22} />
          <h2 className="text-lg font-semibold text-white">
            {isHodView || isAdminView ? 'Department Placement Tracker' : '🎓 My Placement'}
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          {(isStudentView || isHodView || isAdminView) && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center gap-1.5"
            >
              <Plus size={14} /> {isStudentView ? 'Report My Placement' : 'Add Placement'}
            </button>
          )}
        </div>
      </div>

      {/* HOD/Admin Summary Cards */}
      {(isHodView || isAdminView) && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{summary.total_placed}</div>
            <div className="text-xs text-yellow-300 mt-1">Total Placed</div>
            <div className="text-xs text-white/40">{summary.placement_rate}% rate</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{summary.verified_placements}</div>
            <div className="text-xs text-emerald-300 mt-1">Verified</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {summary.avg_package_lpa ? `${summary.avg_package_lpa.toFixed(1)} LPA` : '—'}
            </div>
            <div className="text-xs text-blue-300 mt-1">Avg Package</div>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {summary.max_package_lpa ? `${summary.max_package_lpa} LPA` : '—'}
            </div>
            <div className="text-xs text-purple-300 mt-1">Highest Package</div>
          </div>
        </div>
      )}

      {/* Top Companies */}
      {(isHodView || isAdminView) && summary && summary.top_companies.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-white/50" />
            <span className="text-sm font-medium text-white/70">Top Recruiting Companies</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.top_companies.map((c, i) => (
              <div
                key={c.company_name}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm"
              >
                <span className="text-white/40 text-xs mr-1.5">#{i + 1}</span>
                <span className="text-white">{c.company_name}</span>
                <span className="ml-1.5 text-white/40 text-xs">({c.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <PlacementForm
          onSubmit={data => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Placements List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-white/50">
          <RefreshCw className="animate-spin mr-2" size={18} /> Loading…
        </div>
      ) : placements.length === 0 ? (
        <div className="text-center py-10 text-white/40">
          <Briefcase size={32} className="mx-auto mb-2 opacity-40" />
          No placement records yet.
          {isStudentView && (
            <div className="mt-2 text-sm">Click "Report My Placement" to add your offer!</div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {(isHodView || isAdminView) && (
                  <th className="px-3 py-2.5 text-left text-white/50 font-medium">Student</th>
                )}
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Company</th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Role</th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Package</th>
                <th className="px-3 py-2.5 text-left text-white/50 font-medium">Type</th>
                <th className="px-3 py-2.5 text-center text-white/50 font-medium">Status</th>
                <th className="px-3 py-2.5 text-center text-white/50 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {placements.map(p => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  {(isHodView || isAdminView) && (
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-white text-xs">{p.student_name || '—'}</div>
                      <div className="text-xs text-white/40">{p.roll_number}</div>
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-medium text-white">{p.company_name}</td>
                  <td className="px-3 py-2.5 text-white/70">{p.role_title}</td>
                  <td className="px-3 py-2.5 text-emerald-400 font-semibold">
                    {p.package_lpa ? `${p.package_lpa} LPA` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${typeColor[p.placement_type] || 'bg-white/10 text-white/60'}`}>
                      {p.placement_type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {p.verified ? (
                      <span className="flex items-center justify-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    ) : (
                      <span className="text-amber-400 text-xs">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-2">
                      {(isHodView || isAdminView) && !p.verified && (
                        <button
                          onClick={() => verifyMutation.mutate(p.id)}
                          disabled={verifyMutation.isPending}
                          className="text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        >
                          Verify
                        </button>
                      )}
                      {(isHodView || isAdminView || isStudentView) && (
                        <button
                          onClick={() => { if (confirm('Delete this placement record?')) deleteMutation.mutate(p.id); }}
                          disabled={deleteMutation.isPending}
                          className="text-xs p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        >
                          <Trash2 size={12} />
                        </button>
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
};

export default PlacementTrackerSection;
