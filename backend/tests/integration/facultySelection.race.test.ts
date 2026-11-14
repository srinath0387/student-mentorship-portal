/**
 * tests/integration/facultySelection.race.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the real pick / release SQL against a real PostgreSQL (concurrency cannot be proven
 * with the mock db). Skipped unless FS_TEST_DATABASE_URL is set, e.g.
 *
 *   docker run -d --name fs-pg -e POSTGRES_PASSWORD=fs -e POSTGRES_DB=fstest -p 55432:5432 postgres:16-alpine
 *   FS_TEST_DATABASE_URL=postgres://postgres:fs@localhost:55432/fstest npx jest tests/integration
 *
 * WARNING: drops and recreates the tables it uses — point it at a throwaway database only.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { FS_DDL, FS_ROLLBACK } from '../../src/repositories/facultySelection.schema';
import { pickInTx, releaseInTx, FsError } from '../../src/repositories/facultySelection.repository';

const URL = process.env.FS_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
jest.setTimeout(60000);

let pool: Pool;
const ADMIN = { email: 'admin@rgmcet.edu.in', role: 'admin' };

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
const one = async (sql: string, p: any[] = []) => (await pool.query(sql, p)).rows[0];
const all = async (sql: string, p: any[] = []) => (await pool.query(sql, p)).rows;

/** Ids for a fresh round: department CSE, semester 4-1, groups A/B, sections A-C. */
async function seedRound(title: string) {
  const round = await one(
    `INSERT INTO fs_rounds (department, semester_label, title, starts_at, ends_at, status, created_by)
     VALUES ('CSE', '4-1', $1, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', 'open', 'admin') RETURNING id`, [title]);
  const gA = await one(`INSERT INTO fs_groups (round_id, name) VALUES ($1, 'Group A') RETURNING id`, [round.id]);
  const gB = await one(`INSERT INTO fs_groups (round_id, name) VALUES ($1, 'Group B') RETURNING id`, [round.id]);
  return { roundId: round.id, gA: gA.id, gB: gB.id };
}
async function subject(roundId: string, name: string, type = 'Theory') {
  return (await one(`INSERT INTO fs_subjects (round_id, subject_name, subject_type) VALUES ($1, $2, $3) RETURNING id`, [roundId, name, type])).id;
}
async function offering(roundId: string, subjectId: string, groupId: string, section: string, fac: string, capacity: number) {
  return (await one(
    `INSERT INTO fs_offerings (round_id, subject_id, group_id, section, faculty_email, faculty_name, capacity)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [roundId, subjectId, groupId, section, `${fac.toLowerCase()}@rgmcet.edu.in`, fac, capacity])).id;
}
const stu = (n: number, section: string) => ({ roll_number: `22091A05${String(n).padStart(2, '0')}`, email: `22091a05${String(n).padStart(2, '0')}@rgmcet.edu.in`, section });
const studentRow = (n: number) => {
  const sec = n <= 50 ? 'A' : n <= 70 ? 'B' : 'C';
  return stu(n, sec);
};
const pick = (roundId: string, subjectId: string, offeringId: string, s: any, actor = { email: s.email, role: 'student' }, extra: any = {}) =>
  tx(c => pickInTx(c, { roundId, subjectId, offeringId, student: s, actor, ...extra }));
const outcome = (p: Promise<any>): Promise<{ ok: boolean; v?: any; code?: string }> => p.then(v => ({ ok: true, v }), (e: any) => ({ ok: false, code: e instanceof FsError ? e.code : `ERR:${e.message}` }));

d('Faculty selection against real PostgreSQL', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: URL, max: 25 });
    // Fresh copy of the existing schema + fs_ tables
    for (const s of FS_ROLLBACK) await pool.query(s).catch(() => undefined);
    await pool.query(`DROP TABLE IF EXISTS attendance_records, attendance_sessions, subject_rosters, subject_allotments, timetable_entries CASCADE`);
    const schema = fs.readFileSync(path.join(__dirname, '../../src/schema.sql'), 'utf8');
    await pool.query(schema);
    for (const s of FS_DDL) await pool.query(s); // idempotent: a second run must not fail
    await pool.query(`DELETE FROM students WHERE roll_number LIKE '22091A05%'`);
    await pool.query(`DELETE FROM faculty WHERE email LIKE '%@rgmcet.edu.in' AND faculty_id LIKE 'FS-%'`);
    for (let n = 1; n <= 90; n++) {
      const s = studentRow(n);
      await pool.query(
        `INSERT INTO students (roll_number, name, email, year, department, section) VALUES ($1, $2, $3, '4th Year', 'CSE', $4)`,
        [s.roll_number, `Student ${n}`, s.email, s.section]);
    }
    for (const f of ['Srinath', 'Penchal', 'Suleman', 'Rathi']) {
      await pool.query(`INSERT INTO faculty (faculty_id, name, email, department) VALUES ($1, $2, $3, 'CSE')`, [`FS-${f}`, f, `${f.toLowerCase()}@rgmcet.edu.in`]);
    }
  });
  afterAll(async () => { await pool?.end(); });

  it('last seat: 50 students race for 1 seat → exactly one wins, seat count never exceeds capacity', async () => {
    const { roundId, gA } = await seedRound('race');
    const dl = await subject(roundId, 'Deep Learning');
    const o = await offering(roundId, dl, gA, 'A', 'Srinath', 1);
    const students = Array.from({ length: 50 }, (_, i) => studentRow(i + 1));
    const results = await Promise.all(students.map(s => outcome(pick(roundId, dl, o, s))));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok).every(r => r.code === 'SEATS_FULL')).toBe(true);
    expect((await one(`SELECT filled, capacity FROM fs_offerings WHERE id = $1`, [o]))).toEqual({ filled: 1, capacity: 1 });
    expect(Number((await one(`SELECT COUNT(*) FROM fs_selections WHERE round_id = $1`, [roundId])).count)).toBe(1);
    const allot = await all(`SELECT * FROM subject_allotments WHERE subject_name = 'Deep Learning' AND section = 'A' AND faculty_email = 'srinath@rgmcet.edu.in'`);
    expect(allot).toHaveLength(1);
    expect(Number((await one(`SELECT COUNT(*) FROM subject_rosters WHERE allotment_id = $1`, [allot[0].id])).count)).toBe(1);
  });

  it('many seats, many students in parallel: filled always equals the number of winners', async () => {
    const { roundId, gA } = await seedRound('race-10');
    const ml = await subject(roundId, 'Machine Learning');
    const o = await offering(roundId, ml, gA, 'A', 'Penchal', 10);
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => outcome(pick(roundId, ml, o, studentRow(i + 1)))));
    expect(results.filter(r => r.ok)).toHaveLength(10);
    expect((await one(`SELECT filled FROM fs_offerings WHERE id = $1`, [o])).filled).toBe(10);
    expect(Number((await one(`SELECT COUNT(*) FROM subject_rosters r JOIN subject_allotments a ON a.id = r.allotment_id WHERE a.subject_name = 'Machine Learning'`)).count)).toBe(10);
  });

  it('double click / two tabs: the same student firing 10 picks gets exactly one seat', async () => {
    const { roundId, gA } = await seedRound('double');
    const nlp = await subject(roundId, 'NLP');
    const o = await offering(roundId, nlp, gA, 'A', 'Suleman', 30);
    const s = studentRow(5);
    const results = await Promise.all(Array.from({ length: 10 }, () => outcome(pick(roundId, nlp, o, s))));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok).every(r => r.code === 'ALREADY_SELECTED')).toBe(true);
    expect((await one(`SELECT filled FROM fs_offerings WHERE id = $1`, [o])).filled).toBe(1);
  });

  it('group lock: the first pick fixes the group; a later pick from another group is refused (403)', async () => {
    const { roundId, gA, gB } = await seedRound('group-lock');
    const s1 = await subject(roundId, 'Cloud Computing');
    const s2 = await subject(roundId, 'Cyber Security');
    const s1A = await offering(roundId, s1, gA, 'A', 'Srinath', 30);
    const s2A = await offering(roundId, s2, gA, 'A', 'Penchal', 30);
    const s2B = await offering(roundId, s2, gB, 'A', 'Suleman', 30);
    const s = studentRow(7);
    await pick(roundId, s1, s1A, s);
    const bad = await outcome(pick(roundId, s2, s2B, s));
    expect(bad).toEqual({ ok: false, code: 'GROUP_LOCKED' });
    expect((await one(`SELECT filled FROM fs_offerings WHERE id = $1`, [s2B])).filled).toBe(0); // seat not taken
    expect((await outcome(pick(roundId, s2, s2A, s))).ok).toBe(true);
  });

  it('group lock under concurrency: parallel first picks in two groups → only one group wins', async () => {
    const { roundId, gA, gB } = await seedRound('group-race');
    const s1 = await subject(roundId, 'Big Data');
    const s2 = await subject(roundId, 'IoT');
    const s1A = await offering(roundId, s1, gA, 'A', 'Srinath', 30);
    const s2B = await offering(roundId, s2, gB, 'A', 'Rathi', 30);
    const s = studentRow(9);
    const [a, b] = await Promise.all([outcome(pick(roundId, s1, s1A, s)), outcome(pick(roundId, s2, s2B, s))]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find(r => !r.ok)!.code).toBe('GROUP_LOCKED');
    const groups = await all(`SELECT group_id FROM fs_student_groups WHERE round_id = $1`, [roundId]);
    expect(groups).toHaveLength(1);
  });

  it('a student can only pick the option for their own section', async () => {
    const { roundId, gA } = await seedRound('section');
    const s1 = await subject(roundId, 'Compilers');
    const forB = await offering(roundId, s1, gA, 'B', 'Srinath', 30);
    expect(await outcome(pick(roundId, s1, forB, studentRow(1)))).toEqual({ ok: false, code: 'WRONG_SECTION' });
  });

  it('per-section classes: Sec A and Sec B students of the same faculty get two separate attendance classes', async () => {
    const { roundId, gA } = await seedRound('per-section');
    const sub = await subject(roundId, 'Deep Learning Lab', 'Lab');
    const oA = await offering(roundId, sub, gA, 'A', 'Srinath', 30);
    const oB = await offering(roundId, sub, gA, 'B', 'Srinath', 30);
    await pick(roundId, sub, oA, studentRow(1));
    await pick(roundId, sub, oA, studentRow(2));
    await pick(roundId, sub, oB, studentRow(51));
    const classes = await all(
      `SELECT a.section, a.subject_type, a.department, a.semester_label, ARRAY_AGG(r.roll_number ORDER BY r.roll_number) AS rolls
         FROM subject_allotments a JOIN subject_rosters r ON r.allotment_id = a.id
        WHERE a.subject_name = 'Deep Learning Lab' GROUP BY a.id ORDER BY a.section`);
    expect(classes).toEqual([
      { section: 'A', subject_type: 'Lab', department: 'CSE', semester_label: '4-1', rolls: ['22091A0501', '22091A0502'] },
      { section: 'B', subject_type: 'Lab', department: 'CSE', semester_label: '4-1', rolls: ['22091A0551'] },
    ]);
  });

  it('reuses an existing attendance class and, on release, removes only what this module created', async () => {
    const { roundId, gA } = await seedRound('reuse');
    // Class + one roster row made by the existing attendance setup
    const existing = await one(
      `INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, faculty_name, department)
       VALUES ('4-1', 'Data Mining', 'Theory', 'C', 'Rathi@rgmcet.edu.in', 'Rathi', 'CSE') RETURNING id`);
    await pool.query(`INSERT INTO subject_rosters (allotment_id, roll_number) VALUES ($1, '22091A0571')`, [existing.id]);
    const sub = await subject(roundId, 'Data Mining');
    const o = await offering(roundId, sub, gA, 'C', 'Rathi', 30);
    const a = await pick(roundId, sub, o, studentRow(71)); // already on the roster → roster row not created by us
    const b = await pick(roundId, sub, o, studentRow(72)); // new roster row
    expect(a.allotment_id).toBe(existing.id);
    expect(b.allotment_id).toBe(existing.id);
    expect(await all(`SELECT table_name FROM fs_created_rows WHERE round_id = $1`, [roundId])).toEqual([{ table_name: 'subject_rosters' }]);

    await tx(c => releaseInTx(c, a.selection_id, ADMIN));
    await tx(c => releaseInTx(c, b.selection_id, ADMIN));
    const rolls = (await all(`SELECT roll_number FROM subject_rosters WHERE allotment_id = $1 ORDER BY roll_number`, [existing.id])).map(r => r.roll_number);
    expect(rolls).toEqual(['22091A0571']);                         // existing row kept, ours removed
    expect(await one(`SELECT id FROM subject_allotments WHERE id = $1`, [existing.id])).toBeTruthy(); // class kept
    expect((await one(`SELECT filled FROM fs_offerings WHERE id = $1`, [o])).filled).toBe(0);
    // Released → the student cannot pick again; admin assigns onto the same row
    expect(await outcome(pick(roundId, sub, o, studentRow(72)))).toEqual({ ok: false, code: 'ALREADY_SELECTED' });
    const re = await pick(roundId, sub, o, studentRow(72), ADMIN, { adminOverride: true, reuseReleasedId: b.selection_id });
    expect(re.selection_id).toBe(b.selection_id);
    expect((await one(`SELECT filled FROM fs_offerings WHERE id = $1`, [o])).filled).toBe(1);
  });

  it('release removes a class this module created once it is empty, and keeps it when attendance was posted', async () => {
    const { roundId, gA } = await seedRound('release');
    const sub = await subject(roundId, 'Soft Computing');
    const o = await offering(roundId, sub, gA, 'A', 'Penchal', 30);
    const p1 = await pick(roundId, sub, o, studentRow(11));
    const out = await tx(c => releaseInTx(c, p1.selection_id, ADMIN));
    expect(out.class_removed).toBe(true);
    expect(await one(`SELECT id FROM subject_allotments WHERE id = $1`, [p1.allotment_id])).toBeUndefined();

    const sub2 = await subject(roundId, 'Agile');
    const o2 = await offering(roundId, sub2, gA, 'A', 'Penchal', 30);
    const p2 = await pick(roundId, sub2, o2, studentRow(12));
    await pool.query(`INSERT INTO attendance_sessions (allotment_id, session_date, num_periods, period_start, recorded_by) VALUES ($1, CURRENT_DATE, 1, 1, 'penchal')`, [p2.allotment_id]);
    const out2 = await tx(c => releaseInTx(c, p2.selection_id, ADMIN));
    expect(out2.class_removed).toBe(false);                         // attendance history is never deleted
    expect(await one(`SELECT id FROM subject_allotments WHERE id = $1`, [p2.allotment_id])).toBeTruthy();
  });

  it('departments never share a class: a clash with another department is refused and rolled back', async () => {
    const { roundId, gA } = await seedRound('clash');
    await pool.query(
      `INSERT INTO subject_allotments (semester_label, subject_name, subject_type, section, faculty_email, faculty_name, department)
       VALUES ('4-1', 'Blockchain', 'Theory', 'A', 'srinath@rgmcet.edu.in', 'Srinath', 'CSE (AI & ML)')`);
    const sub = await subject(roundId, 'Blockchain');
    const o = await offering(roundId, sub, gA, 'A', 'Srinath', 30);
    expect(await outcome(pick(roundId, sub, o, studentRow(20)))).toEqual({ ok: false, code: 'DEPT_CLASH' });
    expect((await one(`SELECT filled FROM fs_offerings WHERE id = $1`, [o])).filled).toBe(0);
    expect(await one(`SELECT id FROM fs_selections WHERE round_id = $1`, [roundId])).toBeUndefined();
  });

  it('capacity can never be set below filled (CHECK constraint backs the API guard)', async () => {
    const { roundId, gA } = await seedRound('cap');
    const sub = await subject(roundId, 'HCI');
    const o = await offering(roundId, sub, gA, 'A', 'Rathi', 5);
    await pick(roundId, sub, o, studentRow(30));
    await pick(roundId, sub, o, studentRow(31));
    const r = await pool.query(`UPDATE fs_offerings SET capacity = 1 WHERE id = $1 AND filled <= 1 RETURNING id`, [o]);
    expect(r.rowCount).toBe(0);
    await expect(pool.query(`UPDATE fs_offerings SET capacity = 1 WHERE id = $1`, [o])).rejects.toThrow(/check constraint/);
  });

  it('rollback removes only module-created rows and drops the fs_ tables', async () => {
    const before = Number((await one(`SELECT COUNT(*) FROM subject_rosters WHERE roll_number = '22091A0571'`)).count);
    for (const s of FS_ROLLBACK) await pool.query(s);
    expect(await one(`SELECT to_regclass('public.fs_selections') AS t`)).toEqual({ t: null });
    expect(Number((await one(`SELECT COUNT(*) FROM subject_rosters WHERE roll_number = '22091A0571'`)).count)).toBe(before);
    expect(Number((await one(`SELECT COUNT(*) FROM subject_allotments WHERE subject_name = 'Blockchain'`)).count)).toBe(1); // other dept's class untouched
    for (const s of FS_DDL) await pool.query(s); // and migrate works again after rollback
  });
});
