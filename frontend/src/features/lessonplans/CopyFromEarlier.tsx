/**
 * "Start from an earlier plan" — when a faculty member teaches a subject again (next year, or another section this year),
 * offer to copy the earlier lesson plan, Course Execution Plan and course outcomes into this subject.
 * Only empty parts are filled; dates, syllabus coverage, attainment and class details start fresh.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, X } from 'lucide-react';
import { api } from '../../lib/api';

type Part = 'lesson_plan' | 'exec_plan' | 'obe';
const LABEL: Record<Part, string> = { lesson_plan: 'Lesson plan', exec_plan: 'Course Execution Plan', obe: 'Course outcomes & CO–PO mapping' };

export function CopyFromEarlier({ allotmentId, parts = ['lesson_plan', 'exec_plan', 'obe'], blocked, onCopied }: {
  allotmentId: string;
  parts?: Part[];
  blocked?: string;                      // why copying is not possible right now (e.g. unsaved changes)
  onCopied?: (copied: string[]) => void;
}) {
  const qc = useQueryClient();
  const dismissKey = `copy-from-dismissed:${allotmentId}`;
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem(dismissKey) === '1'; } catch { return false; } });
  const { data } = useQuery({ queryKey: ['copySources', allotmentId], queryFn: () => api.getCopySources(allotmentId), staleTime: 60_000 });
  const has = (x: any, p: Part) => (p === 'lesson_plan' ? x.lesson_topics > 0 : p === 'exec_plan' ? x.exec_progress > 0 : x.obe_cos > 0);
  // parts still empty here that some earlier subject has
  const open = useMemo(() => parts.filter(p => !data?.filled?.[p] && (data?.sources || []).some(x => has(x, p))), [data, parts]);
  const [source, setSource] = useState('');
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (msg?.ok) return <div role="status" className="rounded-xl px-4 py-2.5 text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{msg.text}</div>;
  if (!data?.can_copy || dismissed || !open.length) return null;

  const sources = (data.sources || []).filter(x => open.some(p => has(x, p)));
  const src = sources.find(x => x.allotment_id === source) || sources[0];
  const avail = open.filter(p => has(src, p));
  const chosen = avail.filter(p => pick[p] !== false);
  const describe = (x: any) => [
    x.academic_year === data.academic_year ? `Section ${x.section} this year` : `${x.academic_year} · Section ${x.section}`,
    x.mine ? 'your plan' : x.faculty_name,
  ].join(' · ');
  const what = (x: any) => [x.lesson_topics ? `${x.lesson_topics} topics` : '', x.exec_progress ? `execution plan ${x.exec_progress}% filled` : '', x.obe_cos ? `${x.obe_cos} COs` : ''].filter(Boolean).join(', ');

  const copy = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.copyPlansFrom(allotmentId, src.allotment_id, chosen);
      try { localStorage.removeItem(`cep-draft:${allotmentId}`); } catch { /* storage unavailable */ }
      ['lessonPlan', 'execPlan', 'copySources', 'myLessonPlans', 'obeCourse', 'obeCourses'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      onCopied?.(r.copied);
      setMsg(r.copied.length
        ? { ok: true, text: `Copied ${r.copied.map(c => LABEL[c as Part] || c).join(', ')} from ${describe(src)}. Planned dates, coverage and attainment start fresh: check the copy, set this year's dates, then save.` }
        : { ok: false, text: 'Nothing was copied: this subject already has its own plan.' });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not copy' }); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="Start from an earlier plan" className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 space-y-3 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex items-start gap-3">
        <Copy className="w-4 h-4 mt-0.5 text-sky-700 dark:text-sky-300 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-textPrimary">This subject has been taught before</p>
          <p className="text-xs text-textSecondary">Start from the earlier plan instead of writing it again. Only empty parts are filled; planned dates, coverage and attainment start fresh.</p>
        </div>
        <button type="button" aria-label="Not now" className="p-1 rounded-lg text-textMuted hover:bg-surface-2"
          onClick={() => { setDismissed(true); try { sessionStorage.setItem(dismissKey, '1'); } catch { /* storage unavailable */ } }}><X className="w-4 h-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-7">
        <select aria-label="Copy from" value={src.allotment_id} onChange={e => setSource(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary max-w-full">
          {sources.map(x => <option key={x.allotment_id} value={x.allotment_id}>{describe(x)} — {what(x)}</option>)}
        </select>
        {avail.map(p => (
          <label key={p} className="inline-flex items-center gap-1.5 text-xs text-textPrimary">
            <input type="checkbox" checked={pick[p] !== false} onChange={e => setPick(s => ({ ...s, [p]: e.target.checked }))} />{LABEL[p]}
          </label>
        ))}
        <button type="button" disabled={busy || !chosen.length || !!blocked} onClick={copy}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50">{busy ? 'Copying…' : 'Copy into this subject'}</button>
        {blocked && <span className="text-[11px] text-textMuted">{blocked}</span>}
      </div>
      {msg && !msg.ok && <p role="alert" className="pl-7 text-xs font-bold text-rose-700 dark:text-rose-300">{msg.text}</p>}
    </section>
  );
}
