/**
 * SessionPlanDialog — the lesson plan in the college's own format (Session / UNIT / TOPICS with
 * Discussion rows). Preview, adjust how topics are grouped, edit any row, then download Word or PDF.
 */
import React, { useMemo, useState } from 'react';
import { Download, FileText, RefreshCw, Save, X } from 'lucide-react';
import { api } from '../../lib/api';
import { BouncingDots } from '../../components/common/BouncingDots';
import { Topic, btnGhost, btnPrimary, card, input, currentAy, lessonPlanExcel, lessonPlanPdf, lessonPlanWord } from './lessonPlanShared';
import { SessionRow, SessionSettings, buildSessions, collegeLessonPlanPdf, collegeLessonPlanWord, headerFor, topicsKey, unitLabel } from './collegeFormat';

export function SessionPlanDialog({ allotmentId, allot, plan, draft, canEdit, ensureSaved, onClose }: {
  allotmentId: string; allot: any; plan: any | null; draft: any; canEdit: boolean;
  ensureSaved: () => Promise<void>; onClose: () => void;
}) {
  const topics: Topic[] = (draft?.topics || []).filter((t: Topic) => t.topic?.trim());
  const key = useMemo(() => topicsKey(topics), [topics]);
  const savedFits = !!plan?.session_plan?.length && plan?.session_settings?.topics_key === key;
  const [settings, setSettings] = useState<SessionSettings>(() => ({
    periods_per_session: plan?.session_settings?.periods_per_session || 2,
    discussion_every: plan?.session_settings?.discussion_every ?? 2,
  }));
  const [rows, setRows] = useState<SessionRow[]>(() => (savedFits ? plan.session_plan : buildSessions(topics, settings)));
  const [edited, setEdited] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState<SessionSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    plan?.session_plan?.length && !savedFits ? { ok: false, text: 'The topics changed since this session plan was saved, so the sessions were rebuilt.' } : null);
  const h = headerFor(allot, plan?.academic_year || currentAy());
  const sessions = rows.filter(r => r.kind === 'session').length;

  const rebuild = (s: SessionSettings) => { setSettings(s); setRows(buildSessions(topics, s)); setEdited(false); setConfirmRebuild(null); };
  const change = (s: SessionSettings) => (edited ? setConfirmRebuild(s) : rebuild(s));
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Something went wrong' }); } finally { setBusy(null); }
  };
  const saveSessions = () => run('save', async () => {
    await ensureSaved();
    await api.saveLessonSessions(allotmentId, { rows, settings: { ...settings, topics_key: key } });
    setEdited(false);
    setMsg({ ok: true, text: 'Session plan saved with the lesson plan.' });
  });
  let n = 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-3 sm:p-6" onClick={onClose}>
      <div className={`${card} w-full max-w-4xl max-h-[92vh] flex flex-col`} role="dialog" aria-modal="true" aria-labelledby="sp-title" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-borderLine flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[220px]">
            <p id="sp-title" className="text-sm font-black text-textPrimary">Lesson plan — college format</p>
            <p className="text-[11px] text-textSecondary">{h.course} · {h.year_sem} · {h.branch} Section {h.section} · {sessions} sessions, {rows.length - sessions} discussions</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-textMuted hover:text-textPrimary" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 border-b border-borderLine flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1"><span className="block text-[11px] font-bold text-textSecondary uppercase tracking-wider">Periods per session</span>
            <select className={input} value={settings.periods_per_session} onChange={e => change({ ...settings, periods_per_session: Number(e.target.value) })}>
              {[1, 2, 3, 4].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-[11px] font-bold text-textSecondary uppercase tracking-wider">Discussion</span>
            <select className={input} value={settings.discussion_every} onChange={e => change({ ...settings, discussion_every: Number(e.target.value) })}>
              <option value={0}>No discussion rows</option>{[1, 2, 3, 4].map(x => <option key={x} value={x}>After every {x} session{x > 1 ? 's' : ''}</option>)}</select></label>
          <button className={btnGhost} onClick={() => change(settings)}><RefreshCw className="w-3.5 h-3.5 inline mr-1" />Rebuild</button>
          {confirmRebuild && (
            <span className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5">
              <span className="font-bold text-amber-800 dark:text-amber-300">Rebuilding replaces your edits.</span>
              <button className={btnPrimary} onClick={() => rebuild(confirmRebuild)}>Rebuild</button>
              <button className={btnGhost} onClick={() => setConfirmRebuild(null)}>Keep edits</button>
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          <p className="text-[11px] text-textMuted mb-2">Edit any row before downloading. Discussion questions are drafted from the two sessions above them — reword them as you like.</p>
          <table className="w-full text-xs border border-borderLine">
            <thead className="bg-surface-2 text-[11px] font-black text-textPrimary"><tr>
              <th className="px-2 py-1.5 w-24 border border-borderLine">Session</th><th className="px-2 py-1.5 w-20 border border-borderLine">UNIT</th><th className="px-2 py-1.5 border border-borderLine">TOPICS</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.kind === 'discussion' ? 'bg-surface-2/40' : ''}>
                  <td className="px-2 py-1 text-center border border-borderLine whitespace-nowrap">{r.kind === 'session' ? `Session-${++n}` : 'Discussion'}</td>
                  <td className="px-2 py-1 text-center font-black border border-borderLine whitespace-nowrap">{unitLabel(r.unit)}</td>
                  <td className="p-1 border border-borderLine">
                    <textarea aria-label={`Row ${i + 1} topics`} rows={Math.max(1, Math.ceil(r.text.length / 95))}
                      className="w-full bg-transparent px-1 py-0.5 text-xs text-textPrimary resize-y focus:outline-none focus:ring-2 focus:ring-brand-primary/30 rounded"
                      value={r.text} onChange={e => { setRows(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))); setEdited(true); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-borderLine space-y-2">
          {msg && <div role="status" className={`rounded-xl px-3 py-2 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>{msg.text}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} disabled={!!busy || !rows.length} onClick={() => run('word', () => collegeLessonPlanWord(h, rows))}>
              {busy === 'word' ? <BouncingDots size="xs" /> : <FileText className="w-3.5 h-3.5 inline mr-1" />}Download Word</button>
            <button className={btnPrimary} disabled={!!busy || !rows.length} onClick={() => run('pdf', () => collegeLessonPlanPdf(h, rows))}>
              {busy === 'pdf' ? <BouncingDots size="xs" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Download PDF</button>
            {canEdit && <button className={btnGhost} disabled={!!busy} onClick={saveSessions}>{busy === 'save' ? <BouncingDots size="xs" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}Save session plan</button>}
            <span className="text-[11px] text-textMuted ml-auto">Detailed format with dates:
              <button className="ml-1 font-bold text-brand-primary hover:underline" onClick={() => lessonPlanPdf(allot, draft)}>PDF</button> ·
              <button className="ml-1 font-bold text-brand-primary hover:underline" onClick={() => lessonPlanWord(allot, draft)}>Word</button> ·
              <button className="ml-1 font-bold text-brand-primary hover:underline" onClick={() => lessonPlanExcel(allot, draft)}>Excel</button></span>
          </div>
        </div>
      </div>
    </div>
  );
}
