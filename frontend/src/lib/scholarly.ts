/**
 * Free scholarly APIs, called from the browser (they allow CORS; the API Lambda has no internet):
 *  - ORCID public API   — the faculty member's list of works (free, no key)
 *  - Crossref           — DOI metadata + citation counts ("is-referenced-by-count"; free, no key)
 *  - OpenAlex           — author-level h-index / i10 / total citations (one call per import; free
 *                         without a key within a small shared daily allowance)
 */
import type { FacultyPublicationRecord } from '../types';

export interface ResearchMetrics {
  citations: number;
  h_index: number;
  i10_index: number;
  works: number;
  source: 'OpenAlex' | 'Crossref';
  updated_at: string;
}

export const normalizeDoi = (v?: string | null): string => {
  const m = String(v || '').trim().toLowerCase().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[.,;)\]]+$/, '') : '';
};
const normTitle = (t?: string) => String(t || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const r = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}

/** Works listed on an ORCID record. */
export async function fetchOrcidWorks(orcid: string): Promise<Partial<FacultyPublicationRecord>[]> {
  const data = await getJson(`https://pub.orcid.org/v3.0/${encodeURIComponent(orcid)}/works`);
  const out: Partial<FacultyPublicationRecord>[] = [];
  for (const group of data?.group || []) {
    const s = (group['work-summary'] || [])[0];
    if (!s) continue;
    const ids = s?.['external-ids']?.['external-id'] || [];
    const doiObj = ids.find((x: any) => String(x?.['external-id-type']).toLowerCase() === 'doi');
    const year = parseInt(s?.['publication-date']?.year?.value, 10);
    out.push({
      title: s?.title?.title?.value || 'Untitled publication',
      journal_name: s?.['journal-title']?.value || String(s?.type || 'Journal / conference article').replace(/[_-]/g, ' '),
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      doi_link: doiObj ? `https://doi.org/${normalizeDoi(doiObj['external-id-value'] || doiObj['external-id-url']?.value)}` : undefined,
    });
  }
  return out;
}

/** Crossref metadata for one DOI — used to fill the "Add publication" form. */
export async function lookupDoi(input: string): Promise<{ title: string; journal_name: string; year: number; co_authors: string; doi_link: string; citations: number } | null> {
  const doi = normalizeDoi(input);
  if (!doi) throw new Error('That does not look like a DOI (it starts with 10.)');
  const d = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const m = d?.message;
  if (!m) return null;
  const parts = m.issued?.['date-parts']?.[0] || m.published?.['date-parts']?.[0] || [];
  const authors = (m.author || []).map((a: any) => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean);
  return {
    title: String((m.title || [])[0] || '').replace(/<[^>]+>/g, ''),
    journal_name: String((m['container-title'] || [])[0] || m.publisher || ''),
    year: Number(parts[0]) || new Date().getFullYear(),
    co_authors: authors.slice(0, 15).join(', ') + (authors.length > 15 ? ' et al.' : ''),
    doi_link: `https://doi.org/${doi}`,
    citations: Number(m['is-referenced-by-count'] || 0),
  };
}

/** Citation counts for many DOIs at once (Crossref, 40 per request). */
export async function fetchCitationCounts(dois: string[]): Promise<Map<string, number>> {
  const clean = Array.from(new Set(dois.map(normalizeDoi).filter(Boolean)));
  const out = new Map<string, number>();
  for (let i = 0; i < clean.length; i += 40) {
    const batch = clean.slice(i, i + 40);
    const filter = batch.map(d => `doi:${d}`).join(',');
    const d = await getJson(`https://api.crossref.org/works?filter=${encodeURIComponent(filter)}&select=DOI,is-referenced-by-count&rows=${batch.length}`);
    for (const it of d?.message?.items || []) out.set(normalizeDoi(it.DOI), Number(it['is-referenced-by-count'] || 0));
  }
  return out;
}

/** h-index / i10 / citations for an ORCID from OpenAlex (null when OpenAlex doesn't know the author). */
export async function fetchAuthorMetrics(orcid: string): Promise<ResearchMetrics | null> {
  const d = await getJson(`https://api.openalex.org/authors?filter=orcid:${encodeURIComponent(orcid)}&select=id,cited_by_count,works_count,summary_stats`);
  const a = d?.results?.[0];
  if (!a) return null;
  return {
    citations: Number(a.cited_by_count || 0), h_index: Number(a.summary_stats?.h_index || 0),
    i10_index: Number(a.summary_stats?.i10_index || 0), works: Number(a.works_count || 0),
    source: 'OpenAlex', updated_at: new Date().toISOString(),
  };
}

/** Metrics from our own list (fallback when OpenAlex has no author profile). */
export function computeMetrics(pubs: FacultyPublicationRecord[]): ResearchMetrics {
  const c = pubs.map(p => Number(p.citations || 0)).sort((a, b) => b - a);
  let h = 0;
  while (h < c.length && c[h] >= h + 1) h++;
  return {
    citations: c.reduce((s, x) => s + x, 0), h_index: h, i10_index: c.filter(x => x >= 10).length,
    works: pubs.filter(p => p.category !== 'Patent').length, source: 'Crossref', updated_at: new Date().toISOString(),
  };
}

const keyOf = (p: Partial<FacultyPublicationRecord>) => normalizeDoi(p.doi_link) || `t:${normTitle(p.title)}`;

/**
 * Import from ORCID, add citation counts from Crossref, author metrics from OpenAlex.
 * Returns the full new list (existing entries keep their category / edits; only citations are refreshed).
 */
export async function importFromOrcid(orcid: string, existing: FacultyPublicationRecord[]) {
  const [worksRes, metricsRes] = await Promise.allSettled([fetchOrcidWorks(orcid), fetchAuthorMetrics(orcid)]);
  if (worksRes.status === 'rejected') throw new Error('ORCID could not be reached — check the iD or try again later.');
  const works = worksRes.value;
  const have = new Map(existing.map(p => [keyOf(p), p]));
  const titles = new Set(existing.map(p => `t:${normTitle(p.title)}`));
  const added: FacultyPublicationRecord[] = [];
  for (const w of works) {
    const k = keyOf(w);
    if (have.has(k) || titles.has(`t:${normTitle(w.title)}`)) continue;
    have.set(k, w as FacultyPublicationRecord);
    added.push({
      id: `orcid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, category: 'Unclassified',
      title: w.title!, journal_name: w.journal_name!, year: w.year!, doi_link: w.doi_link, needs_review: true, source: 'orcid',
    });
  }
  let all = [...added, ...existing];
  const counts = await fetchCitationCounts(all.map(p => p.doi_link || '')).catch(() => new Map<string, number>());
  all = all.map(p => {
    const n = counts.get(normalizeDoi(p.doi_link));
    return n == null ? p : { ...p, citations: n };
  });
  const metrics = metricsRes.status === 'fulfilled' && metricsRes.value ? metricsRes.value : computeMetrics(all);
  return { publications: all, added: added.length, withCitations: counts.size, metrics };
}

/** Refresh citation counts for a list (keeps everything else). */
export async function refreshCitations(pubs: FacultyPublicationRecord[]) {
  const counts = await fetchCitationCounts(pubs.map(p => p.doi_link || ''));
  return {
    publications: pubs.map(p => { const n = counts.get(normalizeDoi(p.doi_link)); return n == null ? p : { ...p, citations: n }; }),
    updated: counts.size,
  };
}
