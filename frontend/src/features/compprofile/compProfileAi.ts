/**
 * AI help for the Faculty Comprehensive Profile — descriptive cells only: the objectives and technologies of FDPs,
 * trainings and workshops (from their titles), each connection's industry type, expertise and domain (from the
 * organisation and role), and creative assignment ideas. Facts — dates, people, papers, ratings — stay with the
 * faculty member. No person's name is sent.
 */
import type { CompProfile } from './compProfile';

const SECTIONS = ['fdp', 'training', 'workshops'] as const;
const isBlank = (v: unknown) => !String(v ?? '').trim();
const cut = (v: unknown, n: number) => String(v ?? '').slice(0, n);

export interface ProfileDraft {
  programmes: { id: string; objectives: string; tech: string }[];
  connections: { id: string; type: string; expertise: string; domain: string }[];
  creative: { problem: string; idea: string; why: string }[];
}

export function profileAiInput(p: CompProfile) {
  const programmes: any[] = [];
  for (const s of SECTIONS) for (const role of ['attended', 'organised'] as const) {
    (p[s][role] as any[]).forEach((x, i) => {
      if (!isBlank(x.title) && (isBlank(x.objectives) || isBlank(x.tech)))
        programmes.push({ id: `${s}.${role}.${i}`, title: cut(x.title, 300), organiser: cut(role === 'attended' ? x.organiser : x.collaboration, 200), role });
    });
  }
  const connections: any[] = [];
  for (const list of ['alumni', 'industry'] as const) {
    p[list].forEach((c, i) => {
      if ((!isBlank(c.org) || !isBlank(c.designation)) && (isBlank(c.type) || isBlank(c.expertise) || isBlank(c.domain)))
        connections.push({ id: `${list}.${i}`, org: cut(c.org, 200), designation: cut(c.designation, 150), role: cut(c.role, 150) });
    });
  }
  const creativeEmpty = p.creative.filter(c => isBlank(c.problem) && isBlank(c.idea) && isBlank(c.why)).length;
  return {
    specialization: cut(p.profile.specialization, 200),
    research_areas: [p.profile.area1, p.profile.area2, p.profile.area3].filter(x => !isBlank(x)).map(x => cut(x, 150)),
    courses: p.teaching.map(t => t.course).filter(x => !isBlank(x)).slice(0, 8).map(x => cut(x, 300)),
    programmes: programmes.slice(0, 40), connections: connections.slice(0, 20),
    creative_count: Math.min(6, creativeEmpty),
  };
}

/** True when there is anything the AI could help with */
export const profileAiHasWork = (input: ReturnType<typeof profileAiInput>) => input.programmes.length + input.connections.length + input.creative_count > 0;

/** Fill only the empty cells the draft covers */
export function applyProfileDraft(p: CompProfile, d: ProfileDraft): { profile: CompProfile; filled: number } {
  let filled = 0;
  const put = (row: any, key: string, v: string) => { if (v && isBlank(row[key])) { row[key] = String(v).trim(); filled++; } };
  const next: CompProfile = JSON.parse(JSON.stringify(p));
  for (const x of d.programmes || []) {
    const [s, role, i] = String(x.id).split('.');
    const row = (next as any)[s!]?.[role!]?.[Number(i)];
    if (row && (SECTIONS as readonly string[]).includes(s!)) { put(row, 'objectives', x.objectives); put(row, 'tech', x.tech); }
  }
  for (const x of d.connections || []) {
    const [list, i] = String(x.id).split('.');
    const row = list === 'alumni' || list === 'industry' ? next[list][Number(i)] : undefined;
    if (row) { put(row, 'type', x.type); put(row, 'expertise', x.expertise); put(row, 'domain', x.domain); }
  }
  const ideas = [...(d.creative || [])];
  for (const row of next.creative) {
    if (!ideas.length) break;
    if (isBlank(row.problem) && isBlank(row.idea) && isBlank(row.why)) { const c = ideas.shift()!; put(row, 'problem', c.problem); put(row, 'idea', c.idea); put(row, 'why', c.why); }
  }
  return { profile: next, filled };
}
