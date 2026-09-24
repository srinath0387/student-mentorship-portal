/**
 * repositories/certifications.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.5 — SQL queries for certifications and internships.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, toUpperOrNull } from './base.repository';

// ─── Certifications ───────────────────────────────────────────────────────────

export async function findCertificationsByStudent(rollNumber: string): Promise<any[]> {
  const result = await query(
    `SELECT * FROM certifications WHERE student_id = $1 ORDER BY date_completed DESC`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows;
}

export async function insertCertification(data: {
  student_id: string;
  provider: string;
  title: string;
  date_completed?: string;
  certificate_file_url?: string;
  verified?: boolean;
}): Promise<any> {
  const result = await query(
    `INSERT INTO certifications (student_id, provider, title, date_completed, certificate_file_url, verified)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      toUpperOrNull(data.student_id),
      data.provider,
      data.title,
      data.date_completed ?? null,
      data.certificate_file_url ?? null,
      data.verified ?? false,
    ]
  );
  return result.rows[0];
}

export async function deleteCertification(id: string, studentId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM certifications WHERE id = $1 AND student_id = $2`,
    [id, toUpperOrNull(studentId)]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Certification analytics summary — grouped by department/year/section.
 */
export async function getCertificationSummary(filters: {
  department?: string;
  year?: string;
  section?: string;
  provider?: string;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.department) {
    conditions.push(`LOWER(s.department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.year) {
    conditions.push(`LOWER(s.year) = LOWER($${idx++})`);
    values.push(filters.year);
  }
  if (filters.section) {
    conditions.push(`LOWER(s.section) = LOWER($${idx++})`);
    values.push(filters.section);
  }
  if (filters.provider) {
    conditions.push(`LOWER(c.provider) ILIKE LOWER($${idx++})`);
    values.push(`%${filters.provider}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT
       c.provider,
       LOWER(c.title) as title_normalized,
       c.title,
       s.department,
       s.year,
       s.section,
       COUNT(DISTINCT c.student_id) as student_count,
       MAX(c.date_completed) as latest_completion
     FROM certifications c
     JOIN students s ON s.roll_number = c.student_id
     ${where}
     GROUP BY c.provider, LOWER(c.title), c.title, s.department, s.year, s.section
     ORDER BY student_count DESC, c.provider`,
    values
  );
  return result.rows;
}

/**
 * Search certifications by title with student details.
 */
export async function searchCertifications(filters: {
  search?: string;
  department?: string;
  year?: string;
  limit?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.search) {
    conditions.push(`(LOWER(c.title) ILIKE $${idx} OR LOWER(c.provider) ILIKE $${idx})`);
    values.push(`%${filters.search.toLowerCase()}%`);
    idx++;
  }
  if (filters.department) {
    conditions.push(`LOWER(s.department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.year) {
    conditions.push(`LOWER(s.year) = LOWER($${idx++})`);
    values.push(filters.year);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT c.*, s.name as student_name, s.department, s.year, s.section
     FROM certifications c
     JOIN students s ON s.roll_number = c.student_id
     ${where}
     ORDER BY c.date_completed DESC NULLS LAST LIMIT $${idx}`,
    [...values, filters.limit ?? 100]
  );
  return result.rows;
}

// ─── Internships ──────────────────────────────────────────────────────────────

export async function findInternships(filters: {
  student_roll?: string;
  department?: string;
  verification_status?: string;
  limit?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.student_roll) {
    conditions.push(`LOWER(i.student_roll) = LOWER($${idx++})`);
    values.push(filters.student_roll);
  }
  if (filters.department) {
    conditions.push(`LOWER(s.department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.verification_status) {
    conditions.push(`i.verification_status = $${idx++}`);
    values.push(filters.verification_status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT i.*, s.name as student_name, s.department, s.year, s.section
     FROM student_internships i
     LEFT JOIN students s ON s.roll_number = i.student_roll
     ${where}
     ORDER BY i.created_at DESC LIMIT $${idx}`,
    [...values, filters.limit ?? 200]
  );
  return result.rows;
}

export async function insertInternship(data: {
  student_roll: string;
  company_name: string;
  role: string;
  start_date?: string;
  end_date?: string;
  stipend?: number;
  description?: string;
  offer_letter_url?: string;
}): Promise<any> {
  const result = await query(
    `INSERT INTO student_internships (student_roll, company_name, role, start_date, end_date, stipend, description, offer_letter_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      toUpperOrNull(data.student_roll),
      data.company_name,
      data.role,
      data.start_date ?? null,
      data.end_date ?? null,
      data.stipend ?? null,
      data.description ?? null,
      data.offer_letter_url ?? null,
    ]
  );
  return result.rows[0];
}
