/**
 * RGMCET college-format lesson plan (Session / UNIT / TOPICS with Discussion rows) — Word and PDF.
 * Mirrors the department's own template: coloured college header with crest, details box,
 * session table, faculty / HOD signatures.
 */
import { shrink, urlToDataUrl } from '../../lib/pdfReport';
import type { Topic } from './lessonPlanShared';

export type SessionRow = { kind: 'session' | 'discussion'; unit: number; text: string };
export type SessionSettings = { periods_per_session: number; discussion_every: number };

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const unitLabel = (n: number) => `UNIT - ${ROMAN[n - 1] || n}`;

const DEPT_FULL: Record<string, string> = {
  'cse': 'Computer Science & Engineering',
  'csedatascience': 'Computer Science & Engineering (Data Science)',
  'cseaiml': 'Computer Science & Engineering (Artificial Intelligence & Machine Learning)',
  'csebs': 'Computer Science & Engineering (Business Systems)',
  'csecs': 'Computer Science & Engineering (Cyber Security)',
  'ece': 'Electronics & Communication Engineering',
  'eee': 'Electrical & Electronics Engineering',
  'mechanical': 'Mechanical Engineering',
  'civil': 'Civil Engineering',
  'mca': 'Master of Computer Applications',
  'mba': 'Master of Business Administration',
};
const BRANCH: Record<string, string> = { csedatascience: 'CSE(DS)', cseaiml: 'CSE(AI&ML)', csebs: 'CSE(BS)', csecs: 'CSE(CS)', mechanical: 'MECH', civil: 'CIVIL' };
const dkey = (d: string) => String(d || '').toLowerCase().replace(/[^a-z]/g, '');
export const deptFull = (d: string) => DEPT_FULL[dkey(d)] || d;
export const branchShort = (d: string) => BRANCH[dkey(d)] || String(d || '').toUpperCase();
/** "2-1" → "II B. Tech /I SEM" (MCA/MBA: "I MCA /I SEM") */
export function yearSem(sem: string, dept: string) {
  const [y, s] = String(sem || '').split('-').map(Number);
  if (!y || !s) return sem;
  const prog = ['mca', 'mba'].includes(dkey(dept)) ? dkey(dept).toUpperCase() : 'B. Tech';
  return `${ROMAN[y - 1]} ${prog} /${ROMAN[s - 1]} SEM`;
}
/** Fingerprint of the topics, so a saved session plan is rebuilt when the topics change */
export const topicsKey = (topics: Topic[]) => {
  const s = topics.map(t => `${t.unit}|${t.topic}|${t.periods}`).join('~');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${topics.length}-${(h >>> 0).toString(36)}`;
};

/** Lower-case the first letter of an ordinary phrase, but keep names / Title Case ("Machine Learning", "Neo4j") */
const soft = (t: string) => {
  const words = t.split(/\s+/).filter(w => w.length > 3);
  const titleCase = words.length > 0 && words.every(w => /^[A-Z0-9]/.test(w));
  return !titleCase && /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
};
const similar = (a: string, b: string) => { const x = a.toLowerCase().replace(/[^a-z]/g, ''); const y = b.toLowerCase().replace(/[^a-z]/g, ''); return !!x && !!y && (x.includes(y) || y.includes(x)); };
const QUESTIONS: ((a: string, b: string, u: string) => string)[] = [
  (a, b, u) => `How do ${a} and ${b} fit together in ${u}, and what challenges come up when applying them to a real-world problem?`,
  (a, b, u) => `Why is ${a} important before moving on to ${b}, and how does each step contribute to a successful ${u} solution?`,
  (a, b) => `Compare ${a} with ${b}: where would you use each in practice, and what trade-offs should be considered?`,
  (a, b, u) => `Using a real-world example, explain how ${a} and ${b} are applied in ${u}, and what limitations you would expect.`,
];
/** sessions: the topics of each session since the last discussion */
export function discussionQuestion(sessions: string[][], unitTitle: string, index: number): string {
  const first = sessions[0] || [];
  const last = sessions[sessions.length - 1] || [];
  const a0 = first[0] || '';
  const b0 = sessions.length > 1 ? last[0] || '' : first[1] || '';
  const a = soft(a0); const b = soft(b0);
  const u = unitTitle && !similar(unitTitle, a0) && !similar(unitTitle, b0) ? soft(unitTitle) : 'this unit';
  if (!b || a === b) return `How is ${a} applied in practice, and what are its key benefits and challenges?`;
  return QUESTIONS[index % QUESTIONS.length](a, b, u);
}

/** Group topics into sessions (by periods, never across units) with a discussion every N sessions. */
export function buildSessions(topics: Topic[], s: SessionSettings): SessionRow[] {
  const rows: SessionRow[] = [];
  const units = Array.from(new Set(topics.map(t => t.unit))).sort((x, y) => x - y);
  let dIndex = 0;
  for (const unit of units) {
    const list = topics.filter(t => t.unit === unit && t.topic.trim());
    const title = list.find(t => t.unit_title)?.unit_title || '';
    const groups: string[][] = [];
    let cur: string[] = []; let acc = 0;
    for (const t of list) {
      cur.push(t.topic.trim()); acc += Number(t.periods) || 1;
      if (acc >= s.periods_per_session) { groups.push(cur); cur = []; acc = 0; }
    }
    if (cur.length) groups.push(cur);
    let since: string[][] = [];
    groups.forEach((g, i) => {
      rows.push({ kind: 'session', unit, text: g.join(', ') });
      since.push(g);
      if (s.discussion_every > 0 && (since.length === s.discussion_every || i === groups.length - 1)) {
        rows.push({ kind: 'discussion', unit, text: discussionQuestion(since, title, dIndex++) });
        since = [];
      }
    });
  }
  return rows;
}

const sessionLabels = (rows: SessionRow[]) => { let n = 0; return rows.map(r => (r.kind === 'session' ? `Session-${++n}` : 'Discussion')); };

export interface CollegeHeader { department: string; academic_year: string; year_sem: string; course: string; branch: string; section: string; faculty: string }
export function headerFor(allot: any, ay: string): CollegeHeader {
  const m = String(ay || '').match(/^(\d{4})\s*[-–—/]\s*(\d{2,4})$/);
  const fullAy = m ? `${m[1]}-${m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]}` : ay;   // "2025–26" → "2025-2026"
  return {
    department: allot.department, academic_year: fullAy, year_sem: yearSem(allot.semester_label, allot.department),
    course: String(allot.subject_name || '').toUpperCase(), branch: branchShort(allot.department), section: allot.section || '—',
    faculty: allot.faculty_name + (allot.co_faculty_name ? ` & ${allot.co_faculty_name}` : ''),
  };
}
const fileName = (h: CollegeHeader, ext: string) => `Lesson Plan - ${h.course} - ${h.year_sem.replace(/\//g, '')} Sec ${h.section}.${ext}`;

async function crestPng(maxSide: number): Promise<string | null> {
  const raw = await urlToDataUrl('/rgmcet-crest.png');
  return raw ? shrink(raw, maxSide, 'image/png') : null;
}

const RED = [230, 46, 36] as const, BLUE = [61, 109, 204] as const, GREEN = [96, 166, 73] as const;

// ─── PDF ───────────────────────────────────────────────────────────────────────
export async function collegeLessonPlanPdf(h: CollegeHeader, rows: SessionRow[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default as any;
  const d = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = d.internal.pageSize.getWidth(); const M = 12;
  const crest = await crestPng(260);
  if (crest) { try { d.addImage(crest, 'PNG', M + 2, 8, 26, 26); } catch { /* skip a bad image */ } }
  const cx = W / 2 + 12;
  d.setFont('helvetica', 'bold'); d.setTextColor(...RED);
  let size = 20; d.setFontSize(size);
  const name = 'RGM College of Engineering and Technology';
  while (size > 14 && d.getTextWidth(name) > W - 2 * M - 34) { size -= 0.5; d.setFontSize(size); }
  d.text(name, cx, 16, { align: 'center' });
  d.setFont('times', 'bold'); d.setFontSize(14); d.setTextColor(...BLUE); d.text('(Autonomous)', cx, 23, { align: 'center' });
  d.setFontSize(12); d.setTextColor(...GREEN); d.text(`Department of ${deptFull(h.department)}`, cx, 30, { align: 'center', maxWidth: W - 2 * M - 34 });
  d.setDrawColor(0); d.setLineWidth(0.5); d.line(M, 35, W - M, 35);
  d.setTextColor(0); d.setFontSize(13); d.text('LESSON PLAN', W / 2, 41, { align: 'center' });

  // Details box — bold label, normal value inside one cell
  const lv = (label: string, value: string) => ({ content: `${label}${value}`, _label: label });
  autoTable(d, {
    startY: 44, margin: { left: M }, tableWidth: (W - 2 * M) * 0.88, theme: 'grid',
    styles: { font: 'times', fontSize: 10.5, textColor: 0, lineColor: 0, lineWidth: 0.3, cellPadding: { top: 1.6, bottom: 1.6, left: 1.5, right: 1.5 }, valign: 'top' },
    columnStyles: { 0: { cellWidth: (W - 2 * M) * 0.88 * 0.6 } },
    body: [
      [{ content: `DEPARTMENT OF ${deptFull(h.department).toUpperCase().replace(/&/g, 'AND').replace(/\s+\(/, '(')}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'center', valign: 'bottom', minCellHeight: 11 } }],
      [lv('ACADEMIC YEAR: ', h.academic_year), lv('YEAR: ', h.year_sem)],
      [lv('COURSE NAME: ', h.course), lv('Branch: ', `${h.branch}\nSection : ${h.section}`)],
      [{ content: 'NAME OF THE FACULTY', styles: { fontStyle: 'bold' } }, h.faculty],
    ],
    didParseCell: (c: any) => { if (c.cell.raw?._label) c.cell.styles.textColor = [255, 255, 255]; },  // drawn by hand below
    didDrawCell: (c: any) => {
      const lbl = c.cell.raw?._label; if (!lbl) return;
      const x = c.cell.x + 1.5; let y = c.cell.y + 1.6 + 3.6;
      const value = String(c.cell.raw.content).slice(lbl.length);
      const lines = value.split('\n');
      d.setFontSize(10.5); d.setFont('times', 'bold'); d.setTextColor(0); d.text(lbl, x, y);
      const lw = d.getTextWidth(lbl.trimEnd()) + 1.4;
      d.setFont('times', 'normal'); d.text(lines[0], x + lw, y, { maxWidth: c.cell.width - lw - 3 });
      for (const extra of lines.slice(1)) {
        y += 4.6;
        const m = extra.match(/^([^:]+:\s*)(.*)$/);
        if (m) { d.setFont('times', 'bold'); d.text(m[1], x, y); const w2 = d.getTextWidth(m[1].trimEnd()) + 1.4; d.setFont('times', 'normal'); d.text(m[2], x + w2, y); } else d.text(extra, x, y);
      }
    },
  });
  // Session table
  const labels = sessionLabels(rows);
  autoTable(d, {
    startY: (d as any).lastAutoTable.finalY + 7, margin: { left: M, right: M }, theme: 'grid',
    styles: { font: 'times', fontSize: 11.5, textColor: 0, lineColor: 0, lineWidth: 0.3, cellPadding: 1.4, valign: 'middle' },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold', halign: 'center', fontSize: 12.5 },
    columnStyles: { 0: { cellWidth: 23, halign: 'center' }, 1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }, 2: { cellWidth: 'auto' } },
    head: [['Session', 'UNIT', 'TOPICS']],
    body: rows.map((r, i) => [labels[i], unitLabel(r.unit), r.text]),
  });
  let y = (d as any).lastAutoTable.finalY + 24;
  if (y > d.internal.pageSize.getHeight() - 15) { d.addPage(); y = 30; }
  d.setFont('times', 'bold'); d.setFontSize(10.5); d.setTextColor(0);
  d.text('Signature of Faculty', M, y); d.text('Signature of HOD', W / 2 + 15, y);
  d.save(fileName(h, 'pdf').replace(/[^A-Za-z0-9._ ()&-]+/g, '_'));
}

// ─── Word ──────────────────────────────────────────────────────────────────────
export async function collegeLessonPlanWord(h: CollegeHeader, rows: SessionRow[]) {
  const { para, table, picture, saveDocx } = await import('../../lib/docxWriter');
  const crest = await crestPng(300);
  const images = crest ? [{ id: 'rIdCrest', ext: 'png' as const, data: Uint8Array.from(atob(crest.split(',')[1]), c => c.charCodeAt(0)) }] : [];
  const hex = (c: readonly number[]) => c.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  const T = 'Times New Roman';
  const header = table(null, [[
    { blocks: crest ? picture('rIdCrest', 2.6, 2.6) : para(''), vAlign: 'center' },
    { blocks: para({ text: 'RGM College of Engineering and Technology', bold: true, size: 20, color: hex(RED), font: 'Arial' }, { align: 'center', spaceAfter: 20 })
        + para({ text: '(Autonomous)', bold: true, size: 15, color: hex(BLUE), font: T }, { align: 'center', spaceAfter: 20 })
        + para({ text: `Department of ${deptFull(h.department)}`, bold: true, size: 13, color: hex(GREEN), font: T }, { align: 'center', spaceAfter: 0 }), vAlign: 'center' },
  ]], [1900, 8300], { borderless: true });
  const lbl = (label: string, value: string): any => ({ runs: [{ text: label, bold: true }, { text: value }] });
  const details = table(null, [
    [{ runs: [{ text: `DEPARTMENT OF ${deptFull(h.department).toUpperCase().replace(/&/g, 'AND').replace(/\s+\(/, '(')}`, bold: true }], span: 2, align: 'center', vAlign: 'bottom' }],
    [lbl('ACADEMIC YEAR: ', h.academic_year), lbl('YEAR: ', h.year_sem)],
    [lbl('COURSE NAME: ', h.course), { runs: [{ text: 'Branch: ', bold: true }, { text: h.branch }, { text: '\nSection : ', bold: true }, { text: h.section }] }],
    [{ runs: [{ text: 'NAME OF THE FACULTY', bold: true }] }, h.faculty],
  ], [5200, 3700], { size: 11, font: T });
  const labels = sessionLabels(rows);
  const body = table(['Session', 'UNIT', 'TOPICS'],
    rows.map((r, i) => [{ runs: [{ text: labels[i] }], align: 'center', vAlign: 'center' }, { runs: [{ text: unitLabel(r.unit), bold: true }], align: 'center', vAlign: 'center' }, r.text]),
    [1400, 1350, 7450], { size: 12, font: T, headShade: 'E6E6E6', headColor: '000000', vAlign: 'center' });
  const signs = table(null, [[{ runs: [{ text: 'Signature of Faculty', bold: true }] }, { runs: [{ text: 'Signature of HOD', bold: true }] }]], [5100, 5100], { borderless: true, size: 11, font: T });
  await saveDocx(fileName(h, 'docx'), [
    header,
    para('', { ruleBelow: true, spaceAfter: 60 }),
    para({ text: 'LESSON PLAN', bold: true, size: 13, font: T }, { align: 'center', spaceAfter: 120 }),
    details, body,
    para('', { spaceAfter: 700 }),
    signs,
  ], { images, font: T });
}

