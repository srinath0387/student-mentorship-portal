/**
 * repositories/facultySelection.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Faculty Selection: students pick one faculty per subject for their semester,
 * first come first served. All SQL for the module lives here (parameterized only).
 *
 * Tables are all prefixed fs_ and never alter existing tables. The only writes to
 * existing tables are subject_allotments / subject_rosters rows created for a pick;
 * every such row is recorded in fs_created_rows so a release or rollback removes
 * only what this module created.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { db } from '../db';

/** Anything with .query — the shared db object or a transaction client. */
export interface Q { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> }

/** Error carrying an HTTP status + machine code for the router. */
export class FsError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, any> = {}) {
    super(message);
  }
}

import { FS_DDL } from './facultySelection.schema';
export { FS_DDL, FS_ROLLBACK } from './facultySelection.schema';

let tablesReady: Promise<void> | null = null;
/** Lazy, memoized table creation (same pattern as the other modules) — no manual deploy step. */
export function ensureFsTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => { for (const s of FS_DDL) await db.query(s); })()
      .catch(err => { tablesReady = null; throw err; });
  }
  return tablesReady;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
export const normDept = (d: any) => String(d || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const normSection = (s: any) => String(s || '').trim().toUpperCase();

export async function audit(q: Q, a: { roundId?: string | null; actorEmail: string; actorRole: string; action: string; roll?: string | null; details?: any }) {
  await q.query(
    `INSERT INTO fs_audit_log (round_id, actor_email, actor_role, action, roll_number, details) VALUES ($1, $2, $3, $4, $5, $6)`,
    [a.roundId || null, a.actorEmail || 'unknown', a.actorRole || 'unknown', a.action, a.roll || null, JSON.stringify(a.details || {})]
  );
}

export async function getRound(q: Q, id: string): Promise<any | null> {
  const r = await q.query(`SELECT * FROM fs_rounds WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

/** A round accepts student picks only while open and inside its window. */
export function roundOpenNow(round: any, now = new Date()): boolean {
  return round?.status === 'open' && new Date(round.starts_at) <= now && now < new Date(round.ends_at);
}

export async function getStudent(q: Q, roll: string): Promise<any | null> {
  const r = await q.query(
    `SELECT roll_number, name, email, department, section, year FROM students WHERE UPPER(roll_number) = $1 LIMIT 1`,
    [String(roll || '').toUpperCase()]
  );
  return r.rows[0] || null;
}

export async function isEligible(q: Q, roundId: string, roll: string): Promise<boolean> {
  const r = await q.query(`SELECT 1 FROM fs_eligible_students WHERE round_id = $1 AND UPPER(roll_number) = $2`, [roundId, roll.toUpperCase()]);
  return r.rows.length > 0;
}

/**
 * Would a (semester, subject, section, faculty) class collide with a class of another department?
 * subject_allotments is unique on (semester_label, subject_name, section, faculty_email) without
 * department, so two departments must never share one row.
 */
export async function findDeptClash(q: Q, p: { semester: string; subject: string; section: string; facultyEmail: string; department: string }) {
  const r = await q.query(
    `SELECT id, department FROM subject_allotments
      WHERE semester_label = $1 AND LOWER(subject_name) = LOWER($2) AND UPPER(section) = $3 AND LOWER(faculty_email) = LOWER($4)`,
    [p.semester, p.subject, normSection(p.section), p.facultyEmail]
  );
  return r.rows.find((x: any) => normDept(x.department) !== normDept(p.department)) || null;
}

// ─── The pick ──────────────────────────────────────────────────────────────────
export interface PickInput {
  roundId: string;
  subjectId: string;
  offeringId: string;
  student: { roll_number: string; email: string; section: string };
  actor: { email: string; role: string };
  /** Admin assign/move: skips the group lock (student picks never do) */
  adminOverride?: boolean;
  /** Admin assign onto a released selection row (UNIQUE keeps one row per student+subject) */
  reuseReleasedId?: string;
}

/**
 * One subject pick. MUST run inside a transaction (q = transaction client).
 * Order: group lock → atomic seat claim → selection row (UNIQUE blocks duplicates) →
 * find-or-create the per-section attendance class → roster row → bookkeeping.
 * Any failure throws and the caller's transaction rolls everything back (seat included).
 */
export async function pickInTx(q: Q, p: PickInput) {
  const section = normSection(p.student.section);
  const roll = p.student.roll_number.toUpperCase();

  const o = (await q.query(
    `SELECT o.id, o.group_id, o.section, o.faculty_email, o.faculty_name, s.subject_name, s.subject_type,
            r.semester_label, r.department, g.name AS group_name
       FROM fs_offerings o
       JOIN fs_subjects s ON s.id = o.subject_id
       JOIN fs_rounds r ON r.id = o.round_id
       JOIN fs_groups g ON g.id = o.group_id
      WHERE o.id = $1 AND o.round_id = $2 AND o.subject_id = $3`,
    [p.offeringId, p.roundId, p.subjectId]
  )).rows[0];
  if (!o) throw new FsError(404, 'NO_OPTION', 'This faculty option is not part of this subject.');
  if (!section) throw new FsError(403, 'NO_SECTION', 'Your section is not set in your student record. Ask the admin to update it.');
  if (normSection(o.section) !== section) {
    throw new FsError(403, 'WRONG_SECTION', `This faculty option is for Section ${o.section}. You are in Section ${section}.`);
  }

  // Group lock: the first pick fixes the group; afterwards only that group's faculty
  if (!p.adminOverride) {
    await q.query(
      `INSERT INTO fs_student_groups (round_id, roll_number, group_id) VALUES ($1, $2, $3) ON CONFLICT (round_id, roll_number) DO NOTHING`,
      [p.roundId, roll, o.group_id]
    );
    const lock = (await q.query(
      `SELECT sg.group_id, g.name FROM fs_student_groups sg JOIN fs_groups g ON g.id = sg.group_id WHERE sg.round_id = $1 AND sg.roll_number = $2`,
      [p.roundId, roll]
    )).rows[0];
    if (lock && lock.group_id !== o.group_id) {
      throw new FsError(403, 'GROUP_LOCKED',
        `You are in ${lock.name} (fixed by your first choice). ${o.faculty_name} is in ${o.group_name}, so you can only choose ${lock.name} faculty.`,
        { locked_group: lock.name });
    }
  }

  // Atomic seat claim — never read-then-write
  const seat = (await q.query(
    `UPDATE fs_offerings SET filled = filled + 1 WHERE id = $1 AND filled < capacity RETURNING id, capacity, filled`,
    [p.offeringId]
  )).rows[0];
  if (!seat) throw new FsError(409, 'SEATS_FULL', `No seats left with ${o.faculty_name} for ${o.subject_name}. Pick another faculty.`);

  // Selection row: UNIQUE (round, roll, subject) blocks double clicks and second picks
  let sel: any;
  if (p.reuseReleasedId) {
    sel = (await q.query(
      `UPDATE fs_selections SET offering_id = $2, group_id = $3, section = $4, status = 'active', picked_by = $5, updated_at = clock_timestamp()
        WHERE id = $1 AND status = 'released' RETURNING id, created_at`,
      [p.reuseReleasedId, p.offeringId, o.group_id, section, p.actor.email]
    )).rows[0];
    if (!sel) throw new FsError(409, 'ALREADY_SELECTED', 'This student already has a faculty for this subject.');
  } else {
    try {
      sel = (await q.query(
        `INSERT INTO fs_selections (round_id, subject_id, offering_id, group_id, roll_number, section, picked_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
        [p.roundId, p.subjectId, p.offeringId, o.group_id, roll, section, p.actor.email]
      )).rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new FsError(409, 'ALREADY_SELECTED', `You have already chosen a faculty for ${o.subject_name}. Your first choice is final.`);
      }
      throw err;
    }
  }

  // Attendance class for the student's own section (find-or-create; departments never share one)
  const existing = (await q.query(
    `SELECT id, department FROM subject_allotments
      WHERE semester_label = $1 AND LOWER(subject_name) = LOWER($2) AND UPPER(section) = $3 AND LOWER(faculty_email) = LOWER($4)
      ORDER BY created_at LIMIT 1`,
    [o.semester_label, o.subject_name, section, o.faculty_email]
  )).rows[0];
  let allotmentId: string;
  let allotmentCreated = false;
  if (existing) {
    if (normDept(existing.department) !== normDept(o.department)) {
      throw new FsError(409, 'DEPT_CLASH',
        `${o.faculty_name} already has ${o.subject_name}, Section ${section}, ${o.semester_label} in ${existing.department}. Ask the admin to rename this subject (for example "${o.subject_name} (${o.department})").`);
    }
    allotmentId = existing.id;
  } else {
    const ins = (await q.query(
      `INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, faculty_name, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (semester_label, subject_name, section, faculty_email) DO NOTHING
       RETURNING id`,
      [o.semester_label, o.subject_name, o.subject_type, section, o.faculty_email, o.faculty_name, o.department]
    )).rows[0];
    if (ins) {
      allotmentId = ins.id;
      allotmentCreated = true;
    } else {
      // Created by a parallel pick a moment ago — reuse it
      const again = (await q.query(
        `SELECT id, department FROM subject_allotments WHERE semester_label = $1 AND subject_name = $2 AND section = $3 AND faculty_email = $4`,
        [o.semester_label, o.subject_name, section, o.faculty_email]
      )).rows[0];
      if (!again) throw new Error('Could not create the attendance class');
      if (normDept(again.department) !== normDept(o.department)) {
        throw new FsError(409, 'DEPT_CLASH', `${o.faculty_name} already has ${o.subject_name}, Section ${section} in ${again.department}.`);
      }
      allotmentId = again.id;
    }
  }

  const roster = (await q.query(
    `INSERT INTO subject_rosters (allotment_id, roll_number, student_email) VALUES ($1, $2, $3)
     ON CONFLICT (allotment_id, roll_number) DO NOTHING RETURNING id`,
    [allotmentId, roll, p.student.email || '']
  )).rows[0];

  if (allotmentCreated) {
    await q.query(
      `INSERT INTO fs_created_rows (round_id, selection_id, table_name, row_id) VALUES ($1, $2, 'subject_allotments', $3) ON CONFLICT DO NOTHING`,
      [p.roundId, sel.id, allotmentId]
    );
  }
  if (roster) {
    await q.query(
      `INSERT INTO fs_created_rows (round_id, selection_id, table_name, row_id) VALUES ($1, $2, 'subject_rosters', $3) ON CONFLICT DO NOTHING`,
      [p.roundId, sel.id, roster.id]
    );
  }
  await q.query(`UPDATE fs_selections SET allotment_id = $2 WHERE id = $1`, [sel.id, allotmentId]);

  await audit(q, {
    roundId: p.roundId, actorEmail: p.actor.email, actorRole: p.actor.role, roll,
    action: p.adminOverride ? 'assign' : 'select',
    details: { subject: o.subject_name, faculty: o.faculty_email, group: o.group_name, section, offering_id: p.offeringId, allotment_id: allotmentId, allotment_created: allotmentCreated, roster_created: !!roster },
  });

  return {
    selection_id: sel.id, created_at: sel.created_at, subject_name: o.subject_name, faculty_name: o.faculty_name,
    group_name: o.group_name, section, allotment_id: allotmentId, seats_left: seat.capacity - seat.filled,
  };
}

/**
 * Release a pick (admin/HOD). MUST run inside a transaction.
 * Gives the seat back, removes only the roster row this module created, and removes the
 * attendance class only if this module created it and nothing uses it any more.
 * The selection row stays (status 'released') so the student cannot pick again — only admin assigns.
 */
export async function releaseInTx(q: Q, selectionId: string, actor: { email: string; role: string }, reason?: string) {
  const sel = (await q.query(
    `SELECT sel.*, s.subject_name, o.faculty_name, o.faculty_email
       FROM fs_selections sel
       JOIN fs_subjects s ON s.id = sel.subject_id
       LEFT JOIN fs_offerings o ON o.id = sel.offering_id
      WHERE sel.id = $1 FOR UPDATE OF sel`,
    [selectionId]
  )).rows[0];
  if (!sel) throw new FsError(404, 'NOT_FOUND', 'Selection not found.');
  if (sel.status !== 'active') throw new FsError(409, 'ALREADY_RELEASED', 'This choice was already released.');

  await q.query(`UPDATE fs_offerings SET filled = filled - 1 WHERE id = $1 AND filled > 0`, [sel.offering_id]);

  const created = (await q.query(
    `DELETE FROM fs_created_rows WHERE selection_id = $1 AND table_name = 'subject_rosters' RETURNING row_id`,
    [selectionId]
  )).rows.map((r: any) => r.row_id);
  if (created.length) await q.query(`DELETE FROM subject_rosters WHERE id = ANY($1::uuid[])`, [created]);

  let allotmentRemoved = false;
  if (sel.allotment_id) {
    const own = (await q.query(
      `SELECT 1 FROM fs_created_rows WHERE table_name = 'subject_allotments' AND row_id = $1`, [sel.allotment_id]
    )).rows.length > 0;
    if (own) {
      const del = await q.query(
        `DELETE FROM subject_allotments a WHERE a.id = $1
            AND NOT EXISTS (SELECT 1 FROM subject_rosters r WHERE r.allotment_id = a.id)
            AND NOT EXISTS (SELECT 1 FROM attendance_sessions x WHERE x.allotment_id = a.id)
          RETURNING id`,
        [sel.allotment_id]
      );
      if (del.rows.length) {
        allotmentRemoved = true;
        await q.query(`DELETE FROM fs_created_rows WHERE table_name = 'subject_allotments' AND row_id = $1`, [sel.allotment_id]);
      }
    }
  }

  await q.query(
    `UPDATE fs_selections SET status = 'released', offering_id = NULL, allotment_id = NULL, updated_at = clock_timestamp() WHERE id = $1`,
    [selectionId]
  );
  await audit(q, {
    roundId: sel.round_id, actorEmail: actor.email, actorRole: actor.role, roll: sel.roll_number, action: 'release',
    details: { subject: sel.subject_name, faculty: sel.faculty_email, roster_rows_removed: created.length, class_removed: allotmentRemoved, reason: reason || null },
  });
  return { ...sel, roster_rows_removed: created.length, class_removed: allotmentRemoved };
}

// ─── Read models ───────────────────────────────────────────────────────────────
export async function roundDetail(q: Q, roundId: string) {
  const [groups, subjects, offerings, counts] = await Promise.all([
    q.query(`SELECT id, name FROM fs_groups WHERE round_id = $1 ORDER BY name`, [roundId]),
    q.query(`SELECT id, subject_name, subject_type, sort_order FROM fs_subjects WHERE round_id = $1 ORDER BY sort_order, subject_name`, [roundId]),
    q.query(
      `SELECT o.id, o.subject_id, o.group_id, g.name AS group_name, o.section, o.faculty_email, o.faculty_name, o.capacity, o.filled
         FROM fs_offerings o JOIN fs_groups g ON g.id = o.group_id
        WHERE o.round_id = $1 ORDER BY g.name, o.section, o.faculty_name`, [roundId]),
    q.query(
      `SELECT COUNT(*)::int AS eligible, ARRAY_REMOVE(ARRAY_AGG(DISTINCT UPPER(NULLIF(TRIM(st.section), ''))), NULL) AS sections
         FROM fs_eligible_students e JOIN students st ON st.roll_number = e.roll_number WHERE e.round_id = $1`, [roundId]),
  ]);
  return { groups: groups.rows, subjects: subjects.rows, offerings: offerings.rows, eligible_count: counts.rows[0]?.eligible || 0, eligible_sections: counts.rows[0]?.sections || [] };
}

/** Per-student progress: how many subjects each eligible student has an active pick for. */
export async function studentProgress(q: Q, roundId: string) {
  const r = await q.query(
    `SELECT e.roll_number, st.name, UPPER(COALESCE(st.section, '')) AS section,
            COUNT(sel.id) FILTER (WHERE sel.status = 'active')::int AS picked,
            COUNT(sel.id) FILTER (WHERE sel.status = 'released')::int AS released,
            MIN(sel.created_at) AS first_pick_at
       FROM fs_eligible_students e
       JOIN students st ON st.roll_number = e.roll_number
       LEFT JOIN fs_selections sel ON sel.round_id = e.round_id AND sel.roll_number = e.roll_number
      WHERE e.round_id = $1
      GROUP BY e.roll_number, st.name, st.section
      ORDER BY e.roll_number`,
    [roundId]
  );
  return r.rows;
}

export async function listSelections(q: Q, roundId: string) {
  const r = await q.query(
    `SELECT sel.id, sel.roll_number, st.name AS student_name, sel.section, sel.status, sel.created_at, sel.updated_at, sel.picked_by,
            sel.subject_id, s.subject_name, s.subject_type, sel.offering_id, o.faculty_name, o.faculty_email, g.name AS group_name
       FROM fs_selections sel
       JOIN fs_subjects s ON s.id = sel.subject_id
       LEFT JOIN students st ON st.roll_number = sel.roll_number
       LEFT JOIN fs_offerings o ON o.id = sel.offering_id
       LEFT JOIN fs_groups g ON g.id = sel.group_id
      WHERE sel.round_id = $1
      ORDER BY sel.created_at, sel.id`,
    [roundId]
  );
  return r.rows;
}
