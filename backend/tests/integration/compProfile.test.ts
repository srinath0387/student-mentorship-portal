/**
 * tests/integration/compProfile.test.ts — runs GET /comp-profile/me against a real Postgres, so the prefill SQL
 * (mentees via both mentor links + coding handles, alumni of the department, event speakers, allotments) runs for real.
 * Runs only when FS_TEST_DATABASE_URL is set.
 */
import request from 'supertest';
import { Pool } from 'pg';

const URL = process.env.FS_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
jest.setTimeout(60000);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'fcp-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');

const OURS = /faculty|students|coding_profiles|mentor_assignments|alumni|subject_allotments|dept_events|event_requests|course_exec_|lesson_plans|subject_syllabi|dept_meetings|CREATE |ALTER /;
let pool: Pool;
const FAC = () => `Bearer ${signSessionToken({ role: 'faculty', email: 'ramesh@rgmcet.edu.in' })}`;

d('Comprehensive profile prefill (real Postgres)', () => {
  beforeAll(async () => {
    // a schema of its own, so this test never touches the tables other integration tests use
    const admin = new Pool({ connectionString: URL });
    await admin.query('DROP SCHEMA IF EXISTS fcp_test CASCADE; CREATE SCHEMA fcp_test');
    await admin.end();
    pool = new Pool({ connectionString: URL, options: '-c search_path=fcp_test' });
    await pool.query(`DROP TABLE IF EXISTS faculty, students, coding_profiles, mentor_assignments, alumni, subject_allotments, faculty_full_profiles, dept_events, faculty_comprehensive_profiles CASCADE`);
    await pool.query(`
      CREATE TABLE faculty (faculty_id TEXT PRIMARY KEY, name TEXT, email TEXT, department TEXT);
      CREATE TABLE students (roll_number TEXT PRIMARY KEY, name TEXT, year INT, faculty_mentor_id TEXT, linkedin_url TEXT);
      CREATE TABLE coding_profiles (student_id TEXT, platform TEXT, handle TEXT);
      CREATE TABLE mentor_assignments (roll_number TEXT PRIMARY KEY, faculty_id TEXT);
      CREATE TABLE alumni (id SERIAL PRIMARY KEY, name TEXT, organization TEXT, role_title TEXT, location TEXT, linkedin_url TEXT, batch TEXT, department TEXT);
      CREATE TABLE subject_allotments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester_label TEXT, subject_name TEXT, subject_type TEXT, section TEXT,
        faculty_email TEXT, co_faculty_email TEXT, department TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE faculty_subjects_handled (id TEXT PRIMARY KEY, faculty_email TEXT, year_batch TEXT, section TEXT, subject TEXT, branch TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      INSERT INTO faculty_subjects_handled (id, faculty_email, year_batch, section, subject, branch) VALUES ('S1','Ramesh@rgmcet.edu.in','I B.Tech. II Sem. & 2025','A','C Programming','CSE (DS)'), ('S2','other@x','II B.Tech I Sem 2024','A','Not mine','CSE');
      CREATE TABLE faculty_full_profiles (email TEXT PRIMARY KEY, personal JSONB DEFAULT '{}', education JSONB DEFAULT '{}', publications JSONB DEFAULT '[]', domains JSONB DEFAULT '[]', activities JSONB DEFAULT '[]');
      INSERT INTO faculty VALUES ('F1','Ramesh','ramesh@rgmcet.edu.in','CSE (Data Science)');
      INSERT INTO students VALUES ('23091A0501','Ravi',3,'f1','https://linkedin.com/in/ravi'), ('24091A0502','Sita',2,NULL,NULL), ('22091A0503','Other',4,'F9',NULL);
      INSERT INTO mentor_assignments VALUES ('24091A0502','F1');
      INSERT INTO coding_profiles VALUES ('23091A0501','LeetCode','ravi_lc'), ('23091A0501','GitHub','ravigh');
      INSERT INTO alumni (name, organization, role_title, location, batch, department) VALUES ('Anil','Infosys','SDE','Pune','2019','CSE(Data Science)'), ('NoOrg',NULL,NULL,NULL,'2019','CSE (Data Science)'), ('ECE alum','TCS','QA','Hyd','2018','ECE');
      INSERT INTO subject_allotments (semester_label, subject_name, faculty_email, department) VALUES ('2-1','Operating Systems','ramesh@rgmcet.edu.in','CSE (Data Science)');
      INSERT INTO faculty_full_profiles (email, personal, domains) VALUES ('ramesh@rgmcet.edu.in','{"designation":"Assistant Professor","orcid_id":"0000-0001"}','["Machine Learning"]');`);
    db.query.mockReset();
    db.query.mockImplementation(async (sql: string, params: any[] = []) => (OURS.test(sql) ? pool.query(sql, params) : { rows: [], rowCount: 0 }));
    // event tables through the app, then a report with a speaker
    await request(app).get('/quality/overview').set('Authorization', `Bearer ${signSessionToken({ role: 'principal', email: 'p@x' })}`);
    await pool.query(`INSERT INTO dept_events (academic_year, department, event_type, title, start_date, end_date, status, participation, submitted_by, resource_persons)
      VALUES ('2026–27','CSE (Data Science)','Faculty Development Programme (FDP)','FDP on GenAI','2026-11-01','2026-11-05','approved','attended','ramesh@rgmcet.edu.in','[{"name":"Dr. S. Rao","designation":"Principal Engineer","organization":"Infosys"}]')`);
    // the lesson plan carries the academic year, the department's syllabus the regulation
    await pool.query(`INSERT INTO lesson_plans (allotment_id, faculty_email, semester_label, subject_name, academic_year)
      SELECT id, faculty_email, semester_label, subject_name, '2025–26' FROM subject_allotments`);
    await pool.query(`INSERT INTO subject_syllabi (department, dept_key, semester_label, subject_name, regulation) VALUES ('CSE (Data Science)','csedatascience','2-1','operating systems','R23')`);
  });
  afterAll(async () => { await pool?.end(); });

  it('collects everything the form prefills from', async () => {
    const res = await request(app).get('/comp-profile/me').set('Authorization', FAC());
    expect(res.status).toBe(200);
    const s = res.body.sources;
    expect(s.faculty.faculty_id).toBe('F1');
    expect(s.mentees.map((m: any) => m.roll_number).sort()).toEqual(['23091A0501', '24091A0502']);   // both mentor links, not other faculty's
    expect(s.mentees.find((m: any) => m.roll_number === '23091A0501').handles).toEqual({ LeetCode: 'ravi_lc', GitHub: 'ravigh' });
    expect(s.alumni.map((a: any) => a.name)).toEqual(['Anil']);   // own department, with an organisation
    expect(s.speakers).toEqual([{ name: 'Dr. S. Rao', designation: 'Principal Engineer', organization: 'Infosys' }]);
    expect(s.teaching.map((t: any) => [t.subject_name, t.academic_year, t.regulation])).toEqual([['Operating Systems', '2025–26', 'R23']]);
    expect(s.handled.map((h: any) => [h.subject, h.year_batch])).toEqual([['C Programming', 'I B.Tech. II Sem. & 2025']]);   // only my records
    expect(s.events.map((e: any) => e.title)).toEqual(['FDP on GenAI']);
    expect(s.profile.domains).toEqual(['Machine Learning']);
  });

  it('saves and reads back', async () => {
    const put = await request(app).put('/comp-profile/me').set('Authorization', FAC()).send({ data: { profile: { full_name: 'Ramesh', designation: 'AP' } } });
    expect(put.status).toBe(200);
    const res = await request(app).get('/comp-profile/me').set('Authorization', FAC());
    expect(res.body.saved.data.profile.full_name).toBe('Ramesh');
    expect(res.body.saved.progress).toBeGreaterThan(0);
  });
});
