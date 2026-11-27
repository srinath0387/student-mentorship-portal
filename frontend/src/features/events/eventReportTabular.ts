/**
 * Event report in the department's tabular format — the same layout as the event request forms
 * (numbered rows: label | details, tick boxes, organizer / HOD / Principal rows at the end).
 * One row list drives both outputs: Word (built on the department's own .docx template) and PDF.
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { api } from '../../lib/api';
import { shrink, urlToDataUrl } from '../../lib/pdfReport';
import { listItems } from '../../components/common/NumberedListInput';
import { ER_PARTICIPANTS, ER_TYPES, PARA, dmy, esc, inWords, pPrOf, para, rupees, setLines, textOf, tick } from './eventRequestDocs';

type Photo = { url: string; caption?: string };
export type ReportRow =
  | { kind: 'text'; label: string; lines: string[] }
  | { kind: 'numbered'; label: string; items: string[] }
  | { kind: 'ticks'; label: string; options: 'type' | 'participants'; chosen: string[]; other?: string }
  | { kind: 'pair'; label: string; a: [string, string]; b: [string, string] }
  | { kind: 'photos'; label: string; photos: Photo[] }
  | { kind: 'sign'; label: string; names: string[] }
  // HOD / Principal rows: blank for hand signatures, or filled with the portal decision (signature space kept)
  | { kind: 'hod'; lines?: string[]; stamp?: string[] } | { kind: 'principal'; lines?: string[]; stamp?: string[] };

/** Another document in the same tabular layout (e.g. the request to attend): its own rows, title and file name */
export type TabularDoc = { rows: ReportRow[]; title: string; fileName: string; author?: string };

const TYPE_BOX: Record<string, string> = {
  'Faculty Development Programme (FDP)': 'FDP', Workshop: 'Workshop', Seminar: 'Seminar', 'Guest Lecture': 'Guest Lecture',
  'Training Programme': 'Training Program', Hackathon: 'Hackathon',
};
const d10 = (v: any) => String(v || '').slice(0, 10);
const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

/** The report as rows, in the order of the department's form */
export function reportRows(e: any, photos: Photo[]): ReportRow[] {
  const att = e.participation === 'attended';
  const iv = e.event_type === 'Industrial Visit';
  const box = TYPE_BOX[e.event_type];
  const rows: ReportRow[] = [];
  const text = (label: string, v: any) => { const s = String(v ?? '').trim(); if (s) rows.push({ kind: 'text', label, lines: s.split('\n').map(x => x.trim()).filter(Boolean) }); };
  const numbered = (label: string, v: any) => { const items = listItems(v); if (items.length) rows.push({ kind: 'numbered', label, items }); };

  if (e.ref_no) text('Reference No.', e.ref_no);
  text('Name of the Event', e.title);
  rows.push({ kind: 'ticks', label: 'Event Type', options: 'type', chosen: [box || 'Other'], other: box ? '' : e.event_type });
  text(att ? 'Organised by (attended)' : 'Organised by', e.organized_by || (att ? '' : `Department of ${e.department}`));
  const from = dmy(d10(e.start_date)); const to = dmy(d10(e.end_date));
  rows.push({ kind: 'pair', label: 'Date(s), Duration', a: ['Dates:', to && to !== from ? `From ${from} To ${to}` : from], b: ['Duration:', e.duration_hours ? `${e.duration_hours} hours` : '—'] });
  text('Mode', e.mode);
  if (iv) {
    text('Place Visited', [e.visit?.company, e.visit?.location].filter(Boolean).join(', '));
    text('Contact Person at Industry', e.visit?.contact_person);
    text('Faculty Accompanied', e.visit?.faculty_accompanied);
  } else text('Venue', e.venue);
  (e.coordinators || []).filter((c: any) => c?.name).forEach((c: any) =>
    text(att ? 'Attended by (Name, Designation)' : 'Faculty Organizer Name, Designation, Department',
      [c.name, c.designation, att ? '' : e.department].filter(Boolean).join(', ')));
  numbered('Objective(s) of the Event', e.objectives);
  if (!att) {
    const s = num(e.student_count) || 0; const f = num(e.faculty_count) || 0; const x = num(e.external_count) || 0;
    const chosen = [s && f ? 'Both' : s ? 'Students' : f ? 'Faculty' : '', x ? 'External Participants' : ''].filter(Boolean);
    if (chosen.length) rows.push({ kind: 'ticks', label: 'Target Participants', options: 'participants', chosen });
    text('Target Year, Branch, Dept.', e.target_audience);
    text('No. of Participants', [s ? `Students: ${s}` : '', f ? `Faculty: ${f}` : '', x ? `External: ${x}` : ''].filter(Boolean).join(',  '));
  }
  if (!iv) (e.resource_persons || []).filter((p: any) => p?.name).forEach((p: any, i: number) =>
    text(`Resource Person ${i + 1} Details`, [[p.name, p.designation, p.organization].filter(Boolean).join(', '), p.topic ? `Topic: ${p.topic}` : ''].filter(Boolean).join('\n')));
  text(iv ? 'About the Visit' : 'Brief Report of the Event', e.summary);
  numbered('Expected Outcomes', e.expected_outcomes);
  numbered('Achieved Outcomes', e.outcomes);
  text(att ? 'Takeaways for the Department' : 'Participant Feedback', e.feedback);
  if (!att && num(e.budget)) text('Expenditure (Rs), in words', `${rupees(Number(e.budget))} (Rupees ${inWords(Number(e.budget))} Only)`);
  if (photos.length) rows.push({ kind: 'photos', label: 'Photographs', photos });
  rows.push({ kind: 'sign', label: att ? 'Faculty Name(s) and Signature(s)' : 'Event Organizer Name(s) and Signature(s)', names: (e.coordinators || []).map((c: any) => c?.name).filter(Boolean) });
  rows.push({ kind: 'hod' }, { kind: 'principal' });
  return rows;
}

const title = (e: any) => (e.participation === 'attended' ? 'EVENT PARTICIPATION REPORT' : 'DEPARTMENT EVENT REPORT');
const fileName = (e: any, ext: string) => `${e.event_type} Report - ${e.title} - ${d10(e.start_date)}.${ext}`.replace(/[^A-Za-z0-9._ ()&-]+/g, '_');

/** Photos as JPEG bytes with their pixel size (from the view URLs) */
async function loadPhotos(photos: Photo[]) {
  const out: { data: string; w: number; h: number; caption?: string }[] = [];
  for (const p of photos.slice(0, 12)) {
    const raw = await urlToDataUrl(p.url);
    if (!raw) continue;
    const data = await shrink(raw, 1200, 'image/jpeg');
    const size = await new Promise<{ w: number; h: number }>(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 4, h: 3 }); i.src = data; });
    out.push({ data, ...size, caption: p.caption });
  }
  return out;
}
async function photosOf(e: any): Promise<Photo[]> {
  const list = (e.photos || []).filter((p: any) => p?.key);
  if (!list.length) return [];
  const urls: Record<string, string> = e.urls || await api.getAcademicViewUrls(list.map((p: any) => p.key)).catch(() => ({}));
  return list.filter((p: any) => urls[p.key]).map((p: any) => ({ url: urls[p.key], caption: p.caption }));
}

// ───────────────────────────── Word ─────────────────────────────

const CELL = /<w:tc>[\s\S]*?<\/w:tc>/g;
const ROW = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
const cellsOf = (row: string) => row.match(CELL) || [];
const withCells = (row: string, cells: string[]) => { let j = 0; return row.replace(CELL, () => cells[j++] ?? ''); };
/** Label cell: keep its bold run style, change the words */
function setLabel(cell: string, text: string): string {
  const paras = cell.match(PARA) || [];
  const first = paras[0]; const last = paras[paras.length - 1];
  if (!first || !last) return cell;
  const rPr = first.match(/<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] || '';
  const p = `<w:p>${pPrOf(first)}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  return cell.slice(0, cell.indexOf(first)) + p + cell.slice(cell.lastIndexOf(last) + last.length);
}

export async function eventReportWord(e: any, custom?: TabularDoc) {
  const res = await fetch('/templates/event-request-permission.docx');
  if (!res.ok) throw new Error('Could not load the Word template');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  let doc = await zip.file('word/document.xml')!.async('string');
  const tpl = doc.match(ROW) || [];
  const find = (label: string) => tpl.find(r => textOf(cellsOf(r)[1] || '').replace(/\s+/g, ' ').trim().toLowerCase() === label)!;
  const P = {
    text: find('name of the event'), type: find('event type'), pair: find('proposed date(s), time'), numbered: find('objective(s) of the event'),
    participants: find('target participants'), sign: find('event organizer name(s) and signature(s)'),
    hod: find('head of the department'), principal: find('principal’s approval'),
  };
  if (Object.values(P).some(x => !x)) throw new Error('The Word template has changed; the report rows could not be matched');

  // a fresh numbered list for every numbered row, so each one counts from 1
  let numbering = await zip.file('word/numbering.xml')!.async('string');
  const listNum = P.numbered.match(/<w:numId w:val="(\d+)"\/>/g)?.[1]?.match(/\d+/)?.[0] || '10';
  const abstractId = numbering.match(new RegExp(`<w:num w:numId="${listNum}"[^>]*>\\s*<w:abstractNumId w:val="(\\d+)"`))?.[1] || '0';
  // Each list gets its own copy of the template's list definition (own id + nsid): every viewer then starts
  // it at 1, including ones that ignore restart overrides (Quick Look, phone apps).
  const abstractXml = numbering.match(new RegExp(`<w:abstractNum [^>]*w:abstractNumId="${abstractId}"[^>]*>[\\s\\S]*?<\\/w:abstractNum>`))?.[0] || '';
  // First use the template's own separate "1." lists that are free (decimal, not used by the table) — the most
  // compatible choice; make copies only if a report ever has more numbered rows than that.
  // the table rows are rebuilt, so only the row-number list (S.No. column) stays in use
  const used = new Set((cellsOf(P.text)[0]!.match(/<w:numId w:val="(\d+)"\/>/g) || []).map(x => x.match(/\d+/)![0]));
  const level0 = (abs: string) => {
    const block = numbering.match(new RegExp(`<w:abstractNum [^>]*w:abstractNumId="${abs}"[^>]*>[\\s\\S]*?<\\/w:abstractNum>`))?.[0] || '';
    return block.match(/<w:lvl w:ilvl="0"[\s\S]*?<\/w:lvl>/)?.[0] || '';
  };
  const firstLevelFmt = (abs: string) => level0(abs).match(/<w:numFmt w:val="(\w+)"/)?.[1] || '';
  const indentOf = (abs: string) => level0(abs).match(/<w:ind [^>]*\/>/)?.[0] || '';
  const free = [...numbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g)]
    .filter(([, id, abs]) => !used.has(id!) && firstLevelFmt(abs!) === 'decimal')
    // same indent as the objectives list first, so the lists line up
    .sort((x, y) => Number(indentOf(y[2]!) === indentOf(abstractId)) - Number(indentOf(x[2]!) === indentOf(abstractId)))
    .map(([, id]) => id!);
  const pool = [listNum, ...free.filter(id => id !== listNum)];
  let nextNum = 900;
  const newList = () => {
    const pooled = pool.shift();
    if (pooled) return pooled;
    const id = nextNum++;
    if (!abstractXml) return listNum;
    const copy = abstractXml
      .replace(/w:abstractNumId="\d+"/, `w:abstractNumId="${id}"`)
      .replace(/<w:nsid w:val="[0-9A-Fa-f]+"\/>/, `<w:nsid w:val="${(0x5A000000 + id).toString(16).toUpperCase()}"/>`)
      .replace(/\sw15:restartNumberingAfterBreak="\d"/, '');
    const firstNum = numbering.indexOf('<w:num ');
    numbering = numbering.slice(0, firstNum) + copy + numbering.slice(firstNum);
    numbering = numbering.replace('</w:numbering>', `<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num></w:numbering>`);
    return id;
  };

  // photos → media parts
  const photos = custom ? [] : await loadPhotos(await photosOf(e));
  let rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  let types = await zip.file('[Content_Types].xml')!.async('string');
  if (photos.length && !/Extension="jpeg"/.test(types)) types = types.replace('<Default Extension="xml"', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="xml"');
  const picRun = (i: number, w: number, h: number) => {
    const maxW = 5.6; const maxH = 4.6;
    const s = Math.min(maxW / w, maxH / h);
    const cx = Math.round(w * s * 360000); const cy = Math.round(h * s * 360000);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${7000 + i}" name="Photo ${i + 1}"/>`
      + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
      + `<pic:nvPicPr><pic:cNvPr id="${7000 + i}" name="photo${i + 1}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdEvPhoto${i}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };
  photos.forEach((p, i) => {
    zip.file(`word/media/evphoto${i}.jpeg`, p.data.split(',')[1] || '', { base64: true });
    rels = rels.replace('</Relationships>', `<Relationship Id="rIdEvPhoto${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/evphoto${i}.jpeg"/></Relationships>`);
  });

  const rows = custom ? custom.rows : reportRows(e, photos.map(p => ({ url: '', caption: p.caption })));   // photos are placed from the loaded list
  const built = rows.map(r => {
    if (r.kind === 'hod' || r.kind === 'principal') {
      const proto = r.kind === 'hod' ? P.hod : P.principal;
      if (!r.lines?.length && !r.stamp?.length) return proto;
      const c = cellsOf(proto);
      const keep = (cell: string) => (cell.match(PARA) || []).length;
      return withCells(proto, [c[0]!, c[1]!,
        setLines(c[2]!, [r.kind === 'hod' ? 'Recommendations:' : 'Remarks:', ...(r.lines || [])], keep(c[2]!)),
        setLines(c[3]!, ['Signature & Date:', '', '', ...(r.stamp || [])], keep(c[3]!))]);
    }
    if (r.kind === 'text') { const c = cellsOf(P.text); return withCells(P.text, [c[0]!, setLabel(c[1]!, r.label), setLines(c[2]!, r.lines)]); }
    if (r.kind === 'numbered') {
      const id = newList();
      const proto = P.numbered.replace(new RegExp(`<w:numId w:val="${listNum}"/>`, 'g'), `<w:numId w:val="${id}"/>`);
      const c = cellsOf(proto);
      return withCells(proto, [c[0]!, setLabel(c[1]!, r.label), setLines(c[2]!, r.items)]);
    }
    if (r.kind === 'ticks') {
      const proto = r.options === 'type' ? P.type : P.participants;
      const c = cellsOf(proto);
      return withCells(proto, [c[0]!, setLabel(c[1]!, r.label), tick(c[2]!, r.chosen, r.other)]);
    }
    if (r.kind === 'pair') { const c = cellsOf(P.pair); return withCells(P.pair, [c[0]!, setLabel(c[1]!, r.label), setLines(c[2]!, r.a), setLines(c[3]!, r.b)]); }
    if (r.kind === 'sign') { const c = cellsOf(P.sign); return withCells(P.sign, [c[0]!, setLabel(c[1]!, r.label), setLines(c[2]!, r.names, (c[2]!.match(PARA) || []).length)]); }
    // photos: two per line, captions underneath
    const c = cellsOf(P.text);
    const pPr = pPrOf((c[2]!.match(PARA) || [''])[0]!);
    let inner = '';
    for (let i = 0; i < photos.length; i += 2) {
      const pair = photos.slice(i, i + 2);
      inner += `<w:p>${pPr}${pair.map((p, j) => picRun(i + j, p.w, p.h)).join('<w:r><w:t xml:space="preserve">   </w:t></w:r>')}</w:p>`;
      const caps = pair.map((p, j) => (p.caption ? `Photo ${i + j + 1}: ${p.caption}` : '')).filter(Boolean).join('     ');
      if (caps) inner += para(pPr, caps);
    }
    const cell = c[2]!.replace(/(<\/w:tcPr>)[\s\S]*(<\/w:tc>)$/, `$1${inner || para(pPr, '')}$2`);
    return withCells(P.text, [c[0]!, setLabel(c[1]!, r.label), cell]);
  });
  const finalRows = built;

  const firstRow = doc.indexOf(tpl[0]!);
  const lastRow = tpl[tpl.length - 1]!;
  const end = doc.lastIndexOf(lastRow) + lastRow.length;
  doc = doc.slice(0, firstRow) + finalRows.join('') + doc.slice(end);
  doc = doc.replace(/DEPARTMENT EVENT PROPOSAL &amp; APPROVAL FORM/, esc(custom ? custom.title : title(e)));
  zip.file('word/document.xml', doc);
  zip.file('word/numbering.xml', numbering);
  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('[Content_Types].xml', types);

  for (const path of Object.keys(zip.files).filter(f => /^word\/header\d*\.xml$/.test(f))) {
    const h = await zip.file(path)!.async('string');
    const p = (h.match(PARA) || []).find(x => /Department of/.test(textOf(x)));
    if (p && e.department) zip.file(path, h.replace(p, para(pPrOf(p), `Department of ${e.department}`, true)));
  }
  const author = custom?.author || e.coordinators?.[0]?.name || e.submitted_by_name || 'RGMCET';
  const core = zip.file('docProps/core.xml');
  if (core) zip.file('docProps/core.xml', (await core.async('string'))
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, `<dc:creator>${esc(author)}</dc:creator>`)
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>`)
    .replace(/<dc:description>[\s\S]*?<\/dc:description>/, '<dc:description></dc:description>')
    .replace(/(<dcterms:modified[^>]*>)[\s\S]*?(<\/dcterms:modified>)/, `$1${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}$2`));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  saveAs(blob, custom ? `${custom.fileName}.docx` : fileName(e, 'docx'));
  return blob;
}

// ───────────────────────────── PDF ─────────────────────────────

export async function eventReportTablePdf(e: any, custom?: TabularDoc) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default as any;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(); const M = 15;
  const photos = custom ? [] : await loadPhotos(await photosOf(e));
  const rows = custom ? custom.rows : reportRows(e, photos.map(p => ({ url: '', caption: p.caption })));
  const NO = 11; const LABEL = 52; const VAL = W - 2 * M - NO - LABEL;
  const FONT = 'times'; const SIZE = 10.5;

  const header = () => {
    doc.setFont(FONT, 'bold'); doc.setFontSize(11.5); doc.setTextColor(0);
    doc.text('RGM College of Engineering and Technology (Autonomous), Nandyal', W / 2, 14, { align: 'center' });
    doc.text(`Department of ${e.department || ''}`, W / 2, 19.5, { align: 'center' });
  };

  // tick boxes laid out inside the details cell
  const tickLayout = (options: string[], chosen: string[], other?: string) => {
    doc.setFont(FONT, 'normal'); doc.setFontSize(SIZE);
    const items = options.map(o => ({ o, label: o === 'Other' ? `Other: ${other || '__________'}` : o, on: chosen.includes(o) }));
    const lines: typeof items[] = [[]]; let x = 0; const max = VAL - 4;
    for (const it of items) {
      const w = 3.4 + 1.4 + doc.getTextWidth(it.label) + 4;
      if (x + w > max && lines[lines.length - 1]!.length) { lines.push([]); x = 0; }
      lines[lines.length - 1]!.push(it); x += w;
    }
    return lines;
  };
  type Draw = { kind: 'ticks'; lines: ReturnType<typeof tickLayout> } | { kind: 'photos'; list: typeof photos };
  const draws = new Map<number, Draw>();
  const body: any[] = []; let n = 0;
  const label = (t: string) => ({ content: t, styles: { fontStyle: 'bold' } });
  for (const r of rows) {
    if (r.kind === 'hod' || r.kind === 'principal') {
      body.push([{ content: `${++n}.` }, label(r.kind === 'hod' ? 'Head of the Department' : 'Principal’s Approval'),
        { content: [r.kind === 'hod' ? 'Recommendations:' : 'Remarks:', ...(r.lines || [])].join('\n'), styles: { minCellHeight: 26, valign: 'top' } },
        { content: ['Signature & Date:', ...(r.stamp?.length ? ['', ...r.stamp] : [])].join('\n'), styles: { valign: 'top' } }]);
    } else if (r.kind === 'pair') {
      body.push([{ content: `${++n}.` }, label(r.label), { content: r.a.join('\n') }, { content: r.b.join('\n') }]);
    } else if (r.kind === 'ticks') {
      const lines = tickLayout(r.options === 'type' ? ER_TYPES : ER_PARTICIPANTS, r.chosen, r.other);
      draws.set(body.length, { kind: 'ticks', lines });
      body.push([{ content: `${++n}.` }, label(r.label), { content: '', colSpan: 2, styles: { minCellHeight: lines.length * 5.6 + 3 } }]);
    } else if (r.kind === 'photos') {
      for (let i = 0; i < photos.length; i += 2) {
        draws.set(body.length, { kind: 'photos', list: photos.slice(i, i + 2) });
        const caps = photos.slice(i, i + 2).some(p => p.caption);
        body.push([{ content: i === 0 ? `${++n}.` : '' }, i === 0 ? label(r.label) : '', { content: '', colSpan: 2, styles: { minCellHeight: caps ? 56 : 51 } }]);
      }
    } else {
      const lines = r.kind === 'text' ? r.lines : r.kind === 'numbered' ? r.items.map((x, i) => `${i + 1}. ${x}`) : [...r.names, '', ''];
      body.push([{ content: `${++n}.` }, label(r.label), { content: lines.join('\n'), colSpan: 2, styles: r.kind === 'sign' ? { minCellHeight: 20 } : {} }]);
    }
  }

  header();
  doc.setFont(FONT, 'bold'); doc.setFontSize(11.5);
  doc.text(custom ? custom.title : title(e), W / 2, 28, { align: 'center' });
  autoTable(doc, {
    // a row never splits across pages (photos and tick boxes are drawn inside their cell)
    startY: 32, margin: { left: M, right: M, top: 26, bottom: 16 }, theme: 'grid', body, rowPageBreak: 'avoid',
    columnStyles: { 0: { cellWidth: NO, halign: 'center' }, 1: { cellWidth: LABEL }, 2: { cellWidth: VAL / 2 }, 3: { cellWidth: VAL / 2 } },
    styles: { font: FONT, fontSize: SIZE, textColor: 0, lineColor: 0, lineWidth: 0.25, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, valign: 'middle', overflow: 'linebreak' },
    didDrawPage: () => header(),
    didDrawCell: (d: any) => {
      if (d.section !== 'body' || d.column.index !== 2) return;
      const draw = draws.get(d.row.index);
      if (!draw) return;
      if (draw.kind === 'ticks') {
        doc.setFont(FONT, 'normal'); doc.setFontSize(SIZE); doc.setDrawColor(0); doc.setLineWidth(0.25);
        let y = d.cell.y + 2.2;
        for (const line of draw.lines) {
          let x = d.cell.x + 2;
          for (const it of line) {
            doc.rect(x, y + 0.6, 3.2, 3.2);
            if (it.on) { doc.line(x + 0.5, y + 1.1, x + 2.7, y + 3.3); doc.line(x + 2.7, y + 1.1, x + 0.5, y + 3.3); }
            doc.text(it.label, x + 4.6, y + 3.4);
            x += 3.4 + 1.4 + doc.getTextWidth(it.label) + 4;
          }
          y += 5.6;
        }
      } else {
        const slot = (d.cell.width - 6) / 2; const maxH = 44;
        draw.list.forEach((p, i) => {
          const s = Math.min(slot / p.w, maxH / p.h); const w = p.w * s; const h = p.h * s;
          const x = d.cell.x + 2 + i * (slot + 2) + (slot - w) / 2; const y = d.cell.y + 2.5;
          try { doc.addImage(p.data, 'JPEG', x, y, w, h); } catch { /* skip a bad image */ }
          if (p.caption) {
            doc.setFont(FONT, 'italic'); doc.setFontSize(8.5);
            doc.text(doc.splitTextToSize(p.caption, slot)[0] || '', d.cell.x + 2 + i * (slot + 2) + slot / 2, y + maxH + 4.5, { align: 'center' });
          }
        });
      }
    },
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont(FONT, 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(`Page ${i} of ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }
  doc.save(custom ? `${custom.fileName}.pdf` : fileName(e, 'pdf'));
}
