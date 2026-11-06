import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, RefreshCw, Trash2, Calendar, MessageSquare } from 'lucide-react';
import { api } from '../../lib/api';
import { MentorMeeting } from '../../types';

const TAGS = ['General', 'Academic', 'Attendance', 'Placement', 'Personal', 'Disciplinary'];

interface Props {
  rollNumber: string;
  studentName: string;
  onClose: () => void;
  facultyEmail: string;
}

export const MeetingLogModal: React.FC<Props> = ({ rollNumber, studentName, onClose, facultyEmail }) => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    meeting_date: new Date().toISOString().split('T')[0],
    topics: '',
    action_items: '',
    next_meeting: '',
    tag: 'General',
  });

  const { data: meetings = [], isLoading } = useQuery<MentorMeeting[]>({
    queryKey: ['mentorMeetings', rollNumber],
    queryFn: () => api.getMentorMeetings({ student_id: rollNumber }),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createMentorMeeting(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentorMeetings', rollNumber] });
      setShowForm(false);
      setForm({ meeting_date: new Date().toISOString().split('T')[0], topics: '', action_items: '', next_meeting: '', tag: 'General' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteMentorMeeting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentorMeetings', rollNumber] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, roll_number: rollNumber, student_name: studentName });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <MessageSquare className="text-purple-400" size={20} />
            <div>
              <h2 className="font-semibold text-white">Meeting Log</h2>
              <p className="text-xs text-white/50">{studentName} · {rollNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-3 py-1.5 text-sm rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 flex items-center gap-1.5"
            >
              <Plus size={14} /> Log Meeting
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Log Meeting Form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-purple-300">New Meeting Entry</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Meeting Date *</label>
                  <input
                    required
                    type="date"
                    value={form.meeting_date}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Tag</label>
                  <select
                    value={form.tag}
                    onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400/50"
                  >
                    {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Topics Discussed *</label>
                <textarea
                  required
                  rows={3}
                  value={form.topics}
                  onChange={e => setForm(f => ({ ...f, topics: e.target.value }))}
                  placeholder="What was discussed in this meeting…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-purple-400/50"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Action Items</label>
                <textarea
                  rows={2}
                  value={form.action_items}
                  onChange={e => setForm(f => ({ ...f, action_items: e.target.value }))}
                  placeholder="Tasks assigned to student…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-purple-400/50"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Next Meeting Date</label>
                <input
                  type="date"
                  value={form.next_meeting}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setForm(f => ({ ...f, next_meeting: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400/50"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-lg bg-white/10 text-white/60 hover:bg-white/20">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 text-sm rounded-lg bg-purple-500/30 text-purple-300 hover:bg-purple-500/40 font-medium flex items-center gap-1.5"
                >
                  {createMutation.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                  Save Meeting
                </button>
              </div>
            </form>
          )}

          {/* Meeting History */}
          {isLoading ? (
            <div className="text-center py-8 text-white/40">
              <RefreshCw className="animate-spin mx-auto mb-2" size={18} />
              Loading meetings…
            </div>
          ) : meetings.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <Calendar size={28} className="mx-auto mb-2 opacity-40" />
              No meetings logged yet.
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white/50">Meeting History ({meetings.length})</h3>
              {meetings.map(m => (
                <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">
                          {new Date(m.meeting_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs">{m.tag}</span>
                      </div>
                      <p className="text-sm text-white/70 mt-1">{m.topics}</p>
                      {m.action_items && (
                        <div className="mt-2 text-xs text-white/50">
                          <span className="text-white/30">Action items: </span>{m.action_items}
                        </div>
                      )}
                      {m.next_meeting && (
                        <div className="mt-1 text-xs text-blue-400">
                          Next meeting: {new Date(m.next_meeting).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                    {m.faculty_email === facultyEmail && (
                      <button
                        onClick={() => { if (confirm('Delete this meeting log?')) deleteMutation.mutate(m.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingLogModal;
