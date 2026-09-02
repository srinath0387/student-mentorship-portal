/**
 * Faculty Smart Name Normalization and Matching Engine
 * Handles Indian / Telugu / RGMCET faculty name variations:
 * - Upper vs lower case
 * - Titles (Dr., Prof., Mr., Mrs., Ms., Er., Smt., Sri.)
 * - Initials vs full surnames (e.g., "V Ravikanth" vs "VAKA RAVIKANTH", "P Sucharitha" vs "PUVVADA SUCHARITHA")
 * - Transliteration & spelling variations (e.g., "NAIDU" vs "NAYUDU", "NARSIMHULU" vs "NARASIMHULU", "SUBALAKSHMI" vs "SUBBALAKSHMI", "SHOBITHA" vs "SHOBHITHA")
 * - Initials at start vs end (e.g., "HRISHIKESAVA REDDY C" vs "C HRISHIKESAVA REDDY")
 * - Spacing / punctuation (e.g., "Dr.P.PRATHAP NAIDU", "G.RAJASEKHAR REDDY", "S. GOUSEPEER")
 */

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export interface FacultyTokens {
  raw: string;
  normalized: string;
  initials: string[];
  words: string[];
  substantiveWords: string[];
}

const COMMON_GENERIC_WORDS = new Set([
  'kumar', 'kumari', 'reddy', 'naidu', 'nayudu', 'rao', 'prasad', 'devi',
  'sharma', 'varma', 'babu', 'chary', 'swamy', 'sekhar', 'sastry', 'murthy',
  'sir', 'madam', 'faculty', 'mentor'
]);

export function extractFacultyTokens(rawName: string): FacultyTokens {
  if (!rawName) {
    return { raw: '', normalized: '', initials: [], words: [], substantiveWords: [] };
  }

  const normalized = rawName
    .toLowerCase()
    .replace(/^(dr|prof|mr|mrs|ms|er|smt|sri)\.?\s+/i, '')
    .replace(/^dr\./i, '')
    .replace(/[.,\-_/\\()]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = normalized.split(' ').filter(Boolean);
  const initials: string[] = [];
  const words: string[] = [];
  const substantiveWords: string[] = [];

  for (const part of parts) {
    if (part.length === 1) {
      initials.push(part);
    } else {
      words.push(part);
      if (part.length >= 3 && !COMMON_GENERIC_WORDS.has(part)) {
        substantiveWords.push(part);
      }
    }
  }

  return {
    raw: rawName,
    normalized,
    initials,
    words,
    substantiveWords,
  };
}

/**
 * Checks whether two individual words match phonetically or via Levenshtein distance
 */
export function areWordsSimilar(w1: string, w2: string): boolean {
  if (w1 === w2) return true;
  if (w1.length >= 3 && w2.length >= 3) {
    if (w1.startsWith(w2) || w2.startsWith(w1)) return true;
  }
  if (w1.length >= 4 && w2.length >= 4) {
    const maxLen = Math.max(w1.length, w2.length);
    const maxDist = maxLen >= 8 ? 2 : 1;
    if (levenshteinDistance(w1, w2) <= maxDist) return true;
  }
  // Specific Telugu phonetic mappings
  const normalizePhonetic = (s: string) =>
    s
      .replace(/sh/g, 's')
      .replace(/th/g, 't')
      .replace(/dh/g, 'd')
      .replace(/bh/g, 'b')
      .replace(/ph/g, 'p')
      .replace(/kh/g, 'k')
      .replace(/gh/g, 'g')
      .replace(/ee/g, 'i')
      .replace(/oo/g, 'u')
      .replace(/ai/g, 'ay')
      .replace(/du$/g, 'da')
      .replace(/h/g, '');

  if (w1.length >= 4 && w2.length >= 4) {
    if (normalizePhonetic(w1) === normalizePhonetic(w2)) return true;
    if (levenshteinDistance(normalizePhonetic(w1), normalizePhonetic(w2)) <= 1) return true;
  }

  return false;
}

export interface MatchResult {
  isMatch: boolean;
  confidence: number; // 0 to 100
  reason: string;
}

/**
 * Calculates similarity between two faculty names
 */
export function calculateFacultyNameSimilarity(nameA: string, nameB: string): MatchResult {
  if (!nameA || !nameB) {
    return { isMatch: false, confidence: 0, reason: 'Empty name' };
  }

  const tokA = extractFacultyTokens(nameA);
  const tokB = extractFacultyTokens(nameB);

  // Exact normalized match
  if (tokA.normalized === tokB.normalized) {
    return { isMatch: true, confidence: 100, reason: 'Exact normalized match' };
  }

  // Substantive words comparison (e.g. "ravikanth", "narasimhulu", "shobitha", "sucharitha")
  const subsA = tokA.substantiveWords.length > 0 ? tokA.substantiveWords : tokA.words;
  const subsB = tokB.substantiveWords.length > 0 ? tokB.substantiveWords : tokB.words;

  if (subsA.length === 0 || subsB.length === 0) {
    return { isMatch: false, confidence: 0, reason: 'No valid words to compare' };
  }

  let matchedWordsCount = 0;
  for (const wA of subsA) {
    const found = subsB.some((wB) => areWordsSimilar(wA, wB));
    if (found) matchedWordsCount++;
  }

  const minSubsLen = Math.min(subsA.length, subsB.length);
  const maxSubsLen = Math.max(subsA.length, subsB.length);

  // Initials vs Surname check (e.g. "V" in A matches "VAKA" in B)
  let initialsMatched = false;
  for (const init of tokA.initials) {
    if (tokB.words.some((w) => w.startsWith(init)) || tokB.initials.includes(init)) {
      initialsMatched = true;
    }
  }
  for (const init of tokB.initials) {
    if (tokA.words.some((w) => w.startsWith(init)) || tokA.initials.includes(init)) {
      initialsMatched = true;
    }
  }

  // If ALL substantive words of one name match the other name
  if (matchedWordsCount >= minSubsLen && minSubsLen >= 1) {
    let confidence = 85;
    if (initialsMatched || tokA.initials.length === 0 || tokB.initials.length === 0) {
      confidence += 10;
    }
    if (tokA.normalized.includes(tokB.normalized) || tokB.normalized.includes(tokA.normalized)) {
      confidence += 5;
    }

    return {
      isMatch: confidence >= 80,
      confidence: Math.min(100, confidence),
      reason: `Matched core tokens (${subsA.filter(wA => subsB.some(wB => areWordsSimilar(wA, wB))).join(', ')}) with initial/surname consistency`,
    };
  }

  // Multiple words matched
  if (matchedWordsCount >= 2) {
    const confidence = Math.round((matchedWordsCount / maxSubsLen) * 90);
    return {
      isMatch: confidence >= 75,
      confidence,
      reason: `Matched ${matchedWordsCount} substantive words`,
    };
  }

  return { isMatch: false, confidence: 0, reason: 'Insufficient word overlap' };
}

/**
 * Checks if an email address username matches a faculty name
 */
export function isEmailNameMatch(email: string, facultyName: string): boolean {
  if (!email || !facultyName) return false;
  const cleanEmail = email.toLowerCase().trim();
  const username = cleanEmail.split('@')[0].replace(/[^a-z0-9]/g, '');
  const tok = extractFacultyTokens(facultyName);

  if (username.length < 3) return false;

  const cleanNormName = tok.normalized.replace(/[^a-z0-9]/g, '');
  if (cleanNormName && (cleanNormName === username || cleanNormName.includes(username) || username.includes(cleanNormName))) {
    return true;
  }

  for (const w of tok.substantiveWords) {
    if (w.length >= 4 && username.includes(w)) {
      return true;
    }
  }

  return false;
}

/**
 * Reconciles and merges source faculty record into target faculty record in PostgreSQL database
 */
export async function mergeFacultyRecordsInDb(
  sourceFacultyId: string,
  targetFacultyId: string,
  db: any
): Promise<{ success: boolean; menteesMigrated: number; message: string }> {
  const srcId = sourceFacultyId.toUpperCase().trim();
  const tgtId = targetFacultyId.toUpperCase().trim();

  if (srcId === tgtId) {
    return { success: true, menteesMigrated: 0, message: 'Source and target are identical' };
  }

  // Target faculty
  const tgtRes = await db.query('SELECT * FROM faculty WHERE UPPER(faculty_id) = $1', [tgtId]);
  if (tgtRes.rows.length === 0) {
    throw new Error(`Target faculty "${tgtId}" does not exist in database`);
  }
  const targetFaculty = tgtRes.rows[0];
  const targetEmail = (targetFaculty.email || '').toLowerCase().trim();
  const targetName = targetFaculty.name;

  // Source faculty
  const srcRes = await db.query('SELECT * FROM faculty WHERE UPPER(faculty_id) = $1', [srcId]);
  const sourceFaculty = srcRes.rows[0] || null;
  const sourceEmail = (sourceFaculty?.email || '').toLowerCase().trim();

  // 1. Migrate mentor_assignments
  await db.query(
    `INSERT INTO mentor_assignments (roll_number, faculty_id, assigned_at)
     SELECT roll_number, $1, assigned_at FROM mentor_assignments WHERE UPPER(faculty_id) = $2
     ON CONFLICT (roll_number) DO UPDATE
       SET faculty_id = EXCLUDED.faculty_id, assigned_at = NOW()`,
    [tgtId, srcId]
  ).catch((e: any) => console.warn('[Merge] mentor_assignments insert error:', e.message));

  const maDeleted = await db.query('DELETE FROM mentor_assignments WHERE UPPER(faculty_id) = $1', [srcId]).catch(() => ({ rowCount: 0 }));

  // 2. Update students.faculty_mentor_id
  const stuUpdated = await db.query(
    'UPDATE students SET faculty_mentor_id = $1, updated_at = NOW() WHERE UPPER(faculty_mentor_id) = $2',
    [tgtId, srcId]
  ).catch((e: any) => console.warn('[Merge] students update error:', e.message));

  // 3. Migrate subject_allotments, timetable_entries, and class_incharges if source had an email
  if (sourceEmail && targetEmail && sourceEmail !== targetEmail) {
    await db.query(
      `UPDATE subject_allotments
       SET faculty_email = $1, faculty_name = $2
       WHERE LOWER(faculty_email) = $3`,
      [targetEmail, targetName, sourceEmail]
    ).catch((e: any) => console.warn('[Merge] subject_allotments update error:', e.message));

    await db.query(
      `UPDATE timetable_entries
       SET faculty_email = $1, faculty_name = $2
       WHERE LOWER(faculty_email) = $3`,
      [targetEmail, targetName, sourceEmail]
    ).catch((e: any) => console.warn('[Merge] timetable_entries update error:', e.message));

    await db.query(
      `UPDATE class_incharges
       SET faculty_email = $1, faculty_name = $2
       WHERE LOWER(faculty_email) = $3`,
      [targetEmail, targetName, sourceEmail]
    ).catch((e: any) => console.warn('[Merge] class_incharges update error:', e.message));
  }

  // 4. Delete the source placeholder record
  await db.query('DELETE FROM faculty WHERE UPPER(faculty_id) = $1', [srcId]).catch((e: any) => console.warn('[Merge] delete source error:', e.message));

  const totalMigrated = (maDeleted.rowCount ?? 0) + (stuUpdated.rowCount ?? 0);
  console.log(`[Merge] Successfully merged ${srcId} ("${sourceFaculty?.name}") -> ${tgtId} ("${targetName}"), migrated ${totalMigrated} mentee references.`);

  return {
    success: true,
    menteesMigrated: totalMigrated,
    message: `Merged "${sourceFaculty?.name || srcId}" into "${targetName}" (${tgtId}) with ${totalMigrated} mentee references migrated.`,
  };
}
