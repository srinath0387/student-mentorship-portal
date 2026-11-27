/**
 * Event requests — the department's pre-event forms filled into its own Word templates
 * (public/templates/event-request-permission.docx, event-request-budget.docx), so the download looks
 * exactly like the form faculty print today: ticks in the boxes, dates in the blanks, numbered lists.
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { listItems } from '../../components/common/NumberedListInput';

export const ER_TYPES = ['FDP', 'Workshop', 'Seminar', 'Guest Lecture', 'Industry Orientation', 'Training Program', 'Hands-on Session', 'Hackathon',
  'Competition', 'Technical Symposium', 'Industry Interaction', 'Alumni Interaction', 'Career Guidance', 'Research Orientation', 'Other'];
export const ER_PARTICIPANTS = ['Students', 'Faculty', 'Both', 'External Participants'];

export interface EventRequest {
  title: string; types: string[]; other_type: string;
  from_date: string; to_date: string; from_time: string; to_time: string;
  organizers: { name: string; designation: string; department: string }[];
  objectives: string; participants: string[]; target: string; expected_count: string;
  resource_persons: { name: string; designation: string; organization: string; contact: string }[]; experience: string;
  topics: string; venue: string; venue_from_date: string; venue_to_date: string; venue_from_time: string; venue_to_time: string;
  expected_outcomes: string; honorarium: string; travel: string; lodging: string;
}
export const emptyRequest = (name = '', department = ''): EventRequest => ({
  title: '', types: [], other_type: '', from_date: '', to_date: '', from_time: '', to_time: '',
  organizers: [{ name, designation: '', department }, { name: '', designation: '', department: '' }],
  objectives: '', participants: [], target: '', expected_count: '',
  resource_persons: [0, 1].map(() => ({ name: '', designation: '', organization: '', contact: '' })), experience: '',
  topics: '', venue: '', venue_from_date: '', venue_to_date: '', venue_from_time: '', venue_to_time: '',
  expected_outcomes: '', honorarium: '', travel: '', lodging: '',
});
export const normalizeRequest = (d: any): EventRequest => {
  const e = emptyRequest();
  const x = { ...e, ...(d || {}) };
  return {
    ...x,
    types: Array.isArray(x.types) ? x.types : [], participants: Array.isArray(x.participants) ? x.participants : [],
    organizers: [0, 1].map(i => ({ ...e.organizers[i], ...(x.organizers?.[i] || {}) })),
    resource_persons: [0, 1].map(i => ({ ...e.resource_persons[i], ...(x.resource_persons?.[i] || {}) })),
  };
};

// ── money ──
const n = (v: string) => Math.max(0, Math.round(Number(String(v || '').replace(/[^\d.]/g, '')) || 0));
export const budgetTotal = (r: EventRequest) => n(r.honorarium) + n(r.travel) + n(r.lodging);
export const rupees = (v: number) => `Rs. ${v.toLocaleString('en-IN')}/-`;
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (x: number) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ''}`);
const three = (x: number) => [x >= 100 ? `${ONES[Math.floor(x / 100)]} Hundred` : '', two(x % 100)].filter(Boolean).join(' ');
/** Indian numbering: 1,25,000 → "One Lakh Twenty Five Thousand" */
export function inWords(v: number): string {
  if (!v) return 'Zero';
  const crore = Math.floor(v / 1e7); const lakh = Math.floor((v % 1e7) / 1e5); const thousand = Math.floor((v % 1e5) / 1e3); const rest = v % 1e3;
  return [crore ? `${inWords(crore)} Crore` : '', lakh ? `${two(lakh)} Lakh` : '', thousand ? `${two(thousand)} Thousand` : '', three(rest)].filter(Boolean).join(' ');
}
export const totalLine = (r: EventRequest) => { const t = budgetTotal(r); return t ? `${rupees(t)} (Rupees ${inWords(t)} Only)` : ''; };

// ── Word XML helpers ──
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const PARA = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p\/>/g;
const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').replace(/&amp;/g, '&');
const pPrOf = (p: string) => p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
const runPrOf = (pPr: string) => pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '';
// values are written plain (some template cells carry bold on the empty paragraph mark)
const para = (pPr: string, text: string, bold = false) => {
  const rPr = bold ? runPrOf(pPr) : runPrOf(pPr).replace(/<w:b\/>|<w:bCs\/>/g, '');
  return `<w:p>${pPr}${text ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : ''}</w:p>`;
};
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);
const time12 = (hm: string) => {
  if (!/^\d{2}:\d{2}$/.test(hm)) return hm;
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Replace a cell's paragraphs with one paragraph per line, in the cell's own paragraph style. `minParas` keeps blank lines (signature space). */
function setLines(cell: string, lines: string[], minParas = 0): string {
  const paras = cell.match(PARA) || [];
  const first = paras[0]; const last = paras[paras.length - 1];
  if (!first || !last || !lines.filter(Boolean).length) return cell;
  const pPr = pPrOf(first);
  const out = lines.map(l => para(pPr, l));
  while (out.length < minParas) out.push(para(pPr, ''));
  const start = cell.indexOf(first);
  const end = cell.lastIndexOf(last) + last.length;
  return cell.slice(0, start) + out.join('') + cell.slice(end);
}
/** "Dates:" / "Time:" cells — the second paragraph becomes "From … To …" */
function setFromTo(cell: string, from: string, to: string): string {
  if (!from && !to) return cell;
  const paras = cell.match(PARA) || [];
  const target = paras[1] || paras[0];
  if (!target) return cell;
  return cell.replace(target, para(pPrOf(target), `From ${from || '—'}${to ? ` To ${to}` : ''}`));
}
/** Tick the chosen boxes; fill the "Other: ____" blank */
function tick(cell: string, chosen: string[], other = ''): string {
  let out = cell.replace(/(<w:t(?:\s[^>]*)?>)☐(<\/w:t>[\s\S]*?<w:t(?:\s[^>]*)?>)([^<]*)/g, (m, a, b, label: string) => {
    const name = label.replace(/:.*$/, '').trim();
    return chosen.some(c => c.toLowerCase() === name.toLowerCase()) ? `${a}☒${b}${label}` : m;
  });
  if (other && chosen.includes('Other')) out = out.replace(/(Other:\s*)_{3,}/, `$1${esc(other)}`);
  return out;
}

const joinPerson = (p: Record<string, string>, keys: string[]) => keys.map(k => p[k]).filter(Boolean).join(', ');

async function buildDoc(kind: 'permission' | 'budget', r: EventRequest, department: string, author: string): Promise<Blob> {
  const res = await fetch(`/templates/event-request-${kind}.docx`);
  if (!res.ok) throw new Error('Could not load the Word template');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  let doc = await zip.file('word/document.xml')!.async('string');

  // Work on rows and cells by position: several rows (and cells) have identical XML, so never replace by content
  const ROW = /<w:tr[ >][\s\S]*?<\/w:tr>/g; const CELL = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const rows = doc.match(ROW) || [];
  const cellsOf = (row: string) => row.match(CELL) || [];
  const withCells = (row: string, cells: string[]) => { let j = 0; return row.replace(CELL, () => cells[j++]); };
  const out = [...rows];
  let organizerRow = 0;
  const venueFrom = r.venue_from_date || r.from_date; const venueTo = r.venue_to_date || r.to_date;
  const venueTF = r.venue_from_time || r.from_time; const venueTT = r.venue_to_time || r.to_time;
  rows.forEach((row, i) => {
    const cells = cellsOf(row);
    if (cells.length < 3) return;
    const label = textOf(cells[1]).replace(/\s+/g, ' ').trim().toLowerCase();
    const next = [...cells];
    const put = (c: number, v: string) => { next[c] = setLines(cells[c], [v]); };
    if (label === 'name of the event') put(2, r.title);
    else if (label === 'event type') next[2] = tick(cells[2], r.types, r.other_type);
    else if (label === 'proposed date(s), time') {
      next[2] = setFromTo(cells[2], dmy(r.from_date), dmy(r.to_date));
      if (cells[3]) next[3] = setFromTo(cells[3], time12(r.from_time), time12(r.to_time));
    } else if (label === 'faculty organizer name, designation, department') {
      put(2, joinPerson(r.organizers[organizerRow] || ({} as any), ['name', 'designation', 'department'])); organizerRow++;
    } else if (label === 'objective(s) of the event') next[2] = setLines(cells[2], listItems(r.objectives));
    else if (label === 'target participants') next[2] = tick(cells[2], r.participants);
    else if (label === 'target year, branch, dept.') put(2, r.target);
    else if (label === 'expected no. of participants') put(2, r.expected_count);
    else if (label === 'resource person 1 details') put(2, joinPerson(r.resource_persons[0] as any, ['name', 'designation', 'organization', 'contact']));
    else if (label === 'resource person 2 details') put(2, joinPerson(r.resource_persons[1] as any, ['name', 'designation', 'organization', 'contact']));
    else if (label === 'total professional experience in years') put(2, r.experience);
    else if (label === 'proposed topic(s)') next[2] = setLines(cells[2], r.topics.split('\n').map(x => x.trim()).filter(Boolean));
    else if (label === 'venue requested') put(2, r.venue);
    else if (label === 'venue required date(s), time') {
      next[2] = setFromTo(cells[2], dmy(venueFrom), dmy(venueTo));
      if (cells[3]) next[3] = setFromTo(cells[3], time12(venueTF), time12(venueTT));
    } else if (label === 'expected outcomes') next[2] = setLines(cells[2], listItems(r.expected_outcomes));
    else if (label === 'honorarium' && rows[i + 1]) {
      // the amounts go in the row under Honorarium | Travel | Lodging and Boarding
      const vals = [r.honorarium, r.travel, r.lodging].map(v => (n(v) ? rupees(n(v)) : ''));
      const amt = cellsOf(rows[i + 1]).map((c, j) => (j >= 1 && j <= 3 && vals[j - 1] ? setLines(c, [vals[j - 1]]) : c));
      out[i + 1] = withCells(rows[i + 1], amt);
    } else if (label === 'total budget requested (rs), in words') put(2, totalLine(r));
    else if (label === 'event organizer name(s) and signature(s)') {
      next[2] = setLines(cells[2], r.organizers.map(o => o.name).filter(Boolean), (cells[2].match(PARA) || []).length);
    }
    if (next.some((c, j) => c !== cells[j])) out[i] = withCells(row, next);
  });
  let k = 0;
  doc = doc.replace(ROW, () => out[k++]);
  zip.file('word/document.xml', doc);

  // Header: "Department of …" for the requesting department
  for (const path of Object.keys(zip.files).filter(f => /^word\/header\d*\.xml$/.test(f))) {
    const h = await zip.file(path)!.async('string');
    const p = (h.match(PARA) || []).find(x => /Department of/.test(textOf(x)));
    if (p && department) zip.file(path, h.replace(p, para(pPrOf(p), `Department of ${department}`, true)));
  }
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = zip.file('docProps/core.xml');
  if (core) zip.file('docProps/core.xml', (await core.async('string'))
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, `<dc:creator>${esc(author)}</dc:creator>`)
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>`)
    .replace(/<dc:description>[\s\S]*?<\/dc:description>/, '<dc:description></dc:description>')
    .replace(/(<dcterms:modified[^>]*>)[\s\S]*?(<\/dcterms:modified>)/, `$1${now}$2`));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export const requestFileName = (kind: 'permission' | 'budget', r: EventRequest) =>
  `Event Request - ${kind === 'permission' ? 'Permission & Venue' : 'Budget'} - ${r.title || 'Event'}${r.from_date ? ` - ${dmy(r.from_date)}` : ''}.docx`.replace(/[^A-Za-z0-9._ ()&-]+/g, '_');

export const buildRequestDoc = buildDoc;
export async function downloadRequestDoc(kind: 'permission' | 'budget', r: EventRequest, department: string, author: string) {
  saveAs(await buildDoc(kind, r, department, author), requestFileName(kind, r));
}

/** Map a request onto the event report form, for "write the report" after the event */
export function reportPrefill(r: EventRequest, department: string): Record<string, any> {
  const TYPE: Record<string, string> = {
    FDP: 'Faculty Development Programme (FDP)', Workshop: 'Workshop', 'Hands-on Session': 'Workshop', Seminar: 'Seminar', 'Guest Lecture': 'Guest Lecture',
    'Training Program': 'Training Programme', Hackathon: 'Hackathon', 'Technical Symposium': 'Conference',
  };
  const t = r.types.find(x => TYPE[x]);
  return {
    title: r.title, event_type: t ? TYPE[t] : 'Other', start_date: r.from_date || undefined, end_date: r.to_date || r.from_date || undefined,
    venue: r.venue, mode: 'Offline', organized_by: department ? `Department of ${department}` : '', participation: 'organized',
    coordinators: r.organizers.filter(o => o.name).map(o => ({ name: o.name, designation: o.designation, email: '' })),
    resource_persons: r.resource_persons.filter(p => p.name).map(p => ({ name: p.name, designation: p.designation, organization: p.organization, topic: r.topics.split('\n')[0] || '' })),
    target_audience: [r.participants.join(', '), r.target].filter(Boolean).join(' — '),
    objectives: r.objectives, expected_outcomes: r.expected_outcomes, budget: budgetTotal(r) ? String(budgetTotal(r)) : '',
  };
}
