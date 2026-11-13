import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Search, Settings2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ClubWorkspace } from './ClubWorkspace';
import { CATEGORY_EMOJI, DEPARTMENTS, Empty, RoleChip, StatusChip, btnGhost, btnPrimary, card, downloadCsv, input } from './clubUi';

const CHAIR_DEPTS = ['CSE', 'CSE (AI & ML)', 'CSE (Data Science)', 'CSE (BS)', 'CSE (CS)'];

/** Club participation of the students a staff member is responsible for (mentees / department / institution). */
export default function ClubStudentsPage() {
  const { user } = useAuth();
  const role = user?.role || '';
  const deptLocked = role === 'hod' || role === 'faculty' || role === 'coordinator';
  const deptChoices = role === 'program_chair' ? CHAIR_DEPTS : DEPARTMENTS;
  const [dept, setDept] = useState('All');
  const [q, setQ] = useState('');
  const [club, setClub] = useState('All');
  const [roleF, setRoleF] = useState<'all' | 'leaders'>('all');
  const [working, setWorking] = useState<any | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['clubStudents', deptLocked ? 'own' : dept], queryFn: () => api.getClubStudents(deptLocked ? undefined : dept) });
  const { data: clubs = [] } = useQuery<any[]>({ queryKey: ['clubs', 'staff'], queryFn: () => api.getClubs() });
  const coordinating = clubs.filter(c => user?.email && String(c.coordinator_email || '').toLowerCase() === user.email.toLowerCase());
  const rows: any[] = data?.rows || [];

  const students = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of rows) {
      const s = map.get(r.roll_number) || { roll_number: r.roll_number, name: r.name, department: r.department, year: r.year, section: r.section, clubs: [] as any[] };
      s.clubs.push(r);
      map.set(r.roll_number, s);
    }
    return Array.from(map.values());
  }, [rows]);

  const shown = students.filter(s =>
    (!q.trim() || `${s.name} ${s.roll_number}`.toLowerCase().includes(q.trim().toLowerCase())) &&
    (club === 'All' || s.clubs.some((c: any) => c.club_name === club)) &&
    (roleF === 'all' || s.clubs.some((c: any) => c.status === 'approved' && ['lead', 'co_lead'].includes(c.role))));

  const approved = rows.filter(r => r.status === 'approved');
  const held = approved.reduce((n, r) => n + Number(r.sessions_held || 0), 0);
  const attended = approved.reduce((n, r) => n + Math.min(Number(r.sessions_attended || 0), Number(r.sessions_held || 0)), 0);
  const kpis = [
    { k: 'Students in clubs', v: new Set(approved.map(r => r.roll_number)).size },
    { k: 'Memberships', v: approved.length },
    { k: 'Leads / co-leads', v: approved.filter(r => ['lead', 'co_lead'].includes(r.role)).length },
    { k: 'Pending (payment / waitlist)', v: rows.length - approved.length },
    { k: 'Session attendance', v: held ? `${Math.round((attended / held) * 100)}%` : '—' },
  ];
  const byClub = useMemo(() => {
    const m = new Map<string, { name: string; category: string; n: number }>();
    approved.forEach(r => { const x = m.get(r.club_name) || { name: r.club_name, category: r.category, n: 0 }; x.n++; m.set(r.club_name, x); });
    return Array.from(m.values()).sort((a, b) => b.n - a.n);
  }, [approved]);
  const maxN = Math.max(1, ...byClub.map(b => b.n));
  const clubNames = Array.from(new Set(rows.map(r => r.club_name))).sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">{role === 'faculty' ? 'Mentee Clubs' : 'Student Clubs'}</h1>
          <p className="text-xs text-textSecondary">Club memberships, roles and session attendance · <b>{data?.scope || '…'}</b></p>
        </div>
        {!deptLocked && (
          <div className="flex flex-wrap gap-1.5">
            {['All', ...deptChoices].map(d => (
              <button key={d} onClick={() => setDept(d)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${dept === d ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>{d}</button>
            ))}
          </div>
        )}
      </div>

      {coordinating.length > 0 && (
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-xs font-black text-textPrimary">Clubs you coordinate</p>
          <div className="flex flex-wrap gap-2">
            {coordinating.map(c => (
              <button key={c.id} className={working?.id === c.id ? btnPrimary : btnGhost} onClick={() => setWorking(c)}>
                <Settings2 className="w-3.5 h-3.5 inline mr-1" />{c.name} · {c.members} members
              </button>
            ))}
          </div>
        </div>
      )}
      {working && <ClubWorkspace key={working.id} club={working} mode="coordinator" onClose={() => setWorking(null)} />}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(x => (
          <div key={x.k} className={`${card} p-3`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{x.k}</p>
            <p className="text-2xl font-black text-textPrimary">{x.v}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-xs font-black text-textPrimary">Members by club</p>
          {byClub.length === 0 ? <Empty>No members yet.</Empty> : byClub.map(b => (
            <button key={b.name} onClick={() => setClub(club === b.name ? 'All' : b.name)} className={`w-full text-left rounded-lg px-2 py-1.5 ${club === b.name ? 'bg-brand-soft/60 ring-1 ring-brand-primary/40' : 'hover:bg-surface-2'}`}>
              <div className="flex justify-between text-[11px] font-bold text-textPrimary"><span className="truncate">{CATEGORY_EMOJI[b.category] || '✨'} {b.name}</span><span>{b.n}</span></div>
              <div className="h-1.5 mt-1 rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-primary" style={{ width: `${(b.n / maxN) * 100}%` }} /></div>
            </button>
          ))}
        </div>

        <div className={`${card} lg:col-span-2 overflow-hidden`}>
          <div className="p-3 border-b border-borderLine flex flex-wrap gap-2 items-center">
            <div className="relative"><Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search student" className={`${input} pl-8 w-48`} /></div>
            <select value={club} onChange={e => setClub(e.target.value)} className={input}>
              <option value="All">All clubs</option>{clubNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={roleF} onChange={e => setRoleF(e.target.value as any)} className={input}>
              <option value="all">All roles</option><option value="leaders">Leads &amp; co-leads</option>
            </select>
            <button className={`${btnGhost} ml-auto`} onClick={() => downloadCsv('student-clubs.csv',
              ['Roll No', 'Name', 'Department', 'Year', 'Section', 'Club', 'Status', 'Role', 'Sessions Attended', 'Sessions Held'],
              shown.flatMap(s => s.clubs.map((c: any) => [s.roll_number, s.name, s.department, s.year, s.section, c.club_name, c.status, c.role, c.sessions_attended, c.sessions_held]))) }>
              <Download className="w-3.5 h-3.5 inline mr-1" />CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-[32rem]">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary sticky top-0">
                <tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Clubs</th></tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {isLoading ? <tr><td colSpan={3}><Empty><Loader2 className="w-4 h-4 animate-spin inline" /></Empty></td></tr>
                  : shown.length === 0 ? <tr><td colSpan={3}><Empty>{rows.length ? 'No student matches these filters.' : 'None of these students has joined a club yet.'}</Empty></td></tr>
                  : shown.map(s => (
                    <tr key={s.roll_number} className="align-top hover:bg-surface-2/60">
                      <td className="px-3 py-2"><b className="text-textPrimary">{s.name}</b><br /><span className="text-[10px] text-textMuted">{s.roll_number}</span></td>
                      <td className="px-3 py-2 text-textSecondary whitespace-nowrap">{s.department}<br />{s.year} · {s.section || '—'}</td>
                      <td className="px-3 py-2 space-y-1">
                        {s.clubs.map((c: any) => (
                          <div key={c.club_id} className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-textPrimary">{c.club_name}</span>
                            <RoleChip role={c.status === 'approved' ? c.role : undefined} />
                            {c.status !== 'approved' && <StatusChip status={c.status} />}
                            {c.status === 'approved' && <span className="text-[10px] text-textMuted">{c.sessions_attended}/{c.sessions_held} sessions</span>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
