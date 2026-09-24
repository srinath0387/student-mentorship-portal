/**
 * repositories/coordinator.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.6 — SQL queries for coordinator and first-year management.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, toUpperOrNull } from './base.repository';

// ─── Freshers / First Year ────────────────────────────────────────────────────

export async function findFreshers(filters: {
  department?: string;
  section?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: any[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.department) {
    conditions.push(`LOWER(department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.section) {
    conditions.push(`LOWER(section) = LOWER($${idx++})`);
    values.push(filters.section);
  }
  if (filters.search) {
    conditions.push(
      `(LOWER(name) ILIKE $${idx} OR LOWER(roll_number) ILIKE $${idx} OR LOWER(email) ILIKE $${idx})`
    );
    values.push(`%${filters.search.toLowerCase()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')} AND is_first_year = true` : `WHERE is_first_year = true`;
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT * FROM students ${where} ORDER BY roll_number LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
    query(
      `SELECT COUNT(*) as count FROM students ${where}`,
      values
    ),
  ]);

  return {
    rows: dataRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

export async function findFresherByRoll(rollNumber: string): Promise<any | null> {
  const result = await query(
    `SELECT * FROM students WHERE roll_number = $1 AND is_first_year = true`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows[0] ?? null;
}

// ─── Class Incharge ───────────────────────────────────────────────────────────

export async function findClassIncharge(filters: {
  faculty_email?: string;
  department?: string;
  year?: string;
  section?: string;
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

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT ci.*, f.name as faculty_name FROM class_incharge ci
     LEFT JOIN faculty f ON LOWER(f.email) = LOWER(ci.faculty_email)
     ${where} ORDER BY ci.department, ci.year, ci.section`,
    values
  );
  return result.rows;
}

export async function upsertClassIncharge(data: {
  faculty_email: string;
  department: string;
  year: string;
  section: string;
}): Promise<any> {
  const result = await query(
    `INSERT INTO class_incharge (faculty_email, department, year, section)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (department, year, section) DO UPDATE SET
       faculty_email = EXCLUDED.faculty_email,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [data.faculty_email, data.department, data.year, data.section]
  );
  return result.rows[0];
}

export async function deleteClassIncharge(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM class_incharge WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── First Year Bulk Operations ───────────────────────────────────────────────

export async function getFirstYearDuplicates(): Promise<any[]> {
  const result = await query(
    `SELECT email, COUNT(*) as count, array_agg(roll_number) as roll_numbers
     FROM students WHERE is_first_year = true
     GROUP BY email HAVING COUNT(*) > 1`
  );
  return result.rows;
}

export async function getFirstYearStats(): Promise<any> {
  const result = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN password_hash IS NOT NULL THEN 1 END) as setup_count,
       COUNT(CASE WHEN password_hash IS NULL THEN 1 END) as pending_count
     FROM students WHERE is_first_year = true`
  );
  return result.rows[0];
}
