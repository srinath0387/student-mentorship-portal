import { ActivityType, ActivityLevel } from '../types';
import { calculateAcademicYear } from './facultyUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Faculty document parsing (FDP / workshop / conference certificates and
// industry / NPTEL certifications).
//
// Text extraction:
//   • PDF with a text layer → pdf.js text content (first 3 pages)
//   • Scanned PDF (no text layer) → page 1 rendered to a canvas → Tesseract OCR
//   • Image → Tesseract OCR
// Field extraction is heuristic; every field stays editable in the form, and a
// field we cannot find is left blank rather than filled with a guess.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedActivityDocument {
  title: string;
  type: ActivityType;
  role_type: 'Attended' | 'Organized';
  level: ActivityLevel;
  organizer: string;
  date: string;
  from_date: string;
  to_date: string;
  no_of_days: number;
  academic_year: string;
  file_name: string;
  file_size: number;
  confidence: number;
  /** True when a date was actually found in the document (otherwise today's date is a placeholder) */
  date_found: boolean;
  raw_ocr_text?: string;
}

export interface ParsedCertificationDocument {
  title: string;
  issuing_body: string;
  completion_date: string;
  academic_year: string;
  date_found: boolean;
  raw_ocr_text?: string;
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB — files go straight to S3

/**
 * Calculates number of days between two dates inclusive.
 * e.g., 2024-07-14 to 2024-07-18 => 5 days
 */
export function calculateDaysBetween(fromDateStr: string, toDateStr: string): number {
  if (!fromDateStr) return 1;
  if (!toDateStr || fromDateStr === toDateStr) return 1;

  const start = new Date(fromDateStr);
  const end = new Date(toDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
  if (end < start) return 1;

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

/** Read File as Data URL (Base64) */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// ── Text extraction ──────────────────────────────────────────────────────────

type ProgressFn = (pct: number, stage: string) => void;

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let tesseractPromise: Promise<any> | null = null;
function loadTesseract(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (tesseractPromise) return tesseractPromise;

  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_SRC;
    script.async = true;
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => {
      tesseractPromise = null;
      reject(new Error('Failed to load OCR engine'));
    };
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

// One OCR worker reused across uploads (creating a worker re-downloads language data each time)
let ocrWorkerPromise: Promise<any> | null = null;
async function getOcrWorker(): Promise<any> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const Tesseract = await loadTesseract();
      if (!Tesseract) throw new Error('OCR engine unavailable');
      return Tesseract.createWorker('eng');
    })().catch((err) => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

/**
 * Prepare an image for OCR: grayscale, and scale so the long edge is ~2000px.
 * Small, low-resolution certificate photos are upscaled (Tesseract needs ~20px+ glyphs);
 * huge camera photos are downscaled for speed.
 */
function prepareCanvasForOcr(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const target = 2000;
  const scale = Math.min(3, target / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'grayscale(1) contrast(1.25)';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function ocrCanvas(canvas: HTMLCanvasElement, onProgress?: ProgressFn): Promise<string> {
  onProgress?.(55, 'Loading OCR engine...');
  const worker = await getOcrWorker();
  onProgress?.(65, 'Recognizing text...');
  const result = await worker.recognize(canvas);
  return result?.data?.text || '';
}

/** OCR an image file in the browser. */
export async function performClientOcr(file: File, onProgress?: ProgressFn): Promise<string> {
  try {
    onProgress?.(35, 'Preparing image...');
    const img = await loadImage(file);
    const canvas = prepareCanvasForOcr(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
    return await ocrCanvas(canvas, onProgress);
  } catch (err) {
    console.warn('[OCR] image recognition failed:', err);
    return '';
  }
}

let pdfjsPromise: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      // Vite bundles this worker as a .js asset (served with a JavaScript MIME type from S3/CloudFront)
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
          { type: 'module' },
        );
      }
      return pdfjs;
    }).catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

/** Extract text from a PDF; falls back to OCR of page 1 for scanned PDFs. */
export async function extractPdfText(file: File, onProgress?: ProgressFn): Promise<string> {
  try {
    onProgress?.(30, 'Reading PDF...');
    const pdfjs = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

    const pages = Math.min(doc.numPages, 3);
    const parts: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join(' '));
    }
    const text = parts.join('\n').replace(/\s+/g, ' ').trim();
    if (text.replace(/[^A-Za-z]/g, '').length >= 40) {
      await doc.destroy();
      return text;
    }

    // Scanned certificate: no usable text layer → render page 1 and OCR it
    onProgress?.(45, 'Scanned PDF detected — running OCR...');
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = Math.round(viewport.width);
    pageCanvas.height = Math.round(viewport.height);
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) return text;
    await page.render({ canvasContext: ctx, viewport }).promise;
    await doc.destroy();
    const ocrReady = prepareCanvasForOcr(pageCanvas, pageCanvas.width, pageCanvas.height);
    const ocrText = await ocrCanvas(ocrReady, onProgress);
    return `${text} ${ocrText}`.trim();
  } catch (err) {
    console.warn('[OCR] PDF text extraction failed:', err);
    return '';
  }
}

/** Extract raw text from an uploaded PDF or image. */
export async function extractDocumentText(file: File, onProgress?: ProgressFn): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
  if (isPdf) return extractPdfText(file, onProgress);
  if (isImage) return performClientOcr(file, onProgress);
  return '';
}

// ── Date extraction ──────────────────────────────────────────────────────────

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(?:st|nd|rd|th)?';
const SEP = '\\s*(?:to|till|until|-|–|—|&|and)\\s*';

function monthNum(m: string): number {
  const key = m.toLowerCase().slice(0, 3);
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key) + 1;
}

function iso(y: number, m: number, d: number): string | null {
  const maxYear = new Date().getFullYear() + 1;
  if (y < 100) y += 2000;
  if (y < 1990 || y > maxYear || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Finds a date range (or single date) in free text. Returns null when nothing valid is found. */
export function extractDateRange(text: string): { from: string; to: string } | null {
  const t = text.replace(/\s+/g, ' ');
  const tries: [RegExp, (m: RegExpMatchArray) => [string | null, string | null]][] = [
    // 14th July 2024 to 18th July 2024 / 14 July - 18 Aug 2024
    [new RegExp(`\\b(\\d{1,2})${ORD}\\s+${MONTH},?\\s*(\\d{4})?${SEP}(\\d{1,2})${ORD}\\s+${MONTH},?\\s*(\\d{4})\\b`, 'i'),
      (m) => [iso(+(m[3] || m[6]), monthNum(m[2]), +m[1]), iso(+m[6], monthNum(m[5]), +m[4])]],
    // 14th to 18th July 2024 / 14-18 July 2024
    [new RegExp(`\\b(\\d{1,2})${ORD}${SEP}(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH},?\\s*(\\d{4})\\b`, 'i'),
      (m) => [iso(+m[4], monthNum(m[3]), +m[1]), iso(+m[4], monthNum(m[3]), +m[2])]],
    // July 14, 2024 to July 18, 2024 / July 14-18, 2024 / July 14 to Aug 2, 2024
    [new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD},?\\s*(\\d{4})?${SEP}(?:${MONTH}\\s+)?(\\d{1,2})${ORD},?\\s*(\\d{4})\\b`, 'i'),
      (m) => [iso(+(m[3] || m[6]), monthNum(m[1]), +m[2]), iso(+m[6], monthNum(m[4] || m[1]), +m[5])]],
    // 14-07-2024 to 18-07-2024 (Indian day-first)
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*(?:to|till|-|–|—)\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/i,
      (m) => [iso(+m[3], +m[2], +m[1]), iso(+m[6], +m[5], +m[4])]],
    // 2024-07-14 to 2024-07-18
    [/\b(\d{4})-(\d{2})-(\d{2})\s*(?:to|-|–)\s*(\d{4})-(\d{2})-(\d{2})\b/,
      (m) => [iso(+m[1], +m[2], +m[3]), iso(+m[4], +m[5], +m[6])]],
  ];
  for (const [re, fn] of tries) {
    const m = t.match(re);
    if (m) {
      const [from, to] = fn(m);
      if (from && to) return from <= to ? { from, to } : { from: to, to: from };
    }
  }

  const singles: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH},?\\s*(\\d{4})\\b`, 'i'), (m) => iso(+m[3], monthNum(m[2]), +m[1])],
    [new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD},?\\s*(\\d{4})\\b`, 'i'), (m) => iso(+m[3], monthNum(m[1]), +m[2])],
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/, (m) => iso(+m[3], +m[2], +m[1])],
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => iso(+m[1], +m[2], +m[3])],
  ];
  for (const [re, fn] of singles) {
    const m = t.match(re);
    if (m) {
      const d = fn(m);
      if (d) return { from: d, to: d };
    }
  }
  return null;
}

// ── Field extraction helpers ─────────────────────────────────────────────────

const KNOWN_ORGANIZERS: [RegExp, string][] = [
  [/\batal\b|aicte training and learning/i, 'AICTE Training and Learning (ATAL) Academy'],
  [/\baicte\b/i, 'AICTE'],
  [/nitttr/i, 'NITTTR'],
  [/\biit\s+(madras|bombay|delhi|hyderabad|kharagpur|roorkee|kanpur|guwahati|tirupati)\b/i, 'IIT $1'],
  [/\bnit\s+(warangal|calicut|trichy|tiruchirappalli|surathkal|andhra pradesh)\b/i, 'NIT $1'],
  [/\bnptel\b|\bswayam\b/i, 'NPTEL'],
  [/computer\s+society\s+of\s+india|\bcsi\b/i, 'Computer Society of India (CSI)'],
  [/\biste\b/i, 'Indian Society for Technical Education (ISTE)'],
  [/infosys\s+springboard/i, 'Infosys Springboard'],
  [/\bjntua\b|jntu\s+anantapur/i, 'JNTUA Ananthapuramu'],
  [/\bjntuh\b|jntu\s+hyderabad/i, 'JNTUH Hyderabad'],
  [/\bjntuk\b|jntu\s+kakinada/i, 'JNTUK Kakinada'],
];

function titleCase(s: string): string {
  return s.replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
}

function cleanPhrase(s: string): string {
  return s.replace(/["“”'‘’]/g, '').replace(/\s+/g, ' ').replace(/[\s,.:;-]+$/, '').trim();
}

function extractOrganizer(text: string): string {
  const explicit = text.match(/\b(?:organi[sz]ed|conducted|hosted|offered)\s+by\s+(?:the\s+)?([A-Z][A-Za-z&.,()\s]{4,110}?)(?=\s+(?:from|during|on|held|at|in\s+association|in\s+collaboration|between)\b|\.\s|[;\n]|\.?$)/);
  if (explicit) {
    const org = cleanPhrase(explicit[1]);
    if (org.length >= 4) return org;
  }
  for (const [re, name] of KNOWN_ORGANIZERS) {
    const m = text.match(re);
    if (m) return name.includes('$1') ? name.replace('$1', titleCase(m[1])) : name;
  }
  if (/rgmcet|rajeev\s+gandhi\s+memorial/i.test(text)) return 'RGMCET';
  return '';
}

const TITLE_STOP = '(?=\\s+(?:held|organi[sz]ed|conducted|from|during|between|at|by|on\\s+\\d|in\\s+association|w\\.?e\\.?f|with\\s+(?:a\\s+)?(?:consolidated|score|grade|marks|distinction))\\b|[.,;\\n]|$)';

function extractTitle(text: string, fileName: string, fallbackLabel: string): string {
  const patterns = [
    /(?:titled|entitled|topic)\s*[:\-]?\s*["“]([^"”]{6,140})["”]/i,
    new RegExp(`(?:programme|program|fdp|workshop|conference|course|symposium|seminar|webinar|sttp|bootcamp|training)\\s+on\\s+["“]?(.{6,140}?)["”]?${TITLE_STOP}`, 'i'),
    new RegExp(`(?:participated|participation)\\s+in\\s+(?:the\\s+|a\\s+)?(.{6,140}?)${TITLE_STOP}`, 'i'),
    new RegExp(`(?:successfully\\s+)?(?:completed|completing|attended|attending)\\s+(?:the\\s+|a\\s+)?(?:online\\s+)?(?:course|programme|program)?\\s*(?:on|in|titled)?\\s*["“]?(.{6,140}?)["”]?${TITLE_STOP}`, 'i'),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const t = cleanPhrase(m[1]);
      if (t.length >= 6 && /[a-z]/i.test(t)) return t;
    }
  }
  const fromName = fileName.replace(/\.[^/.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (fromName.length >= 8 && !/^(img|image|scan|doc|document|certificate|cert|whatsapp|pdf)?[\s\d]*$/i.test(fromName)) {
    return fromName;
  }
  return fallbackLabel;
}

// ── Activity (FDP / workshop / conference) parsing ───────────────────────────

/**
 * Parses extracted text & filename into structured FDP / workshop / conference fields.
 */
export function parseActivityText(rawText: string, fileName: string): Omit<ParsedActivityDocument, 'file_name' | 'file_size'> {
  const cleanRaw = (rawText || '').replace(/[\r\t]+/g, ' ').replace(/[ ]{2,}/g, ' ');
  const text = `${cleanRaw}\n${fileName.replace(/[_\-]/g, ' ')}`;

  // 1. Activity Type
  let type: ActivityType = 'FDP';
  if (/conference|symposium|proceedings|conclave/i.test(text)) {
    type = 'Conference';
  } else if (/faculty development|\bfdp\b|\batal\b|pedagogy/i.test(text)) {
    type = 'FDP';
  } else if (/workshop|hands[\s-]?on|bootcamp|\bsttp\b|short term training|seminar|webinar/i.test(text)) {
    type = 'Workshop';
  }

  // 2. Level
  let level: ActivityLevel = 'National';
  if (/\binternational\b|\bieee\b|\bacm\b|springer|elsevier/i.test(text)) level = 'International';
  else if (/\bstate[\s-]level\b|\bapsche\b|state government/i.test(text)) level = 'State';

  // 3. Role
  const role_type: 'Attended' | 'Organized' =
    /\b(?:convenor|co-convenor|coordinator|co-coordinator|organizing secretary|organising secretary|resource person|session chair|keynote speaker)\b/i.test(text)
      ? 'Organized' : 'Attended';

  // 4. Organizer — blank when not found (user fills it in)
  const organizer = extractOrganizer(cleanRaw);

  // 5. Dates & duration
  const range = extractDateRange(cleanRaw) || extractDateRange(fileName.replace(/[_]/g, ' '));
  const today = new Date().toISOString().split('T')[0];
  let fromDate = range?.from || today;
  let toDate = range?.to || fromDate;
  let days = calculateDaysBetween(fromDate, toDate);

  const durationMatch = cleanRaw.match(/\b(\d{1,2})\s*[- ]?\s*days?\b/i)
    || (/\bone[\s-]week\b/i.test(cleanRaw) ? ['', '5'] : null)
    || (/\btwo[\s-]weeks?\b/i.test(cleanRaw) ? ['', '10'] : null);
  if (durationMatch) {
    const stated = parseInt(durationMatch[1], 10);
    if (stated > 0 && stated <= 60 && days === 1 && range) {
      // Only a start date was found — extend by the stated duration
      const end = new Date(fromDate);
      end.setDate(end.getDate() + stated - 1);
      toDate = end.toISOString().split('T')[0];
      days = stated;
    } else if (stated > 0 && stated <= 60 && !range) {
      days = stated;
    }
  }

  // 6. Title
  const fallback = type === 'FDP' ? 'Faculty Development Programme' : type;
  let title = extractTitle(cleanRaw, fileName, '');
  if (!title) title = fallback;
  else if (title.length < 60 && !/fdp|faculty development|workshop|conference|symposium|seminar|webinar|programme|program|course|training/i.test(title)) {
    title = `${type === 'FDP' ? 'FDP' : type} on ${title}`;
  }

  const found = [range ? 1 : 0, organizer ? 1 : 0, title !== fallback ? 1 : 0].reduce((a, b) => a + b, 0);
  const confidence = cleanRaw.trim().length < 30 ? 0.3 : 0.5 + found * 0.15;

  return {
    title,
    type,
    role_type,
    level,
    organizer,
    date: fromDate,
    from_date: fromDate,
    to_date: toDate,
    no_of_days: days,
    academic_year: calculateAcademicYear(fromDate),
    confidence: Math.min(0.95, confidence),
    date_found: !!range,
    raw_ocr_text: cleanRaw,
  };
}

// ── Certification (NPTEL / industry) parsing ─────────────────────────────────

const CERT_ISSUERS: [RegExp, string][] = [
  [/\bnptel\b|\bswayam\b/i, 'NPTEL'],
  [/amazon web services|\baws\b/i, 'Amazon Web Services (AWS)'],
  [/microsoft|\bazure\b/i, 'Microsoft'],
  [/google cloud|\bgcp\b/i, 'Google Cloud'],
  [/\bgoogle\b/i, 'Google'],
  [/\boracle\b/i, 'Oracle'],
  [/\bcisco\b|networking academy/i, 'Cisco'],
  [/\bibm\b/i, 'IBM'],
  [/red\s*hat/i, 'Red Hat'],
  [/salesforce/i, 'Salesforce'],
  [/coursera/i, 'Coursera'],
  [/\budemy\b/i, 'Udemy'],
  [/\bedx\b/i, 'edX'],
  [/infosys\s+springboard/i, 'Infosys Springboard'],
  [/linkedin\s+learning/i, 'LinkedIn Learning'],
  [/great\s*learning/i, 'Great Learning'],
  [/nitttr/i, 'NITTTR'],
  [/\batal\b|aicte/i, 'AICTE'],
];

export function parseCertificationText(rawText: string, fileName: string): ParsedCertificationDocument {
  const cleanRaw = (rawText || '').replace(/[\r\t]+/g, ' ').replace(/[ ]{2,}/g, ' ');
  const corpus = `${cleanRaw} ${fileName.replace(/[_\-]/g, ' ')}`;

  let issuing_body = '';
  for (const [re, name] of CERT_ISSUERS) {
    if (re.test(corpus)) { issuing_body = name; break; }
  }
  if (!issuing_body) {
    const by = cleanRaw.match(/\b(?:issued|offered|awarded)\s+by\s+([A-Z][A-Za-z&.\s]{2,60}?)(?=[.,;\n]|\s+on\b|$)/);
    if (by) issuing_body = cleanPhrase(by[1]);
  }

  // Vendor credentials: "AWS Certified Cloud Practitioner", "Oracle Certified Associate, Java SE 8"
  const certified = cleanRaw.match(/\b((?:[A-Z][A-Za-z]*\s+){0,3}Certified\s+[A-Za-z][A-Za-z0-9 \-–&]{3,80}?)(?=\s+(?:issue|issued|date|valid|expir|validation|credential|this|awarded)\b|[.,;\n]|$)/);
  const title = certified ? cleanPhrase(certified[1]) : extractTitle(cleanRaw, fileName, '');

  // Completion date: the end of a range (course period) or the single date on the certificate
  const range = extractDateRange(cleanRaw) || extractDateRange(fileName.replace(/[_]/g, ' '));
  let completion = range?.to || '';
  if (!range) {
    const monthYear = cleanRaw.match(new RegExp(`\\b${MONTH}[\\s,\\-]+(\\d{4})\\b`, 'i')); // e.g. "Jul-Oct 2024", "October 2024"
    if (monthYear) completion = iso(+monthYear[2], monthNum(monthYear[1]), 1) || '';
  }
  const completion_date = completion || new Date().toISOString().split('T')[0];

  return {
    title,
    issuing_body,
    completion_date,
    academic_year: calculateAcademicYear(completion_date),
    date_found: !!completion,
    raw_ocr_text: cleanRaw,
  };
}

/**
 * Main entry point for FDP / workshop / conference documents.
 */
export async function parseUploadedActivityFile(file: File, onProgress?: ProgressFn): Promise<ParsedActivityDocument> {
  onProgress?.(15, 'Reading file...');
  const rawText = await extractDocumentText(file, onProgress);
  onProgress?.(90, 'Extracting details...');
  return { ...parseActivityText(rawText, file.name), file_name: file.name, file_size: file.size };
}

/** Main entry point for certification documents. */
export async function parseUploadedCertificationFile(file: File, onProgress?: ProgressFn): Promise<ParsedCertificationDocument> {
  onProgress?.(15, 'Reading file...');
  const rawText = await extractDocumentText(file, onProgress);
  onProgress?.(90, 'Extracting details...');
  return parseCertificationText(rawText, file.name);
}
