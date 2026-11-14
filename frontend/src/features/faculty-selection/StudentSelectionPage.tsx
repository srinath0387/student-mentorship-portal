/**
 * Faculty Selection — student: choose one faculty per subject for their semester and section.
 * The first confirmed choice is final. Seats left refresh every 5 seconds.
 * Routes: #/faculty-selection  and  #/faculty-selection/allotted
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Lock, X } from 'lucide-react';
import { fsApi, fmtTime, type FsPickResult, type FsStudentView } from './fsApi';
import { card, btnPrimary, btnGhost, Notice, Empty, RoundStatus, SeatMeter, th, td, chipBrand, chipMuted, chipOk, chipWarn } from './fsUi';

export default function StudentSelectionPage() {
  const me = useQuery({ queryKey: ['fs', 'me'], queryFn: fsApi.me });
  const rounds = (me.data?.rounds || []).filter(r => r.status === 'open');
  const [roundId, setRoundId] = useState<string | null>(null);
  useEffect(() => { if (!roundId && rounds.length) setRoundId(rounds[0].id); }, [rounds, roundId]);

  if (me.isLoading) return <p className="p-6 text-xs text-textMuted">Loading…</p>;
  if (me.error) return <div className="p-6"><Notice msg={{ ok: false, text: (me.error as any).message }} /></div>;
  return (
    <div className="space-y-5 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-textPrimary tracking-tight">Choose your faculty</h1>
        <Link to="/faculty-selection/allotted" className={btnGhost}>My Allotted Faculty</Link>
      </div>
      {!rounds.length ? (
        <Empty title="No faculty selection is open for you" text={me.data?.allotted ? 'Your allotted faculty are in My Allotted Faculty.' : 'You are not on an open selection list. Contact your department admin if this is wrong.'} />
      ) : (
        <>
          {rounds.length > 1 && (
            <div className="flex flex-wrap gap-1.5">{rounds.map(r => (
              <button key={r.id} onClick={() => setRoundId(r.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${roundId === r.id ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>{r.title}</button>))}
            </div>
          )}
          {roundId && <RoundPicker roundId={roundId} />}
        </>
      )}
    </div>
  );
}

function RoundPicker({ roundId }: { roundId: string }) {
  const qc = useQueryClient();
  const view = useQuery({ queryKey: ['fs', 'my-round', roundId], queryFn: () => fsApi.myRound(roundId) });
  const seats = useQuery({ queryKey: ['fs', 'my-seats', roundId], queryFn: () => fsApi.mySeats(roundId), refetchInterval: 5000, enabled: !!view.data });
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<FsPickResult[] | null>(null);

  const remaining = useMemo(() => new Map((seats.data?.seats || []).map(s => [s.id, s.remaining])), [seats.data]);
  const v: FsStudentView | undefined = view.data;
  const openNow = seats.data?.open_now ?? v?.round.open_now;

  const submit = useMutation({
    mutationFn: () => fsApi.select(roundId, Object.entries(picks).map(([subject_id, offering_id]) => ({ subject_id, offering_id }))),
    onSuccess: out => {
      setResults(out.results);
      const { results: _r, ...fresh } = out;
      qc.setQueryData(['fs', 'my-round', roundId], { ...v, ...fresh });
      setPicks(p => Object.fromEntries(Object.entries(p).filter(([sid]) => !out.results.find(x => x.subject_id === sid && x.ok))));
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ['fs', 'my-seats', roundId] });
      qc.invalidateQueries({ queryKey: ['fs', 'me'] });
    },
    onError: (e: any) => { setResults([{ subject_id: '', offering_id: '', subject_name: null, ok: false, status: 409, message: e.message }]); setConfirming(false); },
  });

  if (view.isLoading) return <p className="text-xs text-textMuted">Loading subjects…</p>;
  if (!v) return <Notice msg={{ ok: false, text: 'You are not on this round\'s list. Contact your department admin if this is wrong.' }} />;

  const draftGroups = new Set(Object.entries(picks).map(([sid, oid]) => v.subjects.find(s => s.id === sid)?.options.find(o => o.id === oid)?.group_id));
  const mixedGroups = !v.group && draftGroups.size > 1;
  const open = v.subjects.filter(s => !s.selection);
  const chosen = Object.keys(picks).length;
  const label = (sid: string) => {
    const s = v.subjects.find(x => x.id === sid);
    const o = s?.options.find(x => x.id === picks[sid]);
    return { subject: s?.subject_name || '', faculty: o?.faculty_name || '', group: o?.group_name || '' };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-textPrimary mr-1">{v.round.title} · {v.round.semester_label}</p>
        <span className={chipBrand}>Section {v.student.section || '—'}{v.group ? ` · ${v.group.name}` : ''}</span>
        <RoundStatus round={v.round} />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-textSecondary"><span className="w-2 h-2 rounded-full bg-emerald-500" />Seats live</span>
      </div>
      {!v.group && open.length > 0 && v.subjects.some(s => new Set(s.options.map(o => o.group_id)).size > 1) && (
        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Your first confirmed choice fixes your group. After that, only that group's faculty can be chosen for every subject.</p>
      )}
      {!openNow && <Notice msg={{ ok: false, text: new Date() < new Date(v.round.starts_at) ? `Selection opens ${fmtTime(v.round.starts_at)}.` : 'Selection is closed.' }} />}
      {results && (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <div key={i} role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${r.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
              {r.ok ? `${r.subject_name}: ${r.faculty_name} confirmed.` : `${r.subject_name ? `${r.subject_name}: ` : ''}${r.message}${r.code === 'SEATS_FULL' ? ' Seats have been refreshed.' : ''}`}
            </div>))}
        </div>
      )}

      {v.subjects.map(s => (
        <div key={s.id} className={`${card} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-textPrimary">{s.subject_name}</h3><span className={chipMuted}>{s.subject_type}</span>
            {s.selection?.status === 'active' && <span className={`${chipOk} ml-auto`}>Allotted</span>}
            {s.selection?.status === 'released' && <span className={`${chipWarn} ml-auto`}>Admin will assign</span>}
          </div>
          {s.selection ? (
            s.selection.status === 'active' ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-xs text-textPrimary">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><b>{s.selection.faculty_name}</b>{s.selection.group_name ? ` · ${s.selection.group_name}` : ''} · confirmed {fmtTime(s.selection.created_at, true)}. Locked — contact the admin for changes.</span>
              </div>
            ) : <p className="text-xs text-textSecondary">Your choice was released by the admin. The admin will assign your faculty.</p>
          ) : !s.options.length ? <p className="text-xs text-textMuted">No faculty options for Section {v.student.section} yet.</p> : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={`Faculty for ${s.subject_name}`}>
              {s.options.map(o => {
                const left = remaining.get(o.id) ?? o.remaining;
                const lockedOut = !o.allowed || (draftGroups.size === 1 && !v.group && !draftGroups.has(o.group_id) && !picks[s.id]);
                const disabled = !openNow || left <= 0 || !o.allowed;
                const picked = picks[s.id] === o.id;
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={picked} disabled={disabled}
                    onClick={() => setPicks(p => (picked ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== s.id)) : { ...p, [s.id]: o.id }))}
                    className={`text-left rounded-xl border-2 p-3 space-y-2 transition-colors disabled:cursor-not-allowed ${picked ? 'border-brand-primary bg-brand-subtle dark:bg-brand-primary/10' : 'border-borderLine hover:border-brand-primary/50'} ${disabled ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-black text-textPrimary">{o.faculty_name}</span>
                      {picked && <CheckCircle2 className="w-4 h-4 text-brand-primary shrink-0" />}
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-textSecondary tabular-nums">
                      <span>{o.group_name}</span>
                      <span className={left <= 0 ? 'text-rose-600' : ''}>{left <= 0 ? 'Full' : `${left} of ${o.capacity} left`}</span>
                    </div>
                    <SeatMeter filled={o.capacity - left} capacity={o.capacity} />
                    {!o.allowed && <p className="text-[10px] font-bold text-textMuted">Not your group ({v.group?.name})</p>}
                    {o.allowed && lockedOut && <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">Different group from your other choices</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {open.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 md:mx-0 px-4 py-3 bg-background/95 backdrop-blur border-t border-borderLine md:rounded-2xl md:border flex flex-wrap items-center justify-end gap-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          {mixedGroups && <span className="text-[11px] font-bold text-rose-600 mr-auto">All choices must be from the same group.</span>}
          <span className="text-[11px] font-bold text-textSecondary">{chosen} of {open.length} subjects chosen</span>
          <button className={btnPrimary} disabled={!chosen || mixedGroups || !openNow} onClick={() => { setResults(null); setConfirming(true); }}>Review and confirm</button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => !submit.isPending && setConfirming(false)}>
          <div className={`${card} w-full max-w-md p-5 space-y-4`} role="dialog" aria-modal="true" aria-labelledby="fs-confirm-title" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <p id="fs-confirm-title" className="text-sm font-black text-textPrimary">Confirm your choices</p>
              <button onClick={() => setConfirming(false)} className="p-1 text-textMuted" aria-label="Close" disabled={submit.isPending}><X className="w-4 h-4" /></button>
            </div>
            <table className="w-full"><tbody>
              {Object.keys(picks).map(sid => { const l = label(sid); return (
                <tr key={sid} className="border-b border-borderLine last:border-0"><td className={`${td} whitespace-normal`}>{l.subject}</td><td className={`${td} font-black`}>{l.faculty}</td><td className={`${td} text-textMuted`}>{l.group}</td></tr>); })}
            </tbody></table>
            <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-300">
              Once confirmed you cannot change these. Only the admin can release a choice.</p>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirming(false)} disabled={submit.isPending}>Go back</button>
              <button className={btnPrimary} onClick={() => submit.mutate()} disabled={submit.isPending}>{submit.isPending ? 'Confirming…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MyAllottedPage() {
  const q = useQuery({ queryKey: ['fs', 'allotted'], queryFn: fsApi.allotted });
  const rows = q.data || [];
  const bySem = new Map<string, any[]>();
  for (const r of rows) bySem.set(`${r.semester_label}|${r.round_title}`, [...(bySem.get(`${r.semester_label}|${r.round_title}`) || []), r]);
  return (
    <div className="space-y-5 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-textPrimary tracking-tight">My Allotted Faculty</h1>
        <Link to="/faculty-selection" className={btnGhost}>Choose faculty</Link>
      </div>
      {q.isLoading ? <p className="text-xs text-textMuted">Loading…</p> : !rows.length ? <Empty title="No faculty allotted yet" text="Your choices appear here once you confirm them." /> :
        Array.from(bySem.entries()).map(([k, list]) => (
          <div key={k} className={`${card} p-4 space-y-2 overflow-x-auto`}>
            <p className="text-sm font-black text-textPrimary">{list[0].round_title} · Semester {list[0].semester_label}</p>
            <table className="w-full">
              <thead><tr className="border-b border-borderLine"><th className={th}>Subject</th><th className={th}>Type</th><th className={th}>Faculty</th><th className={th}>Attendance class</th><th className={th}>Confirmed</th></tr></thead>
              <tbody>{list.map((r: any, i: number) => (
                <tr key={i} className="border-b border-borderLine last:border-0">
                  <td className={td}>{r.subject_name}</td><td className={td}>{r.subject_type}</td>
                  <td className={`${td} font-black`}>{r.status === 'active' ? r.faculty_name : <span className={chipWarn}>Admin will assign</span>}</td>
                  <td className={td}>{r.status === 'active' ? `${r.subject_name} · Sec ${r.section}` : '—'}</td>
                  <td className={`${td} font-mono text-[11px]`}>{fmtTime(r.created_at, true)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ))}
      <p className="text-[11px] text-textMuted">These subjects appear in My Attendance once your faculty start posting classes.</p>
    </div>
  );
}
