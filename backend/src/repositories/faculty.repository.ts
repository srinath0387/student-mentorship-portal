/**
 * repositories/faculty.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.2 — All raw SQL queries for the faculty domain.
 * Extracted from api.ts /faculty/* and /mentor-assignments/* route handlers.
 *
 * RULE: This file contains ONLY db.query() calls.
 *       No HTTP, no Express, no business logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, toUpperOrNull } from './base.repository';

export interface FacultyRow {
  faculty_id: string;
  name: string;
  email?: string;
  department?: string;
  role?: string;
  phone?: string;
  designation?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Find faculty by faculty_id.
 */
export async function findFacultyById(facultyId: string): Promise<FacultyRow | null> {
  if (!facultyId) return null;
  const result = await query<FacultyRow>(
    `SELECT * FROM faculty WHERE faculty_id = $1`,
    [facultyId]
  );
  return result.rows[0] ?? null;
}

/**
 * Find faculty by email (case-insensitive).
 */
export async function findFacultyByEmail(email: string): Promise<FacultyRow | null> {
  if (!email) return null;
  const result = await query<FacultyRow>(
    `SELECT * FROM faculty WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );
  return result.rows[0] ?? null;
}

/**
 * List all faculty with optional department filter.
 */
export async function findAllFaculty(filters: {
  department?: string;
  role?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: FacultyRow[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.department) {
    conditions.push(`LOWER(department) = LOWER($${idx++})`);
    values.push(filters.department);
  }
  if (filters.role) {
    conditions.push(`LOWER(role) = LOWER($${idx++})`);
    values.push(filters.role);
  }
  if (filters.search) {
    conditions.push(
      `(LOWER(name) ILIKE $${idx} OR LOWER(email) ILIKE $${idx} OR LOWER(faculty_id) ILIKE $${idx})`
    );
    values.push(`%${filters.search.toLowerCase()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 500;
  const offset = filters.offset ?? 0;

  const [dataRes, countRes] = await Promise.all([
    query<FacultyRow>(
      `SELECT * FROM faculty ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM faculty ${where}`,
      values
    ),
  ]);

  return {
    rows: dataRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

/**
 * Find all mentees assigned to a faculty member.
 */
export async function findFacultyMentees(facultyId: string): Promise<any[]> {
  const result = await query(
    `SELECT s.* FROM students s
     WHERE s.mentor_faculty_id = $1
     ORDER BY s.roll_number`,
    [facultyId]
  );
  return result.rows;
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Insert a new faculty record.
 */
export async function insertFaculty(faculty: Partial<FacultyRow>): Promise<FacultyRow> {
  const result = await query<FacultyRow>(
    `INSERT INTO faculty (faculty_id, name, email, department, role, phone, designation, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true))
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       department = EXCLUDED.department,
       role = EXCLUDED.role,
       is_active = COALESCE(EXCLUDED.is_active, faculty.is_active),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      faculty.faculty_id,
      faculty.name,
      faculty.email ?? null,
      faculty.department ?? null,
      faculty.role ?? 'mentor',
      faculty.phone ?? null,
      faculty.designation ?? null,
      faculty.is_active ?? true,
    ]
  );
  return result.rows[0];
}

/**
 * Update faculty record (partial update).
 */
export async function updateFaculty(
  facultyId: string,
  updates: Partial<FacultyRow>
): Promise<FacultyRow | null> {
  const parts: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const updateable: Record<string, any> = {
    name: updates.name,
    email: updates.email,
    department: updates.department,
    role: updates.role,
    phone: updates.phone,
    designation: updates.designation,
    is_active: updates.is_active,
  };

  for (const [col, val] of Object.entries(updateable)) {
    if (val === undefined) continue;
    parts.push(`${col} = $${idx++}`);
    values.push(val);
  }

  if (parts.length === 0) return findFacultyById(facultyId);

  parts.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(facultyId);

  const result = await query<FacultyRow>(
    `UPDATE faculty SET ${parts.join(', ')} WHERE faculty_id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

/**
 * Delete a faculty member.
 */
export async function deleteFacultyById(facultyId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM faculty WHERE faculty_id = $1`,
    [facultyId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update faculty email by faculty_id.
 */
export async function updateFacultyEmail(
  facultyId: string,
  newEmail: string
): Promise<FacultyRow | null> {
  const result = await query<FacultyRow>(
    `UPDATE faculty SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE faculty_id = $2 RETURNING *`,
    [newEmail.trim().toLowerCase(), facultyId]
  );
  return result.rows[0] ?? null;
}

/**
 * Update faculty department by faculty_id.
 */
export async function updateFacultyDepartment(
  facultyId: string,
  department: string
): Promise<FacultyRow | null> {
  const result = await query<FacultyRow>(
    `UPDATE faculty SET department = $1, updated_at = CURRENT_TIMESTAMP WHERE faculty_id = $2 RETURNING *`,
    [department, facultyId]
  );
  return result.rows[0] ?? null;
}

// ─── Mentor Assignment Operations ─────────────────────────────────────────────

/**
 * Assign a student to a mentor (upsert).
 */
export async function assignStudentToMentor(
  rollNumber: string,
  facultyId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE students SET mentor_faculty_id = $1, updated_at = CURRENT_TIMESTAMP WHERE roll_number = $2`,
    [facultyId, toUpperOrNull(rollNumber)]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Remove a mentor assignment.
 */
export async function removeMentorAssignment(rollNumber: string): Promise<boolean> {
  const result = await query(
    `UPDATE students SET mentor_faculty_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE roll_number = $1`,
    [toUpperOrNull(rollNumber)]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get HOD credentials for a department.
 */
export async function findHodCredentials(department?: string): Promise<any | null> {
  const result = await query(
    department
      ? `SELECT * FROM hod_credentials WHERE LOWER(department) = LOWER($1)`
      : `SELECT * FROM hod_credentials`,
    department ? [department] : []
  );
  return result.rows[0] ?? null;
}

/**
 * Get subjects handled by a faculty member.
 */
export async function findSubjectsHandled(email: string): Promise<any[]> {
  const result = await query(
    `SELECT * FROM faculty_subjects_handled WHERE LOWER(faculty_email) = LOWER($1) ORDER BY created_at DESC`,
    [email.trim()]
  );
  return result.rows;
}
