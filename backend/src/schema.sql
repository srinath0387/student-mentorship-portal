-- Advitiyans PostgreSQL Schema Definition
-- Database Schema for Student 360° & Placement Readiness Platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Faculty Table
CREATE TABLE IF NOT EXISTS faculty (
    faculty_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    department VARCHAR(50) NOT NULL,
    role VARCHAR(50) DEFAULT 'mentor' CHECK (role IN ('mentor', 'coordinator', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Students Table
CREATE TABLE IF NOT EXISTS students (
    roll_number VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    year VARCHAR(20) NOT NULL CHECK (year IN ('1st Year', '2nd Year', '3rd Year', '4th Year')),
    phone VARCHAR(20),
    address TEXT,
    native_place VARCHAR(100),
    department VARCHAR(50) NOT NULL DEFAULT '',
    batch VARCHAR(20) NOT NULL DEFAULT '',
    section VARCHAR(10) DEFAULT '',
    hostel_day_scholar VARCHAR(20) DEFAULT '',
    driving_license BOOLEAN DEFAULT FALSE,
    passport BOOLEAN DEFAULT FALSE,
    relocation_willingness BOOLEAN DEFAULT FALSE,
    family_business TEXT,
    financial_background VARCHAR(50),
    faculty_mentor_id VARCHAR(50) REFERENCES faculty(faculty_id) ON DELETE SET NULL,
    photo_url TEXT,
    resume_url TEXT,
    linkedin_url TEXT,
    linkedin_updated TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_roll_number_format CHECK (roll_number ~* '^(\\d{4}[15]A(01|02|03|04|05|32|33|34|37)[0-9A-Za-z]{2}|\\d{4}1E00[0-9A-Za-z]{2}|\\d{4}1F00[0-9A-Za-z]{2})$'),
    CONSTRAINT check_rgmcet_email CHECK (email ~* '^[a-zA-Z0-9._%+-]+@rgmcet\\.edu\\.in$')
);

-- 3. Academics Table
CREATE TABLE IF NOT EXISTS academics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    semester INT NOT NULL CHECK (semester BETWEEN 1 AND 8),
    semester_gpa NUMERIC(4, 2) CHECK (semester_gpa BETWEEN 0.00 AND 10.00),
    programming_grade VARCHAR(5),
    attendance_pct NUMERIC(5, 2) CHECK (attendance_pct BETWEEN 0.00 AND 100.00),
    theory_grade VARCHAR(5),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, semester)
);

-- 4. Coding Profiles Table
CREATE TABLE IF NOT EXISTS coding_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('GitHub', 'LeetCode', 'GeeksforGeeks', 'HackerRank', 'Codeforces', 'CodeChef', 'Kaggle', 'StackOverflow', 'GSoC-LFX', 'EduSkills')),
    handle VARCHAR(100) NOT NULL,
    streak INT DEFAULT 0,
    repositories_count INT DEFAULT 0,
    commits_count INT DEFAULT 0,
    prs_merged INT DEFAULT 0,
    score_rating NUMERIC(10, 2) DEFAULT 0.00,
    easy_count INT DEFAULT 0,
    medium_count INT DEFAULT 0,
    hard_count INT DEFAULT 0,
    contest_rating INT DEFAULT 0,
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, platform)
);

-- 5. Tech Skills Table
CREATE TABLE IF NOT EXISTS tech_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    skill_category VARCHAR(100) NOT NULL,
    specific_tool VARCHAR(100) NOT NULL,
    self_rating INT NOT NULL CHECK (self_rating BETWEEN 1 AND 5),
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, specific_tool)
);

-- 6. Certifications Table
CREATE TABLE IF NOT EXISTS certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    date_completed DATE,
    certificate_file_url TEXT,
    verified BOOLEAN DEFAULT FALSE,
    suggested BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, title)
);
-- Migration: if table already exists, add columns/constraints safely
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_student_id_title_key'
  ) THEN
    ALTER TABLE certifications ADD CONSTRAINT certifications_student_id_title_key UNIQUE (student_id, title);
  END IF;
END $$;

-- 7. Soft Skills Table
CREATE TABLE IF NOT EXISTS soft_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    skill VARCHAR(100) NOT NULL CHECK (skill IN ('Leadership', 'Communication', 'Teamwork', 'Time Management', 'Public Speaking', 'Learning Ability', 'Professionalism')),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    rated_by VARCHAR(20) DEFAULT 'self' CHECK (rated_by IN ('self', 'faculty')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, skill, rated_by)
);

-- 8. Extracurriculars Table
CREATE TABLE IF NOT EXISTS extracurriculars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Sport', 'Music', 'Dance', 'Photography', 'Art', 'Writing', 'Content Creation', 'Other')),
    description TEXT NOT NULL,
    level VARCHAR(50) DEFAULT 'college' CHECK (level IN ('college', 'state', 'national', 'international')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Achievements Table
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(10) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Achievement', 'Failure-Learning', 'Challenge Overcome', 'Hackathon', 'Conference', 'Meetup', 'Capstone Project', 'Startup', 'Industry Project', 'Department Event', 'Club')),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    achievement_date DATE,
    organization VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Placement Profile Table
CREATE TABLE IF NOT EXISTS placement_profile (
    student_id VARCHAR(10) PRIMARY KEY REFERENCES students(roll_number) ON DELETE CASCADE,
    placement_category VARCHAR(100) DEFAULT 'Product Companies',
    preferred_career VARCHAR(100) DEFAULT 'AI & Full Stack Engineer',
    dream_company TEXT[] DEFAULT ARRAY['Google', 'Microsoft', 'Amazon'],
    employability_score NUMERIC(5, 2) DEFAULT 85.50,
    skill_gap JSONB DEFAULT '[]'::jsonb,
    suggested_certifications JSONB DEFAULT '[]'::jsonb,
    higher_studies_interest BOOLEAN DEFAULT FALSE,
    overall_potential NUMERIC(3, 1) DEFAULT 4.5 CHECK (overall_potential BETWEEN 1.0 AND 5.0),
    research_potential NUMERIC(3, 1) DEFAULT 4.0 CHECK (research_potential BETWEEN 1.0 AND 5.0),
    need_from_department TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Users Sync Table
CREATE TABLE IF NOT EXISTS users (
    cognito_sub VARCHAR(100) PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
    roll_number VARCHAR(10) REFERENCES students(roll_number) ON DELETE SET NULL,
    faculty_id VARCHAR(50) REFERENCES faculty(faculty_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. User Sessions Table (Single-Session Enforcement)
-- Stores exactly ONE active session token per user email.
-- When a user logs in from a new device/browser, this row is UPSERTED,
-- overwriting any previous session_token — invalidating all other sessions.
CREATE TABLE IF NOT EXISTS user_sessions (
    email VARCHAR(100) PRIMARY KEY,
    session_token VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

-- 12. Mentor Assignments — source of truth for faculty–student mentor relationships.
-- One mentor per student (PRIMARY KEY on roll_number).
-- Admin uploads a CSV → rows inserted here; faculty dashboard reads from here.
CREATE TABLE IF NOT EXISTS mentor_assignments (
    roll_number  VARCHAR(10) NOT NULL PRIMARY KEY REFERENCES students(roll_number) ON DELETE CASCADE,
    faculty_id   VARCHAR(50) NOT NULL REFERENCES faculty(faculty_id) ON DELETE CASCADE,
    assigned_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_dept_batch ON students(department, batch);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_academics_student ON academics(student_id);
CREATE INDEX IF NOT EXISTS idx_coding_profiles_student ON coding_profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_tech_skills_student ON tech_skills(student_id);
CREATE INDEX IF NOT EXISTS idx_certifications_student ON certifications(student_id);
CREATE INDEX IF NOT EXISTS idx_achievements_student ON achievements(student_id);

-- 13. Subject Allotments (Faculty-Subject Allocation for Attendance)
CREATE TABLE IF NOT EXISTS subject_allotments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_label VARCHAR(5) NOT NULL,
    subject_name VARCHAR(200) NOT NULL,
    subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('Theory', 'Lab')),
    section VARCHAR(10) NOT NULL DEFAULT '',
    faculty_email VARCHAR(100) NOT NULL,
    faculty_name VARCHAR(100) NOT NULL DEFAULT '',
    department VARCHAR(50) NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(semester_label, subject_name, section, faculty_email)
);

-- 14. Subject Rosters (Students Enrolled in Subject)
CREATE TABLE IF NOT EXISTS subject_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allotment_id UUID NOT NULL REFERENCES subject_allotments(id) ON DELETE CASCADE,
    roll_number VARCHAR(10) NOT NULL,
    student_email VARCHAR(100) NOT NULL DEFAULT '',
    joining_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(allotment_id, roll_number)
);

-- 15. Attendance Sessions (Session instance taken by faculty)
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allotment_id UUID NOT NULL REFERENCES subject_allotments(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    num_periods INT NOT NULL CHECK (num_periods BETWEEN 1 AND 3),
    period_start INT NOT NULL CHECK (period_start BETWEEN 1 AND 7),
    recorded_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(allotment_id, session_date, period_start)
);

-- 16. Attendance Records (Student presence per session)
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    roll_number VARCHAR(10) NOT NULL,
    is_present BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(session_id, roll_number)
);

-- 17. Timetable Entries (Weekly Timetable Schedule per Section & Semester)
CREATE TABLE IF NOT EXISTS timetable_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_label VARCHAR(5) NOT NULL,
    department VARCHAR(50) NOT NULL DEFAULT '',
    section VARCHAR(10) NOT NULL DEFAULT '',
    day_of_week VARCHAR(15) NOT NULL,
    period_start INT NOT NULL CHECK (period_start BETWEEN 1 AND 7),
    num_periods INT NOT NULL CHECK (num_periods BETWEEN 1 AND 3),
    subject_name VARCHAR(200) NOT NULL,
    subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('Theory', 'Lab')),
    faculty_email VARCHAR(100) NOT NULL DEFAULT '',
    faculty_name VARCHAR(100) NOT NULL DEFAULT '',
    room_no VARCHAR(50) NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(semester_label, department, section, day_of_week, period_start)
);

-- 18. Timetable Official Documents (Uploaded PDF Timetable per Section & Semester)
CREATE TABLE IF NOT EXISTS timetable_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_label VARCHAR(5) NOT NULL,
    department VARCHAR(50) NOT NULL DEFAULT '',
    section VARCHAR(10) NOT NULL DEFAULT '',
    file_name VARCHAR(255) NOT NULL,
    file_data TEXT NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    uploaded_by VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(semester_label, department, section)
);

CREATE INDEX IF NOT EXISTS idx_allotments_faculty ON subject_allotments(faculty_email);
CREATE INDEX IF NOT EXISTS idx_allotments_semester ON subject_allotments(semester_label);
CREATE INDEX IF NOT EXISTS idx_allotments_dept ON subject_allotments(department);
CREATE INDEX IF NOT EXISTS idx_rosters_allotment ON subject_rosters(allotment_id);
CREATE INDEX IF NOT EXISTS idx_rosters_roll ON subject_rosters(roll_number);
CREATE INDEX IF NOT EXISTS idx_sessions_allotment ON attendance_sessions(allotment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON attendance_sessions(session_date);
-- 19. Class Incharges (1st Year Only: 1-1 and 1-2)
CREATE TABLE IF NOT EXISTS class_incharges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_label VARCHAR(5) NOT NULL CHECK (semester_label IN ('1-1', '1-2')),
    department VARCHAR(50) NOT NULL,
    section VARCHAR(10) NOT NULL,
    faculty_email VARCHAR(100) NOT NULL,
    faculty_name VARCHAR(100) NOT NULL DEFAULT '',
    assigned_by VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(semester_label, department, section)
);

CREATE INDEX IF NOT EXISTS idx_class_incharges_faculty ON class_incharges(faculty_email);

-- 20. Credly Profile & Certification Catalog
ALTER TABLE students ADD COLUMN IF NOT EXISTS credly_profile_url TEXT;

CREATE TABLE IF NOT EXISTS certification_catalogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'Cloud/DevOps',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id UUID REFERENCES certification_catalogs(id) ON DELETE SET NULL,
    roll_number VARCHAR(50) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    certificate_name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255) NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    verification_url TEXT,
    badge_image_url TEXT,
    proof_document_url TEXT,
    source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'credly')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    verified_by VARCHAR(150),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_cert_issue UNIQUE(roll_number, certificate_name, issue_date)
);

CREATE INDEX IF NOT EXISTS idx_student_cert_roll ON student_certifications(roll_number);
CREATE INDEX IF NOT EXISTS idx_student_cert_catalog ON student_certifications(catalog_id);

-- 21. Student Internships
CREATE TABLE IF NOT EXISTS student_internships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_number VARCHAR(50) NOT NULL REFERENCES students(roll_number) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    internship_type VARCHAR(50) DEFAULT 'Full-time' CHECK (internship_type IN ('Full-time', 'Part-time', 'Virtual', 'Research')),
    mode VARCHAR(30) DEFAULT 'On-site' CHECK (mode IN ('On-site', 'Remote', 'Hybrid')),
    start_date DATE NOT NULL,
    end_date DATE,
    stipend_amount NUMERIC(10, 2) DEFAULT 0,
    offer_letter_url TEXT,
    completion_certificate_url TEXT,
    status VARCHAR(30) DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed', 'cancelled')),
    mentor_email VARCHAR(150),
    mentor_name VARCHAR(150),
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_by VARCHAR(150),
    verified_at TIMESTAMP WITH TIME ZONE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internships_roll ON student_internships(roll_number);
CREATE INDEX IF NOT EXISTS idx_internships_mentor ON student_internships(mentor_email);
CREATE INDEX IF NOT EXISTS idx_internships_status ON student_internships(verification_status);

-- End of schema.sql

