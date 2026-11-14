/**
 * repositories/facultySelection.schema.ts — DDL for the Faculty Selection module (no imports, so the
 * migrate / rollback scripts can use it without loading the app). Mirrored in src/schema.sql.
 */
// ─── Schema ────────────────────────────────────────────────────────────────────
// Mirrored in src/schema.sql. Idempotent: safe to run on every cold start.
export const FS_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS fs_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department VARCHAR(50) NOT NULL,
    semester_label VARCHAR(5) NOT NULL,
    title VARCHAR(120) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
    sections TEXT[] NOT NULL DEFAULT '{}',
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (ends_at > starts_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fs_rounds_dept_sem ON fs_rounds(department, semester_label)`,
  `CREATE TABLE IF NOT EXISTS fs_eligible_students (
    round_id UUID NOT NULL REFERENCES fs_rounds(id) ON DELETE CASCADE,
    roll_number VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    added_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (round_id, roll_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fs_eligible_roll ON fs_eligible_students(roll_number)`,
  `CREATE TABLE IF NOT EXISTS fs_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES fs_rounds(id) ON DELETE CASCADE,
    name VARCHAR(30) NOT NULL,
    UNIQUE (round_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS fs_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES fs_rounds(id) ON DELETE CASCADE,
    subject_name VARCHAR(200) NOT NULL,
    subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('Theory', 'Lab')),
    sort_order INT NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_fs_subjects_round_name ON fs_subjects(round_id, LOWER(subject_name))`,
  `CREATE TABLE IF NOT EXISTS fs_offerings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES fs_rounds(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES fs_subjects(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES fs_groups(id) ON DELETE RESTRICT,
    section VARCHAR(10) NOT NULL,
    faculty_email VARCHAR(100) NOT NULL,
    faculty_name VARCHAR(100) NOT NULL,
    capacity INT NOT NULL CHECK (capacity >= 0),
    filled INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (filled >= 0 AND filled <= capacity),
    UNIQUE (subject_id, group_id, section)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fs_offerings_round ON fs_offerings(round_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fs_offerings_faculty ON fs_offerings(LOWER(faculty_email))`,
  `CREATE TABLE IF NOT EXISTS fs_student_groups (
    round_id UUID NOT NULL REFERENCES fs_rounds(id) ON DELETE CASCADE,
    roll_number VARCHAR(10) NOT NULL,
    group_id UUID NOT NULL REFERENCES fs_groups(id) ON DELETE CASCADE,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (round_id, roll_number)
  )`,
  `CREATE TABLE IF NOT EXISTS fs_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES fs_rounds(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES fs_subjects(id) ON DELETE CASCADE,
    offering_id UUID REFERENCES fs_offerings(id) ON DELETE RESTRICT,
    group_id UUID REFERENCES fs_groups(id) ON DELETE SET NULL,
    roll_number VARCHAR(10) NOT NULL,
    section VARCHAR(10) NOT NULL,
    allotment_id UUID,
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    picked_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (round_id, roll_number, subject_id),
    CHECK (status = 'released' OR offering_id IS NOT NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fs_sel_round_time ON fs_selections(round_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_fs_sel_offering ON fs_selections(offering_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fs_sel_roll ON fs_selections(roll_number)`,
  `CREATE TABLE IF NOT EXISTS fs_created_rows (
    id BIGSERIAL PRIMARY KEY,
    round_id UUID NOT NULL,
    selection_id UUID REFERENCES fs_selections(id) ON DELETE SET NULL,
    table_name VARCHAR(30) NOT NULL CHECK (table_name IN ('subject_allotments', 'subject_rosters')),
    row_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (table_name, row_id)
  )`,
  `CREATE TABLE IF NOT EXISTS fs_audit_log (
    id BIGSERIAL PRIMARY KEY,
    round_id UUID,
    actor_email VARCHAR(100) NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(40) NOT NULL,
    roll_number VARCHAR(10),
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fs_audit_round ON fs_audit_log(round_id, created_at)`,
];

/**
 * Rollback: first remove the subject_rosters / subject_allotments rows this module created
 * (an allotment only when nothing else uses it: no rosters left and no attendance sessions),
 * then drop the fs_ tables. Existing attendance data is never touched otherwise.
 */
export const FS_ROLLBACK: string[] = [
  `DO $$ BEGIN
     IF to_regclass('public.fs_created_rows') IS NOT NULL THEN
       DELETE FROM subject_rosters WHERE id IN (SELECT row_id FROM fs_created_rows WHERE table_name = 'subject_rosters');
       DELETE FROM subject_allotments a
        WHERE a.id IN (SELECT row_id FROM fs_created_rows WHERE table_name = 'subject_allotments')
          AND NOT EXISTS (SELECT 1 FROM subject_rosters r WHERE r.allotment_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM attendance_sessions s WHERE s.allotment_id = a.id);
     END IF;
   END $$`,
  `DROP TABLE IF EXISTS fs_audit_log`,
  `DROP TABLE IF EXISTS fs_created_rows`,
  `DROP TABLE IF EXISTS fs_selections`,
  `DROP TABLE IF EXISTS fs_student_groups`,
  `DROP TABLE IF EXISTS fs_offerings`,
  `DROP TABLE IF EXISTS fs_subjects`,
  `DROP TABLE IF EXISTS fs_groups`,
  `DROP TABLE IF EXISTS fs_eligible_students`,
  `DROP TABLE IF EXISTS fs_rounds`,
];
