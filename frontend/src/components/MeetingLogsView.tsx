import React, { useState } from 'react';
import { Calendar, User, Tag, FileText, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

interface MeetingLog {
  id: number;
  meeting_date: string;
  topics: string;
  action_items?: string;
  next_meeting?: string;
  tag?: string;
  faculty_email?: string;
  faculty_name?: string;
  student_name?: string;
  roll_number?: string;
  year?: string;
  section?: string;
}

const TAG_COLORS: Record<string, string> = {
  'Academic':    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Attendance':  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Behavior':    'bg-red-500/15 text-red-400 border-red-500/30',
  'Placement':   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Career':      'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'General':     'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

interface Props {
  logs: MeetingLog[];
  isLoading?: boolean;
  showStudent?: boolean; // show student name column (for HOD/management view)
  emptyMessage?: string;
}

export const MeetingLogsView: React.FC<Props> = ({
  logs,
  isLoading = false,
  showStudent = false,
  emptyMessage = 'No meeting logs recorded yet.',
}) => {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('All');

  const tags = ['All', ...Array.from(new Set(logs.map(l => l.tag || 'General')))];

  const filtered = logs.filter(l => {
    const matchTag = tagFilter === 'All' || (l.tag || 'General') === tagFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      l.topics?.toLowerCase().includes(q) ||
      l.student_name?.toLowerCase().includes(q) ||
      l.roll_number?.toLowerCase().includes(q) ||
      l.action_items?.toLowerCase().includes(q);
    return matchTag && matchSearch;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
        Loading meeting logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search topics, student..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {tags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filtered.length} log{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Log entries */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">No logs match your search.</p>
      ) : (
        filtered.map(log => {
          const isOpen = expanded === log.id;
          const tagColor = TAG_COLORS[log.tag || 'General'] || TAG_COLORS['General'];
          return (
            <div key={log.id} className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden">
              <button
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-700/30 transition-colors"
                onClick={() => setExpanded(isOpen ? null : log.id)}
              >
                {/* Date badge */}
                <div className="flex-shrink-0 text-center bg-slate-700/60 rounded-lg px-3 py-2 min-w-[64px]">
                  <div className="text-xs text-slate-400">{new Date(log.meeting_date).toLocaleString('en-IN', { month: 'short' })}</div>
                  <div className="text-lg font-bold text-white leading-none">{new Date(log.meeting_date).getDate()}</div>
                  <div className="text-xs text-slate-400">{new Date(log.meeting_date).getFullYear()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tagColor}`}>
                      {log.tag || 'General'}
                    </span>
                    {showStudent && log.student_name && (
                      <span className="text-xs text-slate-300 font-medium">{log.student_name} ({log.roll_number})</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 line-clamp-2">{log.topics}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.faculty_name || log.faculty_email?.split('@')[0] || 'Faculty'}
                    </span>
                    {log.next_meeting && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Next: {new Date(log.next_meeting).toLocaleDateString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-700/40 space-y-3 bg-slate-800/30">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Topics Discussed</p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">{log.topics}</p>
                  </div>
                  {log.action_items && (
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Action Items</p>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{log.action_items}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                    <span>Mentor: <span className="text-slate-300">{log.faculty_name || log.faculty_email?.split('@')[0] || '—'}</span></span>
                    {log.next_meeting && (
                      <span>Next meeting: <span className="text-slate-300">{new Date(log.next_meeting).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
