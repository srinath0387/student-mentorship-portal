import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Send, RefreshCw, ChevronDown } from 'lucide-react';
import { api } from '../../lib/api';

const PRIORITIES = ['normal', 'important', 'urgent'] as const;
const YEARS = ['All Years', '1st Year', '2nd Year', '3rd Year', '4th Year'] as const;
const TARGET_ROLES = ['student', 'faculty', 'hod'] as const;

interface Props {
  department?: string;
}

export const BroadcastNoticePanel: React.FC<Props> = ({ department }) => {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    target_year: '',
    priority: 'normal' as typeof PRIORITIES[number],
    expires_at: '',
  });
  const [success, setSuccess] = useState(false);

  const { data: recent = [] } = useQuery<any[]>({
    queryKey: ['broadcastNotices', department],
    queryFn: () => api.getBroadcastNotices(department),
    staleTime: 60 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: (data: any) => api.broadcastNotice(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcastNotices'] });
      setForm({ title: '', message: '', target_year: '', priority: 'normal', expires_at: '' });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMutation.mutate({
      ...form,
      target_department: department,
      target_year: form.target_year || undefined,
    });
  };

  const priorityColors: Record<string, string> = {
    normal: 'bg-blue-500/20 text-blue-400',
    important: 'bg-amber-500/20 text-amber-400',
    urgent: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="bg-[#0f0f1a] border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">📢 Broadcast Notifications</span>
          <span className="text-xs text-white/40">({recent.length} sent)</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Send Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-white/50 mb-1 block">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Notice title…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-white/50 mb-1 block">Message *</label>
                <textarea
                  required
                  rows={3}
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Notice message…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-blue-400/50"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Target Year</label>
                <select
                  value={form.target_year}
                  onChange={e => setForm(f => ({ ...f, target_year: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50"
                >
                  {YEARS.map(y => (
                    <option key={y} value={y === 'All Years' ? '' : y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50"
                >
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Expires (optional)</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50"
                />
              </div>
            </div>

            {success && (
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-300">
                ✅ Broadcast sent successfully!
              </div>
            )}

            <button
              type="submit"
              disabled={sendMutation.isPending}
              className="w-full py-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {sendMutation.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Send Broadcast{department ? ` to ${department}` : ''}
            </button>
          </form>

          {/* Recent Broadcasts */}
          {recent.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-white/40 font-medium">Recent Broadcasts</div>
              {recent.slice(0, 5).map((n: any) => (
                <div key={n.id} className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white font-medium truncate">{n.title}</span>
                    {n.priority && (
                      <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${priorityColors[n.priority] || priorityColors.normal}`}>
                        {n.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5 truncate">{n.message}</div>
                  <div className="text-xs text-white/30 mt-0.5">
                    {new Date(n.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BroadcastNoticePanel;
