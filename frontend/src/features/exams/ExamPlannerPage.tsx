import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2, Printer, ArrowLeft, X, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm print:shadow-none print:border-slate-300';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const d10 = (v: any) => String(v || '').slice(0, 10);
const slotLabel = (s: string) => (s === 'AN' ? 'Afternoon' : 'Forenoon');

function Rooms() {
  const qc = useQueryClient();
  const { data: rooms = [] } = useQuery<any[]>({ queryKey: ['examRooms'], queryFn: () => api.getExamRooms() });
  const [f, setF] = useState({ name: '', block: '', capacity: '30' });
  const add = useMutation({ mutationFn: () => api.saveExamRoom({ ...f, capacity: Number(f.capacity) }), onSuccess: () => { setF({ name: '', block: f.block, capacity: f.capacity }); qc.invalidateQueries({ queryKey: ['examRooms'] }); } });
  const del = useMutation({ mutationFn: (id: number) => api.deleteExamRoom(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['examRooms'] }) });
  return (
    <div className={`${card} p-4 space-y-3`}>
      <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">Exam rooms · {rooms.reduce((t, r) => t + r.capacity, 0)} seats</h3>
      <div className="flex flex-wrap gap-2">
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Room (e.g. A101)" className={`${input} w-32`} />
        <input value={f.block} onChange={e => setF({ ...f, block: e.target.value })} placeholder="Block" className={`${input} w-28`} />
        <input value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value })} type="number" min={1} className={`${input} w-20`} />
        <button disabled={!f.name.trim() || add.isPending} onClick={() => add.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1 disabled:opacity-40"><Plus className="w-3.5 h-3.5" />Add / update</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rooms.map(r => (
          <span key={r.id} className="px-2 py-1 rounded-lg bg-surface-2 text-[11px] font-semibold text-textSecondary inline-flex items-center gap-1.5">
            {r.block ? `${r.block} · ` : ''}{r.name} <b className="text-textPrimary">{r.capacity}</b>
            <button onClick={() => del.mutate(r.id)} className="text-textMuted hover:text-red-600"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {rooms.length === 0 && <span className="text-xs text-textMuted">Add exam rooms with their seating capacity first.</span>}
      </div>
    </div>
  );
}

function NewSession({ onDone }: { onDone: (id?: number) => void }) {
  const { data: rooms = [] } = useQuery<any[]>({ queryKey: ['examRooms'], queryFn: () => api.getExamRooms() });
  const [f, setF] = useState({ title: '', exam_date: '', slot: 'FN', invigilators_per_room: 1 });
  const [groups, setGroups] = useState<{ department: string; year: string }[]>([]);
  const [g, setG] = useState({ department: VALID_DEPARTMENT_NAMES[0], year: '3rd Year' });
  const [roomIds, setRoomIds] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createExamSession({ ...f, groups, room_ids: roomIds }),
    onSuccess: (r: any) => onDone(r?.session?.id),
    onError: (e: any) => setErr(e.message || 'Could not create'),
  });
  const seats = rooms.filter(r => roomIds.includes(r.id)).reduce((t, r) => t + r.capacity, 0);
  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">New exam session</h3><button onClick={() => onDone()} className="p-1 text-textMuted"><X className="w-4 h-4" /></button></div>
      <div className="flex flex-wrap gap-2">
        <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Title (e.g. Mid-1 · DBMS)" className={`${input} flex-1 min-w-[200px]`} />
        <input type="date" value={f.exam_date} onChange={e => setF({ ...f, exam_date: e.target.value })} className={input} />
        <select value={f.slot} onChange={e => setF({ ...f, slot: e.target.value })} className={input}><option value="FN">Forenoon</option><option value="AN">Afternoon</option></select>
        <label className="text-[11px] text-textSecondary inline-flex items-center gap-1">Invigilators / room
          <input type="number" min={1} max={4} value={f.invigilators_per_room} onChange={e => setF({ ...f, invigilators_per_room: Number(e.target.value) })} className={`${input} w-14`} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-textMuted">Students:</span>
        <select value={g.department} onChange={e => setG({ ...g, department: e.target.value })} className={input}>{VALID_DEPARTMENT_NAMES.map(d => <option key={d}>{d}</option>)}</select>
        <select value={g.year} onChange={e => setG({ ...g, year: e.target.value })} className={input}>{YEARS.map(y => <option key={y}>{y}</option>)}</select>
        <button onClick={() => !groups.some(x => x.department === g.department && x.year === g.year) && setGroups([...groups, g])} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-borderLine">Add group</button>
        {groups.map((x, i) => <span key={i} className="px-2 py-1 rounded-lg bg-brand-primary/10 text-brand-primary text-[11px] font-bold inline-flex items-center gap-1">{x.department} · {x.year}<button onClick={() => setGroups(groups.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button></span>)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-textMuted">Rooms ({seats} seats):</span>
        {rooms.map(r => (
          <button key={r.id} onClick={() => setRoomIds(roomIds.includes(r.id) ? roomIds.filter(x => x !== r.id) : [...roomIds, r.id])}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${roomIds.includes(r.id) ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{r.name} · {r.capacity}</button>
        ))}
      </div>
      <p className="text-[10px] text-textMuted">Students from different groups are seated alternately. Invigilators are chosen by fewest duties so far, skipping anyone on duty in the same slot or on approved leave.</p>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <button disabled={!f.title.trim() || !f.exam_date || !groups.length || !roomIds.length || create.isPending} onClick={() => create.mutate()}
        className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40 inline-flex items-center gap-1.5">
        {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Create & allocate</button>
    </div>
  );
}

function SessionDetail({ id, onBack, canDelete }: { id: number; onBack: () => void; canDelete: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['examSession', id], queryFn: () => api.getExamSession(id) });
  const del = useMutation({ mutationFn: () => api.deleteExamSession(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['examSessions'] }); onBack(); } });
  const [confirm, setConfirm] = useState(false);
  if (isLoading || !data) return <div className={`${card} p-8 text-center text-xs text-textMuted`}>Loading…</div>;
  const s = data.session;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-2 rounded-xl border border-borderLine print:hidden"><ArrowLeft className="w-4 h-4" /></button>
          <div><div className="text-sm font-black text-textPrimary">{s.title}</div><div className="text-[11px] text-textMuted">{d10(s.exam_date)} · {slotLabel(s.slot)}</div></div>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" />Print</button>
          {canDelete && (confirm
            ? <button onClick={() => del.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl bg-red-600 text-white">Confirm delete</button>
            : <button onClick={() => setConfirm(true)} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine text-red-600 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Delete</button>)}
        </div>
      </div>
      {data.rooms.map((r: any) => (
        <div key={r.id} className={`${card} overflow-hidden print:break-inside-avoid`}>
          <div className="px-4 py-3 border-b border-borderLine flex flex-wrap justify-between gap-2">
            <span className="text-xs font-black text-textPrimary">{r.block ? `${r.block} · ` : ''}Room {r.name} — {r.seats.length}/{r.capacity} seats</span>
            <span className="text-[11px] text-textSecondary">Invigilator{r.invigilators.length === 1 ? '' : 's'}: {r.invigilators.map((i: any) => i.faculty_name || i.faculty_email).join(', ') || <b className="text-red-600">not assigned</b>}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-px bg-borderLine">
            {r.seats.map((x: any) => (
              <div key={x.roll_number} className="bg-surface px-2 py-1.5 text-[11px]">
                <span className="text-textMuted mr-1">{x.seat_no}.</span><b className="font-mono text-textPrimary">{x.roll_number}</b>
                <div className="text-[10px] text-textMuted truncate">{x.department} · {x.year}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MyExams({ role }: { role: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['myExams'], queryFn: () => api.getMyExams() });
  const list: any[] = role === 'student' ? data?.seats || [] : data?.duties || [];
  return (
    <div className={`${card} overflow-x-auto`}>
      <div className="px-4 py-3 border-b border-borderLine text-xs font-black uppercase tracking-wider text-textSecondary">{role === 'student' ? 'My exam seats' : 'My invigilation duties'}</div>
      {isLoading ? <div className="p-6 text-center text-xs text-textMuted">Loading…</div>
        : list.length === 0 ? <div className="p-6 text-center text-xs text-textMuted">Nothing scheduled.</div>
        : <table className="w-full text-xs"><tbody className="divide-y divide-borderLine">
          {list.map((x, i) => (
            <tr key={i}>
              <td className="py-2.5 px-4 font-bold text-textPrimary">{d10(x.exam_date)} · {slotLabel(x.slot)}</td>
              <td className="py-2.5 px-3 text-textSecondary">{x.title}</td>
              <td className="py-2.5 px-3 text-textPrimary font-bold">{x.block ? `${x.block} · ` : ''}Room {x.room}</td>
              <td className="py-2.5 px-4 text-right text-textSecondary">{role === 'student' ? `Seat ${x.seat_no}` : `${x.students} students`}</td>
            </tr>
          ))}
        </tbody></table>}
    </div>
  );
}

export const ExamPlannerPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || '';
  const isAdmin = role === 'admin';
  const staff = ['admin', 'hod', 'principal', 'director'].includes(role);
  const { data: sessions = [], isLoading } = useQuery<any[]>({ queryKey: ['examSessions'], queryFn: () => api.getExamSessions(), enabled: staff });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const qc = useQueryClient();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><ClipboardList className="w-5 h-5 text-brand-primary" />Exams — Seating & Invigilation</h1>
          <p className="text-xs text-textMuted mt-0.5">{staff ? 'Plan exam rooms, seat students automatically and assign invigilators fairly' : 'Your upcoming exam schedule'}</p>
        </div>
        {isAdmin && !creating && !open && <button onClick={() => setCreating(true)} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />New exam session</button>}
      </div>
      {['faculty', 'hod', 'student'].includes(role) && !open && <MyExams role={role} />}
      {staff && (open !== null ? <SessionDetail id={open} onBack={() => setOpen(null)} canDelete={isAdmin} /> : (
        <>
          {isAdmin && <Rooms />}
          {creating && <NewSession onDone={(id) => { setCreating(false); qc.invalidateQueries({ queryKey: ['examSessions'] }); if (id) setOpen(id); }} />}
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-xs text-left">
              <thead><tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Date</th><th className="py-2.5 px-3">Session</th><th className="py-2.5 px-3 text-center">Students</th><th className="py-2.5 px-3 text-center">Rooms</th><th className="py-2.5 px-3 text-center">Invigilators</th></tr></thead>
              <tbody className="divide-y divide-borderLine">
                {isLoading ? <tr><td colSpan={5} className="py-8 text-center text-textMuted">Loading…</td></tr>
                  : sessions.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-textMuted">No exam sessions yet.</td></tr>
                  : sessions.map(s => (
                    <tr key={s.id} onClick={() => setOpen(s.id)} className="hover:bg-surface-2/50 cursor-pointer">
                      <td className="py-2.5 px-4 font-bold text-textPrimary">{d10(s.exam_date)} · {s.slot}</td>
                      <td className="py-2.5 px-3 text-textSecondary">{s.title}</td>
                      <td className="py-2.5 px-3 text-center">{s.students}</td><td className="py-2.5 px-3 text-center">{s.rooms_used}</td><td className="py-2.5 px-3 text-center">{s.invigilators}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ))}
    </div>
  );
};

export default ExamPlannerPage;
