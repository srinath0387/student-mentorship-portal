/**
 * Read a university syllabus PDF in the browser and turn it into the subject's syllabus:
 * units (title, hours, topics), course objectives, course outcomes, text books, references,
 * course code, regulation and L-T-P-C. Typed PDFs use pdf.js; scanned PDFs fall back to OCR.
 * A full regulation book with many subjects is narrowed to the requested subject.
 */
import { loadPdfJs, ocrCanvas, prepareCanvasForOcr } from './activityDocumentParser';

export interface ParsedSyllabus {
  subject_code: string; regulation: string; credits: string;
  objectives: string[]; outcomes: { code: string; text: string }[];
  units: { title: string; hours: string; topics: string[] }[];
  text_books: string[]; references: string[];
  warnings: string[]; scanned: boolean;
}
type Progress = (stage: string) => void;

/** Text of the PDF with real line breaks (items grouped by their vertical position). */
export async function readPdfText(file: File, onProgress?: Progress): Promise<{ text: string; scanned: boolean }> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = Math.min(doc.numPages, 60);
  const out: string[] = [];
  for (let i = 1; i <= pages; i++) {
    onProgress?.(`Reading page ${i} of ${pages}…`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter(it => 'str' in it && String(it.str).trim())
      .map(it => ({ s: String(it.str), x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || 10 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; parts: typeof items }[] = [];
    for (const it of items) {
      const line = lines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
      if (line) line.parts.push(it); else lines.push({ y: it.y, parts: [it] });
    }
    lines.sort((a, b) => b.y - a.y);
    out.push(lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n'));
  }
  const text = out.join('\n');
  if (text.replace(/[^A-Za-z]/g, '').length >= 200) { await doc.destroy(); return { text, scanned: false }; }

  // Scanned syllabus: OCR each page (first 12)
  const ocr: string[] = [];
  const n = Math.min(doc.numPages, 12);
  for (let i = 1; i <= n; i++) {
    onProgress?.(`Scanned PDF — recognising text on page ${i} of ${n}…`);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
    const ctx = c.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    ocr.push(await ocrCanvas(prepareCanvasForOcr(c, c.width, c.height)));
  }
  await doc.destroy();
  return { text: ocr.join('\n'), scanned: true };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const unitNo = (v: string) => (/^\d+$/.test(v) ? Number(v) : ROMAN[v.toUpperCase()] || 0);
const UNIT_RE = /(?:^|\n)\s*(?:UNIT|MODULE)\s*[-–—:.]?\s*([IVX]{1,4}|\d{1,2})\b/gi;
const HEADS: [string, RegExp][] = [
  ['objectives', /(?:^|\n)\s*(?:COURSE\s+)?OBJECTIVES?\s*[:\-–]?/i],
  ['outcomes', /(?:^|\n)\s*COURSE\s+OUTCOMES?\s*(?:\(\s*COs?\s*\))?\s*[:\-–]?/i],
  ['text_books', /(?:^|\n)\s*TEXT\s*-?\s*BOOKS?\s*[:\-–]?/i],
  ['references', /(?:^|\n)\s*REFERENCES?(?:\s+BOOKS?)?\s*[:\-–]?/i],
  ['end', /(?:^|\n)\s*(?:WEB\s*(?:RESOURCES|LINKS|REFERENCES)|E\s*-?\s*RESOURCES|ONLINE\s+(?:RESOURCES|COURSES)|MOOCS?|CO\s*-\s*PO\s+MAPPING|MAPPING\s+OF\s+COS?)\b/i],
];

/** Points of a list block: numbered / bulleted items, or one per line, wrapped lines rejoined. */
function listOf(block: string): string[] {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const l of lines) {
    const start = l.match(/^(?:\d{1,2}[.)]|[•●▪◦*-]|CO\s*-?\s*\d+\s*[:.)-]|\(?[a-z]\)|[ivx]+[.)])\s*(.*)$/i);
    if (start || !items.length) items.push((start ? start[1] : l).trim());
    else items[items.length - 1] += ' ' + l;
  }
  return items.map(x => x.replace(/\s+/g, ' ').replace(/^[:\-–\s]+/, '').trim()).filter(x => x.length > 3);
}

/** Split a unit's paragraph into topics. */
function topicsOf(body: string): string[] {
  const flat = body.replace(/\n(?!\s*(?:\d{1,2}[.)]|[•●▪◦*]))/g, ' ').replace(/\s+/g, ' ');
  return flat.split(/[,;•●▪\n]|\s[–—-]\s|\.\s+(?=[A-Z])/)
    .map(x => x.replace(/^\s*(?:\d{1,2}[.)]|[-*])\s*/, '').replace(/[.:]+$/, '').trim())
    .filter(x => x.length > 2 && /[a-z]/i.test(x));
}

export function parseSyllabusDocument(raw: string, subjectName: string, scanned = false): ParsedSyllabus {
  const warnings: string[] = [];
  let text = raw.replace(/\r/g, '').replace(/[ \t]+/g, ' ');

  // A book of many subjects: start at this subject's title (letters-only match), end at the next subject
  const target = norm(subjectName);
  let preamble = '';                                   // lines just above the title (course code is often there)
  if (target.length >= 4) {
    const lines = text.split('\n');
    const idx = lines.findIndex(l => norm(l).includes(target));
    if (idx >= 0) {
      const tail = lines.slice(idx).join('\n');
      if (/UNIT|MODULE/i.test(tail.slice(0, 6000))) { text = tail; preamble = lines.slice(Math.max(0, idx - 3), idx).join('\n'); }
    } else if ((text.match(UNIT_RE) || []).length > 6) {
      warnings.push(`"${subjectName}" was not found in the PDF, so the first subject in it was used. If that is wrong, upload only this subject's pages.`);
    }
  }

  // Units: stop when the numbering starts again (that is the next subject)
  const marks: { at: number; end: number; n: number }[] = [];
  UNIT_RE.lastIndex = 0;
  for (let m = UNIT_RE.exec(text); m; m = UNIT_RE.exec(text)) {
    const n = unitNo(m[1]);
    if (!n) continue;
    if (marks.length && n <= marks[marks.length - 1].n) {
      // Next subject starts here — cut the text before its title / code lines
      const before = text.slice(0, m.index).split('\n');
      let k = before.length;
      for (let back = 0; back < 5 && k > 0; back++) {
        const l = before[k - 1].trim();
        if (!l || /course\s*code|subject\s*code|L\s*-?\s*T\s*-?\s*P|semester/i.test(l) || (l === l.toUpperCase() && /[A-Z]{3}/.test(l) && !/,/.test(l) && l.length < 70)) k--;
        else break;
      }
      text = before.slice(0, k).join('\n');
      break;
    }
    marks.push({ at: m.index, end: m.index + m[0].length, n });
  }
  const firstUnit = marks[0]?.at ?? text.length;
  const afterUnits = (from: number) => {
    let end = text.length;
    for (const [, re] of HEADS) {
      const m = re.exec(text.slice(from));
      if (m && from + m.index < end) end = from + m.index;
    }
    return end;
  };
  const lastUnitEnd = marks.length ? afterUnits(marks[marks.length - 1].end) : text.length;
  const units = marks.map((mk, i) => {
    const chunk = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].at : lastUnitEnd).replace(/^[\s:.\-–—]+/, '');
    const nl = chunk.indexOf('\n');
    let header = nl >= 0 ? chunk.slice(0, nl) : chunk;
    let body = nl >= 0 ? chunk.slice(nl + 1) : '';
    let hours = '';
    const h = header.match(/(?:lecture|contact|teaching|no\.?\s*of)?\s*(?:hours|hrs?|periods|lectures)\s*[:\-]?\s*(\d{1,2})\b/i)
      || header.match(/\(?\s*(\d{1,2})\s*(?:hours|hrs?|periods|lectures|L)\b\.?\s*\)?/i)
      || body.match(/^\s*\(?\s*(\d{1,2})\s*(?:hours|hrs?|periods|lectures)\s*\)?/i);
    if (h) { hours = h[1]; if (header.includes(h[0])) header = header.replace(h[0], ' '); else body = body.replace(h[0], ' '); }
    // Header only had the hours: the title is on the next line ("Basics of Neural Networks: Perceptron, …")
    if (!header.replace(/[\s:.\-–—()]/g, '')) {
      const n2 = body.indexOf('\n');
      header = n2 >= 0 ? body.slice(0, n2) : body;
      body = n2 >= 0 ? body.slice(n2 + 1) : '';
    }
    // "UNIT I: Title: topic, topic" or "UNIT I Title – topic, topic" on one line
    let title = header;
    const split = header.match(/^(.{3,90}?)\s*(?::|\s[–—]\s)\s*(.+)$/);
    if (split) { title = split[1]; body = `${split[2]}\n${body}`; }
    title = title.replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '').replace(/\s+/g, ' ');
    if (title.length > 90 || /,/.test(title)) { body = `${title}\n${body}`; title = ''; }
    return { title: title && title === title.toUpperCase() ? title.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : title, hours, topics: topicsOf(body) };
  }).filter(u => u.topics.length || u.title);

  // Other sections
  const section = (key: string) => {
    const re = HEADS.find(([k]) => k === key)![1];
    const m = re.exec(text);
    if (!m) return '';
    const from = m.index + m[0].length;
    let end = text.length;
    for (const [k, r] of HEADS) {
      if (k === key) continue;
      const n = r.exec(text.slice(from));
      if (n && from + n.index < end) end = from + n.index;
    }
    const nextUnit = text.slice(from).search(UNIT_RE);
    if (nextUnit >= 0 && from + nextUnit < end && from < firstUnit) end = from + nextUnit;
    return text.slice(from, Math.min(end, from + 4000));
  };
  const leadIn = (s: string) => s.length < 80 && /(?:\bto|:|will|able)$/i.test(s.trim()) && /objective|course|student|able/i.test(s);
  const objectives = listOf(section('objectives')).filter(o => !leadIn(o)).slice(0, 10);
  const outcomes = listOf(section('outcomes')).filter(o => !/^(?:after|on|upon)\s+(?:successful\s+)?completion|students?\s+will\s+be\s+able/i.test(o))
    .slice(0, 8).map((text, i) => ({ code: `CO${i + 1}`, text: text.replace(/^CO\s*-?\s*\d+\s*[:.)-]?\s*/i, '') }));
  const text_books = listOf(section('text_books')).slice(0, 8);
  const references = listOf(section('references')).slice(0, 10);

  const head = preamble + '\n' + text.slice(0, Math.max(800, firstUnit));
  const code = head.match(/(?:COURSE|SUBJECT|PAPER)\s*CODE\s*[:\-]?\s*([A-Z0-9]{4,12})/i)?.[1] || '';
  const regulation = head.match(/\b(R\s?(?:1[3-9]|2\d))\b/)?.[1]?.replace(/\s/g, '') || '';
  const ltpc = head.match(/L\s*[-]?\s*T\s*[-]?\s*P\s*[-]?\s*C[\s\S]{0,40}?(\d)\s*[- ]\s*(\d)\s*[- ]\s*(\d)\s*[- ]\s*(\d(?:\.\d)?)/i);

  if (!units.length) warnings.push('No "UNIT I, UNIT II…" headings were found. Paste the units or type them in.');
  if (scanned) warnings.push('This was a scanned PDF, read with text recognition. Check the topics carefully.');
  return {
    subject_code: code, regulation, credits: ltpc ? `${ltpc[1]}-${ltpc[2]}-${ltpc[3]}-${ltpc[4]}` : '',
    objectives, outcomes, units, text_books, references, warnings, scanned,
  };
}
