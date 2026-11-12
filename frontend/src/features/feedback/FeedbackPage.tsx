import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareHeart, Lock, CheckCircle2, Plus, X, Star, Loader2, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

interface Question { id: string; text: string }
interface Cycle {
  id: number; title: string; department: string; semester_label: string; start_date: string; end_date: string;
  questions: Question[]; status: 'open' | 'upcoming' | 'closed';
}

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';
const d10 = (v: string) => String(v).slice(0, 10);
const statusPill = (s: string) => s === 'open'
  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  : s === 'upcoming' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300';
const ratingTone = (v: number) => v >= 4 ? 'text-emerald-600' : v >= 3 ? 'text-amber-600' : 'text-red-600';

// ── Student: give feedback ─────────────────────────────────────────────────
function StudentFeedback() {
  const qc = useQueryClient();
  const { data: cycles = [], isLoading } = useQuery<Cycle[]>({ queryKey: ['feedbackCycles'], queryFn: () => api.getFeedbackCycles() });
  const [cycleId, setCycleId] = useState<number | null>(null);
  const active = cycles.find(c => c.id === cycleId) || cycles[0] || null;
  const { data: mine } = useQuery({
    queryKey: ['feedbackMySubjects', active?.id], queryFn: () => api.getFeedbackMySubjects(active!.id), enabled: Boolean(active),
  });
  const [form, setForm] = useState<{ allotment_id: string; subject: string; faculty: string } | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = useMutation({
    mutationFn: () => api.submitFeedback(active!.id, { allotment_id: form!.allotment_id, ratings, comment }),
    onSuccess: (r: any) => {
      setForm(null); setRatings({}); setComment('');
      setMsg({ ok: true, text: r?.message || 'Thank you — your feedback was recorded anonymously.' });
      qc.invalidateQueries({ queryKey: ['feedbackMySubjects'] });
    },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Could not submit.' }),
  });

  if (isLoading) return <div className={`${card} p-8 text-center text-xs text-textMuted`}>Loading…</div>;
  if (!active) return <div className={`${card} p-8 text-center text-xs text-textMuted`}>No feedback window is open right now.</div>;
  const subjects: any[] = mine?.subjects || [];
  const questions = active.questions || [];
  const complete = questions.every(q => ratings[q.id] >= 1);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex items-start gap-3`}>
        <Lock className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-textPrimary">Your feedback is anonymous.</p>
          <p className="text-[11px] text-textMuted">Ratings are stored without your name or roll number. Faculty only see averages after the window closes, and comments only when at least 3 classmates respond.</p>
        </div>
      </div>
      {cycles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cycles.map(c => <button key={c.id} onClick={() => setCycleId(c.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${active.id === c.id ? 'bg-brand-primary text-white' : 'bg-surface-2 text-textSecondary'}`}>{c.title}</button>)}
        </div>
      )}
      {msg && <div className={`px-4 py-2.5 rounded-xl text-xs font-semibold ${msg.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{msg.text}</div>}
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-borderLine text-xs font-black text-textPrimary">{active.title} · open until {d10(active.end_date)}</div>
        <div className="divide-y divide-borderLine">
          {subjects.length === 0 ? <div className="p-8 text-center text-xs text-textMuted">No subjects found on your rolls for this feedback.</div>
            : subjects.map(s => (
              <div key={s.allotment_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-xs font-bold text-textPrimary">{s.subject_name} <span className="text-textMuted font-normal">· {s.subject_type}</span></div>
                  <div className="text-[11px] text-textMuted">{s.faculty_name || s.faculty_email}</div>
                </div>
                {s.submitted
                  ? <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Submitted</span>
                  : <button onClick={() => { setForm({ allotment_id: s.allotment_id, subject: s.subject_name, faculty: s.faculty_name || s.faculty_email }); setRatings({}); setComment(''); setMsg(null); }}
                      className="px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold">Give feedback</button>}
              </div>
            ))}
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`${card} w-full max-w-lg max-h-[90vh] flex flex-col`}>
            <div className="flex items-start justify-between p-4 border-b border-borderLine">
              <div><h3 className="text-sm font-black text-textPrimary">{form.subject}</h3><p className="text-[11px] text-textMuted">{form.faculty}</p></div>
              <button onClick={() => setForm(null)} className="p-1 text-textMuted"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {questions.map((q, i) => (
                <div key={q.id}>
                  <p className="text-xs font-semibold text-textPrimary mb-1.5">{i + 1}. {q.text}</p>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map(v => (
                      <button key={v} onClick={() => setRatings(r => ({ ...r, [q.id]: v }))}
                        className={`w-9 h-9 rounded-xl text-xs font-black border ${ratings[q.id] === v ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>{v}</button>
                    ))}
                    <span className="self-center text-[10px] text-textMuted ml-1">1 = poor · 5 = excellent</span>
                  </div>
                </div>
              ))}
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} maxLength={1000}
                placeholder="Optional comment (be constructive — do not include names)" className={`${input} w-full`} />
            </div>
            <div className="p-3 border-t border-borderLine flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine">Cancel</button>
              <button disabled={!complete || submit.isPending} onClick={() => submit.mutate()}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40 inline-flex items-center gap-1.5">
                {submit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Submit anonymously
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Staff: cycles and results ──────────────────────────────────────────────
function CycleResults({ cycle }: { cycle: Cycle }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['feedbackSummary', cycle.id], queryFn: () => api.getFeedbackSummary(cycle.id) });
  const [open, setOpen] = useState<string | null>(null);
  const questions: Question[] = data?.questions || cycle.questions || [];
  const rows: any[] = data?.rows || [];
  if (isLoading) return <div className="p-6 text-center text-xs text-textMuted">Loading results…</div>;
  if (isError) return <div className="p-6 text-center text-xs text-amber-700">{(error as Error)?.message}</div>;
  if (rows.length === 0) return <div className="p-6 text-center text-xs text-textMuted">No responses yet.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
            <th className="py-2.5 px-4">Faculty</th><th className="py-2.5 px-3">Subject</th><th className="py-2.5 px-3 text-center">Responses</th><th className="py-2.5 px-3 text-center">Overall</th><th className="py-2.5 px-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borderLine">
          {rows.map(r => (
            <React.Fragment key={r.allotment_id}>
              <tr className="hover:bg-surface-2/50 cursor-pointer" onClick={() => setOpen(open === r.allotment_id ? null : r.allotment_id)}>
                <td className="py-2.5 px-4"><div className="font-bold text-textPrimary">{r.faculty_name || r.faculty_email}</div><div className="text-[10px] text-textMuted">{r.department}</div></td>
                <td className="py-2.5 px-3 text-textSecondary">{r.subject_name} · {r.semester_label} {r.section}</td>
                <td className="py-2.5 px-3 text-center text-textSecondary">{r.responses}{r.enrolled ? <span className="text-textMuted"> / {r.enrolled}</span> : ''}</td>
                <td className={`py-2.5 px-3 text-center font-black ${ratingTone(r.overall)}`}><Star className="w-3 h-3 inline -mt-0.5 mr-0.5" />{r.overall.toFixed(2)}</td>
                <td className="py-2.5 px-3 text-right"><ChevronRight className={`w-3.5 h-3.5 inline text-textMuted transition-transform ${open === r.allotment_id ? 'rotate-90' : ''}`} /></td>
              </tr>
              {open === r.allotment_id && (
                <tr><td colSpan={5} className="px-4 py-3 bg-surface-2/40">
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                    {questions.map(q => (
                      <div key={q.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-textSecondary">{q.text}</span>
                        <span className={`font-bold ${ratingTone(r.averages[q.id])}`}>{r.averages[q.id]?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {r.comments?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-textMuted">Comments</p>
                      {r.comments.map((c: string, i: number) => <p key={i} className="text-[11px] text-textSecondary">“{c}”</p>)}
                    </div>
                  )}
                  {r.comments_hidden && <p className="mt-2 text-[10px] text-textMuted">Comments are hidden until at least 3 students respond (to protect anonymity).</p>}
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffFeedback({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: cycles = [], isLoading } = useQuery<Cycle[]>({ queryKey: ['feedbackCycles'], queryFn: () => api.getFeedbackCycles() });
  const [selected, setSelected] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');
  const [nf, setNf] = useState({ title: '', department: 'All', semester_label: 'All', start_date: today, end_date: today });
  const [msg, setMsg] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createFeedbackCycle(nf),
    onSuccess: () => { setShowNew(false); setNf({ ...nf, title: '' }); qc.invalidateQueries({ queryKey: ['feedbackCycles'] }); },
    onError: (e: any) => setMsg(e.message || 'Could not create'),
  });
  const close = useMutation({
    mutationFn: (id: number) => { const y = new Date(); y.setDate(y.getDate() - 1); return api.updateFeedbackCycle(id, { end_date: y.toLocaleDateString('en-CA') }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedbackCycles'] }),
  });
  const active = useMemo(() => cycles.find(c => c.id === selected) || cycles[0] || null, [cycles, selected]);

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className={`${card} p-4`}>
          {!showNew ? (
            <button onClick={() => setShowNew(true)} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Open a feedback window</button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input value={nf.title} onChange={e => setNf({ ...nf, title: e.target.value })} placeholder="Title (e.g. Odd Semester 2026-27 — Mid-term)" className={`${input} flex-1 min-w-[240px]`} />
              <select value={nf.department} onChange={e => setNf({ ...nf, department: e.target.value })} className={input}>
                <option value="All">All departments</option>{VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={nf.semester_label} onChange={e => setNf({ ...nf, semester_label: e.target.value })} className={input}>
                <option value="All">All semesters</option>{['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'].map(s => <option key={s}>{s}</option>)}
              </select>
              <input type="date" value={nf.start_date} onChange={e => setNf({ ...nf, start_date: e.target.value })} className={input} />
              <span className="text-xs text-textMuted">to</span>
              <input type="date" value={nf.end_date} min={nf.start_date} onChange={e => setNf({ ...nf, end_date: e.target.value })} className={input} />
              <button disabled={!nf.title.trim() || create.isPending} onClick={() => create.mutate()} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40">Open</button>
              <button onClick={() => setShowNew(false)} className="p-2 text-textMuted"><X className="w-4 h-4" /></button>
              <p className="w-full text-[10px] text-textMuted">Uses 9 standard questions (subject knowledge, clarity, punctuality, syllabus coverage, doubt clearing, examples, fair evaluation, availability, overall).</p>
              {msg && <p className="w-full text-[11px] text-red-600">{msg}</p>}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isLoading ? <span className="text-xs text-textMuted">Loading…</span>
          : cycles.length === 0 ? <span className="text-xs text-textMuted">No feedback windows yet.</span>
          : cycles.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border text-left ${active?.id === c.id ? 'border-brand-primary bg-brand-primary/5' : 'border-borderLine bg-surface'}`}>
              <div className="text-textPrimary">{c.title}</div>
              <div className="text-[10px] font-normal text-textMuted">{d10(c.start_date)} → {d10(c.end_date)} <span className={`ml-1 px-1.5 py-0.5 rounded-full font-bold ${statusPill(c.status)}`}>{c.status}</span></div>
            </button>
          ))}
      </div>

      {active && (
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-borderLine flex items-center justify-between gap-2">
            <span className="text-xs font-black text-textPrimary">{active.title} — results</span>
            {isAdmin && active.status === 'open' && (
              <button onClick={() => close.mutate(active.id)} className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-borderLine">Close now</button>
            )}
          </div>
          <CycleResults cycle={active} />
        </div>
      )}
    </div>
  );
}

export const FeedbackPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || '';
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><MessageSquareHeart className="w-5 h-5 text-brand-primary" />Faculty Feedback</h1>
        <p className="text-xs text-textMuted mt-0.5">
          {role === 'student' ? 'Rate the teaching in each of your subjects — anonymously'
            : role === 'faculty' ? 'Your anonymous student feedback (available after each feedback window closes)'
            : 'Anonymous student feedback on teaching, by faculty and subject'}
        </p>
      </div>
      {role === 'student' ? <StudentFeedback /> : <StaffFeedback isAdmin={role === 'admin'} />}
    </div>
  );
};

export default FeedbackPage;
