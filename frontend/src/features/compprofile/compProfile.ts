/**
 * Faculty Comprehensive Profile — the department's 11-sheet workbook.
 * Data model, prefill from the portal (profile, allotments, events, mentees, alumni), progress, and the Excel export
 * that fills the department's own template (public/templates/faculty-comprehensive-profile.xlsx).
 */
import JSZip from 'jszip';
import { Val, fillInPlace, rowsOf, setRowCells } from '../lessonplans/execPlan';

const blank = <T extends string>(keys: readonly T[]) => Object.fromEntries(keys.map(k => [k, ''])) as Record<T, string>;

export const PROFILE_ROWS = [
  ['full_name', 'Full Name'], ['designation', 'Designation'], ['date_joined', 'Date Joined RGMCET (DD-MM-YYYY)'], ['highest_qualification', 'Highest Qualification'],
  ['basic_degree', 'Basic Degree Qualification'], ['specialization', 'Specialization'], ['email', 'Email (institutional)'], ['linkedin', 'LinkedIn URL'],
  ['github', 'GitHub URL'], ['website', 'Personal Website'], ['orcid', 'ORCID'], ['scopus', 'Scopus ID'], ['scholar', 'Google Scholar URL'],
  ['h_index', 'h-index'], ['i10_index', 'i-10 index'], ['area1', 'Top Research Area 1'], ['area2', 'Top Research Area 2'], ['area3', 'Top Research Area 3'],
] as const;
export type ProfileKey = typeof PROFILE_ROWS[number][0];

export const TEACH_KEYS = ['label', 'regulation', 'programme', 'course', 'tool', 'expert_used', 'expert_mode', 'expert_name', 'expert_designation', 'expert_company', 'econtent', 'econtent_kind', 'econtent_url'] as const;
export type Semester = Record<typeof TEACH_KEYS[number], string>;

export const ATT_KEYS = ['title', 'organiser', 'objectives', 'tech', 'days', 'dates', 'govt', 'industry', 'college', 'college_ways'] as const;
export const ORG_KEYS = ['title', 'collaboration', 'objectives', 'tech', 'days', 'dates', 'sponsor_type', 'agency', 'sponsorship_kind'] as const;
export type Attended = Record<typeof ATT_KEYS[number], string>;
export type Organised = Record<typeof ORG_KEYS[number], string>;
export type Programme = { attended: Attended[]; organised: Organised[] };

export const MENTEE_KEYS = ['roll', 'name', 'year', 'linkedin', 'github', 'leetcode', 'hackerrank', 'codechef', 'codeforces', 'website'] as const;
export type Mentee = Record<typeof MENTEE_KEYS[number], string>;
export const RATINGS = ['How good in Coding?', 'How good in Communication?', 'How regular to report the project progress?', 'How good in doing research?',
  'How active to attend CSE department events?', 'How active to attend other department events?', 'How active to attend Industry events outside the college?',
  'How active to participate in the extracurricular events the college?', 'How good to create any publicity content for the events of our department?'];
export type TopMentee = { year: string; student: string; ratings: string[] };

export const PAPER_KEYS = ['ay', 'title', 'indexing', 'publisher', 'citations', 'quartile', 'product', 'plan'] as const;
export const PATENT_KEYS = ['ay', 'title', 'type', 'publisher', 'citations', 'year', 'product', 'plan'] as const;
export type Paper = Record<typeof PAPER_KEYS[number], string>;
export type Patent = Record<typeof PATENT_KEYS[number], string>;

export const CONN_ROWS = [
  ['org', 'Name, Location'], ['type', 'Type of Industry (Product-based, service-based, Startup, etc)'], ['person', 'Name of the person you are connected with'],
  ['designation', 'Designation'], ['role', 'Role'], ['expertise', 'Expertise'], ['linkedin', 'LinkedIn Profile URL'],
  ['domain', 'Domain (Cyber Security / Data related / Compilers / Cloud / AI / Other Software)'], ['collaboration', 'What kind of collaboration(s) you have with this connection?'],
  ['outcomes', 'Any outcome(s) already achieved with this connection?'], ['w_mentees', 'How willing to help your mentees?'],
  ['w_teaching', 'How willing to help complementing your classroom teaching?'], ['w_internships', 'How willing to help your IV Year mentees for internships?'],
  ['w_visits', 'How willing to help arranging industry visits for your mentees (II, III, IV Year)?'],
] as const;
export type Connection = Record<typeof CONN_ROWS[number][0], string>;
export const CREATIVE_KEYS = ['m1', 'm2', 'm3', 'problem', 'idea', 'why'] as const;
export type Creative = Record<typeof CREATIVE_KEYS[number], string>;

export interface CompProfile {
  profile: Record<ProfileKey, string>;
  teaching: Semester[];
  fdp: Programme; training: Programme; workshops: Programme;
  mentees: Mentee[];
  top_mentees: TopMentee[];
  papers: Paper[]; patents: Patent[];
  alumni: Connection[]; industry: Connection[];
  creative: Creative[];
}

/** The past eight semesters, newest first: "AY 2026-27 I Semester", "AY 2025-26 II Semester", … */
export function semesterLabels(today = new Date()): { label: string; ay: string; sem: 'I' | 'II' }[] {
  const y = today.getFullYear(); const m = today.getMonth() + 1;
  let ayStart = m >= 6 ? y : y - 1; let sem: 'I' | 'II' = 'I';   // Jun–May academic year; the I semester is the latest one finished or under way
  const out: { label: string; ay: string; sem: 'I' | 'II' }[] = [];
  for (let i = 0; i < 8; i++) {
    const ay = `${ayStart}-${String((ayStart + 1) % 100).padStart(2, '0')}`;
    out.push({ label: `AY ${ay} ${sem} Semester`, ay, sem });
    if (sem === 'I') { sem = 'II'; ayStart -= 1; } else sem = 'I';
  }
  return out;
}
const emptyProgramme = (): Programme => ({ attended: Array.from({ length: 6 }, () => blank(ATT_KEYS)), organised: Array.from({ length: 6 }, () => blank(ORG_KEYS)) });
export const emptyConnection = (): Connection => blank(CONN_ROWS.map(r => r[0]));
export const emptyCreative = (): Creative => blank(CREATIVE_KEYS);
export function emptyProfile(): CompProfile {
  return {
    profile: blank(PROFILE_ROWS.map(r => r[0])),
    teaching: semesterLabels().map(s => ({ ...blank(TEACH_KEYS), label: s.label })),
    fdp: emptyProgramme(), training: emptyProgramme(), workshops: emptyProgramme(),
    mentees: [],
    top_mentees: Array.from({ length: 5 }, () => ({ year: '', student: '', ratings: RATINGS.map(() => '') })),
    papers: Array.from({ length: 5 }, () => blank(PAPER_KEYS)), patents: Array.from({ length: 5 }, () => blank(PATENT_KEYS)),
    alumni: Array.from({ length: 5 }, emptyConnection), industry: Array.from({ length: 5 }, emptyConnection),
    creative: Array.from({ length: 3 }, emptyCreative),
  };
}

// ── prefill from the portal ──
const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
const yearRoman = (y: any) => ROMAN[String(y || '').replace(/[^1-4]/g, '').slice(0, 1)] || '';
const dmyDash = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const dateRange = (a?: string, b?: string) => { const x = dmyDash(a); const y = dmyDash(b); return x && y && x !== y ? `${x} to ${y}` : x; };
const days = (a?: string, b?: string) => { if (!a) return ''; const d = b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : 1; return d > 0 ? String(d) : ''; };
const ayOfYear = (y: number) => (y ? `${y - 1}-${String(y % 100).padStart(2, '0')}` : '');
const semLabel = (ayStart: number, sem: 'I' | 'II') => `AY ${ayStart}-${String((ayStart + 1) % 100).padStart(2, '0')} ${sem} Semester`;
/** "2025–26", "2025-2026", "AY 2025-26" → 2025 */
const ayStartOf = (s: any) => { const m = /(20\d{2})\s*[-–/]\s*(\d{2,4})\b/.exec(String(s || '')); return m ? Number(m[1]) : 0; };
/** The latest I / II semester that had begun by this date (I runs Jul–Dec, II Jan–May) */
const ayStartAt = (iso: any, sem: 'I' | 'II') => {
  const d = new Date(iso || Date.now()); const y = d.getFullYear();
  return sem === 'II' ? y - 1 : d.getMonth() + 1 >= 7 ? y : y - 1;
};
const ROMAN_N: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
const num = (t: string) => (/^\d$/.test(t) ? Number(t) : ROMAN_N[t.toUpperCase()] || 0);
/** I or II semester of the year from free text: "II Sem.", "Sem-3", "5th Sem", "II-I", "Even" */
export function semFromText(text: any): 'I' | 'II' | '' {
  const t = String(text || '');
  const m = /\b([IVX]{1,4}|\d)(?:st|nd|rd|th)?\.?\s*sem/i.exec(t) || /\bsem(?:ester)?\.?\s*[-:]?\s*([IVX]{1,4}|\d)\b/i.exec(t)
    || /\b(?:[IVX]{1,3}|[1-4])\s*[-–/]\s*([IVX]{1,2}|[12])\b/i.exec(t);
  const n = m ? num(m[1]!) : 0;
  if (n) return n % 2 ? 'I' : 'II';
  return /\beven\b/i.test(t) ? 'II' : /\bodd\b/i.test(t) ? 'I' : '';
}
/** A subject allotment → which of the eight semesters it belongs to (odd semester_label "x-1" = I semester) */
const semOf = (a: any) => {
  const sem: 'I' | 'II' = /-1$/.test(String(a.semester_label || '')) ? 'I' : 'II';
  return semLabel(ayStartOf(a.academic_year) || ayStartAt(a.created_at, sem), sem);
};
/** A Subjects Handled record ("I B.Tech. II Sem. & 2025", "III-I 2024-25") → its semester, or '' when it can't be told */
export function semOfHandled(r: any): string {
  const t = String(r?.year_batch || '');
  const sem = semFromText(t);
  if (!sem) return '';
  const ay = ayStartOf(t);
  if (ay) return semLabel(ay, sem);
  const years = t.match(/\b20\d{2}\b/g);
  // a plain year is the calendar year the semester ran in: I semester Jul–Dec of it, II semester Jan–May of it
  if (years) { const y = Number(years[years.length - 1]); return semLabel(sem === 'I' ? y : y - 1, sem); }
  return semLabel(ayStartAt(r.created_at, sem), sem);
}
const programmeOf = (text: any, dept?: any) => {
  const t = `${text || ''}`;
  if (/\bM\.?\s*Tech/i.test(t)) return 'M.Tech.';
  if (/\bMCA\b/i.test(t) || /^MCA$/i.test(String(dept || '').trim())) return 'MCA';
  if (/\bMBA\b/i.test(t) || /^MBA$/i.test(String(dept || '').trim())) return 'MBA';
  return 'B.Tech.';
};
const handleUrl: Record<string, (h: string) => string> = {
  GitHub: h => `https://github.com/${h}`, LeetCode: h => `https://leetcode.com/u/${h}`, HackerRank: h => `https://www.hackerrank.com/profile/${h}`,
  CodeChef: h => `https://www.codechef.com/users/${h}`, Codeforces: h => `https://codeforces.com/profile/${h}`,
};
const url = (platform: string, h?: string) => (!h ? '' : /^https?:\/\//.test(h) ? h : handleUrl[platform]?.(h) || h);

export function menteesFrom(sources: any): Mentee[] {
  return (sources?.mentees || []).map((s: any) => {
    const h = s.handles || {};
    return { roll: s.roll_number || '', name: s.name || '', year: yearRoman(s.year), linkedin: s.linkedin_url || '', github: url('GitHub', h.GitHub),
      leetcode: url('LeetCode', h.LeetCode), hackerrank: url('HackerRank', h.HackerRank), codechef: url('CodeChef', h.CodeChef), codeforces: url('Codeforces', h.Codeforces), website: '' };
  });
}

/** A first draft from what the portal holds; anything the faculty member already saved wins */
export function prefill(sources: any): CompProfile {
  const p = emptyProfile();
  const per = sources?.profile?.personal || {}; const edu = sources?.profile?.education || {}; const fac = sources?.faculty || {};
  const metrics = per.research_metrics || {};
  const domains: string[] = Array.isArray(sources?.profile?.domains) ? sources.profile.domains : [];
  Object.assign(p.profile, {
    full_name: per.name || fac.name || '', designation: per.designation || '', date_joined: dmyDash(per.joining_date),
    highest_qualification: edu.highest_qualification || per.highest_qualification || '', specialization: edu.specialization || per.specialization || '',
    email: fac.email || per.email || '', linkedin: per.linkedin_url || '', orcid: per.orcid_id || '', scopus: per.scopus_id || '',
    h_index: metrics.h_index != null ? String(metrics.h_index) : '', i10_index: metrics.i10_index != null ? String(metrics.i10_index) : '',
    area1: domains[0] || '', area2: domains[1] || '', area3: domains[2] || '',
  });
  // teaching: subject allotments (this and recent semesters) and the Subjects Handled records faculty entered for past ones
  const bySem = new Map<string, { courses: string[]; regs: string[]; progs: string[] }>();
  const add = (label: string, course: any, reg: any, prog: string) => {
    const c = String(course || '').trim(); if (!label || !c) return;
    const e = bySem.get(label) || { courses: [], regs: [], progs: [] };
    if (!e.courses.some(x => x.toLowerCase() === c.toLowerCase())) e.courses.push(c);
    const r = String(reg || '').trim(); if (r && !e.regs.includes(r)) e.regs.push(r);
    if (!e.progs.includes(prog)) e.progs.push(prog);
    bySem.set(label, e);
  };
  for (const a of sources?.teaching || []) add(semOf(a), a.subject_name, a.regulation, programmeOf('', a.department));
  for (const h of sources?.handled || []) add(semOfHandled(h), h.subject, '', programmeOf(h.year_batch, h.branch));
  p.teaching = p.teaching.map(t => {
    const e = bySem.get(t.label);
    return e ? { ...t, course: e.courses.join('; '), regulation: e.regs.join(', '), programme: e.progs.join(', ') } : t;
  });
  // FDPs / trainings / workshops from event reports and the profile's activities
  const put = (prog: Programme, attended: boolean, row: Partial<Attended & Organised>) => {
    const list: any[] = attended ? prog.attended : prog.organised;
    const i = list.findIndex(x => !x.title);
    if (i >= 0 && !list.some(x => x.title.toLowerCase() === String(row.title || '').toLowerCase())) list[i] = { ...list[i], ...row };
  };
  const bucket = (t: string): Programme | null => (/fdp|faculty development/i.test(t) ? p.fdp : /training/i.test(t) ? p.training : /workshop/i.test(t) ? p.workshops : null);
  for (const e of sources?.events || []) {
    const prog = bucket(e.event_type || ''); if (!prog || !e.title) continue;
    const att = e.participation === 'attended';
    put(prog, att, att
      ? { title: e.title, organiser: e.organized_by || '', objectives: e.objectives || '', days: days(e.start_date, e.end_date), dates: dateRange(e.start_date, e.end_date) }
      : { title: e.title, objectives: e.objectives || '', days: days(e.start_date, e.end_date), dates: dateRange(e.start_date, e.end_date) });
  }
  for (const a of sources?.profile?.activities || []) {
    const prog = bucket(a.type || ''); if (!prog || !a.title) continue;
    put(prog, a.role_type !== 'Organized', { title: a.title, organiser: a.organizer || '', days: a.no_of_days ? String(a.no_of_days) : days(a.from_date || a.date, a.to_date),
      dates: dateRange(a.from_date || a.date, a.to_date) });
  }
  p.mentees = menteesFrom(sources);
  // papers & patents: the most cited first
  const pubs: any[] = Array.isArray(sources?.profile?.publications) ? sources.profile.publications : [];
  const byCites = (a: any, b: any) => (Number(b.citations) || 0) - (Number(a.citations) || 0) || (Number(b.year) || 0) - (Number(a.year) || 0);
  pubs.filter(x => x.category !== 'Patent').sort(byCites).slice(0, 5).forEach((x, i) => {
    p.papers[i] = { ay: ayOfYear(Number(x.year)), title: x.title || '', indexing: x.category && x.category !== 'Unclassified' ? x.category : '', publisher: x.journal_name || '',
      citations: x.citations != null ? String(x.citations) : '', quartile: '', product: '', plan: '' };
  });
  pubs.filter(x => x.category === 'Patent').sort(byCites).slice(0, 5).forEach((x, i) => {
    p.patents[i] = { ay: ayOfYear(Number(String(x.patent_date || x.year || '').slice(0, 4))), title: x.title || '', type: x.patent_status || '', publisher: x.journal_name || '',
      citations: x.citations != null ? String(x.citations) : '', year: String(x.patent_date || x.year || '').slice(0, 4), product: '', plan: '' };
  });
  return p;
}

/** Saved data over a fresh draft — older saves and missing pieces fill in */
export function merge(saved: any, base: CompProfile): CompProfile {
  if (!saved || typeof saved !== 'object') return base;
  const arr = <T,>(x: any, fallback: T[], fill: () => T): T[] => {
    const list = Array.isArray(x) && x.length ? x : fallback;
    return list.map((v: any, i: number) => ({ ...(fallback[i] || fill()), ...v }));
  };
  const prog = (x: any, b: Programme): Programme => ({ attended: arr(x?.attended, b.attended, () => blank(ATT_KEYS)), organised: arr(x?.organised, b.organised, () => blank(ORG_KEYS)) });
  const labels = semesterLabels().map(s => s.label);
  const teachSaved: any[] = Array.isArray(saved.teaching) ? saved.teaching : [];
  return {
    profile: { ...base.profile, ...(saved.profile || {}) },
    // the semester columns always follow today's date; saved entries move with their label
    // what the faculty member typed wins; a column they left empty still picks up what the portal now knows
    teaching: labels.map((l, i) => {
      const b = base.teaching[i]!; const sv = teachSaved.find(t => t?.label === l) || {};
      const out: Semester = { ...b, ...sv, label: l };
      for (const k of ['course', 'regulation', 'programme'] as const) if (!String(sv[k] ?? '').trim()) out[k] = b[k];
      return out;
    }),
    fdp: prog(saved.fdp, base.fdp), training: prog(saved.training, base.training), workshops: prog(saved.workshops, base.workshops),
    mentees: Array.isArray(saved.mentees) && saved.mentees.length ? saved.mentees.map((m: any) => ({ ...blank(MENTEE_KEYS), ...m })) : base.mentees,
    top_mentees: Array.from({ length: 5 }, (_, i) => ({ ...base.top_mentees[i]!, ...(saved.top_mentees?.[i] || {}),
      ratings: RATINGS.map((_, j) => String(saved.top_mentees?.[i]?.ratings?.[j] ?? '')) })),
    papers: arr(saved.papers, base.papers, () => blank(PAPER_KEYS)), patents: arr(saved.patents, base.patents, () => blank(PATENT_KEYS)),
    alumni: arr(saved.alumni, base.alumni, emptyConnection), industry: arr(saved.industry, base.industry, emptyConnection),
    creative: arr(saved.creative, base.creative, emptyCreative),
  };
}

export function progressOf(p: CompProfile): number {
  const has = (x: any): boolean => (Array.isArray(x) ? x.some(has) : x && typeof x === 'object' ? Object.values(x).some(has) : !!String(x ?? '').trim());
  const keys = ['full_name', 'designation', 'date_joined', 'highest_qualification', 'basic_degree', 'specialization', 'email', 'linkedin', 'orcid', 'area1'] as const;
  const r = [
    keys.filter(k => p.profile[k].trim()).length / keys.length,
    Math.min(1, p.teaching.filter(t => t.course.trim()).length / 8),
    ...([p.fdp, p.training, p.workshops, p.mentees, p.top_mentees.map(t => t.student), p.papers, p.patents, p.alumni, p.industry, p.creative] as any[]).map(x => (has(x) ? 1 : 0)),
  ];
  return Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100);
}

// ───────────────────────── Excel: fills the department template ─────────────────────────

const NO_WRAP: Record<string, string> = {};   // the template's answer cells already wrap
const n = (v: string) => (/^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : v);
const COLS6 = ['B', 'C', 'D', 'E', 'F', 'G'];

/** Make sure rows up to `last` exist, copying the last existing row's cells and style */
function ensureRows(sheet: string, last: number): string {
  const rows = rowsOf(sheet);
  const max = Math.max(...rows.map(r => r.num));
  if (last <= max) return sheet;
  const proto = rows.find(r => r.num === max)!;
  let add = '';
  for (let r = max + 1; r <= last; r++) {
    add += proto.xml.replace(new RegExp(`<row r="${max}"`), `<row r="${r}"`).replace(new RegExp(`(<c r="[A-Z]+)${max}"`, 'g'), `$1${r}"`)
      .replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, '<c r="$1"$2/>').replace(/\st="[a-z]+"(?=[^>]*\/>)/g, '');
  }
  return sheet.replace('</sheetData>', `${add}</sheetData>`).replace(/<dimension ref="A1:([A-Z]+)\d+"\/>/, `<dimension ref="A1:$1${last}"/>`);
}

export async function buildCompProfileXlsx(p: CompProfile, opts: { author?: string; hideRatings?: boolean } = {}): Promise<Blob> {
  const res = await fetch('/templates/faculty-comprehensive-profile.xlsx');
  if (!res.ok) throw new Error('Could not load the Excel template');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sheet = async (i: number, fn: (x: string) => string) => {
    const path = `xl/worksheets/sheet${i}.xml`;
    zip.file(path, fn(await zip.file(path)!.async('string')));
  };
  const fill = (cells: Record<number, Record<string, Val>>) => (x: string) => fillInPlace(x, cells, {}, NO_WRAP);

  // 2 · Faculty Profile
  const prof: Record<number, Record<string, Val>> = {};
  PROFILE_ROWS.forEach(([k], i) => { prof[i + 2] = { B: n(p.profile[k]) }; });
  await sheet(2, fill(prof));
  // 3 · Teaching History — B..I are the eight semesters
  const T = 'BCDEFGHI'.split('');
  const teach: Record<number, Record<string, Val>> = { 2: {} };
  for (let r = 3; r <= 16; r++) teach[r] = {};
  p.teaching.slice(0, 8).forEach((t, i) => {
    const c = T[i]!;
    teach[2]![c] = t.label.replace(/ (I{1,2}) Semester$/, '\n$1 Semester');
    teach[3]![c] = t.regulation;
    teach[4]![c] = t.programme === 'B.Tech.' ? '✓' : ''; teach[5]![c] = t.programme === 'M.Tech.' ? '✓' : ''; teach[6]![c] = t.programme === 'MCA' ? '✓' : '';
    teach[7]![c] = t.course; teach[8]![c] = t.tool; teach[9]![c] = t.expert_used; teach[10]![c] = t.expert_mode; teach[11]![c] = t.expert_name;
    teach[12]![c] = t.expert_designation; teach[13]![c] = t.expert_company; teach[14]![c] = t.econtent; teach[15]![c] = t.econtent_kind; teach[16]![c] = t.econtent_url;
  });
  await sheet(3, fill(teach));
  // 4–6 · FDPs, Training Programs, Workshops (columns B..G = 1..6)
  const programme = (prog: Programme, attRows: Record<string, number>, orgRows: Record<string, number>) => {
    const cells: Record<number, Record<string, Val>> = {};
    const put = (row: number, col: string, v: string) => { (cells[row] ||= {})[col] = n(v); };
    prog.attended.slice(0, 6).forEach((a, i) => { for (const [k, row] of Object.entries(attRows)) put(row, COLS6[i]!, (a as any)[k] || ''); });
    prog.organised.slice(0, 6).forEach((o, i) => { for (const [k, row] of Object.entries(orgRows)) put(row, COLS6[i]!, (o as any)[k] || ''); });
    return fill(cells);
  };
  const ATT = { title: 2, organiser: 3, objectives: 4, days: 5, dates: 6, govt: 7, industry: 8, college: 9, college_ways: 10 };
  // row 11 is a spacer; the "Organised" header is row 12
  const ORG = { title: 13, collaboration: 14, objectives: 15, days: 16, dates: 17, sponsor_type: 18, agency: 19, sponsorship_kind: 20 };
  await sheet(4, programme(p.fdp, ATT, ORG));
  await sheet(5, programme(p.training, ATT, ORG));
  await sheet(6, programme(p.workshops,
    { title: 2, organiser: 3, objectives: 4, tech: 5, days: 6, dates: 7, govt: 8, industry: 9, college: 10, college_ways: 11 },
    { title: 14, collaboration: 15, objectives: 16, tech: 17, days: 18, dates: 19, sponsor_type: 20, agency: 21, sponsorship_kind: 22 }));
  // 7 · Mentee Details — counts on row 2; the table header is row 4, mentees from row 5
  const count = (y: string) => p.mentees.filter(m => m.year === y).length;
  const mentee: Record<number, Record<string, Val>> = { 2: { B: count('II'), C: count('III'), D: count('IV'), E: p.mentees.length } };
  p.mentees.forEach((m, i) => { mentee[i + 5] = { A: `Mentee ${i + 1}`, B: m.roll, C: m.name, D: m.linkedin, E: m.github, F: m.leetcode, G: m.hackerrank, H: m.codechef, I: m.codeforces, J: m.website }; });
  await sheet(7, x => fillInPlace(ensureRows(x, p.mentees.length + 4), mentee, {}, NO_WRAP));
  // 8 · Top 5 Mentees (left blank when the viewer may not see ratings of named students)
  if (!opts.hideRatings) {
    const top: Record<number, Record<string, Val>> = {};
    p.top_mentees.slice(0, 5).forEach((t, i) => {
      const row: Record<string, Val> = { B: '', C: '', D: '' };
      if (t.student) row[t.year === 'III' ? 'C' : t.year === 'IV' ? 'D' : 'B'] = t.student;
      'EFGHIJKLM'.split('').forEach((c, j) => { row[c] = n(t.ratings[j] || ''); });
      top[i + 2] = row;
    });
    await sheet(8, fill(top));
  }
  // 9 · Publications and IP
  const pub: Record<number, Record<string, Val>> = {};
  p.papers.slice(0, 5).forEach((x, i) => { pub[i + 2] = { A: x.ay ? `AY ${x.ay}` : '', B: x.title, C: x.indexing, D: x.publisher, E: n(x.citations), F: x.quartile, G: x.product, H: x.plan }; });
  // row 7 is a spacer, the patents header is row 8
  p.patents.slice(0, 5).forEach((x, i) => { pub[i + 9] = { A: x.ay ? `AY ${x.ay}` : '', B: x.title, C: x.type, D: x.publisher, E: n(x.citations), F: n(x.year), G: x.product, H: x.plan }; });
  // keep the template's AY labels where a row is empty
  for (const r of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13]) if (pub[r] && !pub[r]!.B) delete pub[r]!.A;
  await sheet(9, fill(pub));
  // 10–11 · Alumni / Industry connections (columns B..F = 1..5)
  const conns = (list: Connection[]) => {
    const cells: Record<number, Record<string, Val>> = {};
    list.slice(0, 5).forEach((c, i) => CONN_ROWS.forEach(([k], j) => { (cells[j + 2] ||= {})['BCDEF'[i]!] = c[k]; }));
    return fill(cells);
  };
  await sheet(10, conns(p.alumni));
  await sheet(11, conns(p.industry));
  // 12 · Creative Assignments
  const cr: Record<number, Record<string, Val>> = {};
  p.creative.forEach((c, i) => { cr[i + 2] = { A: `Batch ${i + 1}`, B: c.m1, C: c.m2, D: c.m3, E: c.problem, F: c.idea, G: c.why }; });
  await sheet(12, x => fillInPlace(ensureRows(x, p.creative.length + 1), cr, {}, NO_WRAP));

  zip.file('xl/workbook.xml', (await zip.file('xl/workbook.xml')!.async('string')).replace(/<calcPr ([^/]*)\/>/, '<calcPr $1 fullCalcOnLoad="1"/>'));
  const core = zip.file('docProps/core.xml');
  if (core && opts.author) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    zip.file('docProps/core.xml', (await core.async('string'))
      .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, `<dc:creator>${esc(opts.author)}</dc:creator>`)
      .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${esc(opts.author)}</cp:lastModifiedBy>`));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
export const profileFileName = (p: CompProfile, fallback = 'Faculty') =>
  `Faculty Comprehensive Profile - ${p.profile.full_name || fallback}.xlsx`.replace(/[^A-Za-z0-9._ ()&-]+/g, '_');

/** One row per faculty member + all connections + the most promising papers — for department leadership */
export async function consolidatedXlsx(rows: { name: string; email: string; department: string; progress: number | null; updated_at: string | null; data: CompProfile | null }[], department: string) {
  const XLSX = await import('xlsx');
  const filled = (list: any[], key: string) => list.filter(x => String(x?.[key] || '').trim()).length;
  const summary = rows.map(r => {
    const p = r.data;
    return {
      Faculty: r.name, Email: r.email, Department: r.department, 'Filled %': r.progress ?? 0,
      Designation: p?.profile.designation || '', 'Date joined': p?.profile.date_joined || '', 'Highest qualification': p?.profile.highest_qualification || '',
      Specialization: p?.profile.specialization || '', 'h-index': p?.profile.h_index || '', 'i10-index': p?.profile.i10_index || '',
      'Research areas': p ? [p.profile.area1, p.profile.area2, p.profile.area3].filter(Boolean).join('; ') : '',
      'Semesters with courses': p ? p.teaching.filter(t => t.course).length : 0,
      'Semesters with industry tools': p ? p.teaching.filter(t => t.tool).length : 0,
      'Semesters with industry experts': p ? p.teaching.filter(t => /^y/i.test(t.expert_used)).length : 0,
      'FDPs attended': p ? filled(p.fdp.attended, 'title') : 0, 'FDPs organised': p ? filled(p.fdp.organised, 'title') : 0,
      'Trainings attended': p ? filled(p.training.attended, 'title') : 0, 'Trainings organised': p ? filled(p.training.organised, 'title') : 0,
      'Workshops attended': p ? filled(p.workshops.attended, 'title') : 0, 'Workshops organised': p ? filled(p.workshops.organised, 'title') : 0,
      Mentees: p?.mentees.length || 0, 'Top papers': p ? filled(p.papers, 'title') : 0, Patents: p ? filled(p.patents, 'title') : 0,
      'Alumni connections': p ? filled(p.alumni, 'person') : 0, 'Industry connections': p ? filled(p.industry, 'person') : 0,
      'Creative solutions': p ? filled(p.creative, 'problem') : 0, 'Last saved': r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-IN') : '',
    };
  });
  const connections = rows.flatMap(r => !r.data ? [] : [...r.data.alumni.map(c => ({ c, kind: 'Alumni' })), ...r.data.industry.map(c => ({ c, kind: 'Industry' }))]
    .filter(({ c }) => c.person || c.org).map(({ c, kind }) => ({
      Faculty: r.name, Type: kind, 'Company, location': c.org, 'Industry type': c.type, Person: c.person, Designation: c.designation, Role: c.role, Expertise: c.expertise,
      Domain: c.domain, LinkedIn: c.linkedin, Collaboration: c.collaboration, Outcomes: c.outcomes,
      'Help mentees (1-5)': c.w_mentees, 'Help teaching (1-5)': c.w_teaching, 'Internships (1-5)': c.w_internships, 'Industry visits (1-5)': c.w_visits,
    })));
  const papers = rows.flatMap(r => !r.data ? [] : [
    ...r.data.papers.filter(x => x.title).map(x => ({ Faculty: r.name, Kind: 'Paper', AY: x.ay, Title: x.title, 'Indexing / type': x.indexing, Publisher: x.publisher, Citations: x.citations, 'Quartile / year': x.quartile, 'Product potential': x.product, Plan: x.plan })),
    ...r.data.patents.filter(x => x.title).map(x => ({ Faculty: r.name, Kind: 'Patent', AY: x.ay, Title: x.title, 'Indexing / type': x.type, Publisher: x.publisher, Citations: x.citations, 'Quartile / year': x.year, 'Product potential': x.product, Plan: x.plan })),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Faculty summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(connections.length ? connections : [{ Faculty: 'No connections entered yet' }]), 'Alumni & industry');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(papers.length ? papers : [{ Faculty: 'No papers or patents entered yet' }]), 'Papers & patents');
  XLSX.writeFile(wb, `Faculty Profiles - ${department} - consolidated.xlsx`);
}
