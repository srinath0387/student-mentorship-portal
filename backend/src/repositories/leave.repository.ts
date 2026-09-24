/**
 * repositories/leave.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.4 — All raw SQL queries for faculty leave and student permissions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query } from './base.repository';

// ─── Faculty Leaves ───────────────────────────────────────────────────────────

export async function findFacultyLeaves(filters: {
  faculty_email?: string;
  department?: string;
  status?: string;
  limit?: number;
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
  if (filters.status) {
    conditions.push(`LOWER(status) = LOWER($${idx++})`);
    values.push(filters.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM faculty_leave_applications ${where} ORDER BY created_at DESC LIMIT $${idx}`,
    [...values, filters.limit ?? 200]
  );
  return result.rows;
}

export async function findLeaveById(id: string): Promise<any | null> {
  const result = await query(`SELECT * FROM faculty_leave_applications WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function insertLeaveApplication(data: {
  faculty_email: string;
  faculty_name: string;
  department: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  contact_during_leave?: string;
  total_days?: number;
}): Promise<any> {
  const result = await query(
    `INSERT INTO faculty_leave_applications
       (faculty_email, faculty_name, department, leave_type, from_date, to_date, reason, contact_during_leave, total_days, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [data.faculty_email, data.faculty_name, data.department, data.leave_type, data.from_date, data.to_date, data.reason, data.contact_during_leave ?? null, data.total_days ?? null]
  );
  return result.rows[0];
}

export async function updateLeaveStatus(
  id: string,
  status: string,
  remarks?: string,
  approvedBy?: string
): Promise<any | null> {
  const result = await query(
    `UPDATE faculty_leave_applications
     SET status = $1, remarks = $2, approved_by = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING *`,
    [status, remarks ?? null, approvedBy ?? null, id]
  );
  return result.rows[0] ?? null;
}

export async function deleteLeaveApplication(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM faculty_leave_applications WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Leave Credits ────────────────────────────────────────────────────────────

export async function findLeaveCredits(email?: string): Promise<any[]> {
  const result = await query(
    email
      ? `SELECT * FROM faculty_leave_credits WHERE LOWER(faculty_email) = LOWER($1)`
      : `SELECT * FROM faculty_leave_credits ORDER BY faculty_email`,
    email ? [email] : []
  );
  return result.rows;
}

// ─── Student Permissions ──────────────────────────────────────────────────────

export async function findStudentPermissions(filters: {
  student_roll?: string;
  status?: string;
  department?: string;
  limit?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.student_roll) {
    conditions.push(`LOWER(student_roll) = LOWER($${idx++})`);
    values.push(filters.student_roll);
  }
  if (filters.status) {
    conditions.push(`LOWER(status) = LOWER($${idx++})`);
    values.push(filters.status);
  }
  if (filters.department) {
    conditions.push(`LOWER(department) = LOWER($${idx++})`);
    values.push(filters.department);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT sp.*, s.name as student_name FROM student_permissions sp
     LEFT JOIN students s ON s.roll_number = sp.student_roll
     ${where} ORDER BY sp.created_at DESC LIMIT $${idx}`,
    [...values, filters.limit ?? 200]
  );
  return result.rows;
}

export async function insertStudentPermission(data: {
  student_roll: string;
  student_name: string;
  department: string;
  reason: string;
  from_date: string;
  to_date: string;
  duration_hours?: number;
}): Promise<any> {
  const result = await query(
    `INSERT INTO student_permissions (student_roll, student_name, department, reason, from_date, to_date, duration_hours, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [data.student_roll, data.student_name, data.department, data.reason, data.from_date, data.to_date, data.duration_hours ?? null]
  );
  return result.rows[0];
}

export async function updatePermissionStatus(
  id: string,
  status: string,
  approvedBy?: string
): Promise<any | null> {
  const result = await query(
    `UPDATE student_permissions SET status = $1, approved_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
    [status, approvedBy ?? null, id]
  );
  return result.rows[0] ?? null;
}
