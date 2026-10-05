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
  const text = `${rawText} ${fileName}`.replace(/[_\-\/\\]/g, ' ');

  // 1. Activity Type
  let type: ActivityType = 'FDP';
  if (/conference|symposium|ic[a-z]{2,5}|proceedings/i.test(text)) {
    type = 'Conference';
  } else if (/workshop|hands[\s-]?on|bootcamp|skill|training/i.test(text) && !/faculty development|fdp/i.test(text)) {
    type = 'Workshop';
  } else if (/fdp|faculty development|atal|pedagogy|teacher/i.test(text)) {
    type = 'FDP';
  }

  // 2. Activity Level
  let level: ActivityLevel = 'National';
  if (/international|ieee|acm|springer|elsevier|global|world/i.test(text)) {
    level = 'International';
  } else if (/state level|state/i.test(text) && !/united states/i.test(text)) {
    level = 'State';
  } else {
    level = 'National';
  }

  // 3. Role: Attended vs Organized
  let role_type: 'Attended' | 'Organized' = 'Attended';
  if (/convenor|co-convenor|coordinator|co-coordinator|organized by me|organizing secretary|resource person|chair|keynote speaker/i.test(text)) {
    role_type = 'Organized';
  }

  // 4. Organizer
  let organizer = 'RGMCET';
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

  // Pattern A: "14th to 18th July 2024" or "14th - 18th July 2024" or "14 - 18 July 2024"
  const rangeWithMonthRegex = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})/i;
  const matchRange = text.match(rangeWithMonthRegex);

  // Pattern B: "July 14 to July 18, 2024" or "July 14-18, 2024"
  const monthFirstRangeRegex = /([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-)\s*(?:[A-Za-z]{3,9}\s*)?(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i;
  const matchMonthFirst = text.match(monthFirstRangeRegex);

  // Pattern C: "14-07-2024 to 18-07-2024" or "14/07/2024 - 18/07/2024"
  const numRangeRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\s*(?:to|-)\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i;
  const matchNumRange = text.match(numRangeRegex);

  // Pattern D: Explicit duration like "5 Days", "5-day", "One Week"
  const explicitDurationRegex = /(\d{1,2})\s*(?:day|days|day's)/i;
  const matchExplicitDays = text.match(explicitDurationRegex);

  if (matchRange) {
    const startDay = parseInt(matchRange[1], 10);
    const endDay = parseInt(matchRange[2], 10);
    const month = monthNameToNum(matchRange[3]);
    const year = parseInt(matchRange[4], 10);
    fromDate = formatIsoDate(year, month, startDay);
    toDate = formatIsoDate(year, month, endDay);
    parsedDays = calculateDaysBetween(fromDate, toDate);
  } else if (matchMonthFirst) {
    const month = monthNameToNum(matchMonthFirst[1]);
    const startDay = parseInt(matchMonthFirst[2], 10);
    const endDay = parseInt(matchMonthFirst[3], 10);
    const year = parseInt(matchMonthFirst[4], 10);
    fromDate = formatIsoDate(year, month, startDay);
    toDate = formatIsoDate(year, month, endDay);
    parsedDays = calculateDaysBetween(fromDate, toDate);
  } else if (matchNumRange) {
    fromDate = formatIsoDate(matchNumRange[3], matchNumRange[2], matchNumRange[1]);
    toDate = formatIsoDate(matchNumRange[6], matchNumRange[5], matchNumRange[4]);
    parsedDays = calculateDaysBetween(fromDate, toDate);
  } else {
    // Look for any single date: e.g. "15th July 2024" or "2024-07-15"
    const singleDateRegex = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})/i;
    const matchSingle = text.match(singleDateRegex);
    if (matchSingle) {
      const day = parseInt(matchSingle[1], 10);
      const month = monthNameToNum(matchSingle[2]);
      const year = parseInt(matchSingle[3], 10);
      fromDate = formatIsoDate(year, month, day);
      toDate = fromDate;
    } else {
      const yearOnlyMatch = text.match(/\b(202[0-9])\b/);
      if (yearOnlyMatch) {
        fromDate = `${yearOnlyMatch[1]}-06-15`;
        toDate = fromDate;
      }
    }
  }

  // If explicit duration like "5 Days FDP" or "One Week" was mentioned
  if (matchExplicitDays) {
    parsedDays = parseInt(matchExplicitDays[1], 10);
    // If toDate was equal to fromDate, adjust toDate accordingly
    if (fromDate === toDate && parsedDays > 1) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + (parsedDays - 1));
      toDate = d.toISOString().split('T')[0];
    }
  } else if (/one\s*week/i.test(text)) {
    parsedDays = 5;
    if (fromDate === toDate) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + 4);
      toDate = d.toISOString().split('T')[0];
    }
  } else if (/two\s*weeks/i.test(text)) {
    parsedDays = 10;
    if (fromDate === toDate) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + 9);
      toDate = d.toISOString().split('T')[0];
    }
  }

  // 6. Title Extraction
  const cleanFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[_\-\.]/g, ' ').trim();
  let title = '';

  // Look for topic phrases in raw text:
  const topicRegex = /(?:titled|topic|on)\s+["']?([^"'\n\r]{10,120}?)["']?(?:\s+(?:held|organized|during|from|at|\.|\,|$))/i;
  const matchTopic = rawText.match(topicRegex);
  if (matchTopic && matchTopic[1].trim().length > 8) {
    title = matchTopic[1].trim();
  } else if (cleanFileName.length > 8) {
    title = cleanFileName;
  } else {
    title = `${type} on Advanced Technologies in Computer Science`;
  }

  // Ensure title includes helpful prefix if missing
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
    confidence: 0.92,
  };
}

/**
 * Main parser entry point: reads file, extracts text / metadata, and returns ParsedActivityDocument
 */
export async function parseUploadedActivityFile(file: File): Promise<ParsedActivityDocument> {
  const dataUrl = await readFileAsDataUrl(file);
  let rawText = '';

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
      // Decode dataUrl base64 to binary string for quick text inspection
      const base64Data = dataUrl.split(',')[1];
      if (base64Data) {
        const binaryStr = atob(base64Data);
        rawText = extractAsciiFromPdfBinary(binaryStr);
      }
    } catch {
      rawText = '';
    }
  }

  const parsed = parseActivityText(rawText, file.name);

  return {
    ...parsed,
    document_url: dataUrl,
    file_name: file.name,
    file_size: file.size,
  };
}
