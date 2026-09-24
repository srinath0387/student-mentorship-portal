/**
 * repositories/settings.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.7 — SQL queries for holidays, academic calendar, and subject masters.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query } from './base.repository';

// ─── Holidays ─────────────────────────────────────────────────────────────────

export async function findHolidays(year?: number): Promise<any[]> {
  if (year) {
    const result = await query(
      `SELECT * FROM holidays WHERE EXTRACT(YEAR FROM holiday_date) = $1 ORDER BY holiday_date`,
      [year]
    );
    return result.rows;
  }
  const result = await query(`SELECT * FROM holidays ORDER BY holiday_date`);
  return result.rows;
}

export async function insertHoliday(data: {
  holiday_date: string;
  description: string;
  holiday_type?: string;
}): Promise<any> {
  const result = await query(
    `INSERT INTO holidays (holiday_date, description, holiday_type)
     VALUES ($1, $2, $3) RETURNING *`,
    [data.holiday_date, data.description, data.holiday_type ?? 'public']
  );
  return result.rows[0];
}

export async function updateHoliday(id: string, data: {
  holiday_date?: string;
  description?: string;
  holiday_type?: string;
}): Promise<any | null> {
  const result = await query(
    `UPDATE holidays SET
       holiday_date = COALESCE($1, holiday_date),
       description = COALESCE($2, description),
       holiday_type = COALESCE($3, holiday_type),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING *`,
    [data.holiday_date ?? null, data.description ?? null, data.holiday_type ?? null, id]
  );
  return result.rows[0] ?? null;
}

export async function deleteHoliday(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM holidays WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Academic Calendar ────────────────────────────────────────────────────────

export async function findAcademicCalendar(): Promise<any[]> {
  const result = await query(
    `SELECT * FROM academic_calendar ORDER BY event_date ASC`
  );
  return result.rows;
}

export async function insertAcademicEvent(data: {
  event_date: string;
  event_name: string;
  event_type?: string;
  description?: string;
}): Promise<any> {
  const result = await query(
    `INSERT INTO academic_calendar (event_date, event_name, event_type, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.event_date, data.event_name, data.event_type ?? 'event', data.description ?? null]
  );
  return result.rows[0];
}

export async function deleteAcademicEvent(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM academic_calendar WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Subject Masters ──────────────────────────────────────────────────────────

export async function findSubjectMasters(filters: {
  department?: string;
  year?: string;
  semester?: string;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.department) {
    conditions.push(`LOWER(department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.year) {
    conditions.push(`LOWER(year) = LOWER($${idx++})`);
    values.push(filters.year);
  }
  if (filters.semester) {
    conditions.push(`LOWER(semester) = LOWER($${idx++})`);
    values.push(filters.semester);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM subject_masters ${where} ORDER BY department, year, subject_code`,
    values
  );
  return result.rows;
}

export async function insertSubjectMaster(data: {
  subject_code: string;
  subject_name: string;
  department: string;
  year: string;
  semester?: string;
  credits?: number;
}): Promise<any> {
  const result = await query(
    `INSERT INTO subject_masters (subject_code, subject_name, department, year, semester, credits)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (subject_code, department, year) DO UPDATE SET
       subject_name = EXCLUDED.subject_name,
       semester = COALESCE(EXCLUDED.semester, subject_masters.semester),
       credits = COALESCE(EXCLUDED.credits, subject_masters.credits),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [data.subject_code, data.subject_name, data.department, data.year, data.semester ?? null, data.credits ?? null]
  );
  return result.rows[0];
}

export async function updateSubjectMaster(id: string, data: {
  subject_code?: string;
  subject_name?: string;
  credits?: number;
}): Promise<any | null> {
  const result = await query(
    `UPDATE subject_masters SET
       subject_code = COALESCE($1, subject_code),
       subject_name = COALESCE($2, subject_name),
       credits = COALESCE($3, credits),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING *`,
    [data.subject_code ?? null, data.subject_name ?? null, data.credits ?? null, id]
  );
  return result.rows[0] ?? null;
}

export async function deleteSubjectMaster(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM subject_masters WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Semester Unlock Settings ─────────────────────────────────────────────────

export async function getSemesterUnlockSettings(): Promise<any[]> {
  const result = await query(`SELECT * FROM semester_unlock_settings ORDER BY created_at DESC`);
  return result.rows;
}
