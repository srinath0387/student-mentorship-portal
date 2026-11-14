/**
 * routes/facultySelection.routes.ts — Faculty Selection (mounted at /faculty-selection in api.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin / HOD (own department only): rounds, eligible students, groups, subjects,
 *   faculty options with per-section seats, live dashboard, release / assign / move, audit.
 * Student: own semester + section only, one faculty per subject, first confirmed choice is final.
 * Faculty: read-only list of students who selected them.
 *
 * Every pick is its own transaction (repository.pickInTx): atomic seat claim, UNIQUE selection
 * row, and the student goes straight onto the existing attendance roster for their own section.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { requireRole } from '../lib/authMiddleware';
import {
  roundCreateSchema, roundUpdateSchema, roundStatusSchema, eligibleAddSchema, groupSchema, subjectSchema,
  subjectUpdateSchema, offeringCreateSchema, offeringUpdateSchema, selectSchema, releaseSchema, assignSchema,
  reassignSchema, zodMessage,
} from '../lib/facultySelection.schemas';
import {
  FsError, ensureFsTables, audit, getRound, roundOpenNow, getStudent, isEligible, findDeptClash, pickInTx,
  releaseInTx, roundDetail, studentProgress, listSelections, normDept, normSection,
} from '../repositories/facultySelection.repository';

const router = Router();

// ─── Plumbing ──────────────────────────────────────────────────────────────────
router.use(async (_req: Request, res: Response, next) => {
  if ((db as any).isMock) {
    return res.status(503).json({ error: 'Faculty selection needs the database. It is not available in mock mode (USE_MOCK=true).' });
  }
  try {
    await ensureFsTables();
    next();
  } catch (err: any) {
    res.status(500).json({ error: `Faculty selection tables are not ready: ${err.message}` });
  }
});

type Handler = (req: Request, res: Response) => Promise<any>;
const h = (fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (err: any) {
    if (err instanceof FsError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    console.error('[faculty-selection]', err);
    res.status(500).json({ error: err?.message || 'Something went wrong' });
  }
};

function parse<T>(schema: { safeParse: (v: any) => any }, body: any): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new FsError(400, 'INVALID', zodMessage(r.error));
  return r.data as T;
}

const actorOf = (req: Request) => ({ email: req.auth?.email || 'unknown', role: req.auth?.role || 'unknown' });
const MANAGERS = ['admin', 'hod'];
const ALL_DEPTS = ['*', 'all', 'ALL', 'All'];

/** Which departments the caller manages. Super admin: all. Department admin / HOD: their own. */
async function scopeOf(req: Request): Promise<{ all: boolean; dept: string | null }> {
  const a = req.auth!;
  if (a.role === 'admin') {
    if (a.isSuperAdmin || !a.department || ALL_DEPTS.includes(a.department)) return { all: true, dept: null };
    return { all: false, dept: a.department };
  }
  if (a.role === 'hod') {
    let dept = a.department && !ALL_DEPTS.includes(a.department) ? a.department : '';
    if (!dept) {
      const f = await db.query('SELECT department FROM faculty WHERE LOWER(email) = LOWER($1) LIMIT 1', [a.email || '']).catch(() => ({ rows: [] as any[] }));
      dept = f.rows[0]?.department || '';
    }
    if (!dept) throw new FsError(403, 'NO_DEPARTMENT', 'Your account has no department, so you cannot manage faculty selection.');
    return { all: false, dept };
  }
  throw new FsError(403, 'FORBIDDEN', 'Only admins and HODs can manage faculty selection.');
}
function deptAllowed(scope: { all: boolean; dept: string | null }, dept: string): boolean {
  if (scope.all) return true;
  if (!scope.dept) return false;
  if (scope.dept === 'CSE_ALLIED') return normDept(dept).startsWith('cse');
  return normDept(scope.dept) === normDept(dept);
}
async function managedRound(req: Request, roundId: string) {
  const round = await getRound(db, roundId);
  if (!round) throw new FsError(404, 'NOT_FOUND', 'Round not found.');
  if (!deptAllowed(await scopeOf(req), round.department)) throw new FsError(403, 'OTHER_DEPARTMENT', 'This round belongs to another department.');
  return round;
}
async function roundIdOf(table: 'fs_groups' | 'fs_subjects' | 'fs_offerings' | 'fs_selections', id: string): Promise<string> {
  const r = await db.query(`SELECT round_id FROM ${table} WHERE id = $1`, [id]);
  if (!r.rows[0]) throw new FsError(404, 'NOT_FOUND', 'Not found.');
  return r.rows[0].round_id;
}
const selectionCount = async (roundId: string) =>
  Number((await db.query(`SELECT COUNT(*)::int AS n FROM fs_selections WHERE round_id = $1`, [roundId])).rows[0]?.n || 0);

// ─── Rounds ────────────────────────────────────────────────────────────────────
router.get('/rounds', requireRole(...MANAGERS), h(async (req, res) => {
  const scope = await scopeOf(req);
  const r = await db.query(
    `SELECT r.*,
            (SELECT COUNT(*)::int FROM fs_eligible_students e WHERE e.round_id = r.id) AS eligible_count,
            (SELECT COUNT(*)::int FROM fs_subjects s WHERE s.round_id = r.id) AS subject_count,
            (SELECT COUNT(*)::int FROM fs_selections x WHERE x.round_id = r.id AND x.status = 'active') AS selection_count
       FROM fs_rounds r ORDER BY r.created_at DESC LIMIT 500`
  );
  res.json(r.rows.filter((x: any) => deptAllowed(scope, x.department)).map((x: any) => ({ ...x, open_now: roundOpenNow(x) })));
}));

router.post('/rounds', requireRole(...MANAGERS), h(async (req, res) => {
  const body = parse<any>(roundCreateSchema, req.body);
  const scope = await scopeOf(req);
  let department = scope.all || scope.dept === 'CSE_ALLIED' ? (body.department || '') : scope.dept!;
  if (!department) throw new FsError(400, 'INVALID', 'Choose the department for this round.');
  if (!deptAllowed(scope, department)) throw new FsError(403, 'OTHER_DEPARTMENT', 'You can only create rounds for your own department.');
  department = department.trim();
  const r = await db.query(
    `INSERT INTO fs_rounds (department, semester_label, title, starts_at, ends_at, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [department, body.semester_label, body.title, body.starts_at, body.ends_at, req.auth!.email]
  );
  await audit(db, { roundId: r.rows[0].id, ...actor(req), action: 'round_create', details: { title: body.title, semester: body.semester_label, department } });
  res.status(201).json(r.rows[0]);
}));

function actor(req: Request) {
  const a = actorOf(req);
  return { actorEmail: a.email, actorRole: a.role };
}

router.get('/rounds/:id', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const detail = await roundDetail(db, round.id);
  res.json({ ...round, open_now: roundOpenNow(round), ...detail });
}));

router.put('/rounds/:id', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const body = parse<any>(roundUpdateSchema, req.body);
  const starts = body.starts_at ?? round.starts_at;
  const ends = body.ends_at ?? round.ends_at;
  if (new Date(ends) <= new Date(starts)) throw new FsError(400, 'INVALID', 'Close time must be after open time.');
  const sections = body.sections ? Array.from(new Set(body.sections.map(normSection).filter(Boolean))) : round.sections;
  const r = await db.query(
    `UPDATE fs_rounds SET title = $2, starts_at = $3, ends_at = $4, sections = $5, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [round.id, body.title ?? round.title, starts, ends, sections]
  );
  await audit(db, { roundId: round.id, ...actor(req), action: 'round_update', details: body });
  res.json(r.rows[0]);
}));

router.post('/rounds/:id/status', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const { status } = parse<any>(roundStatusSchema, req.body);
  if (status === 'open') {
    const d = await roundDetail(db, round.id);
    if (!d.eligible_count) throw new FsError(400, 'NOT_READY', 'Add eligible students before opening the round.');
    if (!d.offerings.length) throw new FsError(400, 'NOT_READY', 'Add at least one subject with faculty options before opening the round.');
    const bare = d.subjects.filter((s: any) => !d.offerings.some((o: any) => o.subject_id === s.id));
    if (bare.length) throw new FsError(400, 'NOT_READY', `These subjects have no faculty options yet: ${bare.map((s: any) => s.subject_name).join(', ')}.`);
  }
  if (status === 'draft' && await selectionCount(round.id) > 0) {
    throw new FsError(409, 'HAS_SELECTIONS', 'Students have already picked in this round. Close it instead of moving it back to draft.');
  }
  const r = await db.query(`UPDATE fs_rounds SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [round.id, status]);
  await audit(db, { roundId: round.id, ...actor(req), action: `round_${status}`, details: { from: round.status } });
  res.json({ ...r.rows[0], open_now: roundOpenNow(r.rows[0]) });
}));

router.delete('/rounds/:id', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  if (await selectionCount(round.id) > 0) throw new FsError(409, 'HAS_SELECTIONS', 'Students have already picked in this round, so it cannot be deleted. Close it instead.');
  await db.query(`DELETE FROM fs_rounds WHERE id = $1`, [round.id]);
  await audit(db, { roundId: round.id, ...actor(req), action: 'round_delete', details: { title: round.title } });
  res.json({ deleted: true });
}));

// ─── Eligible students ─────────────────────────────────────────────────────────
router.get('/rounds/:id/eligible', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  res.json(await studentProgress(db, round.id));
}));

router.post('/rounds/:id/eligible', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const { rolls } = parse<any>(eligibleAddSchema, req.body);
  const seen = new Set<string>();
  const results: any[] = [];
  const candidates: string[] = [];
  for (const raw of rolls) {
    const roll = String(raw || '').trim().toUpperCase();
    if (!roll) continue;
    if (seen.has(roll)) { results.push({ roll_number: roll, result: 'duplicate', message: 'Listed more than once' }); continue; }
    seen.add(roll);
    if (!/^[0-9A-Z]{10}$/.test(roll)) { results.push({ roll_number: roll, result: 'invalid', message: 'Not a valid roll number' }); continue; }
    candidates.push(roll);
  }
  const found = candidates.length
    ? (await db.query(`SELECT roll_number, name, department, section, year FROM students WHERE UPPER(roll_number) = ANY($1)`, [candidates])).rows
    : [];
  const byRoll = new Map(found.map((s: any) => [String(s.roll_number).toUpperCase(), s]));
  const already = candidates.length
    ? new Set((await db.query(`SELECT UPPER(roll_number) AS r FROM fs_eligible_students WHERE round_id = $1 AND UPPER(roll_number) = ANY($2)`, [round.id, candidates])).rows.map((x: any) => x.r))
    : new Set<string>();
  const yearDigit = String(round.semester_label).charAt(0);
  const toAdd: string[] = [];
  for (const roll of candidates) {
    const s: any = byRoll.get(roll);
    if (!s) { results.push({ roll_number: roll, result: 'not_found', message: 'Not in the students list' }); continue; }
    const base = { roll_number: s.roll_number, name: s.name, section: normSection(s.section), department: s.department };
    if (normDept(s.department) !== normDept(round.department)) { results.push({ ...base, result: 'other_department', message: `Student is in ${s.department}` }); continue; }
    if (already.has(roll)) { results.push({ ...base, result: 'duplicate', message: 'Already in this round' }); continue; }
    const warning = !normSection(s.section) ? 'No section in the student record — they cannot pick until it is set'
      : String(s.year || '').charAt(0) !== yearDigit ? `Student record says ${s.year || 'no year'}` : undefined;
    toAdd.push(s.roll_number);
    results.push({ ...base, result: 'added', ...(warning ? { warning } : {}) });
  }
  if (toAdd.length) {
    await db.query(
      `INSERT INTO fs_eligible_students (round_id, roll_number, added_by) SELECT $1, UNNEST($2::varchar[]), $3 ON CONFLICT DO NOTHING`,
      [round.id, toAdd, req.auth!.email]
    );
    await audit(db, { roundId: round.id, ...actor(req), action: 'eligible_add', details: { count: toAdd.length } });
  }
  const summary = results.reduce((m: any, r: any) => { m[r.result] = (m[r.result] || 0) + 1; return m; }, {});
  res.json({ summary, results });
}));

router.delete('/rounds/:id/eligible/:roll', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const roll = req.params.roll.toUpperCase();
  const used = await db.query(`SELECT 1 FROM fs_selections WHERE round_id = $1 AND roll_number = $2 LIMIT 1`, [round.id, roll]);
  if (used.rows.length) throw new FsError(409, 'HAS_SELECTIONS', 'This student has already picked. Release their choices first.');
  await db.query(`DELETE FROM fs_eligible_students WHERE round_id = $1 AND UPPER(roll_number) = $2`, [round.id, roll]);
  await db.query(`DELETE FROM fs_student_groups WHERE round_id = $1 AND roll_number = $2`, [round.id, roll]);
  await audit(db, { roundId: round.id, ...actor(req), action: 'eligible_remove', roll });
  res.json({ removed: true });
}));

// ─── Groups ────────────────────────────────────────────────────────────────────
router.post('/rounds/:id/groups', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const { name } = parse<any>(groupSchema, req.body);
  try {
    const r = await db.query(`INSERT INTO fs_groups (round_id, name) VALUES ($1, $2) RETURNING id, name`, [round.id, name]);
    await audit(db, { roundId: round.id, ...actor(req), action: 'group_create', details: { name } });
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    if (err?.code === '23505') throw new FsError(409, 'DUPLICATE', `There is already a group called ${name}.`);
    throw err;
  }
}));

router.put('/groups/:gid', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_groups', req.params.gid));
  const { name } = parse<any>(groupSchema, req.body);
  try {
    const r = await db.query(`UPDATE fs_groups SET name = $2 WHERE id = $1 RETURNING id, name`, [req.params.gid, name]);
    await audit(db, { roundId: round.id, ...actor(req), action: 'group_rename', details: { group_id: req.params.gid, name } });
    res.json(r.rows[0]);
  } catch (err: any) {
    if (err?.code === '23505') throw new FsError(409, 'DUPLICATE', `There is already a group called ${name}.`);
    throw err;
  }
}));

router.delete('/groups/:gid', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_groups', req.params.gid));
  const used = await db.query(`SELECT 1 FROM fs_offerings WHERE group_id = $1 LIMIT 1`, [req.params.gid]);
  if (used.rows.length) throw new FsError(409, 'IN_USE', 'Remove this group\'s faculty options first.');
  await db.query(`DELETE FROM fs_groups WHERE id = $1`, [req.params.gid]);
  await audit(db, { roundId: round.id, ...actor(req), action: 'group_delete', details: { group_id: req.params.gid } });
  res.json({ deleted: true });
}));

// ─── Subjects ──────────────────────────────────────────────────────────────────
router.post('/rounds/:id/subjects', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const body = parse<any>(subjectSchema, req.body);
  try {
    const r = await db.query(
      `INSERT INTO fs_subjects (round_id, subject_name, subject_type, sort_order)
       VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM fs_subjects WHERE round_id = $1))) RETURNING *`,
      [round.id, body.subject_name, body.subject_type, body.sort_order ?? null]
    );
    await audit(db, { roundId: round.id, ...actor(req), action: 'subject_create', details: body });
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    if (err?.code === '23505') throw new FsError(409, 'DUPLICATE', `${body.subject_name} is already in this round.`);
    throw err;
  }
}));

router.put('/subjects/:sid', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_subjects', req.params.sid));
  const body = parse<any>(subjectUpdateSchema, req.body);
  const cur = (await db.query(`SELECT * FROM fs_subjects WHERE id = $1`, [req.params.sid])).rows[0];
  const changesClass = (body.subject_name && body.subject_name !== cur.subject_name) || (body.subject_type && body.subject_type !== cur.subject_type);
  if (changesClass) {
    const used = await db.query(`SELECT 1 FROM fs_selections WHERE subject_id = $1 LIMIT 1`, [req.params.sid]);
    if (used.rows.length) throw new FsError(409, 'HAS_SELECTIONS', 'Students have already picked this subject, so its name and type cannot change.');
  }
  try {
    const r = await db.query(
      `UPDATE fs_subjects SET subject_name = $2, subject_type = $3, sort_order = $4 WHERE id = $1 RETURNING *`,
      [req.params.sid, body.subject_name ?? cur.subject_name, body.subject_type ?? cur.subject_type, body.sort_order ?? cur.sort_order]
    );
    await audit(db, { roundId: round.id, ...actor(req), action: 'subject_update', details: { subject_id: req.params.sid, ...body } });
    res.json(r.rows[0]);
  } catch (err: any) {
    if (err?.code === '23505') throw new FsError(409, 'DUPLICATE', `${body.subject_name} is already in this round.`);
    throw err;
  }
}));

router.delete('/subjects/:sid', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_subjects', req.params.sid));
  const used = await db.query(`SELECT 1 FROM fs_selections WHERE subject_id = $1 LIMIT 1`, [req.params.sid]);
  if (used.rows.length) throw new FsError(409, 'HAS_SELECTIONS', 'Students have already picked this subject, so it cannot be deleted.');
  await db.query(`DELETE FROM fs_subjects WHERE id = $1`, [req.params.sid]);
  await audit(db, { roundId: round.id, ...actor(req), action: 'subject_delete', details: { subject_id: req.params.sid } });
  res.json({ deleted: true });
}));

// ─── Faculty options (offerings) ───────────────────────────────────────────────
async function facultyByEmail(email: string) {
  const f = (await db.query(`SELECT name, email, department FROM faculty WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email])).rows[0];
  if (!f) throw new FsError(400, 'UNKNOWN_FACULTY', `${email} is not in the faculty list.`);
  return f;
}

router.get('/faculty-options', requireRole(...MANAGERS), h(async (_req, res) => {
  const r = await db.query(`SELECT name, email, department FROM faculty WHERE email NOT LIKE 'pending\\_%' ORDER BY department, name LIMIT 5000`);
  res.json(r.rows);
}));

router.post('/subjects/:sid/offerings', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_subjects', req.params.sid));
  const body = parse<any>(offeringCreateSchema, req.body);
  const subject = (await db.query(`SELECT * FROM fs_subjects WHERE id = $1`, [req.params.sid])).rows[0];
  const group = (await db.query(`SELECT id, name FROM fs_groups WHERE id = $1 AND round_id = $2`, [body.group_id, round.id])).rows[0];
  if (!group) throw new FsError(400, 'INVALID', 'That group is not part of this round.');
  const fac = await facultyByEmail(body.faculty_email);
  const clash = await findDeptClash(db, { semester: round.semester_label, subject: subject.subject_name, section: body.section, facultyEmail: fac.email, department: round.department });
  if (clash) {
    throw new FsError(409, 'DEPT_CLASH',
      `${fac.name} already teaches ${subject.subject_name}, Section ${body.section}, ${round.semester_label} in ${clash.department}. Rename this subject (for example "${subject.subject_name} (${round.department})") so the two departments get separate attendance classes.`);
  }
  try {
    const r = await db.query(
      `INSERT INTO fs_offerings (round_id, subject_id, group_id, section, faculty_email, faculty_name, capacity) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [round.id, subject.id, group.id, body.section, fac.email, fac.name, body.capacity]
    );
    await audit(db, { roundId: round.id, ...actor(req), action: 'offering_create', details: { subject: subject.subject_name, group: group.name, section: body.section, faculty: fac.email, capacity: body.capacity } });
    res.status(201).json({ ...r.rows[0], group_name: group.name });
  } catch (err: any) {
    if (err?.code === '23505') throw new FsError(409, 'DUPLICATE', `${group.name} already has a faculty for Section ${body.section} in ${subject.subject_name}.`);
    throw err;
  }
}));

router.put('/offerings/:oid', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_offerings', req.params.oid));
  const body = parse<any>(offeringUpdateSchema, req.body);
  const cur = (await db.query(
    `SELECT o.*, s.subject_name FROM fs_offerings o JOIN fs_subjects s ON s.id = o.subject_id WHERE o.id = $1`, [req.params.oid])).rows[0];
  let facultyEmail = cur.faculty_email, facultyName = cur.faculty_name;
  if (body.faculty_email && body.faculty_email.toLowerCase() !== String(cur.faculty_email).toLowerCase()) {
    const used = await db.query(`SELECT 1 FROM fs_selections WHERE offering_id = $1 LIMIT 1`, [cur.id]);
    if (used.rows.length || cur.filled > 0) throw new FsError(409, 'HAS_SELECTIONS', 'Students have already picked this faculty. Release them before changing the faculty.');
    const fac = await facultyByEmail(body.faculty_email);
    const clash = await findDeptClash(db, { semester: round.semester_label, subject: cur.subject_name, section: cur.section, facultyEmail: fac.email, department: round.department });
    if (clash) throw new FsError(409, 'DEPT_CLASH', `${fac.name} already teaches ${cur.subject_name}, Section ${cur.section} in ${clash.department}.`);
    facultyEmail = fac.email; facultyName = fac.name;
  }
  const capacity = body.capacity ?? cur.capacity;
  // Atomic guard: never below the seats already filled (checked against the live row)
  const r = await db.query(
    `UPDATE fs_offerings SET capacity = $2, faculty_email = $3, faculty_name = $4 WHERE id = $1 AND filled <= $2 RETURNING *`,
    [cur.id, capacity, facultyEmail, facultyName]
  );
  if (!r.rows[0]) {
    const now = (await db.query(`SELECT filled FROM fs_offerings WHERE id = $1`, [cur.id])).rows[0];
    throw new FsError(409, 'BELOW_FILLED', `${now?.filled ?? cur.filled} students have already picked this faculty, so seats cannot go below that.`);
  }
  await audit(db, { roundId: round.id, ...actor(req), action: 'offering_update', details: { offering_id: cur.id, from: { capacity: cur.capacity, faculty: cur.faculty_email }, to: { capacity, faculty: facultyEmail } } });
  res.json(r.rows[0]);
}));

router.delete('/offerings/:oid', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_offerings', req.params.oid));
  const used = await db.query(`SELECT 1 FROM fs_selections WHERE offering_id = $1 LIMIT 1`, [req.params.oid]);
  if (used.rows.length) throw new FsError(409, 'HAS_SELECTIONS', 'Students have picked this faculty. Release them first.');
  const del = await db.query(`DELETE FROM fs_offerings WHERE id = $1 AND filled = 0 RETURNING id`, [req.params.oid]);
  if (!del.rows.length) throw new FsError(409, 'HAS_SELECTIONS', 'Students have picked this faculty. Release them first.');
  await audit(db, { roundId: round.id, ...actor(req), action: 'offering_delete', details: { offering_id: req.params.oid } });
  res.json({ deleted: true });
}));

// ─── Dashboard, selections, audit ──────────────────────────────────────────────
router.get('/rounds/:id/dashboard', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const [detail, progress] = await Promise.all([roundDetail(db, round.id), studentProgress(db, round.id)]);
  const subjectCount = detail.subjects.length;
  const complete = progress.filter((p: any) => subjectCount > 0 && p.picked >= subjectCount).length;
  const none = progress.filter((p: any) => p.picked === 0).length;
  res.json({
    round: { ...round, open_now: roundOpenNow(round) },
    ...detail,
    counts: { eligible: progress.length, complete, partial: progress.length - complete - none, none, released: progress.reduce((n: number, p: any) => n + p.released, 0) },
    students: progress,
    server_time: new Date().toISOString(),
  });
}));

router.get('/rounds/:id/selections', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  res.json(await listSelections(db, round.id));
}));

router.get('/rounds/:id/audit', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const r = await db.query(`SELECT * FROM fs_audit_log WHERE round_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1000`, [round.id]);
  res.json(r.rows);
}));

router.post('/selections/:sid/release', requireRole(...MANAGERS), h(async (req, res) => {
  await managedRound(req, await roundIdOf('fs_selections', req.params.sid));
  const { reason } = parse<any>(releaseSchema, req.body);
  const out = await db.transaction((q: any) => releaseInTx(q, req.params.sid, actorOf(req), reason));
  res.json({ released: true, roster_rows_removed: out.roster_rows_removed, class_removed: out.class_removed });
}));

/** Admin gives a faculty to a student who has none for the subject (never picked, or released). */
router.post('/rounds/:id/assign', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, req.params.id);
  const body = parse<any>(assignSchema, req.body);
  if (!(await isEligible(db, round.id, body.roll_number))) throw new FsError(400, 'NOT_ELIGIBLE', `${body.roll_number} is not on this round's list.`);
  const student = await getStudent(db, body.roll_number);
  if (!student) throw new FsError(404, 'NOT_FOUND', 'Student not found.');
  const cur = (await db.query(`SELECT id, status FROM fs_selections WHERE round_id = $1 AND roll_number = $2 AND subject_id = $3`, [round.id, student.roll_number, body.subject_id])).rows[0];
  if (cur?.status === 'active') throw new FsError(409, 'ALREADY_SELECTED', 'This student already has a faculty for this subject. Use Move instead.');
  const out = await db.transaction((q: any) => pickInTx(q, {
    roundId: round.id, subjectId: body.subject_id, offeringId: body.offering_id,
    student: { roll_number: student.roll_number, email: student.email, section: student.section },
    actor: actorOf(req), adminOverride: true, reuseReleasedId: cur?.id,
  }));
  res.json(out);
}));

/** Move a student to another faculty for the same subject: release + assign in ONE transaction. */
router.post('/selections/:sid/reassign', requireRole(...MANAGERS), h(async (req, res) => {
  const round = await managedRound(req, await roundIdOf('fs_selections', req.params.sid));
  const body = parse<any>(reassignSchema, req.body);
  const out = await db.transaction(async (q: any) => {
    const sel = await releaseInTx(q, req.params.sid, actorOf(req), body.reason || 'moved');
    const student = await getStudent(q, sel.roll_number);
    if (!student) throw new FsError(404, 'NOT_FOUND', 'Student not found.');
    const picked = await pickInTx(q, {
      roundId: round.id, subjectId: sel.subject_id, offeringId: body.offering_id,
      student: { roll_number: student.roll_number, email: student.email, section: student.section },
      actor: actorOf(req), adminOverride: true, reuseReleasedId: sel.id,
    });
    await audit(q, { roundId: round.id, ...actor(req), action: 'reassign', roll: student.roll_number, details: { subject: sel.subject_name, from: sel.faculty_email, to_offering: body.offering_id } });
    return picked;
  });
  res.json(out);
}));

// ─── Department summary (HOD / admin) ──────────────────────────────────────────
router.get('/department-summary', requireRole(...MANAGERS), h(async (req, res) => {
  const scope = await scopeOf(req);
  const rounds = (await db.query(
    `SELECT r.id, r.title, r.semester_label, r.department, r.status, r.starts_at, r.ends_at,
            (SELECT COUNT(*)::int FROM fs_subjects s WHERE s.round_id = r.id) AS subject_count,
            (SELECT COUNT(*)::int FROM fs_eligible_students e WHERE e.round_id = r.id) AS eligible
       FROM fs_rounds r ORDER BY r.created_at DESC LIMIT 500`)).rows.filter((r: any) => deptAllowed(scope, r.department));
  const ids = rounds.map((r: any) => r.id);
  const picks = ids.length ? (await db.query(
    `SELECT sel.round_id, sel.roll_number, COUNT(*)::int AS n FROM fs_selections sel
      WHERE sel.round_id = ANY($1::uuid[]) AND sel.status = 'active' GROUP BY sel.round_id, sel.roll_number`, [ids])).rows : [];
  const load = ids.length ? (await db.query(
    `SELECT o.faculty_name, LOWER(o.faculty_email) AS faculty_email, r.semester_label, s.subject_name,
            COUNT(DISTINCT sel.section)::int AS sections, COUNT(sel.id)::int AS students
       FROM fs_selections sel
       JOIN fs_offerings o ON o.id = sel.offering_id
       JOIN fs_subjects s ON s.id = sel.subject_id
       JOIN fs_rounds r ON r.id = sel.round_id
      WHERE sel.round_id = ANY($1::uuid[]) AND sel.status = 'active'
      GROUP BY o.faculty_name, LOWER(o.faculty_email), r.semester_label, s.subject_name
      ORDER BY o.faculty_name, r.semester_label, s.subject_name`, [ids])).rows : [];
  res.json({
    rounds: rounds.map((r: any) => {
      const mine = picks.filter((p: any) => p.round_id === r.id);
      const completed = mine.filter((p: any) => r.subject_count > 0 && p.n >= r.subject_count).length;
      return { ...r, open_now: roundOpenNow(r), completed, pending: Math.max(0, r.eligible - completed) };
    }),
    faculty_load: load,
  });
}));

// ─── Faculty: my selected students ─────────────────────────────────────────────
router.get('/my-students', requireRole('faculty', 'hod'), h(async (req, res) => {
  const r = await db.query(
    `SELECT r.id AS round_id, r.title AS round_title, r.semester_label, r.department, r.status AS round_status,
            s.subject_name, s.subject_type, sel.section, g.name AS group_name, sel.roll_number, st.name AS student_name,
            sel.created_at, sel.allotment_id
       FROM fs_selections sel
       JOIN fs_offerings o ON o.id = sel.offering_id
       JOIN fs_subjects s ON s.id = sel.subject_id
       JOIN fs_rounds r ON r.id = sel.round_id
       LEFT JOIN fs_groups g ON g.id = sel.group_id
       LEFT JOIN students st ON st.roll_number = sel.roll_number
      WHERE sel.status = 'active' AND LOWER(o.faculty_email) = LOWER($1)
      ORDER BY r.semester_label, s.subject_name, sel.section, sel.roll_number`,
    [req.auth!.email]
  );
  res.json(r.rows);
}));

// ─── Student ───────────────────────────────────────────────────────────────────
async function me(req: Request) {
  const student = await getStudent(db, req.auth!.regNo || '');
  if (!student) throw new FsError(404, 'NO_STUDENT', 'Your student record was not found.');
  return student;
}

/** Drives the menu: shown when the student is on an open round's list, or already has an allotted faculty. */
router.get('/me', requireRole('student'), h(async (req, res) => {
  const roll = String(req.auth!.regNo || '').toUpperCase();
  const rounds = (await db.query(
    `SELECT r.id, r.title, r.semester_label, r.status, r.starts_at, r.ends_at
       FROM fs_eligible_students e JOIN fs_rounds r ON r.id = e.round_id
      WHERE UPPER(e.roll_number) = $1 AND r.status IN ('open', 'closed')
      ORDER BY r.starts_at DESC`, [roll])).rows.map((r: any) => ({ ...r, open_now: roundOpenNow(r) }));
  const allotted = Number((await db.query(`SELECT COUNT(*)::int AS n FROM fs_selections WHERE roll_number = $1 AND status = 'active'`, [roll])).rows[0]?.n || 0);
  res.json({ show: rounds.some((r: any) => r.status === 'open') || allotted > 0, rounds, allotted });
}));

async function studentRoundView(roundId: string, student: any) {
  const section = normSection(student.section);
  const [subjects, offerings, lock, mine] = await Promise.all([
    db.query(`SELECT id, subject_name, subject_type FROM fs_subjects WHERE round_id = $1 ORDER BY sort_order, subject_name`, [roundId]),
    db.query(
      `SELECT o.id, o.subject_id, o.group_id, g.name AS group_name, o.faculty_name, o.capacity, o.filled
         FROM fs_offerings o JOIN fs_groups g ON g.id = o.group_id
        WHERE o.round_id = $1 AND UPPER(o.section) = $2 ORDER BY g.name, o.faculty_name`, [roundId, section]),
    db.query(`SELECT sg.group_id, g.name FROM fs_student_groups sg JOIN fs_groups g ON g.id = sg.group_id WHERE sg.round_id = $1 AND sg.roll_number = $2`, [roundId, student.roll_number]),
    db.query(
      `SELECT sel.id, sel.subject_id, sel.status, sel.created_at, o.faculty_name, g.name AS group_name
         FROM fs_selections sel LEFT JOIN fs_offerings o ON o.id = sel.offering_id LEFT JOIN fs_groups g ON g.id = sel.group_id
        WHERE sel.round_id = $1 AND sel.roll_number = $2`, [roundId, student.roll_number]),
  ]);
  const locked = lock.rows[0] || null;
  return {
    student: { roll_number: student.roll_number, name: student.name, section },
    group: locked ? { id: locked.group_id, name: locked.name } : null,
    subjects: subjects.rows.map((s: any) => ({
      ...s,
      selection: mine.rows.find((m: any) => m.subject_id === s.id) || null,
      options: offerings.rows.filter((o: any) => o.subject_id === s.id).map((o: any) => ({
        id: o.id, group_id: o.group_id, group_name: o.group_name, faculty_name: o.faculty_name,
        capacity: o.capacity, remaining: Math.max(0, o.capacity - o.filled),
        allowed: !locked || locked.group_id === o.group_id,
      })),
    })),
  };
}

async function studentRound(req: Request) {
  const student = await me(req);
  const round = await getRound(db, req.params.id);
  if (!round || round.status === 'draft') throw new FsError(404, 'NOT_FOUND', 'This selection round is not available.');
  if (!(await isEligible(db, round.id, student.roll_number))) throw new FsError(403, 'NOT_ELIGIBLE', 'You are not on this round\'s list. Contact your department admin if this is wrong.');
  return { student, round };
}

router.get('/me/rounds/:id', requireRole('student'), h(async (req, res) => {
  const { student, round } = await studentRound(req);
  res.json({
    round: { id: round.id, title: round.title, semester_label: round.semester_label, status: round.status, starts_at: round.starts_at, ends_at: round.ends_at, open_now: roundOpenNow(round) },
    server_time: new Date().toISOString(),
    ...(await studentRoundView(round.id, student)),
  });
}));

/** Light endpoint for 5-second polling of seats left (own section only). */
router.get('/me/rounds/:id/seats', requireRole('student'), h(async (req, res) => {
  const { student, round } = await studentRound(req);
  const r = await db.query(
    `SELECT id, capacity, filled FROM fs_offerings WHERE round_id = $1 AND UPPER(section) = $2`, [round.id, normSection(student.section)]);
  res.json({ open_now: roundOpenNow(round), seats: r.rows.map((o: any) => ({ id: o.id, remaining: Math.max(0, o.capacity - o.filled), capacity: o.capacity })) });
}));

/**
 * Confirm picks. Each subject is its own transaction, so a full seat in one subject never blocks
 * the others. Response: 200 when all succeed, 207 with per-subject status (409 / 403) otherwise.
 */
router.post('/me/rounds/:id/select', requireRole('student'), h(async (req, res) => {
  const { student, round } = await studentRound(req);
  if (!roundOpenNow(round)) {
    const msg = new Date() < new Date(round.starts_at) ? 'Selection has not opened yet.' : 'Selection is closed.';
    throw new FsError(409, 'CLOSED', msg);
  }
  if (!normSection(student.section)) throw new FsError(403, 'NO_SECTION', 'Your section is not set in your student record. Ask the admin to update it.');
  const { choices } = parse<any>(selectSchema, req.body);
  const existing = (await db.query(`SELECT subject_id, status FROM fs_selections WHERE round_id = $1 AND roll_number = $2`, [round.id, student.roll_number])).rows;
  const subjects = (await db.query(`SELECT id, subject_name FROM fs_subjects WHERE round_id = $1`, [round.id])).rows;
  const seen = new Set<string>();
  const results: any[] = [];
  for (const c of choices) {
    const subj = subjects.find((s: any) => s.id === c.subject_id);
    const base = { subject_id: c.subject_id, offering_id: c.offering_id, subject_name: subj?.subject_name || null };
    if (!subj) { results.push({ ...base, ok: false, status: 404, code: 'NO_SUBJECT', message: 'This subject is not part of the round.' }); continue; }
    if (seen.has(c.subject_id)) { results.push({ ...base, ok: false, status: 409, code: 'ALREADY_SELECTED', message: `Only one faculty can be chosen for ${subj.subject_name}.` }); continue; }
    seen.add(c.subject_id);
    const prior = existing.find((e: any) => e.subject_id === c.subject_id);
    if (prior?.status === 'released') {
      results.push({ ...base, ok: false, status: 409, code: 'RELEASED', message: `Your choice for ${subj.subject_name} was released by the admin. The admin will assign your faculty.` });
      continue;
    }
    if (prior) {
      results.push({ ...base, ok: false, status: 409, code: 'ALREADY_SELECTED', message: `You have already chosen a faculty for ${subj.subject_name}. Your first choice is final.` });
      continue;
    }
    try {
      const out = await db.transaction((q: any) => pickInTx(q, {
        roundId: round.id, subjectId: c.subject_id, offeringId: c.offering_id,
        student: { roll_number: student.roll_number, email: student.email, section: student.section },
        actor: actorOf(req),
      }));
      results.push({ ...base, ok: true, status: 200, ...out });
    } catch (err: any) {
      if (!(err instanceof FsError)) throw err;
      results.push({ ...base, ok: false, status: err.status, code: err.code, message: err.message });
    }
  }
  const view = await studentRoundView(round.id, student);
  res.status(results.every(r => r.ok) ? 200 : 207).json({ results, ...view });
}));

router.get('/me/allotted', requireRole('student'), h(async (req, res) => {
  const roll = String(req.auth!.regNo || '').toUpperCase();
  const r = await db.query(
    `SELECT r.id AS round_id, r.title AS round_title, r.semester_label, s.subject_name, s.subject_type,
            sel.status, sel.section, g.name AS group_name, o.faculty_name, sel.created_at, sel.allotment_id
       FROM fs_selections sel
       JOIN fs_rounds r ON r.id = sel.round_id
       JOIN fs_subjects s ON s.id = sel.subject_id
       LEFT JOIN fs_offerings o ON o.id = sel.offering_id
       LEFT JOIN fs_groups g ON g.id = sel.group_id
      WHERE sel.roll_number = $1
      ORDER BY r.semester_label DESC, s.sort_order, s.subject_name`, [roll]);
  res.json(r.rows);
}));

export default router;
