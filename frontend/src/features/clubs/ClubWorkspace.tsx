import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Download, Loader2, Megaphone, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { RoleChip, StatusChip, btnGhost, btnPrimary, card, downloadCsv, fmtDate, fmtDateTime, input, label, todayIso, Empty } from './clubUi';

type Mode = 'admin' | 'coordinator' | 'lead';

/** Run a club: members (payment checks, roles), sessions & announcements, session attendance. */
export function ClubWorkspace({ club, mode, onClose }: { club: any; mode: Mode; onClose: () => void }) {
  const [tab, setTab] = useState<'members' | 'sessions'>(mode === 'lead' ? 'sessions' : 'members');
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="p-4 border-b border-borderLine flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-textPrimary">{club.name}</h3>
          <p className="text-[11px] text-textSecondary">
            {mode === 'admin' ? 'Verify payments, assign lead / co-lead, post sessions' : mode === 'coordinator' ? 'You are the faculty coordinator' : 'You lead this club'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold">
            {(['members', 'sessions'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 ${tab === t ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>
                {t === 'members' ? 'Members' : 'Sessions & updates'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
      </div>
      {tab === 'members' ? <Members club={club} mode={mode} /> : <Sessions club={club} />}
    </div>
  );
}

function Members({ club, mode }: { club: any; mode: Mode }) {
  const qc = useQueryClient();
  const { data: members = [], isLoading } = useQuery<any[]>({ queryKey: ['clubMembers', club.id], queryFn: () => api.getClubMembers(club.id) });
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: ({ mid, body }: { mid: number; body: any }) => api.updateClubMembership(mid, body),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ['clubMembers', club.id] }); qc.invalidateQueries({ queryKey: ['clubs'] }); },
    onError: (e: any) => setErr(e.message || 'Could not update'),
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    members.forEach(m => { c[m.status] = (c[m.status] || 0) + 1; });
    return c;
  }, [members]);
  const shown = members.filter(m => (filter === 'all' ? !['withdrawn', 'expired'].includes(m.status) : m.status === filter))
    .filter(m => !q.trim() || `${m.student_name} ${m.roll_number} ${m.department} ${m.payment_ref || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const isAdmin = mode === 'admin';
  const reject = (m: any) => {
    const why = window.prompt(`Reason for rejecting ${m.student_name}'s registration (shown to the student):`, m.status === 'payment_submitted' ? 'Payment not received for this transaction ID' : '');
    if (why && why.trim()) act.mutate({ mid: m.id, body: { status: 'rejected', remarks: why.trim() } });
  };

  const FILTERS = isAdmin
    ? [['all', 'All'], ['payment_submitted', 'To verify'], ['approved', 'Members'], ['pending_payment', 'Payment due'], ['waitlisted', 'Waitlist'], ['rejected', 'Rejected'], ['expired', 'Expired']]
    : [['all', 'All']];

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, t]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${filter === k ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>
            {t}{k !== 'all' && counts[k] ? ` (${counts[k]})` : ''}
          </button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, roll no, UTR…" className={`${input} ml-auto w-56`} />
        <button className={btnGhost} onClick={() => downloadCsv(`${club.name}-members.csv`,
          ['Roll No', 'Name', 'Department', 'Year', 'Section', 'Status', 'Role', 'Payment Ref', 'Sessions Attended', 'Registered'],
          shown.map(m => [m.roll_number, m.student_name, m.department, m.year, m.section, m.status, m.role, m.payment_ref || '', m.sessions_attended, fmtDateTime(m.applied_at)]))}>
          <Download className="w-3.5 h-3.5 inline mr-1" />CSV
        </button>
      </div>
      {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
      <div className="overflow-x-auto rounded-xl border border-borderLine">
        <table className="w-full text-xs text-left">
          <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
            <tr>
              <th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2">Payment ref</th>}
              <th className="px-3 py-2 text-center">Sessions</th><th className="px-3 py-2">Role</th>
              {isAdmin && <th className="px-3 py-2 text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLine">
            {isLoading ? <tr><td colSpan={7}><Empty><Loader2 className="w-4 h-4 animate-spin inline" /></Empty></td></tr>
              : shown.length === 0 ? <tr><td colSpan={7}><Empty>No registrations here yet.</Empty></td></tr>
              : shown.map(m => (
                <tr key={m.id} className="hover:bg-surface-2/60">
                  <td className="px-3 py-2"><b className="text-textPrimary">{m.student_name}</b><br /><span className="text-textMuted text-[10px]">{m.roll_number}</span></td>
                  <td className="px-3 py-2 text-textSecondary">{m.department} · {m.year} · {m.section || '—'}</td>
                  <td className="px-3 py-2"><StatusChip status={m.status} />{m.remarks && <p className="text-[10px] text-textMuted mt-0.5 max-w-[14rem]">{m.remarks}</p>}</td>
                  {isAdmin && <td className="px-3 py-2 font-mono text-[11px] text-textPrimary">{m.payment_ref || '—'}</td>}
                  <td className="px-3 py-2 text-center font-bold text-textPrimary">{m.sessions_attended}</td>
                  <td className="px-3 py-2">
                    {isAdmin && m.status === 'approved' ? (
                      <select value={m.role} disabled={act.isPending} onChange={e => act.mutate({ mid: m.id, body: { role: e.target.value } })} className={`${input} py-1`}>
                        <option value="member">Member</option><option value="lead">Lead</option><option value="co_lead">Co-Lead</option>
                      </select>
                    ) : <RoleChip role={m.role} />}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {['payment_submitted', 'pending_payment'].includes(m.status) && (
                        <button disabled={act.isPending} onClick={() => act.mutate({ mid: m.id, body: { status: 'approved' } })}
                          className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold mr-1 disabled:opacity-50" title="Payment received — confirm membership">
                          <Check className="w-3 h-3 inline" /> Approve
                        </button>
                      )}
                      {['payment_submitted', 'pending_payment', 'approved'].includes(m.status) && (
                        <button disabled={act.isPending} onClick={() => reject(m)} className="px-2 py-1 rounded-lg border border-rose-300 text-rose-600 text-[11px] font-bold disabled:opacity-50">Reject</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {isAdmin && <p className="text-[10px] text-textMuted">Check the UTR against the bank / UPI statement before approving. Rejecting frees the seat and the next waitlisted student moves up automatically.</p>}
    </div>
  );
}

function Sessions({ club }: { club: any }) {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useQuery<any[]>({ queryKey: ['clubSessions', club.id], queryFn: () => api.getClubSessions(club.id) });
  const { data: members = [] } = useQuery<any[]>({ queryKey: ['clubMembers', club.id], queryFn: () => api.getClubMembers(club.id) });
  const approved = members.filter(m => m.status === 'approved');
  const blank = { kind: 'session', title: '', session_date: todayIso(), start_time: '', end_time: '', venue: '', details: '' };
  const [f, setF] = useState<any>(blank);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [marking, setMarking] = useState<any | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['clubSessions', club.id] }); qc.invalidateQueries({ queryKey: ['clubMembers', club.id] }); };
  const post = useMutation({
    mutationFn: () => api.postClubSession(club.id, f),
    onSuccess: () => { setF(blank); setOpen(false); setErr(null); refresh(); },
    onError: (e: any) => setErr(e.message || 'Could not post'),
  });
  const del = useMutation({ mutationFn: (sid: number) => api.deleteClubSession(sid), onSuccess: refresh });

  return (
    <div className="p-4 space-y-4">
      {!open ? (
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={() => { setF({ ...blank, kind: 'session' }); setOpen(true); }}><CalendarPlus className="w-3.5 h-3.5 inline mr-1" />Schedule a session</button>
          <button className={btnGhost} onClick={() => { setF({ ...blank, kind: 'announcement', session_date: '' }); setOpen(true); }}><Megaphone className="w-3.5 h-3.5 inline mr-1" />Post an announcement</button>
          <span className="text-[11px] text-textMuted self-center">Members see these under “My Clubs → Updates”.</span>
        </div>
      ) : (
        <div className="rounded-xl border border-borderLine p-4 space-y-3 bg-surface-2/40">
          <p className="text-xs font-black text-textPrimary">{f.kind === 'session' ? 'New session' : 'New announcement'}</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1 md:col-span-2"><label className={label}>Title</label>
              <input className={`${input} w-full`} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={f.kind === 'session' ? 'e.g. Intro to Git & GitHub — hands-on' : 'e.g. Hackathon team sign-ups close Friday'} /></div>
            {f.kind === 'session' && (<>
              <div className="space-y-1"><label className={label}>Date</label><input type="date" className={`${input} w-full`} value={f.session_date} onChange={e => setF({ ...f, session_date: e.target.value })} /></div>
              <div className="space-y-1"><label className={label}>Venue</label><input className={`${input} w-full`} value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} placeholder="Room / lab / online link" /></div>
              <div className="space-y-1"><label className={label}>Starts</label><input type="time" className={`${input} w-full`} value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></div>
              <div className="space-y-1"><label className={label}>Ends</label><input type="time" className={`${input} w-full`} value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} /></div>
            </>)}
            <div className="space-y-1 md:col-span-2"><label className={label}>Details</label>
              <textarea rows={3} className={`${input} w-full`} value={f.details} onChange={e => setF({ ...f, details: e.target.value })} placeholder="Agenda, what to bring, speaker…" /></div>
          </div>
          {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={!f.title.trim() || post.isPending} onClick={() => post.mutate()}>{post.isPending ? 'Posting…' : 'Post to members'}</button>
            <button className={btnGhost} onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <Empty><Loader2 className="w-4 h-4 animate-spin inline" /></Empty> : sessions.length === 0 ? <Empty>Nothing posted yet.</Empty> : (
        <div className="space-y-2">
          {sessions.map(s => {
            const due = s.kind === 'session' && s.session_date && String(s.session_date).slice(0, 10) <= todayIso();
            return (
              <div key={s.id} className="rounded-xl border border-borderLine p-3 flex flex-wrap items-start gap-3">
                <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${s.kind === 'session' ? 'bg-brand-soft text-brand-primary' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                  {s.kind === 'session' ? <CalendarPlus className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-xs font-black text-textPrimary">{s.title}</p>
                  <p className="text-[11px] text-textSecondary">
                    {s.kind === 'session' ? `${fmtDate(s.session_date)}${s.start_time ? ` · ${s.start_time}${s.end_time ? `–${s.end_time}` : ''}` : ''}${s.venue ? ` · ${s.venue}` : ''}` : `Announcement · ${fmtDateTime(s.created_at)}`}
                    {' · '}by {s.posted_by_name}
                  </p>
                  {s.details && <p className="text-[11px] text-textSecondary mt-1 whitespace-pre-line">{s.details}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {s.kind === 'session' && (due
                    ? <button className={btnGhost} onClick={() => setMarking(s)}><Users className="w-3.5 h-3.5 inline mr-1" />Attendance {s.present_count}/{approved.length}</button>
                    : <span className="text-[10px] font-bold text-textMuted">Upcoming</span>)}
                  <button onClick={() => window.confirm('Delete this post?') && del.mutate(s.id)} className="p-1.5 text-textMuted hover:text-rose-600" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {marking && <AttendanceSheet session={marking} members={approved} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); refresh(); }} />}
    </div>
  );
}

function AttendanceSheet({ session, members, onClose, onSaved }: { session: any; members: any[]; onClose: () => void; onSaved: () => void }) {
  const [present, setPresent] = useState<Set<string>>(new Set((session.present || []).map((r: string) => r.toUpperCase())));
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => api.markClubAttendance(session.id, Array.from(present)), onSuccess: onSaved, onError: (e: any) => setErr(e.message) });
  const toggle = (r: string) => { const n = new Set(present); n.has(r) ? n.delete(r) : n.add(r); setPresent(n); };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className={`${card} w-full max-w-lg max-h-[85vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-borderLine">
          <p className="text-sm font-black text-textPrimary">Attendance · {session.title}</p>
          <p className="text-[11px] text-textSecondary">{fmtDate(session.session_date)} · {present.size} of {members.length} present · each session attended adds to the student's employability score</p>
          <div className="flex gap-2 mt-2">
            <button className={btnGhost} onClick={() => setPresent(new Set(members.map(m => m.roll_number.toUpperCase())))}>All present</button>
            <button className={btnGhost} onClick={() => setPresent(new Set())}>Clear</button>
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-borderLine">
          {members.length === 0 ? <Empty>No approved members yet.</Empty> : members.map(m => {
            const r = m.roll_number.toUpperCase();
            return (
              <label key={r} className="flex items-center gap-3 px-4 py-2 text-xs cursor-pointer hover:bg-surface-2">
                <input type="checkbox" checked={present.has(r)} onChange={() => toggle(r)} className="w-4 h-4 accent-emerald-600" />
                <span className="flex-1"><b className="text-textPrimary">{m.student_name}</b> <span className="text-textMuted">· {m.roll_number} · {m.department}</span></span>
                <RoleChip role={m.role} />
              </label>
            );
          })}
        </div>
        <div className="p-4 border-t border-borderLine flex items-center gap-2">
          {err && <p className="text-xs font-bold text-rose-600 flex-1">{err}</p>}
          <button className={`${btnGhost} ml-auto`} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save attendance'}</button>
        </div>
      </div>
    </div>
  );
}
