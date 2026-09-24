/**
 * repositories/student.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.1 — All raw SQL queries for the students domain.
 * Extracted from api.ts /students/* route handlers.
 *
 * RULE: This file contains ONLY db.query() calls.
 *       No HTTP, no Express, no business logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, buildWhereClause, parsePagination, toUpperOrNull } from './base.repository';

export interface StudentRow {
  roll_number: string;
  name: string;
  email?: string;
  department?: string;
  year?: string;
  section?: string;
  batch?: string;
  cgpa?: number;
  gender?: string;
  date_of_birth?: string;
  phone_number?: string;
  linkedin_url?: string;
  github_url?: string;
  leetcode_handle?: string;
  gfg_handle?: string;
  mentor_faculty_id?: string;
  photo_url?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Find a student by roll number (primary key).
 */
export async function findStudentById(rollNumber: string): Promise<StudentRow | null> {
  const id = toUpperOrNull(rollNumber);
  if (!id) return null;
  const result = await query<StudentRow>(
    `SELECT * FROM students WHERE roll_number = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Find a student by email address (case-insensitive).
 */
export async function findStudentByEmail(email: string): Promise<StudentRow | null> {
  if (!email) return null;
  const result = await query<StudentRow>(
    `SELECT * FROM students WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );
  return result.rows[0] ?? null;
}

/**
 * Search students with optional filters: department, year, section, search text, mentor.
 * Supports pagination.
 */
export async function findStudents(filters: {
  department?: string;
  year?: string;
  section?: string;
  search?: string;
  mentor_faculty_id?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: StudentRow[]; total: number }> {
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
  if (filters.section) {
    conditions.push(`LOWER(section) = LOWER($${idx++})`);
    values.push(filters.section);
  }
  if (filters.mentor_faculty_id) {
    conditions.push(`mentor_faculty_id = $${idx++}`);
    values.push(filters.mentor_faculty_id);
  }
  if (filters.search) {
    conditions.push(
      `(LOWER(name) ILIKE $${idx} OR LOWER(roll_number) ILIKE $${idx} OR LOWER(email) ILIKE $${idx})`
    );
    values.push(`%${filters.search.toLowerCase()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 200;
  const offset = ((filters.page ?? 1) - 1) * limit;

  const [dataRes, countRes] = await Promise.all([
    query<StudentRow>(
      `SELECT * FROM students ${where} ORDER BY roll_number ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM students ${where}`,
      values
    ),
  ]);

  return {
    rows: dataRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

/**
 * Get students assigned to a specific mentor.
 */
export async function findStudentsByMentor(facultyId: string): Promise<StudentRow[]> {
  const result = await query<StudentRow>(
    `SELECT * FROM students WHERE mentor_faculty_id = $1 ORDER BY roll_number`,
    [facultyId]
  );
  return result.rows;
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Insert a new student record.
 */
export async function insertStudent(student: Partial<StudentRow>): Promise<StudentRow> {
  const result = await query<StudentRow>(
    `INSERT INTO students (roll_number, name, email, department, year, section, batch, gender, phone_number, date_of_birth, cgpa)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      toUpperOrNull(student.roll_number),
      student.name,
      student.email ?? null,
      student.department ?? null,
      student.year ?? null,
      student.section ?? null,
      student.batch ?? null,
      student.gender ?? null,
      student.phone_number ?? null,
      student.date_of_birth ?? null,
      student.cgpa ?? null,
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing student record (partial update).
 */
export async function updateStudent(
  rollNumber: string,
  updates: Partial<StudentRow>
): Promise<StudentRow | null> {
  const id = toUpperOrNull(rollNumber);
  if (!id) return null;

  // Build dynamic SET clause from provided fields
  const updateable: Record<string, any> = {
    name: updates.name,
    email: updates.email,
    department: updates.department,
    year: updates.year,
    section: updates.section,
    batch: updates.batch,
    cgpa: updates.cgpa,
    gender: updates.gender,
    date_of_birth: updates.date_of_birth,
    phone_number: updates.phone_number,
    linkedin_url: updates.linkedin_url,
    github_url: updates.github_url,
    leetcode_handle: updates.leetcode_handle,
    gfg_handle: updates.gfg_handle,
    photo_url: updates.photo_url,
    mentor_faculty_id: updates.mentor_faculty_id,
  };

  const parts: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [col, val] of Object.entries(updateable)) {
    if (val === undefined) continue;
    parts.push(`${col} = $${idx++}`);
    values.push(val);
  }

  if (parts.length === 0) return findStudentById(id);

  parts.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await query<StudentRow>(
    `UPDATE students SET ${parts.join(', ')} WHERE roll_number = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

/**
 * Delete a student by roll number.
 */
export async function deleteStudentById(rollNumber: string): Promise<boolean> {
  const id = toUpperOrNull(rollNumber);
  if (!id) return false;
  const result = await query(
    `DELETE FROM students WHERE roll_number = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Bulk delete students by array of roll numbers.
 */
export async function bulkDeleteStudents(rollNumbers: string[]): Promise<number> {
  if (!rollNumbers.length) return 0;
  const ids = rollNumbers.map((r) => toUpperOrNull(r)).filter(Boolean);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `DELETE FROM students WHERE roll_number IN (${placeholders})`,
    ids
  );
  return result.rowCount ?? 0;
}

// ─── Sub-resource Queries ─────────────────────────────────────────────────────

/**
 * Get academic record for a student.
 */
export async function findStudentAcademics(rollNumber: string): Promise<any | null> {
  const result = await query(
    `SELECT * FROM student_academics WHERE student_id = $1`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows[0] ?? null;
}

/**
 * Upsert academic record for a student.
 */
export async function upsertStudentAcademics(rollNumber: string, data: any): Promise<any> {
  const id = toUpperOrNull(rollNumber);
  const result = await query(
    `INSERT INTO student_academics (student_id, tenth_percentage, twelfth_percentage, current_cgpa, backlogs, semester_grades)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (student_id) DO UPDATE SET
       tenth_percentage = EXCLUDED.tenth_percentage,
       twelfth_percentage = EXCLUDED.twelfth_percentage,
       current_cgpa = EXCLUDED.current_cgpa,
       backlogs = EXCLUDED.backlogs,
       semester_grades = EXCLUDED.semester_grades,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [id, data.tenth_percentage ?? null, data.twelfth_percentage ?? null, data.current_cgpa ?? null, data.backlogs ?? 0, data.semester_grades ? JSON.stringify(data.semester_grades) : null]
  );
  return result.rows[0];
}

/**
 * Get coding profiles for a student.
 */
export async function findStudentCodingProfiles(rollNumber: string): Promise<any[]> {
  const result = await query(
    `SELECT * FROM coding_profiles WHERE student_id = $1 ORDER BY platform`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows;
}

/**
 * Get placement profile for a student.
 */
export async function findPlacementProfile(rollNumber: string): Promise<any | null> {
  const result = await query(
    `SELECT * FROM placement_profiles WHERE student_id = $1`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows[0] ?? null;
}

/**
 * Get achievements for a student.
 */
export async function findStudentAchievements(rollNumber: string): Promise<any[]> {
  const result = await query(
    `SELECT * FROM achievements WHERE student_id = $1 ORDER BY created_at DESC`,
    [toUpperOrNull(rollNumber)]
  );
  return result.rows;
}
