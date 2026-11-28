/**
 * Every subject allotment belongs to an academic year ("2026–27", June–May, India time), so teaching the same
 * semester, subject and section again next year starts a fresh allotment — its own roster, attendance, lesson plan,
 * execution plan and CO attainment — while last year's stays as it was.
 *
 * Run on every cold start (idempotent). Existing allotments get the year of their latest attendance session,
 * or of the day they were created when no class has been held yet.
 */

/** SQL: the first calendar year of the academic year in progress, e.g. 2026 for 2026–27 */
export const AY_START_SQL = `(EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::int - CASE WHEN EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata')) >= 6 THEN 0 ELSE 1 END)`;
/** SQL: the academic year in progress, e.g. '2026–27' */
export const AY_NOW_SQL = `(${AY_START_SQL}::text || '–' || LPAD(((${AY_START_SQL} + 1) % 100)::text, 2, '0'))`;

export const ALLOTMENT_YEAR_DDL: string[] = [
  `ALTER TABLE subject_allotments ADD COLUMN IF NOT EXISTS academic_year VARCHAR(9);`,
  // backfill: the year the subject was actually taught in
  `UPDATE subject_allotments a SET academic_year = z.y::text || '–' || LPAD(((z.y + 1) % 100)::text, 2, '0')
   FROM (
     SELECT x.id, EXTRACT(YEAR FROM x.d)::int - CASE WHEN EXTRACT(MONTH FROM x.d) >= 6 THEN 0 ELSE 1 END AS y
     FROM (
       SELECT a2.id, GREATEST((a2.created_at AT TIME ZONE 'Asia/Kolkata')::date,
                              COALESCE((SELECT MAX(s.session_date) FROM attendance_sessions s WHERE s.allotment_id = a2.id), '1970-01-01'::date)) AS d
       FROM subject_allotments a2 WHERE a2.academic_year IS NULL
     ) x
   ) z
   WHERE a.id = z.id AND a.academic_year IS NULL;`,
  // anything that inserts without a year gets the year in progress
  `ALTER TABLE subject_allotments ALTER COLUMN academic_year SET DEFAULT ${AY_NOW_SQL};`,
  // the old rule (one allotment per semester + subject + section + faculty, forever) becomes one per academic year
  `DO $$ DECLARE c record; BEGIN
     FOR c IN
       SELECT con.conname FROM pg_constraint con
       WHERE con.conrelid = 'subject_allotments'::regclass AND con.contype = 'u'
         AND NOT EXISTS (SELECT 1 FROM unnest(con.conkey) k JOIN pg_attribute at ON at.attrelid = con.conrelid AND at.attnum = k
                         WHERE at.attname = 'academic_year')
     LOOP EXECUTE format('ALTER TABLE subject_allotments DROP CONSTRAINT %I', c.conname); END LOOP;
   END $$;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_allotments_year ON subject_allotments (academic_year, semester_label, subject_name, section, faculty_email);`,
  `CREATE INDEX IF NOT EXISTS idx_allotments_year ON subject_allotments (academic_year);`,
];
