import { ActivityType, ActivityLevel } from '../types';
import { calculateAcademicYear } from './facultyUtils';

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
  document_url: string;
  file_name: string;
  file_size: number;
  confidence: number;
  raw_ocr_text?: string;
}

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

/**
 * Helper to convert Month name to 2-digit month string (01-12)
 */
function monthNameToNum(monthStr: string): string {
  const months: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };
  const key = monthStr.toLowerCase().trim();
  return months[key] || '01';
}

/**
 * Standardize date to YYYY-MM-DD
 */
function formatIsoDate(year: number | string, month: number | string, day: number | string): string {
  const y = String(year).padStart(4, '20');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Read File as Data URL (Base64)
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Dynamically loads Tesseract.js from CDN if not already loaded in the window.
 */
let tesseractPromise: Promise<any> | null = null;
function loadTesseract(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (tesseractPromise) return tesseractPromise;

  tesseractPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="tesseract.min.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).Tesseract));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => {
      tesseractPromise = null;
      reject(new Error('Failed to load OCR engine from CDN'));
    };
    document.head.appendChild(script);
  });

  return tesseractPromise;
}

/**
 * Downscale image for fast OCR processing (keeps aspect ratio, max 1600px).
 * Runs OCR in ~1.5s instead of ~10s while retaining sharp text.
 */
async function downscaleImageForOcr(file: File): Promise<string | File> {
  if (typeof window === 'undefined') return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1600;
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } else {
        resolve(file);
      }
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

/**
 * Executes OCR on an image file in the browser with progress callbacks.
 */
export async function performClientOcr(
  file: File,
  onProgress?: (pct: number, stage: string) => void
): Promise<string> {
  try {
    onProgress?.(30, 'Loading OCR engine...');
    const Tesseract = await loadTesseract();
    if (!Tesseract) return '';

    onProgress?.(45, 'Optimizing certificate image...');
    const processedTarget = await downscaleImageForOcr(file);

    onProgress?.(60, 'Recognizing certificate text...');
    const worker = await Tesseract.createWorker('eng');
    const result = await worker.recognize(processedTarget);
    const text = result?.data?.text || '';
    await worker.terminate();

    onProgress?.(85, 'Extracting activity details...');
    return text;
  } catch (err) {
    console.warn('OCR processing skipped or timed out, relying on document metadata:', err);
    return '';
  }
}

/**
 * Extracts raw ASCII text from PDF binary string
 */
function extractAsciiFromPdfBinary(binaryStr: string): string {
  const textChunks: string[] = [];
  // Match text inside parentheses in PDF TJ or Tj operators: (some text) Tj
  const parenRegex = /\(([^()]{2,150})\)\s*T[jd]/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(binaryStr)) !== null) {
    const clean = match[1].replace(/\\([()\\])/g, '$1').trim();
    if (clean.length > 1) {
      textChunks.push(clean);
    }
  }

  // Also match BT ... ET blocks with text
  const btEtRegex = /BT[\s\S]*?ET/g;
  let btMatch: RegExpExecArray | null;
  while ((btMatch = btEtRegex.exec(binaryStr)) !== null) {
    const inner = btMatch[0];
    const words = inner.match(/\(([^\(\)]{2,100})\)/g);
    if (words) {
      words.forEach((w) => textChunks.push(w.slice(1, -1)));
    }
  }

  return textChunks.join(' ');
}

/**
 * Parses raw text & filename to extract structured conference / FDP attributes
 */
export function parseActivityText(rawText: string, fileName: string): Omit<ParsedActivityDocument, 'document_url' | 'file_name' | 'file_size'> {
  const cleanRaw = (rawText || '').replace(/[\r\n\t]+/g, ' ');
  const text = `${cleanRaw} ${fileName}`.replace(/[_\-\/\\]/g, ' ');

  // 1. Activity Type
  let type: ActivityType = 'FDP';
  if (/conference|symposium|ic[a-z]{2,5}|proceedings|conclave/i.test(text)) {
    type = 'Conference';
  } else if (/workshop|hands[\s-]?on|bootcamp|skill|training|sttp/i.test(text) && !/faculty development|fdp/i.test(text)) {
    type = 'Workshop';
  } else if (/fdp|faculty development|atal|pedagogy|teacher|instructional/i.test(text)) {
    type = 'FDP';
  }

  // 2. Activity Level
  let level: ActivityLevel = 'National';
  if (/international|ieee|acm|springer|elsevier|global|world/i.test(text)) {
    level = 'International';
  } else if (/state level|state government|apsche/i.test(text) && !/united states/i.test(text)) {
    level = 'State';
  } else {
    level = 'National';
  }

  // 3. Role: Attended vs Organized
  let role_type: 'Attended' | 'Organized' = 'Attended';
  if (/convenor|co-convenor|coordinator|co-coordinator|organized by me|organizing secretary|resource person|chair|keynote speaker|session chair/i.test(text)) {
    role_type = 'Organized';
  }

  // 4. Organizer
  let organizer = 'Department of CSE, RGMCET';
  const orgPatterns: [RegExp, string][] = [
    [/aicte|atal/i, 'AICTE Training and Learning (ATAL) Academy'],
    [/nitttr/i, 'NITTTR (National Institute of Technical Teachers Training & Research)'],
    [/iit\s+madras/i, 'IIT Madras'],
    [/iit\s+bombay/i, 'IIT Bombay'],
    [/iit\s+delhi/i, 'IIT Delhi'],
    [/iit\s+hyderabad/i, 'IIT Hyderabad'],
    [/iit\s+kharagpur/i, 'IIT Kharagpur'],
    [/iit\s+roorkee/i, 'IIT Roorkee'],
    [/nit\s+warangal/i, 'NIT Warangal'],
    [/nit\s+calicut/i, 'NIT Calicut'],
    [/nit\s+trichy/i, 'NIT Trichy'],
    [/nit\s+surathkal/i, 'NIT Surathkal'],
    [/ieee\s+hyderabad/i, 'IEEE Hyderabad Section'],
    [/ieee/i, 'IEEE Student Branch & Technical Chapters'],
    [/csi|computer\s+society\s+of\s+india/i, 'Computer Society of India (CSI)'],
    [/iste/i, 'Indian Society for Technical Education (ISTE)'],
    [/infosys|springboard/i, 'Infosys Springboard'],
    [/rgmcet|rajeev\s+gandhi/i, 'Department of CSE, RGMCET'],
    [/jntua|jntu\s+anantapur/i, 'JNTUA Ananthapuramu'],
    [/jntuh|jntu\s+hyderabad/i, 'JNTUH Hyderabad'],
  ];

  for (const [re, name] of orgPatterns) {
    if (re.test(text)) {
      organizer = name;
      break;
    }
  }

  // 5. Date and Duration Parsing
  const today = new Date();
  let fromDate = today.toISOString().split('T')[0];
  let toDate = fromDate;
  let parsedDays = 1;

  // Pattern 1: "14th to 18th July 2024" or "14th - 18th July 2024" or "14 - 18 July 2024"
  const p1 = /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-|–|—)\s*\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,\s]+(\d{4})\b/i;
  // Pattern 2: "14th July 2024 to 18th July 2024" or "14th July to 18th July 2024" or "14 July - 18 July 2024"
  const p2 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})(?:[,\s]+(\d{4}))?\s*(?:to|-|–|—)\s*\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,\s]+(\d{4})\b/i;
  // Pattern 3: "July 14, 2024 to July 18, 2024" or "July 14 to July 18, 2024" or "July 14-18, 2024"
  const p3 = /([A-Za-z]{3,9})\s+\b(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\s*(?:to|-|–|—)\s*(?:([A-Za-z]{3,9})\s*)?\b(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})\b/i;
  // Pattern 4: "14-07-2024 to 18-07-2024" or "14/07/2024 - 18/07/2024" or "14.07.2024 to 18.07.2024"
  const p4 = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\s*(?:to|-|–|—)\s*\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/i;
  // Pattern 5: Single Date "15th July 2024" or "July 15, 2024"
  const p5 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,\s]+(\d{4})\b/i;
  const p5b = /([A-Za-z]{3,9})\s+\b(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})\b/i;
  // Pattern 6: Single Numeric Date "15-07-2024" or "15/07/2024"
  const p6 = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/i;

  const m2 = text.match(p2);
  const m1 = text.match(p1);
  const m3 = text.match(p3);
  const m4 = text.match(p4);

  if (m2) {
    const sDay = parseInt(m2[1], 10);
    const sMon = monthNameToNum(m2[2]);
    const sYr = m2[3] ? parseInt(m2[3], 10) : undefined;
    const eDay = parseInt(m2[4], 10);
    const eMon = monthNameToNum(m2[5]);
    const eYr = parseInt(m2[6], 10);
    fromDate = formatIsoDate(sYr || eYr, sMon, sDay);
    toDate = formatIsoDate(eYr, eMon, eDay);
  } else if (m1) {
    const sDay = parseInt(m1[1], 10);
    const eDay = parseInt(m1[2], 10);
    const mon = monthNameToNum(m1[3]);
    const yr = parseInt(m1[4], 10);
    fromDate = formatIsoDate(yr, mon, sDay);
    toDate = formatIsoDate(yr, mon, eDay);
  } else if (m3) {
    const sMon = monthNameToNum(m3[1]);
    const sDay = parseInt(m3[2], 10);
    const sYr = m3[3] ? parseInt(m3[3], 10) : undefined;
    const eMon = m3[4] ? monthNameToNum(m3[4]) : sMon;
    const eDay = parseInt(m3[5], 10);
    const eYr = parseInt(m3[6], 10);
    fromDate = formatIsoDate(sYr || eYr, sMon, sDay);
    toDate = formatIsoDate(eYr, eMon, eDay);
  } else if (m4) {
    fromDate = formatIsoDate(m4[3], m4[2], m4[1]);
    toDate = formatIsoDate(m4[6], m4[5], m4[4]);
  } else {
    const sm5 = text.match(p5);
    const sm5b = text.match(p5b);
    const sm6 = text.match(p6);
    if (sm5) {
      const day = parseInt(sm5[1], 10);
      const mon = monthNameToNum(sm5[2]);
      const yr = parseInt(sm5[3], 10);
      fromDate = formatIsoDate(yr, mon, day);
      toDate = fromDate;
    } else if (sm5b) {
      const mon = monthNameToNum(sm5b[1]);
      const day = parseInt(sm5b[2], 10);
      const yr = parseInt(sm5b[3], 10);
      fromDate = formatIsoDate(yr, mon, day);
      toDate = fromDate;
    } else if (sm6) {
      fromDate = formatIsoDate(sm6[3], sm6[2], sm6[1]);
      toDate = fromDate;
    } else {
      const yearOnlyMatch = text.match(/\b(202[0-9])\b/);
      if (yearOnlyMatch) {
        fromDate = `${yearOnlyMatch[1]}-06-15`;
        toDate = fromDate;
      }
    }
  }

  // Explicit Duration detection (e.g. "5 Days", "5-Day", "One Week")
  const explicitDurationMatch = text.match(/(\d{1,2})\s*(?:day|days|day's|days')/i);
  if (explicitDurationMatch) {
    parsedDays = parseInt(explicitDurationMatch[1], 10);
  } else if (/one\s*week/i.test(text)) {
    parsedDays = 5;
  } else if (/two\s*weeks/i.test(text)) {
    parsedDays = 10;
  }

  // Adjust dates vs days
  const dStart = new Date(fromDate);
  const dEnd = new Date(toDate);
  if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime())) {
    // Swap if inverted (parsing artefact)
    if (dEnd < dStart) {
      [fromDate, toDate] = [toDate, fromDate];
      const calcDays = Math.round((dStart.getTime() - dEnd.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (calcDays > 1) parsedDays = calcDays;
    } else if (dEnd >= dStart) {
      const diffDays = Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 1) {
        parsedDays = diffDays;
      } else if (parsedDays > 1 && fromDate === toDate) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + (parsedDays - 1));
        toDate = d.toISOString().split('T')[0];
      }
    }
  }

  // 6. Title Extraction
  let title = '';
  const quotedTopic = text.match(/(?:titled|topic|on)\s+["“]([^"”\n\r]{8,120}?)["”]/i);
  const progTopic = text.match(/(?:FDP|Programme|Program|Workshop|Conference|Course|Symposium)\s+on\s+([^,\n\r]{8,120}?)(\s+(?:held|organized|conducted|from|during|at|by)|\.|\,|$)/i);
  const partTopic = text.match(/participated in\s+(?:the\s+)?(?:one week |5-day )?([^,\n\r]{8,120}?)(\s+(?:held|organized|conducted|from|during|at|by)|\.|\,|$)/i);

  if (quotedTopic && quotedTopic[1].trim().length > 5) {
    title = quotedTopic[1].trim();
  } else if (progTopic && progTopic[1].trim().length > 5) {
    title = progTopic[1].trim();
  } else if (partTopic && partTopic[1].trim().length > 5) {
    title = partTopic[1].trim();
  } else {
    const cleanFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[_\-\.]/g, ' ').trim();
    title = cleanFileName.length > 8 ? cleanFileName : `${type} on Advanced Computing & Emerging Technologies`;
  }

  title = title.replace(/\s+/g, ' ').trim();
  if (title.length < 50 && !new RegExp(type, 'i').test(title)) {
    title = `${type === 'FDP' ? 'Faculty Development Programme' : type} on ${title}`;
  }

  const academic_year = calculateAcademicYear(fromDate);

  return {
    title,
    type,
    role_type,
    level,
    organizer,
    date: fromDate,
    from_date: fromDate,
    to_date: toDate,
    no_of_days: parsedDays,
    academic_year,
    confidence: cleanRaw.length > 30 ? 0.95 : 0.75,
    raw_ocr_text: cleanRaw,
  };
}

/**
 * Main parser entry point: reads file, extracts text / OCR, and returns ParsedActivityDocument
 */
export async function parseUploadedActivityFile(
  file: File,
  onProgress?: (pct: number, stage: string) => void
): Promise<ParsedActivityDocument> {
  onProgress?.(15, 'Reading file...');
  const dataUrl = await readFileAsDataUrl(file);
  let rawText = '';

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);

  if (isImage) {
    try {
      rawText = await performClientOcr(file, onProgress);
    } catch {
      rawText = '';
    }
  } else if (isPdf) {
    try {
      onProgress?.(40, 'Scanning PDF structure...');
      const base64Data = dataUrl.split(',')[1];
      if (base64Data) {
        const binaryStr = atob(base64Data);
        rawText = extractAsciiFromPdfBinary(binaryStr);
      }
    } catch {
      rawText = '';
    }
  }

  onProgress?.(85, 'Analyzing extracted content...');
  const parsed = parseActivityText(rawText, file.name);

  return {
    ...parsed,
    document_url: dataUrl,
    file_name: file.name,
    file_size: file.size,
  };
}
