/**
 * Course Execution Plan — the department's 6-sheet planning workbook.
 * The data model, the prefill from what the portal already knows (allotment, timetable, academic calendar,
 * syllabus, lesson plan, roster), the checks, and the Excel export, which fills the department's own
 * template file (public/templates/course-execution-plan.xlsx) so the download keeps its exact layout.
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { branchShort } from './collegeFormat';
import { Topic } from './lessonPlanShared';

export type Initial = Record<InitialKey, string>;
export type InitialKey = 'faculty_name' | 'short_code' | 'subject_title' | 'class_section' | 'strength' | 'sem_start' | 'sem_end' | 'teaching_weeks'
  | 'hours_per_week' | 'classroom_hours' | 'online_hours' | 'vision' | 'competencies' | 'industry_problem' | 'faculty_tool' | 'tool_a' | 'tool_b'
  | 'tool_c' | 'assessment' | 'support' | 'submission_date';
export type BriefRow = { unit: string; heading: string; topics: string; cos: string; hours: string; classroom: string; online: string; tool: string; evidence: string };
export type WeeklyRow = { week: string; topic: string; co: string; method: string; classroom: string; online: string; activity: string; tool: string; group_a: string; group_b: string; deliverable: string };
export type ExpertRow = { name: string; alumni: string; company: string; role: string; specialization: string; linkedin: string; email: string; date: string; topic: string; mode: string; outcomes: string };
export type TeamRow = { week: string; date: string; duration: string; tool: string; s1: string; s2: string; s3: string; feature: string; objective: string; evidence: string; feedback: string };
export type CatalogRow = { semester: string; short_code: string; subject: string; syllabus_code: string; key_topics: string; tools: string };
export interface ExecPlan { initial: Initial; brief: BriefRow[]; weekly: WeeklyRow[]; experts: ExpertRow[]; teams: TeamRow[] }

/** Initial Plan rows — label and hint text exactly as in the template (row = Excel row) */
export const INITIAL_ROWS: { key: InitialKey | 'total' | 'expert1' | 'session1' | 'expert2' | 'session2'; row: number; label: string; hint?: string; long?: boolean; type?: 'date' | 'number' }[] = [
  { key: 'faculty_name', row: 2, label: 'Faculty name' },
  { key: 'short_code', row: 3, label: 'Subject short code' },
  { key: 'subject_title', row: 4, label: 'Subject title' },
  { key: 'class_section', row: 5, label: 'Class / Section' },
  { key: 'strength', row: 6, label: 'Student strength', type: 'number' },
  { key: 'sem_start', row: 7, label: 'Semester start date', type: 'date' },
  { key: 'sem_end', row: 8, label: 'Semester end date', type: 'date' },
  { key: 'teaching_weeks', row: 9, label: 'No. of Teaching weeks', type: 'number', hint: "Practically consider not more than 70% of the no. of weeks proposed by Academic Section\n(Keeping in mind of Placement-based training, students' non-response during major festivals, Unit exams, etc)" },
  { key: 'hours_per_week', row: 10, label: 'No. of Instructional hours / week', type: 'number' },
  { key: 'total', row: 11, label: 'Total planned No. of instructional hours', hint: 'Do not fill this (It calculates from B13, B14)' },
  { key: 'classroom_hours', row: 12, label: 'Classroom target (70%)', type: 'number' },
  { key: 'online_hours', row: 13, label: 'Online / Student-collaboration target (30%)', type: 'number' },
  { key: 'vision', row: 14, label: 'Brief subject vision', hint: 'Consolidation of Course Outcomes', long: true },
  { key: 'competencies', row: 15, label: 'Top 3 student competencies\n(Expected)', long: true, hint: 'Example (considering OS subject):\n1. Analyze CPU scheduling and memory management mechanisms,\n2. Solve process synchronization and deadlock problems,\n3. Apply OS concepts using Linux tools.' },
  { key: 'industry_problem', row: 16, label: 'Industry problem(s) / application(s) planned to discuss', long: true, hint: 'Example (considering OS subject):\nOptimizing CPU resource utilization in cloud servers by analyzing process scheduling, resource contention, and system performance using industry-standard operating system monitoring tools.' },
  { key: 'faculty_tool', row: 17, label: 'Proposed faculty-led tool', long: true, hint: 'htop (Linux) – Real-time process monitoring, CPU utilization analysis, process priority management, and resource contention investigation.' },
  { key: 'tool_a', row: 18, label: 'Tool for group A', hint: 'htop – Interactive CPU and process monitoring' },
  { key: 'tool_b', row: 19, label: 'Tool for group B', hint: 'top – CPU load and process resource analysis' },
  { key: 'tool_c', row: 20, label: 'Tool for group C', hint: 'pidstat – Per-process CPU and context-switching analysis' },
  { key: 'expert1', row: 21, label: 'Industry expert 1', hint: 'Name, Designation, Company Name, Expertise' },
  { key: 'session1', row: 22, label: 'Industry session 1 - Expert 1', hint: 'Date, Topic, Expected Outcome' },
  { key: 'expert2', row: 23, label: 'Industry expert 2', hint: 'Name, Designation, Company Name, Expertise' },
  { key: 'session2', row: 24, label: 'Industry session 2 - Expert 2', hint: 'Date, Topic, Expected Outcome' },
  { key: 'assessment', row: 25, label: 'Learning evidence / assessment', long: true, hint: 'Remember to record the online class, Copy the URL and paste at the appropriate placeholder' },
  { key: 'support', row: 26, label: 'Faculty support requested', long: true, hint: "You are encouraged / free to take any other faculty member's support (In the department or from other relevant department)" },
  { key: 'submission_date', row: 27, label: 'Submission date', type: 'date' },
];

export const EXPERT_FIELDS: { key: keyof ExpertRow; label: string; long?: boolean; type?: 'date' }[] = [
  { key: 'name', label: 'Industry Expert Name' }, { key: 'alumni', label: 'Alumni / Non-Alumni' }, { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' }, { key: 'specialization', label: 'Specialization' }, { key: 'linkedin', label: 'LinkedIn Profile Link' },
  { key: 'email', label: 'Email ID' }, { key: 'date', label: 'Approxiate Date', type: 'date' }, { key: 'topic', label: 'Topic & syllabus linkage', long: true },
  { key: 'mode', label: 'Online / In-campus' }, { key: 'outcomes', label: 'Expected Outcome(s)', long: true },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const n = (v: any) => { const x = Number(String(v ?? '').trim()); return Number.isFinite(x) ? x : 0; };
const blank = <T extends Record<string, string>>(keys: (keyof T)[]): T => Object.fromEntries(keys.map(k => [k, ''])) as T;
export const emptyWeek = (w: number): WeeklyRow => ({ ...blank<WeeklyRow>(['topic', 'co', 'method', 'classroom', 'online', 'activity', 'tool', 'group_a', 'group_b', 'deliverable']), week: String(w) });
export const emptyTeam = (w: number): TeamRow => ({ ...blank<TeamRow>(['date', 'duration', 'tool', 's1', 's2', 's3', 'feature', 'objective', 'evidence', 'feedback']), week: String(w) });
export const emptyExpert = (): ExpertRow => blank<ExpertRow>(['name', 'alumni', 'company', 'role', 'specialization', 'linkedin', 'email', 'date', 'topic', 'mode', 'outcomes']);
export const emptyBrief = (u: number): BriefRow => ({ ...blank<BriefRow>(['heading', 'topics', 'cos', 'hours', 'classroom', 'online', 'tool', 'evidence']), unit: `Unit ${u}` });

/** "2-2" → "II-II", the catalog's semester format */
export const semRoman = (sem: string) => { const [y, s] = String(sem || '').split('-').map(Number); return y && s ? `${ROMAN[y - 1]}-${ROMAN[s - 1]}` : sem; };
const initials = (name: string) => String(name || '').split(/[^A-Za-z]+/).filter(w => w && !/^(and|of|the|to|for|in|&)$/i.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 6);
export const catalogFor = (catalog: CatalogRow[], allot: any): CatalogRow | null => {
  const name = String(allot?.subject_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return catalog.find(c => String(c.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '') === name) || null;
};
const weeksBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000;
  return d > 0 ? Math.ceil((d + 1) / 7) : 0;
};
export const calendarWeeks = (p: ExecPlan) => weeksBetween(p.initial.sem_start, p.initial.sem_end);
export const totalHours = (p: ExecPlan) => n(p.initial.classroom_hours) + n(p.initial.online_hours);
const split = (h: number) => { const c = Math.round(h * 0.7); return { classroom: h ? String(c) : '', online: h ? String(h - c) : '' }; };
/** Share `total` across rows in proportion to `weights`, as whole numbers that add up exactly to `total` */
const apportion = (weights: number[], total: number) => {
  const ws = weights.map(w => (w > 0 ? w : 1));
  const sum = ws.reduce((s, w) => s + w, 0);
  let cum = 0; let prev = 0;
  return ws.map(w => { cum += w; const now = Math.round((cum / sum) * total); const v = now - prev; prev = now; return v; });
};
/** Classroom / online per row so the columns add up to 70% / 30% of the whole, not just of each row */
const split7030Rows = (hours: number[]) => {
  let cum = 0; let prevC = 0;
  return hours.map(h => { cum += h; const c = Math.round(cum * 0.7); const v = c - prevC; prevC = c; return h ? { classroom: String(v), online: String(h - v) } : { classroom: '', online: '' }; });
};

export interface PrefillContext {
  allot: any; lessonPlan: any | null; classDays: { day_of_week: string; periods: number }[]; semester: { start_date: string; end_date: string } | null;
  syllabus: any | null; strength: number; catalog: CatalogRow[]; due_date: string | null;
}

/** A first draft from everything the portal already has; faculty edit from here. */
export function prefillExecPlan(c: PrefillContext): ExecPlan {
  const a = c.allot; const cat = catalogFor(c.catalog, a);
  const hpw = c.classDays.reduce((s, d) => s + (Number(d.periods) || 0), 0);
  const calWeeks = weeksBetween(c.semester?.start_date, c.semester?.end_date);
  const weeks = calWeeks ? Math.max(1, Math.floor(calWeeks * 0.7)) : 0;
  const total = weeks * hpw;
  const outcomes: { code: string; text: string }[] = (c.syllabus?.outcomes?.length ? c.syllabus.outcomes : c.lessonPlan?.outcomes || []).filter((o: any) => o?.text);
  const vision = outcomes.length
    ? `By the end of the course, students will be able to ${outcomes.map(o => o.text.replace(/^(students will be able to|able to)\s*/i, '').replace(/[.\s]+$/, '')).map(t => t.charAt(0).toLowerCase() + t.slice(1)).join('; ')}.`
    : '';
  const initial: Initial = {
    faculty_name: a.faculty_name + (a.co_faculty_name ? ` & ${a.co_faculty_name}` : ''),
    short_code: cat?.short_code || initials(a.subject_name),
    subject_title: a.subject_name || '',
    class_section: `${semRoman(a.semester_label)} ${branchShort(a.department)} - Section ${a.section || '—'}`,
    strength: c.strength ? String(c.strength) : '',
    sem_start: c.semester?.start_date || '', sem_end: c.semester?.end_date || '',
    teaching_weeks: weeks ? String(weeks) : '', hours_per_week: hpw ? String(hpw) : '',
    classroom_hours: split(total).classroom, online_hours: split(total).online,
    vision, competencies: '', industry_problem: '', faculty_tool: '', tool_a: '', tool_b: '', tool_c: '',
    assessment: '', support: '', submission_date: c.due_date || '',
  };

  // Units: from the syllabus, else from the lesson plan's topics
  const topics: Topic[] = (c.lessonPlan?.topics || []).filter((t: Topic) => t.topic);
  const units: { title: string; topics: string[]; hours: number; cos: string[] }[] = c.syllabus?.units?.length
    ? c.syllabus.units.map((u: any, i: number) => ({
      title: u.title || '', topics: u.topics || [],
      hours: Number(u.hours) || topics.filter(t => t.unit === i + 1).reduce((s, t) => s + (t.periods || 1), 0),
      cos: [...new Set(topics.filter(t => t.unit === i + 1 && t.co).map(t => String(t.co)))],
    }))
    : [...new Set(topics.map(t => t.unit))].sort((x, y) => x - y).map(u => {
      const ts = topics.filter(t => t.unit === u);
      return { title: ts.find(t => t.unit_title)?.unit_title || '', topics: ts.map(t => t.topic), hours: ts.reduce((s, t) => s + (t.periods || 1), 0), cos: [...new Set(ts.filter(t => t.co).map(t => String(t.co)))] };
    });
  // Unit hours: the syllabus hours, scaled to the planned total so the Brief Plan adds up
  const unitHours = total && units.length ? apportion(units.map(u => u.hours || 1), total) : units.map(u => u.hours);
  const unitSplit = split7030Rows(unitHours);
  const brief: BriefRow[] = (units.length ? units : [1, 2, 3, 4, 5].map(() => null)).map((u, i) => u ? {
    unit: `Unit ${i + 1}`, heading: u.title, topics: u.topics.join(', '), cos: u.cos.join(' / '),
    hours: unitHours[i] ? String(unitHours[i]) : '', ...unitSplit[i], tool: '', evidence: '',
  } : emptyBrief(i + 1));

  return { initial, brief, weekly: spreadWeeks(units, weeks || 12, hpw), experts: [emptyExpert(), emptyExpert()], teams: Array.from({ length: weeks || 12 }, (_, i) => emptyTeam(i + 1)) };
}

/** Spread the units' topics evenly across the teaching weeks (by hours), unit by unit. */
export function spreadWeeks(units: { title: string; topics: string[]; hours: number; cos: string[] }[], weeks: number, hpw: number): WeeklyRow[] {
  const rows = Array.from({ length: Math.max(1, weeks) }, (_, i) => emptyWeek(i + 1));
  const items: { unit: number; topic: string; hours: number; cos: string[] }[] = [];
  units.forEach((u, i) => {
    const list = u.topics.length ? u.topics : [u.title].filter(Boolean);
    const each = list.length ? (u.hours || list.length) / list.length : 0;
    list.forEach(t => items.push({ unit: i + 1, topic: t, hours: each || 1, cos: u.cos }));
  });
  if (items.length) {
    const perWeek = items.reduce((s, x) => s + x.hours, 0) / rows.length;
    let acc = 0;
    const buckets: typeof items[] = rows.map(() => []);
    for (const it of items) { buckets[Math.min(rows.length - 1, Math.floor((acc + 1e-6) / perWeek))].push(it); acc += it.hours; }
    buckets.forEach((b, i) => {
      if (!b.length) return;
      const byUnit = [...new Set(b.map(x => x.unit))].map(u => `Unit ${u}: ${b.filter(x => x.unit === u).map(x => x.topic).join(', ')}`);
      rows[i].topic = byUnit.join('\n');
      rows[i].co = [...new Set(b.flatMap(x => x.cos))].join(' / ');
    });
  }
  if (hpw) split7030Rows(rows.map(() => hpw)).forEach((s, i) => { rows[i].classroom = s.classroom; rows[i].online = s.online; });
  return rows;
}

/** Fill in whatever is missing from a saved plan (older saves, new rows) */
export function normalizePlan(raw: any, fallback: ExecPlan): ExecPlan {
  if (!raw || typeof raw !== 'object' || !raw.initial) return fallback;
  return {
    initial: { ...fallback.initial, ...Object.fromEntries(Object.entries(raw.initial).map(([k, v]) => [k, String(v ?? '')])) } as Initial,
    brief: Array.isArray(raw.brief) && raw.brief.length ? raw.brief.map((r: any, i: number) => ({ ...emptyBrief(i + 1), ...r })) : fallback.brief,
    weekly: Array.isArray(raw.weekly) && raw.weekly.length ? raw.weekly.map((r: any, i: number) => ({ ...emptyWeek(i + 1), ...r })) : fallback.weekly,
    experts: [0, 1].map(i => ({ ...emptyExpert(), ...(raw.experts?.[i] || {}) })),
    teams: Array.isArray(raw.teams) && raw.teams.length ? raw.teams.map((r: any, i: number) => ({ ...emptyTeam(i + 1), ...r })) : fallback.teams,
  };
}

/** Warnings shown above the form — the template's own rules */
export function planChecks(p: ExecPlan): string[] {
  const out: string[] = [];
  const total = totalHours(p);
  const cal = calendarWeeks(p);
  const tw = n(p.initial.teaching_weeks);
  if (cal && tw > Math.floor(cal * 0.7)) out.push(`Teaching weeks (${tw}) is more than 70% of the ${cal} calendar weeks (${Math.floor(cal * 0.7)}).`);
  if (total) {
    const pct = Math.round((n(p.initial.classroom_hours) / total) * 100);
    if (pct < 65 || pct > 75) out.push(`Classroom is ${pct}% of the planned hours; the target is 70% classroom, 30% online / collaboration.`);
    const brief = p.brief.reduce((s, r) => s + n(r.hours), 0);
    if (brief && brief !== total) out.push(`Brief Plan units add up to ${brief} hours, but the total planned is ${total}.`);
    const weekly = p.weekly.reduce((s, r) => s + n(r.classroom) + n(r.online), 0);
    if (weekly && weekly !== total) out.push(`Weekly Plan adds up to ${weekly} hours, but the total planned is ${total}.`);
  }
  return out;
}

export const progressOf = (p: ExecPlan) => {
  let f = 0; let t = 0;
  const c = (v: string) => { t++; if (String(v || '').trim()) f++; };
  INITIAL_ROWS.forEach(r => { if (r.key in p.initial) c(p.initial[r.key as InitialKey]); });
  p.brief.forEach(r => ['heading', 'topics', 'cos', 'hours', 'tool', 'evidence'].forEach(k => c((r as any)[k])));
  p.weekly.forEach(r => ['topic', 'co', 'method', 'classroom', 'activity', 'deliverable'].forEach(k => c((r as any)[k])));
  p.experts.forEach(r => ['name', 'company', 'role', 'date', 'topic', 'outcomes'].forEach(k => c((r as any)[k])));
  return t ? Math.round((f / t) * 100) : 0;
};

// ───────────────────────────── Excel (fills the department template) ─────────────────────────────

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // characters XML 1.0 doesn't allow
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);
const colNum = (col: string) => [...col].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0);
const colOf = (ref: string) => ref.replace(/\d+/g, '');
export type Val = string | number | null | undefined;
const WRAP: Record<string, string> = { '3': '10', '4': '10', '6': '10', '18': '10' };   // template styles → same look with text wrap

/** Column widths (in characters) from <cols> */
export function colWidths(sheet: string): (col: string) => number {
  const cols = [...sheet.matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g)].map(m => ({ min: +m[1], max: +m[2], w: +m[3] }));
  return (col: string) => { const i = colNum(col); return cols.find(c => i >= c.min && i <= c.max)?.w ?? 8.43; };
}
/** One cell's XML with the template style kept (wrapping text where the style allows) */
export function cellXml(ref: string, style: string | null, v: Val, formula?: string, wrap: Record<string, string> = WRAP) {
  const s = style ? ` s="${typeof v === 'string' && v && wrap[style] ? wrap[style] : style}"` : '';
  if (formula) return `<c r="${ref}"${s}><f>${formula}</f><v>${Number(v) || 0}</v></c>`;
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${s}/>`;
  if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}
export const asVal = (v: string, numeric = false): Val => {
  const t = String(v ?? '').trim();
  if (!t) return '';
  return numeric && /^\d+(\.\d+)?$/.test(t) ? Number(t) : t;
};
/** Set cells in one <row>, keeping each cell's template style; inserts missing cells in column order. */
export function setRowCells(rowXml: string, rowNum: number, values: Record<string, Val>, formulas: Record<string, string> = {}, wrap: Record<string, string> = WRAP): string {
  let xml = rowXml;
  for (const [col, v] of Object.entries(values)) {
    const ref = `${col}${rowNum}`;
    const re = new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>[\\s\\S]*?</c>)`);
    const m = xml.match(re);
    const style = m ? (m[1].match(/\ss="(\d+)"/)?.[1] ?? null) : null;
    const cx = cellXml(ref, style, v, formulas[col], wrap);
    if (m) xml = xml.replace(re, cx);
    else {
      const cells = [...xml.matchAll(/<c r="([A-Z]+)\d+"/g)];
      const after = cells.find(c => colNum(c[1]) > colNum(col));
      xml = after ? xml.replace(after[0], cx + after[0]) : xml.replace('</row>', `${cx}</row>`);
    }
  }
  return xml;
}
/** Row height so wrapped text shows in full (Excel doesn't resize rows written by other programs) */
export function withHeight(rowXml: string, values: Record<string, Val>, width: (c: string) => number, minHt = 14.4): string {
  let lines = 1;
  for (const [col, v] of Object.entries(values)) {
    if (typeof v !== 'string' || !v) continue;
    const per = Math.max(4, Math.floor(width(col) * 1.15));
    lines = Math.max(lines, v.split('\n').reduce((s, l) => s + Math.max(1, Math.ceil(l.length / per)), 0));
  }
  const ht = Math.max(minHt, +(lines * 15 + 3).toFixed(1));
  return rowXml.replace(/<row ([^>]*?)>/, (_m, attrs: string) =>
    `<row ${attrs.replace(/\s?ht="[\d.]+"/, '').replace(/\s?customHeight="\d"/, '')} ht="${ht}" customHeight="1">`);
}
export const rowsOf = (sheet: string) => [...sheet.matchAll(/<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g)].map(m => ({ num: +m[1], xml: m[0] }));

/** Fill fixed rows in place (Initial Plan, Industry Experts) */
export function fillInPlace(sheet: string, cells: Record<number, Record<string, Val>>, formulas: Record<number, Record<string, string>> = {}, wrap: Record<string, string> = WRAP): string {
  const width = colWidths(sheet);
  let out = sheet;
  for (const r of rowsOf(sheet)) {
    const vals = cells[r.num];
    if (!vals) continue;
    const old = +(r.xml.match(/\sht="([\d.]+)"/)?.[1] || 14.4);
    out = out.replace(r.xml, withHeight(setRowCells(r.xml, r.num, vals, formulas[r.num], wrap), vals, width, old));
  }
  return out;
}
/** Replace the data rows of a table sheet with one row per record, cloned from the template's first data row. */
export function fillTable(sheet: string, records: Record<string, Val>[], opts: { dropMerges?: boolean } = {}): string {
  const width = colWidths(sheet);
  const rows = rowsOf(sheet);
  const head = rows.find(r => r.num === 1)!;
  const proto = rows.find(r => r.num === 2)!;
  const body = records.map((vals, i) => {
    const num = i + 2;
    const clone = proto.xml.replace(/<row r="2"/, `<row r="${num}"`).replace(/<c r="([A-Z]+)2"/g, `<c r="$1${num}"`);
    return withHeight(setRowCells(clone, num, vals), vals, width, 18);
  }).join('');
  let out = sheet.replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${head.xml}${body}</sheetData>`);
  if (opts.dropMerges) out = out.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, '');
  const lastCol = [...head.xml.matchAll(/<c r="([A-Z]+)1"/g)].map(m => m[1]).pop() || 'A';
  return out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastCol}${records.length + 1}"/>`);
}

const expertLine = (e: ExpertRow) => [e.name, e.role, e.company, e.specialization].filter(Boolean).join(', ');
const sessionLine = (e: ExpertRow) => [e.date ? dmy(e.date) : '', e.topic, e.outcomes].filter(Boolean).join(', ');

/** The filled workbook as a Blob */
export async function buildExecPlanXlsx(p: ExecPlan, catalog: CatalogRow[], author?: string): Promise<Blob> {
  const res = await fetch('/templates/course-execution-plan.xlsx');
  if (!res.ok) throw new Error('Could not load the Excel template');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sheet = async (i: number, fn: (x: string) => string) => {
    const path = `xl/worksheets/sheet${i}.xml`;
    zip.file(path, fn(await zip.file(path)!.async('string')));
  };
  const I = p.initial;
  const num = (k: InitialKey) => asVal(I[k], true);

  // 1 · Subject Catalog — the department's list when the HOD has set one, otherwise the template's sample
  if (catalog.length) {
    await sheet(1, x => fillTable(x, catalog.map(c => ({ A: c.semester, B: c.short_code, C: c.subject, D: c.syllabus_code, E: c.key_topics, F: c.tools })), { dropMerges: true }));
  }
  // 2 · Initial Plan
  const e1 = p.experts[0] || emptyExpert(); const e2 = p.experts[1] || emptyExpert();
  const initialCells: Record<number, Record<string, Val>> = {
    2: { B: I.faculty_name }, 3: { B: I.short_code }, 4: { B: I.subject_title }, 5: { B: I.class_section }, 6: { B: num('strength') },
    7: { B: dmy(I.sem_start) }, 8: { B: dmy(I.sem_end) }, 9: { B: num('teaching_weeks') }, 10: { B: num('hours_per_week') },
    11: { B: totalHours(p) }, 12: { B: num('classroom_hours') }, 13: { B: num('online_hours') },
    14: { B: I.vision }, 15: { B: I.competencies }, 16: { B: I.industry_problem }, 17: { B: I.faculty_tool },
    18: { B: I.tool_a }, 19: { B: I.tool_b }, 20: { B: I.tool_c },
    21: { B: expertLine(e1) }, 22: { B: sessionLine(e1) }, 23: { B: expertLine(e2) }, 24: { B: sessionLine(e2) },
    25: { B: I.assessment }, 26: { B: I.support },
  };
  if (I.submission_date) initialCells[27] = { B: dmy(I.submission_date) };   // otherwise keep the template's date
  await sheet(2, x => fillInPlace(
    // a wider answer column so the plan reads without scrolling
    x.replace(/<col min="2" max="2" width="[\d.]+"/, '<col min="2" max="2" width="56"'),
    initialCells, { 11: { B: 'SUM(B12:B13)' } }));
  // 3 · Brief Plan
  await sheet(3, x => fillTable(x, p.brief.map(r => ({
    A: I.short_code, B: r.unit, C: r.heading, D: r.topics, E: r.cos, F: asVal(r.hours, true), G: asVal(r.classroom, true), H: asVal(r.online, true), I: r.tool, J: r.evidence,
  }))));
  // 4 · Weekly Plan
  await sheet(4, x => fillTable(x, p.weekly.map((r, i) => {
    const t = n(r.classroom) + n(r.online);
    return { A: asVal(r.week, true) || i + 1, B: r.topic, C: r.co, D: r.method, E: asVal(r.classroom, true), F: asVal(r.online, true), G: t || '', H: r.activity, I: r.tool, J: r.group_a, K: r.group_b, L: r.deliverable };
  })));
  // 5 · Industry Experts
  const keys: (keyof ExpertRow)[] = ['name', 'alumni', 'company', 'role', 'specialization', 'linkedin', 'email', 'date', 'topic', 'mode', 'outcomes'];
  const expertCells: Record<number, Record<string, Val>> = {};
  keys.forEach((k, i) => { expertCells[i + 2] = { B: k === 'date' ? dmy(e1[k]) : e1[k], C: k === 'date' ? dmy(e2[k]) : e2[k] }; });
  await sheet(5, x => fillInPlace(x, expertCells));
  // 6 · Student Teams
  await sheet(6, x => fillTable(x, p.teams.map((r, i) => ({
    A: asVal(r.week, true) || i + 1, B: dmy(r.date), C: asVal(r.duration, true), D: r.tool, E: r.s1, F: r.s2, G: r.s3, H: r.feature, I: r.objective, J: r.evidence, K: r.feedback,
  }))));

  // Excel recalculates the total on open; authorship shows the faculty, not the template's author
  zip.file('xl/workbook.xml', (await zip.file('xl/workbook.xml')!.async('string')).replace(/<calcPr ([^/]*)\/>/, '<calcPr $1 fullCalcOnLoad="1"/>'));
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file('docProps/core.xml', (await zip.file('docProps/core.xml')!.async('string'))
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, `<dc:creator>${xmlEsc(author || I.faculty_name || 'RGMCET')}</dc:creator>`)
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${xmlEsc(author || I.faculty_name || 'RGMCET')}</cp:lastModifiedBy>`)
    .replace(/(<dcterms:modified[^>]*>)[\s\S]*?(<\/dcterms:modified>)/, `$1${now}$2`));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const execPlanFileName = (p: ExecPlan, allot: any) =>
  `Course Execution Plan - ${p.initial.short_code || allot?.subject_name || 'Subject'} - ${semRoman(allot?.semester_label || '')} Sec ${allot?.section || ''} - ${p.initial.faculty_name || allot?.faculty_name || ''}.xlsx`
    .replace(/[^A-Za-z0-9._ ()&-]+/g, '_');

export async function downloadExecPlan(p: ExecPlan, catalog: CatalogRow[], allot: any) {
  saveAs(await buildExecPlanXlsx(p, catalog), execPlanFileName(p, allot));
}
