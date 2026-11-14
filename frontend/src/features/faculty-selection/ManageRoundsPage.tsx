/**
 * Faculty Selection — rounds list, new round form and department summary (admin + HOD, own department).
 * Route: #/faculty-selection/manage
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, ListChecks, Plus, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fsApi, fmtTime, toLocalInput } from './fsApi';
import {
  card, input, label, btnPrimary, btnGhost, DEPARTMENTS, SEMESTERS, RoundStatus, SeatMeter, Notice, Empty, th, td, errText,
} from './fsUi';

const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters'),
  semester_label: z.string().regex(/^[1-4]-[12]$/, 'Pick a semester'),
  department: z.string().optional(),
  starts_at: z.string().min(1, 'Required'),
  ends_at: z.string().min(1, 'Required'),
}).refine(v => new Date(v.ends_at) > new Date(v.starts_at), { message: 'Must be after the open time', path: ['ends_at'] });
type FormValues = z.infer<typeof schema>;

function NewRoundForm({ superAdmin, onDone, onClose }: { superAdmin: boolean; onDone: (id: string) => void; onClose: () => void }) {
  const now = new Date();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '', semester_label: '4-1', department: '',
      starts_at: toLocalInput(new Date(now.getTime() + 864e5)), ends_at: toLocalInput(new Date(now.getTime() + 2 * 864e5)),
    },
  });
  const [err, setErr] = useState<string | null>(null);
  const submit = handleSubmit(async v => {
    if (superAdmin && !v.department) { setErr('Choose the department for this round.'); return; }
    try {
      const r = await fsApi.createRound({ ...v, starts_at: new Date(v.starts_at).toISOString(), ends_at: new Date(v.ends_at).toISOString() });
      onDone(r.id);
    } catch (e) { setErr(errText(e)); }
  });
  const fe = (k: keyof FormValues) => errors[k] && <p className="text-[10px] font-bold text-rose-600">{errors[k]?.message as string}</p>;
  return (
    <form onSubmit={submit} className={`${card} p-5 space-y-4`} noValidate>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-textPrimary">New selection round</h3>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <div className="space-y-1 md:col-span-2"><label className={label} htmlFor="fs-title">Title</label>
          <input id="fs-title" className={`${input} w-full`} placeholder="e.g. 4-1 Professional Electives (2026-27)" {...register('title')} />{fe('title')}</div>
        <div className="space-y-1"><label className={label} htmlFor="fs-sem">Semester</label>
          <select id="fs-sem" className={`${input} w-full`} {...register('semester_label')}>{SEMESTERS.map(s => <option key={s}>{s}</option>)}</select>{fe('semester_label')}</div>
        {superAdmin && (
          <div className="space-y-1"><label className={label} htmlFor="fs-dept">Department</label>
            <select id="fs-dept" className={`${input} w-full`} {...register('department')}>
              <option value="">Choose…</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select></div>
        )}
        <div className="space-y-1 md:col-span-2"><label className={label} htmlFor="fs-open">Selection opens</label>
          <input id="fs-open" type="datetime-local" className={`${input} w-full`} {...register('starts_at')} />{fe('starts_at')}</div>
        <div className="space-y-1 md:col-span-2"><label className={label} htmlFor="fs-close">Selection closes</label>
          <input id="fs-close" type="datetime-local" className={`${input} w-full`} {...register('ends_at')} />{fe('ends_at')}</div>
      </div>
      <Notice msg={err ? { ok: false, text: err } : null} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="submit" className={btnPrimary} disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create round'}</button>
      </div>
      <p className="text-[11px] text-textMuted">The round starts as a draft. Add eligible students, groups, subjects and faculty seats, then open it.</p>
    </form>
  );
}

export default function ManageRoundsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const superAdmin = role === 'admin' && (!!(user as any)?.isSuperAdmin || ['*', 'All', ''].includes((user as any)?.department || ''));
  const rounds = useQuery({ queryKey: ['fs', 'rounds'], queryFn: fsApi.rounds });
  const summary = useQuery({ queryKey: ['fs', 'summary'], queryFn: fsApi.departmentSummary });
  const del = useMutation({ mutationFn: (id: string) => fsApi.deleteRound(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fs'] }) });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary tracking-tight">Faculty Selection</h1>
          <p className="text-xs text-textSecondary">Students choose one faculty per subject, first come first served. Each confirmed choice goes straight onto that faculty's attendance roster for the student's section.</p>
        </div>
        {!showForm && <button className={btnPrimary} onClick={() => setShowForm(true)}><Plus className="w-3.5 h-3.5 inline mr-1" />New round</button>}
      </div>

      {showForm && <NewRoundForm superAdmin={superAdmin} onClose={() => setShowForm(false)}
        onDone={id => { qc.invalidateQueries({ queryKey: ['fs'] }); navigate(`/faculty-selection/manage/${id}`); }} />}

      {rounds.isLoading ? <p className="text-xs text-textMuted">Loading rounds…</p>
        : rounds.error ? <Notice msg={{ ok: false, text: errText(rounds.error) }} />
        : !rounds.data?.length ? <Empty title="No selection rounds yet" text="Create a round for a semester, e.g. 4-1, to get started." />
        : (
          <div className="grid gap-3 md:grid-cols-2">
            {rounds.data.map(r => (
              <div key={r.id} className={`${card} p-4 space-y-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-textPrimary truncate">{r.title}</p>
                    <p className="text-[11px] font-bold text-textSecondary">{r.department} · Semester {r.semester_label}</p>
                  </div>
                  <RoundStatus round={r} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-textSecondary">
                  <span><Users className="w-3 h-3 inline mr-1" />{r.eligible_count ?? 0} eligible</span>
                  <span><ListChecks className="w-3 h-3 inline mr-1" />{r.subject_count ?? 0} subjects · {r.selection_count ?? 0} choices made</span>
                  <span><CalendarClock className="w-3 h-3 inline mr-1" />{fmtTime(r.starts_at)} → {fmtTime(r.ends_at)}</span>
                </div>
                <div className="flex justify-end gap-2">
                  {!r.selection_count && (
                    <ConfirmButton label="Delete" confirmLabel="Delete this round?" onConfirm={() => del.mutate(r.id)} />
                  )}
                  <button className={btnPrimary} onClick={() => navigate(`/faculty-selection/manage/${r.id}`)}>Manage<ChevronRight className="w-3.5 h-3.5 inline ml-0.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      {summary.data && summary.data.rounds?.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-black text-textPrimary">Department summary</h2>
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full">
              <thead><tr className="border-b border-borderLine"><th className={th}>Round</th><th className={th}>Semester</th><th className={th}>Status</th><th className={`${th} text-right`}>Eligible</th><th className={`${th} text-right`}>Completed</th><th className={`${th} text-right`}>Pending</th><th className={th}>Progress</th></tr></thead>
              <tbody>
                {summary.data.rounds.map((r: any) => (
                  <tr key={r.id} className="border-b border-borderLine last:border-0">
                    <td className={td}>{r.title}</td><td className={td}>{r.semester_label}</td><td className={td}><RoundStatus round={r} /></td>
                    <td className={`${td} text-right tabular-nums`}>{r.eligible}</td><td className={`${td} text-right tabular-nums`}>{r.completed}</td><td className={`${td} text-right tabular-nums`}>{r.pending}</td>
                    <td className={td}><SeatMeter filled={r.completed} capacity={Math.max(1, r.eligible)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.data.faculty_load?.length > 0 && (
            <div className={`${card} overflow-x-auto`}>
              <p className="px-3 pt-3 text-xs font-black text-textPrimary">Faculty load from selections</p>
              <table className="w-full">
                <thead><tr className="border-b border-borderLine"><th className={th}>Faculty</th><th className={th}>Semester</th><th className={th}>Subject</th><th className={`${th} text-right`}>Sections</th><th className={`${th} text-right`}>Students</th></tr></thead>
                <tbody>
                  {summary.data.faculty_load.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-borderLine last:border-0">
                      <td className={td}>{f.faculty_name}</td><td className={td}>{f.semester_label}</td><td className={td}>{f.subject_name}</td>
                      <td className={`${td} text-right tabular-nums`}>{f.sections}</td><td className={`${td} text-right tabular-nums`}>{f.students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Two-step inline confirm (no browser dialog) */
export function ConfirmButton({ label: text, confirmLabel, onConfirm, danger = true, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; danger?: boolean; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const tone = danger ? 'text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30' : '';
  if (!armed) return <button type="button" className={`${btnGhost} ${tone}`} disabled={disabled} onClick={() => setArmed(true)}>{text}</button>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-textSecondary">{confirmLabel}</span>
      <button type="button" className={`${btnGhost} ${tone}`} onClick={() => { setArmed(false); onConfirm(); }}>Yes</button>
      <button type="button" className={btnGhost} onClick={() => setArmed(false)}>No</button>
    </span>
  );
}
