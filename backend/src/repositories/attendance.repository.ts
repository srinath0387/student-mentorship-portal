/**
 * repositories/attendance.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.3 — All raw SQL queries for the attendance domain.
 * Extracted from api.ts /attendance/* route handlers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, toUpperOrNull } from './base.repository';

// ─── Allotments ───────────────────────────────────────────────────────────────

export async function findAllotments(filters: {
  faculty_email?: string;
  department?: string;
  year?: string;
  section?: string;
  semester?: string;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.faculty_email) {
    conditions.push(`LOWER(faculty_email) = LOWER($${idx++})`);
    values.push(filters.faculty_email);
  }
  if (filters.department) {
    conditions.push(`LOWER(department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.year) {
    conditions.push(`LOWER(year) = LOWER($${idx++})`);
    values.push(filters.year);
  }
  if (filters.section) {
    conditions.push(`LOWER(section) = LOWER($${idx++})`);
    values.push(filters.section);
  }
  if (filters.semester) {
    conditions.push(`LOWER(semester) = LOWER($${idx++})`);
    values.push(filters.semester);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM attendance_allotments ${where} ORDER BY created_at DESC`,
    values
  );
  return result.rows;
}

export async function insertAllotment(data: {
  faculty_email: string;
  faculty_name: string;
  subject_code: string;
  subject_name: string;
  department: string;
  year: string;
  section: string;
  semester?: string;
}): Promise<any> {
  const result = await query(
    `INSERT INTO attendance_allotments
       (faculty_email, faculty_name, subject_code, subject_name, department, year, section, semester)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (faculty_email, subject_code, department, year, section)
     DO UPDATE SET faculty_name = EXCLUDED.faculty_name, subject_name = EXCLUDED.subject_name, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [data.faculty_email, data.faculty_name, data.subject_code, data.subject_name, data.department, data.year, data.section, data.semester ?? null]
  );
  return result.rows[0];
}

export async function deleteAllotment(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM attendance_allotments WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function findSessions(filters: {
  faculty_email?: string;
  allotment_id?: string;
  department?: string;
  year?: string;
  section?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.allotment_id) {
    conditions.push(`allotment_id = $${idx++}`);
    values.push(filters.allotment_id);
  }
  if (filters.faculty_email) {
    conditions.push(`LOWER(faculty_email) = LOWER($${idx++})`);
    values.push(filters.faculty_email);
  }
  if (filters.date_from) {
    conditions.push(`session_date >= $${idx++}`);
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`session_date <= $${idx++}`);
    values.push(filters.date_to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 200;

  const result = await query(
    `SELECT * FROM attendance_sessions ${where} ORDER BY session_date DESC, period_number ASC LIMIT $${idx}`,
    [...values, limit]
  );
  return result.rows;
}

export async function findSessionById(sessionId: string): Promise<any | null> {
  const result = await query(
    `SELECT s.*, a.subject_name, a.subject_code, a.faculty_name
     FROM attendance_sessions s
     LEFT JOIN attendance_allotments a ON a.id = s.allotment_id
     WHERE s.id = $1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

export async function insertSession(data: {
  allotment_id: string;
  faculty_email: string;
  session_date: string;
  period_number: number;
  topic?: string;
  duration_minutes?: number;
  attendance_records: Array<{ roll_number: string; is_present: boolean }>;
}): Promise<any> {
  const result = await query(
    `INSERT INTO attendance_sessions (allotment_id, faculty_email, session_date, period_number, topic, duration_minutes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.allotment_id, data.faculty_email, data.session_date, data.period_number, data.topic ?? null, data.duration_minutes ?? 60]
  );
  const session = result.rows[0];

  if (session && data.attendance_records?.length > 0) {
    for (const rec of data.attendance_records) {
      await query(
        `INSERT INTO attendance_records (session_id, student_roll_number, is_present)
         VALUES ($1, $2, $3) ON CONFLICT (session_id, student_roll_number) DO UPDATE SET is_present = EXCLUDED.is_present`,
        [session.id, toUpperOrNull(rec.roll_number), rec.is_present]
      ).catch(() => {});
    }
  }
  return session;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  await query(`DELETE FROM attendance_records WHERE session_id = $1`, [sessionId]);
  const result = await query(`DELETE FROM attendance_sessions WHERE id = $1`, [sessionId]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Rosters ─────────────────────────────────────────────────────────────────

export async function findRoster(allotmentId: string): Promise<any[]> {
  const result = await query(
    `SELECT ar.*, s.name as student_name
     FROM attendance_rosters ar
     LEFT JOIN students s ON s.roll_number = ar.roll_number
     WHERE ar.allotment_id = $1 ORDER BY ar.roll_number`,
    [allotmentId]
  );
  return result.rows;
}

export async function insertRosterEntry(data: {
  allotment_id: string;
  roll_number: string;
  joining_date?: string;
}): Promise<any> {
  const result = await query(
    `INSERT INTO attendance_rosters (allotment_id, roll_number, joining_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (allotment_id, roll_number) DO UPDATE SET
       joining_date = COALESCE(EXCLUDED.joining_date, attendance_rosters.joining_date),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [data.allotment_id, toUpperOrNull(data.roll_number), data.joining_date ?? null]
  );
  return result.rows[0];
}

export async function deleteRosterEntry(rosterId: string): Promise<boolean> {
  const result = await query(`DELETE FROM attendance_rosters WHERE id = $1`, [rosterId]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Student Attendance Summary ───────────────────────────────────────────────

export async function getStudentAttendanceSummary(rollNumber: string): Promise<any[]> {
  const result = await query(
    `SELECT
       aa.subject_name, aa.subject_code, aa.faculty_name, aa.faculty_email,
       COUNT(DISTINCT ases.id) as total_classes,
       COUNT(DISTINCT CASE WHEN ar.is_present = true THEN ases.id END) as present_count
     FROM attendance_allotments aa
     JOIN attendance_rosters aro ON aro.allotment_id = aa.id AND aro.roll_number = $1
     LEFT JOIN attendance_sessions ases ON ases.allotment_id = aa.id
     LEFT JOIN attendance_records ar ON ar.session_id = ases.id AND ar.student_roll_number = $1
     GROUP BY aa.id, aa.subject_name, aa.subject_code, aa.faculty_name, aa.faculty_email
     ORDER BY aa.subject_name`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows;
}
