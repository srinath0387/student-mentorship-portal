import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Printer, RefreshCw, ArrowLeft, Loader2, Undo2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm print:shadow-none print:border-slate-300';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold focus:outline-none';
const RATINGS = ['Outstanding', 'Very Good', 'Good', 'Satisfactory', 'Needs Improvement'];
const STATUS_TONE: Record<string, string> = {
  'Not started': 'bg-slate-500/10 text-slate-600 dark:text-slate-300', Draft: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Submitted: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', Reviewed: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  Approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

function academicYears(): string[] {
  const d = new Date(); const start = d.getMonth() + 1 >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return [0, 1, 2].map(k => `${start - k}–${String(start - k + 1).slice(-2)}`);
}
const fmt = (v: any, suffix = '') => (v === null || v === undefined || v === '' ? '—' : `${v}${suffix}`);

function Snapshot({ s }: { s: any }) {
  if (!s) return null;
  const tiles = [
    { label: 'API score', value: s.api_score ? `${s.api_score.total} / 100` : '—', sub: s.api_score?.grade },
    { label: 'Teaching load', value: fmt(s.teaching?.weekly_hours, ' h/week'), sub: `Attendance posted ${fmt(s.teaching?.posting_pct_90d, '%')} (90 days)` },
    { label: 'Student attendance (classes)', value: fmt(s.teaching?.student_attendance_avg_90d, '%'), sub: 'last 90 days' },
    { label: 'Mentoring', value: `${fmt(s.mentoring?.mentees)} mentees`, sub: `${fmt(s.mentoring?.meetings_in_year)} meetings this year` },
    { label: 'FDPs · Workshops/Conferences', value: `${s.development?.fdps ?? 0} · ${s.development?.workshops_conferences ?? 0}`, sub: s.academic_year },
    { label: 'Publications · Certifications', value: `${s.development?.publications ?? 0} · ${s.development?.certifications ?? 0}`, sub: s.academic_year },
    { label: 'Student feedback', value: s.feedback?.average ? `${s.feedback.average} / 5` : '—', sub: `${s.feedback?.responses ?? 0} responses` },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4">
      {tiles.map(t => (
        <div key={t.label} className={`${card} p-3`}>
          <div className="text-lg font-black text-textPrimary">{t.value}</div>
          <div className="text-[11px] font-bold text-textMuted">{t.label}</div>
          {t.sub && <div className="text-[10px] text-textMuted">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function AppraisalDetail({ email, ay, onBack }: { email: string; ay: string; onBack?: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['appraisal', email, ay], queryFn: () => api.getAppraisal(email, ay) });
  const a = data?.appraisal; const access: string = data?.access || '';
  const [self, setSelf] = useState({ self_remarks: '', self_achievements: '' });
  const [review, setReview] = useState({ rating: 'Good', remarks: '' });
  const [returnNote, setReturnNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (a) setSelf({ self_remarks: a.self_remarks || '', self_achievements: a.self_achievements || '' }); }, [a?.id, a?.status]);

  const act = useMutation({
    mutationFn: (body: any) => api.appraisalAction(email, { academic_year: ay, ...body }),
    onSuccess: (_r, body: any) => {
      setMsg({ ok: true, text: ({ submit: 'Submitted to your HOD.', save_self: 'Draft saved.', review: 'Review recorded.', approve: 'Appraisal approved.', return: 'Returned for changes.', refresh: 'Figures refreshed from live data.' } as any)[body.action] || 'Saved.' });
      qc.invalidateQueries({ queryKey: ['appraisal', email, ay] }); qc.invalidateQueries({ queryKey: ['appraisals'] });
    },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Action failed' }),
  });

  if (isLoading) return <div className={`${card} p-8 text-center text-xs text-textMuted`}>Preparing appraisal…</div>;
  if (isError) return <div className={`${card} p-8 text-center text-xs text-red-600`}>{(error as Error)?.message}</div>;
  const canSelf = access === 'self' && a.status === 'Draft';
  const canReview = (access === 'hod' || access === 'approver') && a.status === 'Submitted';
  const canApprove = access === 'approver' && a.status === 'Reviewed';
  const canReturn = (access === 'hod' && a.status === 'Submitted') || (access === 'approver' && ['Submitted', 'Reviewed'].includes(a.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onBack && <button onClick={onBack} className="p-2 rounded-xl border border-borderLine print:hidden"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <div className="text-sm font-black text-textPrimary">{a.faculty_name} <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_TONE[a.status]}`}>{a.status}</span></div>
            <div className="text-[11px] text-textMuted">{a.designation || 'Faculty'} · {a.department} · Academic year {a.academic_year}</div>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          {(canSelf || access === 'hod' || access === 'approver') && a.status !== 'Approved' && (
            <button onClick={() => act.mutate({ action: 'refresh' })} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Refresh figures</button>
          )}
          <button onClick={() => window.print()} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" />Print</button>
        </div>
      </div>

      {a.return_note && a.status === 'Draft' && <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-semibold">Returned for changes: {a.return_note}</div>}
      {msg && <div className={`px-4 py-2.5 rounded-xl text-xs font-semibold print:hidden ${msg.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{msg.text}</div>}

      <Snapshot s={a.snapshot} />

      <div className={`${card} p-4 space-y-2`}>
        <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">Self-appraisal</h3>
        {canSelf ? (
          <>
            <textarea value={self.self_remarks} onChange={e => setSelf({ ...self, self_remarks: e.target.value })} rows={4} placeholder="Teaching, research, mentoring and service contributions this year…" className={`${input} w-full`} />
            <textarea value={self.self_achievements} onChange={e => setSelf({ ...self, self_achievements: e.target.value })} rows={3} placeholder="Key achievements (awards, grants, results, responsibilities)" className={`${input} w-full`} />
            <div className="flex gap-2 print:hidden">
              <button disabled={act.isPending} onClick={() => act.mutate({ action: 'save_self', ...self })} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine">Save draft</button>
              <button disabled={act.isPending || !self.self_remarks.trim()} onClick={() => act.mutate({ action: 'submit', ...self })} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white disabled:opacity-40 inline-flex items-center gap-1.5">
                {act.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Submit to HOD</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-textPrimary whitespace-pre-wrap">{a.self_remarks || <span className="text-textMuted">Not filled in yet.</span>}</p>
            {a.self_achievements && <p className="text-xs text-textSecondary whitespace-pre-wrap"><b>Achievements:</b> {a.self_achievements}</p>}
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`${card} p-4 space-y-2`}>
          <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">HOD review</h3>
          {canReview ? (
            <>
              <select value={review.rating} onChange={e => setReview({ ...review, rating: e.target.value })} className={input}>{RATINGS.map(r => <option key={r}>{r}</option>)}</select>
              <textarea value={review.remarks} onChange={e => setReview({ ...review, remarks: e.target.value })} rows={3} placeholder="Remarks" className={`${input} w-full`} />
              <button disabled={act.isPending} onClick={() => act.mutate({ action: 'review', hod_rating: review.rating, hod_remarks: review.remarks })} className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white print:hidden">Record review</button>
            </>
          ) : a.hod_rating ? (
            <><p className="text-sm font-black text-textPrimary">{a.hod_rating}</p><p className="text-xs text-textSecondary whitespace-pre-wrap">{a.hod_remarks}</p></>
          ) : <p className="text-xs text-textMuted">Awaiting HOD review.</p>}
        </div>
        <div className={`${card} p-4 space-y-2`}>
          <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary">Final approval</h3>
          {canApprove ? (
            <>
              <select value={review.rating} onChange={e => setReview({ ...review, rating: e.target.value })} className={input}>{RATINGS.map(r => <option key={r}>{r}</option>)}</select>
              <textarea value={review.remarks} onChange={e => setReview({ ...review, remarks: e.target.value })} rows={3} placeholder="Principal's remarks" className={`${input} w-full`} />
              <button disabled={act.isPending} onClick={() => act.mutate({ action: 'approve', final_rating: review.rating, principal_remarks: review.remarks })} className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white print:hidden">Approve</button>
            </>
          ) : a.final_rating ? (
            <><p className="text-sm font-black text-textPrimary">{a.final_rating}</p><p className="text-xs text-textSecondary whitespace-pre-wrap">{a.principal_remarks}</p></>
          ) : <p className="text-xs text-textMuted">Awaiting approval.</p>}
        </div>
      </div>

      {canReturn && (
        <div className={`${card} p-4 flex flex-wrap items-center gap-2 print:hidden`}>
          <input value={returnNote} onChange={e => setReturnNote(e.target.value)} placeholder="What should the faculty member change?" className={`${input} flex-1 min-w-[240px]`} />
          <button disabled={act.isPending || !returnNote.trim()} onClick={() => act.mutate({ action: 'return', return_note: returnNote })} className="px-3 py-2 text-xs font-bold rounded-xl border border-borderLine inline-flex items-center gap-1.5 disabled:opacity-40"><Undo2 className="w-3.5 h-3.5" />Return for changes</button>
        </div>
      )}
    </div>
  );
}

export const AppraisalPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || '';
  const [ay, setAy] = useState(academicYears()[0]);
  const [open, setOpen] = useState<string | null>(null);
  const isFaculty = role === 'faculty';
  const { data, isLoading } = useQuery({ queryKey: ['appraisals', ay], queryFn: () => api.getAppraisals(ay), enabled: !isFaculty });
  const rows: any[] = data?.appraisals || [];
  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-textPrimary flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-brand-primary print:hidden" />Faculty Appraisal</h1>
          <p className="text-xs text-textMuted mt-0.5">Pre-filled from API score, workload, mentoring, development activity and student feedback</p>
        </div>
        <select value={ay} onChange={e => { setAy(e.target.value); setOpen(null); }} className={`${input} print:hidden`}>
          {academicYears().map(y => <option key={y} value={y}>Academic year {y}</option>)}
        </select>
      </div>

      {isFaculty ? <AppraisalDetail email={(user?.email || '').toLowerCase()} ay={ay} />
        : open ? <AppraisalDetail email={open} ay={ay} onBack={() => setOpen(null)} />
        : (
          <>
            {s && (
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {[['Faculty', s.total], ['Not started', s.not_started], ['Draft', s.draft], ['Submitted', s.submitted], ['Reviewed', s.reviewed], ['Approved', s.approved]].map(([k, v]) => (
                  <div key={k as string} className={`${card} p-3`}><div className="text-xl font-black text-textPrimary">{v as number}</div><div className="text-[10px] font-bold text-textMuted">{k}</div></div>
                ))}
              </div>
            )}
            <div className={`${card} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-4">Faculty</th><th className="py-2.5 px-3">Department</th><th className="py-2.5 px-3 text-center">API score</th>
                      <th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3">HOD rating</th><th className="py-2.5 px-3">Final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLine">
                    {isLoading ? <tr><td colSpan={6} className="py-8 text-center text-textMuted">Loading…</td></tr>
                      : rows.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-textMuted">No faculty found.</td></tr>
                      : rows.map(r => (
                        <tr key={r.faculty_email} onClick={() => setOpen(String(r.faculty_email).toLowerCase())} className="hover:bg-surface-2/50 cursor-pointer">
                          <td className="py-2.5 px-4 font-bold text-textPrimary">{r.faculty_name || r.faculty_email}</td>
                          <td className="py-2.5 px-3 text-textSecondary">{r.department}</td>
                          <td className="py-2.5 px-3 text-center text-textSecondary">{r.snapshot?.api_score?.total ?? '—'}</td>
                          <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_TONE[r.status]}`}>{r.status}</span></td>
                          <td className="py-2.5 px-3 text-textSecondary">{r.hod_rating || '—'}</td>
                          <td className="py-2.5 px-3 font-bold text-textPrimary">{r.final_rating || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
    </div>
  );
};

export default AppraisalPage;
