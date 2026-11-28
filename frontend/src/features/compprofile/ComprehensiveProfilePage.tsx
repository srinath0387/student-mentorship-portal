/**
 * Faculty Comprehensive Profile — the department's 11-sheet workbook as a form, prefilled from the portal.
 * Faculty: /faculty-profile/comprehensive (editable, autosaved). HOD / Principal: ?email= (read-only).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Download, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { saveAs } from 'file-saver';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { BouncingDots } from '../../components/common/BouncingDots';
import { useAutosaveDoc } from '../../lib/useAutosaveDoc';
import {
  ATT_KEYS, CONN_ROWS, CompProfile, Connection, ORG_KEYS, PROFILE_ROWS, Programme, RATINGS, buildCompProfileXlsx, emptyCreative,
  emptyProfile, menteesFrom, merge, prefill, profileFileName, progressOf,
} from './compProfile';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'w-full px-2.5 py-1.5 text-xs rounded-lg border border-borderLine bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-80';
const btn = 'px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50';
const btnPrimary = `${btn} bg-brand-primary text-white hover:opacity-90`;
const btnGhost = `${btn} border border-borderLine text-textSecondary hover:bg-surface-2`;
const lbl = 'block text-[11px] font-bold text-textSecondary';

const TABS = [
  ['profile', 'Faculty Profile'], ['teaching', 'Teaching History'], ['fdp', 'FDPs'], ['training', 'Training Programs'], ['workshops', 'Workshops'],
  ['mentees', 'Mentee Details'], ['top', 'Top 5 Mentees'], ['pubs', 'Publications and IP'], ['alumni', 'Alumni Connections'],
  ['industry', 'Industry Connections'], ['creative', 'Creative Assignments'],
] as const;
type Tab = typeof TABS[number][0];
const LONG = new Set(['objectives', 'plan', 'collaboration', 'outcomes', 'problem', 'idea', 'why', 'expertise']);

function useFooterHeight() {
  const [h, setH] = useState(64);
  useEffect(() => {
    const f = document.querySelector('footer'); if (!f) return;
    const up = () => setH(f.getBoundingClientRect().height || 64); up();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(up) : null; ro?.observe(f);
    return () => ro?.disconnect();
  }, []);
  return h;
}
const F = ({ id, label, children, className = '' }: { id: string; label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1 ${className}`}><label htmlFor={id} className={lbl}>{label}</label>{children}</div>
);
const Txt = ({ id, value, onChange, long, placeholder, type = 'text' }: { id: string; value: string; onChange: (v: string) => void; long?: boolean; placeholder?: string; type?: string }) => long
  ? <textarea id={id} rows={2} className={`${input} resize-y`} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  : <input id={id} type={type} className={input} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
const Sel = ({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: string[] }) => (
  <select id={id} className={input} value={value} onChange={e => onChange(e.target.value)}><option value="">—</option>{options.map(o => <option key={o}>{o}</option>)}</select>
);
const Rate = ({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) => (
  <select id={id} aria-label={label} className={`${input} w-16`} value={value} onChange={e => onChange(e.target.value)}><option value="">—</option>{['1', '2', '3', '4', '5'].map(o => <option key={o}>{o}</option>)}</select>
);

const ATT_LABELS: Record<string, string> = {
  title: 'Title', organiser: 'Organised by (Department, College / Agency, Location)', objectives: 'Objectives', tech: 'Technologies / Products trained upon',
  days: 'Duration (No. of days)', dates: 'Dates', govt: 'Sponsored by a Government agency?', industry: 'Sponsored by an Industry?', college: 'Participation sponsored by our college?',
  college_ways: 'If yes, in what ways? (Financial and/or Paid leaves)',
};
const ORG_LABELS: Record<string, string> = {
  title: 'Title', collaboration: 'Any collaboration? (Department, College / Agency, Location)', objectives: 'Objectives', tech: 'Technologies / Tools trained upon',
  days: 'Duration (No. of days)', dates: 'Dates', sponsor_type: 'Sponsoring agency', agency: 'Agency name', sponsorship_kind: 'Kind of sponsorship (Financial and/or Resource persons)',
};

function ProgrammeEditor({ prog, onChange, workshop, idp }: { prog: Programme; onChange: (p: Programme) => void; workshop?: boolean; idp: string }) {
  const section = (kind: 'attended' | 'organised') => {
    const list = prog[kind] as any[];
    const keys = (kind === 'attended' ? ATT_KEYS : ORG_KEYS).filter(k => k !== 'tech' || workshop);
    const shown = Math.min(6, Math.max(1, list.filter(x => x.title).length + (list.filter(x => x.title).length < 6 ? 1 : 0)));
    const set = (i: number, k: string, v: string) => onChange({ ...prog, [kind]: list.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
    return (
      <div className="space-y-2">
        <p className="text-sm font-black text-textPrimary">{kind === 'attended' ? 'Attended' : 'Organised'} <span className="text-[11px] font-bold text-textMuted">({list.filter(x => x.title).length} of 6)</span></p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {list.slice(0, shown).map((x, i) => (
            <div key={i} className={`${card} p-3 grid grid-cols-1 sm:grid-cols-2 gap-2`}>
              <p className="sm:col-span-2 text-[11px] font-black text-textMuted">#{i + 1}</p>
              {keys.map(k => {
                const id = `${idp}-${kind}-${i}-${k}`;
                const lab = (kind === 'attended' ? ATT_LABELS : ORG_LABELS)[k]!;
                const yn = ['govt', 'industry', 'college'].includes(k);
                return (
                  <F key={k} id={id} label={lab} className={LONG.has(k) || k === 'title' || k === 'organiser' || k === 'collaboration' || k === 'college_ways' ? 'sm:col-span-2' : ''}>
                    {yn ? <Sel id={id} value={x[k]} onChange={v => set(i, k, v)} options={['Yes', 'No']} />
                      : k === 'sponsor_type' ? <Sel id={id} value={x[k]} onChange={v => set(i, k, v)} options={['Government', 'Private', 'Parent Institution']} />
                      : <Txt id={id} value={x[k]} onChange={v => set(i, k, v)} long={LONG.has(k)} type={k === 'days' ? 'number' : 'text'} placeholder={k === 'dates' ? 'e.g. 12-12-2026 to 16-12-2026' : undefined} />}
                  </F>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };
  return <div className="space-y-5">{section('attended')}{section('organised')}</div>;
}

function ConnectionsEditor({ list, onChange, kind, picks }: { list: Connection[]; onChange: (l: Connection[]) => void; kind: 'alumni' | 'industry'; picks: { label: string; value: Partial<Connection> }[] }) {
  const set = (i: number, patch: Partial<Connection>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {list.slice(0, 5).map((c, i) => (
        <div key={i} className={`${card} p-3 space-y-2`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-textPrimary mr-auto">Connection {i + 1}</p>
            {picks.length > 0 && (
              <select aria-label={`Fill connection ${i + 1} from the list`} className={`${input} w-auto max-w-[16rem]`} value="" onChange={e => { const p = picks[Number(e.target.value)]; if (p) set(i, p.value); }}>
                <option value="">{kind === 'alumni' ? 'Pick from the Alumni list…' : 'Pick from event speakers…'}</option>
                {picks.map((p, j) => <option key={j} value={j}>{p.label}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONN_ROWS.map(([k, l]) => {
              const id = `${kind}-${i}-${k}`;
              const label = k === 'org' ? (kind === 'alumni' ? 'Company where the alumnus works, Location' : 'Industry name, Location') : l;
              return (
                <F key={k} id={id} label={label} className={LONG.has(k) || k === 'domain' || k === 'org' ? 'sm:col-span-2' : ''}>
                  {k.startsWith('w_') ? <Rate id={id} label={label} value={c[k]} onChange={v => set(i, { [k]: v })} />
                    : k === 'type' ? <Sel id={id} value={c[k]} onChange={v => set(i, { [k]: v })} options={['Product-based', 'Service-based', 'Startup', 'Other']} />
                    : k === 'domain' ? <Sel id={id} value={c[k]} onChange={v => set(i, { [k]: v })} options={['Cyber Security', 'Data related', 'Compilers', 'Cloud', 'AI', 'Other Software']} />
                    : <Txt id={id} value={c[k]} onChange={v => set(i, { [k]: v })} long={LONG.has(k)} type={k === 'linkedin' ? 'url' : 'text'} />}
                </F>
              );
            })}
          </div>
          <p className="text-[10px] text-textMuted">Willingness: 1 = not willing, 5 = very willing.</p>
        </div>
      ))}
    </div>
  );
}

export default function ComprehensiveProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const viewEmail = new URLSearchParams(useLocation().search).get('email');
  const viewing = !!viewEmail;
  // own profile (editable, with prefill sources) or someone else's (read-only)
  const q = useQuery<any>({ queryKey: ['compProfile', viewEmail || 'me'], queryFn: () => (viewing ? api.getCompProfileOf(viewEmail!) : api.getMyCompProfile()) });
  const canEdit = !viewing && !!q.data?.can_edit;
  const doc = useAutosaveDoc<CompProfile>({ draftKey: `fcp-draft:${user?.email || 'me'}`, canEdit, save: async v => { await api.saveMyCompProfile(v); qc.invalidateQueries({ queryKey: ['deptCompProfiles'] }); } });
  const [tab, setTab] = useState<Tab>('profile');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const footerH = useFooterHeight();
  const sources = (q.data as any)?.sources || null;

  useEffect(() => {
    if (!q.data || doc.value) return;
    const base = viewing ? emptyProfile() : prefill(sources);
    doc.init(merge(q.data.saved?.data, base), q.data.saved?.updated_at || null, d => merge(d, base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const p = doc.value;
  const menteeNames = useMemo(() => (p?.mentees || []).map(m => [m.roll, m.name].filter(Boolean).join(', ')), [p?.mentees]);
  if (q.isLoading || (!p && !q.error)) return <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>;
  if (q.error || !p) return <div className={`${card} p-6 text-sm text-rose-600`}>{(q.error as any)?.message || 'Could not load'}</div>;

  const set = (patch: Partial<CompProfile>) => { doc.update({ ...p, ...patch }); setMsg(null); };
  const idx = TABS.findIndex(([k]) => k === tab);
  const next = TABS[idx + 1];
  const pct = progressOf(p);
  const name = viewing ? (q.data as any)?.faculty?.name : p.profile.full_name || user?.name;
  const hideRatings = viewing && !(q.data as any)?.can_see_ratings;
  const download = async () => {
    setBusy('download');
    try {
      const saved = canEdit && (doc.dirty || doc.neverSaved) ? await doc.saveNow(doc.neverSaved) : true;
      saveAs(await buildCompProfileXlsx(p, { author: name || undefined, hideRatings }), profileFileName(p, name || 'Faculty'));
      setMsg(saved ? { ok: true, text: 'Downloaded: all sheets with everything on screen.' } : { ok: false, text: 'Downloaded, but saving to the portal failed. Your entries are kept on this device; press Save to try again.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Could not build the Excel file' }); } finally { setBusy(null); }
  };
  const go = async (t: Tab) => { if (canEdit) await doc.saveNow(doc.neverSaved); setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const st = doc.saveState;
  const status = !canEdit ? null
    : st.s === 'saving' ? <span className="inline-flex items-center gap-1 text-textSecondary"><BouncingDots size="xs" /> Saving…</span>
    : st.s === 'error' ? <span className="text-rose-600">Not saved: {st.err}. Kept on this device; press Save to try again.</span>
    : doc.dirty ? <span className="text-amber-700 dark:text-amber-300">Unsaved changes (saving automatically)</span>
    : st.at ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><Check className="w-3 h-3" />All changes saved · {new Date(st.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
    : <span className="text-textMuted">Not saved yet</span>;

  return (
    <div className={`space-y-4 ${canEdit ? 'pb-24 sm:pb-16' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        {viewing && <Link to="/faculty-profile/department" className="p-2 rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Link>}
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl font-black text-textPrimary">{viewing ? `${name || viewEmail} — Comprehensive Profile` : 'My Comprehensive Profile'}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <div className="h-1.5 w-32 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-brand-primary" style={{ width: `${pct}%` }} /></div>
            <span className="text-[11px] font-bold text-textSecondary">{pct}% filled</span>
            <span className="text-[11px] font-bold">{status}</span>
          </div>
        </div>
        {canEdit && <button className={btnGhost} disabled={st.s === 'saving' || (!doc.dirty && !doc.neverSaved && st.s !== 'error')} onClick={() => doc.saveNow(doc.neverSaved)}><Save className="w-3.5 h-3.5 inline mr-1" />Save</button>}
        <button className={btnPrimary} disabled={!!busy} onClick={download}>{busy === 'download' ? <BouncingDots size="xs" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Download Excel</button>
      </div>
      {!viewing && <p className="text-xs text-textSecondary">Developmental and supportive, not a ranking. Leave unknown items blank or write “Not Applicable”. Much of it is already filled from the portal; check it and add the rest.</p>}
      {doc.restored && <div className="rounded-xl px-4 py-2.5 text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Your unsaved entries from last time were brought back and are being saved.</div>}
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { if (canEdit && doc.dirty) void doc.saveNow(); setTab(k); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${tab === k ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>{l}</button>
        ))}
      </div>

      <fieldset disabled={!canEdit} className="min-w-0">
        {tab === 'profile' && (
          <div className={`${card} divide-y divide-borderLine`}>
            {PROFILE_ROWS.map(([k, l]) => (
              <div key={k} className="grid grid-cols-1 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-x-4 gap-y-1 p-3 items-center">
                <label htmlFor={`fp-${k}`} className="text-xs font-bold text-textPrimary">{l}</label>
                <Txt id={`fp-${k}`} value={p.profile[k]} onChange={v => set({ profile: { ...p.profile, [k]: v } })}
                  type={['linkedin', 'github', 'website', 'scholar'].includes(k) ? 'url' : ['h_index', 'i10_index'].includes(k) ? 'number' : 'text'}
                  placeholder={k === 'date_joined' ? 'DD-MM-YYYY' : undefined} />
              </div>
            ))}
          </div>
        )}

        {tab === 'teaching' && (
          <div className="space-y-2">
            <p className="text-[11px] text-textMuted">The past eight semesters, including the one just finished. Courses fill in from your subject allotments and from the Subjects Handled records on your faculty profile (e.g. “II B.Tech. I Sem. &amp; 2024”). Add the missing ones there, or type them here.</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {p.teaching.map((t, i) => {
                const st2 = (k: string, v: string) => set({ teaching: p.teaching.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
                const id = (k: string) => `t-${i}-${k}`;
                return (
                  <div key={t.label} className={`${card} p-3 grid grid-cols-1 sm:grid-cols-2 gap-2`}>
                    <p className="sm:col-span-2 text-xs font-black text-textPrimary">{i + 1}. {t.label}</p>
                    <F id={id('course')} label="Course title (full name as in the curriculum)" className="sm:col-span-2"><Txt id={id('course')} value={t.course} onChange={v => st2('course', v)} /></F>
                    <F id={id('programme')} label="Programme"><Sel id={id('programme')} value={t.programme} onChange={v => st2('programme', v)} options={['B.Tech.', 'M.Tech.', 'MCA']} /></F>
                    <F id={id('regulation')} label="Regulation"><Txt id={id('regulation')} value={t.regulation} onChange={v => st2('regulation', v)} placeholder="e.g. R23" /></F>
                    <F id={id('tool')} label="Industry tool used in class (Linux, PostgreSQL, Wireshark…)" className="sm:col-span-2"><Txt id={id('tool')} value={t.tool} onChange={v => st2('tool', v)} /></F>
                    <F id={id('expert_used')} label="Industry expert included?"><Sel id={id('expert_used')} value={t.expert_used} onChange={v => st2('expert_used', v)} options={['Yes', 'No']} /></F>
                    {t.expert_used === 'Yes' && <>
                      <F id={id('expert_mode')} label="How (Seminar / Workshop / Bootcamp / Part of the syllabus…)"><Txt id={id('expert_mode')} value={t.expert_mode} onChange={v => st2('expert_mode', v)} /></F>
                      <F id={id('expert_name')} label="Expert's name"><Txt id={id('expert_name')} value={t.expert_name} onChange={v => st2('expert_name', v)} /></F>
                      <F id={id('expert_designation')} label="Designation in the industry"><Txt id={id('expert_designation')} value={t.expert_designation} onChange={v => st2('expert_designation', v)} /></F>
                      <F id={id('expert_company')} label="Company, location" className="sm:col-span-2"><Txt id={id('expert_company')} value={t.expert_company} onChange={v => st2('expert_company', v)} /></F>
                    </>}
                    <F id={id('econtent')} label="Developed e-content for the course?"><Sel id={id('econtent')} value={t.econtent} onChange={v => st2('econtent', v)} options={['Yes', 'No']} /></F>
                    {t.econtent === 'Yes' && <>
                      <F id={id('econtent_kind')} label="What kind (website material / YouTube videos…)"><Txt id={id('econtent_kind')} value={t.econtent_kind} onChange={v => st2('econtent_kind', v)} /></F>
                      <F id={id('econtent_url')} label="URL" className="sm:col-span-2"><Txt id={id('econtent_url')} type="url" value={t.econtent_url} onChange={v => st2('econtent_url', v)} /></F>
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'fdp' && <ProgrammeEditor idp="fdp" prog={p.fdp} onChange={v => set({ fdp: v })} />}
        {tab === 'training' && <ProgrammeEditor idp="trg" prog={p.training} onChange={v => set({ training: v })} />}
        {tab === 'workshops' && <ProgrammeEditor idp="ws" workshop prog={p.workshops} onChange={v => set({ workshops: v })} />}

        {tab === 'mentees' && (
          <div className={`${card} p-3 space-y-2`}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-textSecondary mr-auto">
                <b className="text-textPrimary">{p.mentees.length} mentees</b> · II year {p.mentees.filter(m => m.year === 'II').length} · III year {p.mentees.filter(m => m.year === 'III').length} · IV year {p.mentees.filter(m => m.year === 'IV').length}.
                Taken from your mentee list and the students' coding profiles.</p>
              {canEdit && sources && <button type="button" className={btnGhost} onClick={() => { set({ mentees: menteesFrom(sources) }); setMsg({ ok: true, text: 'Mentee list refreshed from the portal.' }); }}><RefreshCw className="w-3.5 h-3.5 inline mr-1" />Refresh from portal</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-xs border-collapse">
                <thead><tr>{['Regd No', 'Name', 'Year', 'LinkedIn', 'GitHub', 'LeetCode', 'HackerRank', 'CodeChef', 'Codeforces', 'Personal website'].map(h => <th key={h} className="px-2 py-1.5 border border-borderLine text-left text-[10px] font-black uppercase text-textSecondary">{h}</th>)}</tr></thead>
                <tbody>
                  {p.mentees.length === 0 ? <tr><td colSpan={10} className="p-6 text-center text-textMuted">No mentees are assigned to you in the portal.</td></tr> : p.mentees.map((m, i) => (
                    <tr key={i}>
                      {(['roll', 'name', 'year', 'linkedin', 'github', 'leetcode', 'hackerrank', 'codechef', 'codeforces', 'website'] as const).map(k => (
                        <td key={k} className="p-1 border border-borderLine"><input aria-label={`${m.name} ${k}`} className="w-full bg-transparent px-1.5 py-1 text-xs text-textPrimary rounded focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                          value={m[k]} onChange={e => set({ mentees: p.mentees.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'top' && (
          hideRatings ? <div className={`${card} p-6 text-xs text-textSecondary flex items-center gap-2`}><ShieldCheck className="w-4 h-4" />Ratings of named students are visible only to the faculty member and their HOD.</div> : (
            <div className={`${card} p-3 space-y-2`}>
              <p className="flex items-center gap-1.5 text-[11px] text-textMuted"><ShieldCheck className="w-3.5 h-3.5" />Seen only by you and your HOD. Rate 1 (needs support) to 5 (excellent).</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1150px] text-xs border-collapse">
                  <thead><tr>
                    <th className="px-2 py-1.5 border border-borderLine text-left text-[10px] font-black uppercase text-textSecondary w-56">Mentee</th>
                    {RATINGS.map(r => <th key={r} className="px-1.5 py-1.5 border border-borderLine text-left text-[10px] font-bold text-textSecondary align-bottom">{r}</th>)}
                  </tr></thead>
                  <tbody>
                    {p.top_mentees.map((t, i) => (
                      <tr key={i}>
                        <td className="p-1 border border-borderLine">
                          <select aria-label={`Top mentee ${i + 1}`} className={input} value={t.student} onChange={e => {
                            const m = p.mentees.find(x => [x.roll, x.name].filter(Boolean).join(', ') === e.target.value);
                            set({ top_mentees: p.top_mentees.map((x, j) => (j === i ? { ...x, student: e.target.value, year: m?.year || x.year } : x)) });
                          }}>
                            <option value="">Mentee {i + 1}…</option>
                            {(t.student && !menteeNames.includes(t.student) ? [t.student, ...menteeNames] : menteeNames).map(n => <option key={n}>{n}</option>)}
                          </select>
                        </td>
                        {RATINGS.map((r, j) => (
                          <td key={r} className="p-1 border border-borderLine"><Rate id={`top-${i}-${j}`} label={`Mentee ${i + 1}: ${r}`} value={t.ratings[j] || ''}
                            onChange={v => set({ top_mentees: p.top_mentees.map((x, k) => (k === i ? { ...x, ratings: x.ratings.map((y, m) => (m === j ? v : y)) } : x)) })} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {tab === 'pubs' && (
          <div className="space-y-4">
            {(['papers', 'patents'] as const).map(kind => {
              const list = p[kind] as any[];
              const mine = (sources?.profile?.publications || []).filter((x: any) => (kind === 'patents') === (x.category === 'Patent'));
              const keys = kind === 'papers'
                ? [['ay', 'Academic year'], ['title', 'Title of the paper'], ['indexing', 'Indexing (SCI / Scopus / WoS…)'], ['publisher', 'Publishing agency'], ['citations', 'Citations'], ['quartile', 'Quartile']]
                : [['ay', 'Academic year'], ['title', 'Title of the patent'], ['type', 'Type of patent'], ['publisher', 'Publishing agency'], ['citations', 'Citations'], ['year', 'Publishing year']];
              return (
                <div key={kind} className="space-y-2">
                  <p className="text-sm font-black text-textPrimary">{kind === 'papers' ? 'Most promising papers' : 'Most promising patents'} <span className="text-[11px] font-bold text-textMuted">(up to 5, whole career)</span></p>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {list.map((x, i) => {
                      const setx = (patch: any) => set({ [kind]: list.map((y, j) => (j === i ? { ...y, ...patch } : y)) } as any);
                      return (
                        <div key={i} className={`${card} p-3 grid grid-cols-1 sm:grid-cols-2 gap-2`}>
                          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                            <p className="text-[11px] font-black text-textMuted mr-auto">#{i + 1}</p>
                            {mine.length > 0 && (
                              <select aria-label={`Fill ${kind} ${i + 1} from my publications`} className={`${input} w-auto max-w-[18rem]`} value="" onChange={e => {
                                const m = mine[Number(e.target.value)]; if (!m) return;
                                const yr = Number(String(m.patent_date || m.year || '').slice(0, 4));
                                setx({ title: m.title || '', publisher: m.journal_name || '', citations: m.citations != null ? String(m.citations) : '', ay: yr ? `${yr - 1}-${String(yr % 100).padStart(2, '0')}` : '',
                                  ...(kind === 'papers' ? { indexing: m.category !== 'Unclassified' ? m.category : '' } : { type: m.patent_status || '', year: yr ? String(yr) : '' }) });
                              }}>
                                <option value="">Pick from my publications…</option>
                                {mine.map((m: any, j: number) => <option key={j} value={j}>{String(m.title || '').slice(0, 80)}</option>)}
                              </select>
                            )}
                          </div>
                          {keys.map(([k, l]) => <F key={k} id={`${kind}-${i}-${k}`} label={l!} className={k === 'title' ? 'sm:col-span-2' : ''}>
                            {k === 'quartile' ? <Sel id={`${kind}-${i}-${k}`} value={x[k!]} onChange={v => setx({ [k!]: v })} options={['Q1', 'Q2', 'Q3', 'Q4']} />
                              : <Txt id={`${kind}-${i}-${k}`} value={x[k!]} onChange={v => setx({ [k!]: v })} placeholder={k === 'ay' ? '2025-26' : undefined} />}</F>)}
                          <F id={`${kind}-${i}-product`} label="Can it become a product / API / service?"><Sel id={`${kind}-${i}-product`} value={x.product} onChange={v => setx({ product: v })} options={['Yes', 'No', 'To confirm']} /></F>
                          {x.product === 'Yes' && <F id={`${kind}-${i}-plan`} label="Your plan to transform it" className="sm:col-span-2"><Txt id={`${kind}-${i}-plan`} long value={x.plan} onChange={v => setx({ plan: v })} /></F>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'alumni' && <ConnectionsEditor kind="alumni" list={p.alumni} onChange={l => set({ alumni: l })}
          picks={(sources?.alumni || []).map((a: any) => ({ label: `${a.name} — ${a.role_title ? `${a.role_title}, ` : ''}${a.organization}${a.batch ? ` (${a.batch})` : ''}`,
            value: { person: a.name || '', org: [a.organization, a.location].filter(Boolean).join(', '), designation: a.role_title || '', linkedin: a.linkedin_url || '' } }))} />}
        {tab === 'industry' && <ConnectionsEditor kind="industry" list={p.industry} onChange={l => set({ industry: l })}
          picks={(sources?.speakers || []).map((s: any) => ({ label: `${s.name}${s.organization ? ` — ${s.organization}` : ''}`, value: { person: s.name || '', designation: s.designation || '', org: s.organization || '' } }))} />}

        {tab === 'creative' && (
          <div className="space-y-3">
            <p className="text-[11px] text-textMuted">Creative solutions from your mentees: up to three mentees per batch.</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {p.creative.map((c, i) => {
                const setc = (patch: any) => set({ creative: p.creative.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className={`${card} p-3 grid grid-cols-1 sm:grid-cols-3 gap-2`}>
                    <div className="sm:col-span-3 flex items-center"><p className="text-xs font-black text-textPrimary mr-auto">Batch {i + 1}</p>
                      {canEdit && p.creative.length > 1 && <button type="button" aria-label={`Remove batch ${i + 1}`} className="p-1 text-textMuted hover:text-rose-600" onClick={() => set({ creative: p.creative.filter((_, j) => j !== i) })}><Trash2 className="w-3.5 h-3.5" /></button>}</div>
                    {(['m1', 'm2', 'm3'] as const).map((k, j) => (
                      <F key={k} id={`cr-${i}-${k}`} label={`Mentee ${j + 1}`}>
                        <select id={`cr-${i}-${k}`} className={input} value={c[k]} onChange={e => setc({ [k]: e.target.value })}>
                          <option value="">—</option>{(c[k] && !p.mentees.some(m => m.name === c[k]) ? [c[k], ...p.mentees.map(m => m.name)] : p.mentees.map(m => m.name)).map(n => <option key={n}>{n}</option>)}
                        </select>
                      </F>
                    ))}
                    <F id={`cr-${i}-problem`} label="Problem statement" className="sm:col-span-3"><Txt id={`cr-${i}-problem`} long value={c.problem} onChange={v => setc({ problem: v })} /></F>
                    <F id={`cr-${i}-idea`} label="Innovative idea / technique implemented" className="sm:col-span-3"><Txt id={`cr-${i}-idea`} long value={c.idea} onChange={v => setc({ idea: v })} /></F>
                    <F id={`cr-${i}-why`} label="Why it is innovative" className="sm:col-span-3"><Txt id={`cr-${i}-why`} long value={c.why} onChange={v => setc({ why: v })} /></F>
                  </div>
                );
              })}
            </div>
            {canEdit && p.creative.length < 18 && <button type="button" className="text-[11px] font-bold text-brand-primary" onClick={() => set({ creative: [...p.creative, emptyCreative()] })}><Plus className="w-3 h-3 inline" /> Add batch</button>}
          </div>
        )}
      </fieldset>

      {canEdit && (
        <div style={{ bottom: footerH + 10 }} className={`${card} fixed right-3 sm:right-6 z-30 max-w-[calc(100vw-1.5rem)] p-2.5 flex flex-wrap items-center justify-end gap-2 shadow-lg`}>
          <span className="text-[11px] font-bold max-w-[16rem]">{status}</span>
          <button className={btnGhost} disabled={st.s === 'saving' || (!doc.dirty && !doc.neverSaved && st.s !== 'error')} onClick={() => doc.saveNow(doc.neverSaved)}><Save className="w-3.5 h-3.5 inline mr-1" />Save</button>
          {next ? <button className={btnPrimary} disabled={st.s === 'saving'} onClick={() => go(next[0])}>Save &amp; next: {next[1]}<ArrowRight className="w-3.5 h-3.5 inline ml-1" /></button>
            : <button className={btnPrimary} disabled={!!busy} onClick={download}>{busy === 'download' ? <BouncingDots size="xs" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Save &amp; download Excel</button>}
        </div>
      )}
    </div>
  );
}

