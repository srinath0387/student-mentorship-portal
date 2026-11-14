import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api';
import { fetchCitationCounts, normalizeDoi } from '../../lib/scholarly';

const hIndex = (cites: number[]) => {
  const c = [...cites].sort((a, b) => b - a);
  let h = 0;
  while (h < c.length && c[h] >= h + 1) h++;
  return h;
};

/** Citations & h-index for a department (or all), with a one-click refresh from Crossref. */
export function ResearchImpactPanel({ department, canRefresh }: { department: string; canRefresh: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['researchImpact', department], queryFn: () => api.getPublications(department, 'All', 'all', '') });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pubs: any[] = data?.publications || [];

  const s = useMemo(() => {
    const withDoi = pubs.filter(p => normalizeDoi(p.doi_link));
    const counted = pubs.filter(p => p.citations != null);
    const byFaculty = new Map<string, { name: string; dept: string; cites: number[] }>();
    for (const p of pubs) {
      const f = byFaculty.get(p.faculty_email) || { name: p.faculty_name, dept: p.department, cites: [] as number[] };
      f.cites.push(Number(p.citations || 0));
      byFaculty.set(p.faculty_email, f);
    }
    const faculty = Array.from(byFaculty.values()).map(f => ({ ...f, total: f.cites.reduce((a, b) => a + b, 0), h: hIndex(f.cites) }))
      .sort((a, b) => b.total - a.total || b.h - a.h);
    return {
      total: counted.reduce((n, p) => n + Number(p.citations || 0), 0),
      h: hIndex(pubs.map(p => Number(p.citations || 0))),
      withDoi: withDoi.length, counted: counted.length,
      topPapers: [...counted].sort((a, b) => b.citations - a.citations).slice(0, 5),
      topFaculty: faculty.filter(f => f.total > 0).slice(0, 5),
    };
  }, [pubs]);

  const refresh = async () => {
    setBusy(true); setNote(null);
    try {
      const counts = await fetchCitationCounts(pubs.map(p => p.doi_link || ''));
      const updates = pubs.map(p => ({ faculty_email: p.faculty_email, id: p.id, citations: counts.get(normalizeDoi(p.doi_link)) }))
        .filter(u => u.citations != null);
      const r: any = updates.length ? await api.saveCitationCounts(updates as any) : { updated: 0 };
      setNote(`Updated ${r.updated} publication(s) from Crossref.${s.withDoi < pubs.length ? ` ${pubs.length - s.withDoi} have no DOI — faculty can add one in their profile.` : ''}`);
      qc.invalidateQueries({ queryKey: ['researchImpact'] });
    } catch (e: any) { setNote(e.message || 'Could not reach Crossref'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-textPrimary text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-sky-600" />Research impact · {department === 'All' ? 'all departments' : department}</h3>
        {canRefresh && (
          <button onClick={refresh} disabled={busy || isLoading || !s.withDoi} className="px-3 py-1.5 rounded-lg border border-borderLine text-xs font-bold text-textSecondary hover:bg-surface-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 inline mr-1" />}Update citations from Crossref
          </button>
        )}
      </div>
      {note && <p className="text-[11px] font-bold text-sky-700 dark:text-sky-300">{note}</p>}
      {isLoading ? <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline text-textMuted" /></div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Total citations', s.total],
              ['Group h-index', s.h],
              ['Papers with DOI', `${s.withDoi} / ${pubs.length}`],
              ['Citation data', s.counted ? `${s.counted} papers` : 'not fetched yet'],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-surface-2 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{k}</p>
                <p className="text-xl font-black text-textPrimary">{v}</p>
              </div>
            ))}
          </div>
          {(s.topPapers.length > 0 || s.topFaculty.length > 0) ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider mb-2">Most cited papers</p>
                <div className="space-y-1.5">
                  {s.topPapers.map(p => (
                    <div key={p.id + p.faculty_email} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 w-12 text-right font-black text-sky-700 dark:text-sky-300">{p.citations}</span>
                      <span className="flex-1 min-w-0"><span className="text-textPrimary font-semibold line-clamp-1">{p.title}</span>
                        <span className="text-[10px] text-textMuted">{p.faculty_name} · {p.journal_name} · {p.year}</span></span>
                      {p.doi_link && <a href={p.doi_link} target="_blank" rel="noopener noreferrer" className="text-textMuted hover:text-brand-primary" aria-label="Open DOI"><ExternalLink className="w-3 h-3" /></a>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-textSecondary uppercase tracking-wider mb-2">Faculty by citations</p>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="text-[10px] text-textMuted uppercase"><th className="text-left font-bold pb-1">Faculty</th><th className="font-bold pb-1">Citations</th><th className="font-bold pb-1">h-index</th></tr></thead>
                  <tbody>{s.topFaculty.map(f => (
                    <tr key={f.name} className="border-t border-borderLine"><td className="py-1.5"><b className="text-textPrimary">{f.name}</b> <span className="text-[10px] text-textMuted">{f.dept}</span></td>
                      <td className="text-center font-black text-textPrimary">{f.total}</td><td className="text-center font-bold text-textSecondary">{f.h}</td></tr>
                  ))}</tbody>
                </table></div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-textMuted">No citation counts yet.{canRefresh && s.withDoi ? ' Press “Update citations from Crossref”.' : ' Faculty can import publications with DOIs from their ORCID iD (Faculty Profile → Publications).'}</p>
          )}
        </>
      )}
    </div>
  );
}
