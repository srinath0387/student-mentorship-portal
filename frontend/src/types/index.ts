export type UserRole = 'student' | 'faculty' | 'admin' | 'hod' | 'parent';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  rollNumber?: string;
  department: string;
  isSuperAdmin?: boolean;
  isLateralEntry?: boolean;
}

export interface StudentProfile {
  roll_number: string;
  name: string;
  email: string;
  year: '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
  phone?: string;
  address?: string;
  native_place?: string;
  department: string;
  batch: string;
  section: string;
  hostel_day_scholar: 'Hostel' | 'Day Scholar';
  driving_license: boolean;
  passport: boolean;
  relocation_willingness: boolean;
  family_business?: string;
  financial_background?: string;
  faculty_mentor_id?: string;
  photo_url?: string;
  resume_url?: string;
  linkedin_url?: string;
  linkedin_updated?: string;
}

export interface AcademicRecord {
  id?: string;
  semester: number;
  semester_gpa: number;
  programming_grade?: string;
  attendance_pct: number;
  theory_grade?: string;
  remarks?: string;
}

export interface CodingProfile {
  id?: string;
  platform:
    | 'GitHub'
    | 'LeetCode'
    | 'GeeksforGeeks'
    | 'HackerRank'
    | 'Codeforces'
    | 'CodeChef'
    | 'Kaggle'
    | 'StackOverflow'
    | 'GSoC-LFX';
  handle: string;
  streak: number;
  repositories_count: number;
  commits_count: number;
  prs_merged: number;
  score_rating: number;
  last_synced?: string;
}

export interface TechSkill {
  id?: string;
  skill_category: string;
  specific_tool: string;
  self_rating: number;
  verified: boolean;
}

export interface Certification {
  id?: string;
  provider: string;
  title: string;
  date_completed?: string;
  certificate_file_url?: string;
  suggested?: boolean;
}

export interface SoftSkill {
  id?: string;
  skill: 'Leadership' | 'Communication' | 'Teamwork' | 'Time Management' | 'Public Speaking' | 'Learning Ability' | 'Professionalism';
  rating: number;
  rated_by: 'self' | 'faculty';
}

export interface Extracurricular {
  id?: string;
  category: 'Sport' | 'Music' | 'Dance' | 'Photography' | 'Art' | 'Writing' | 'Content Creation' | 'Other';
  description: string;
  level: 'college' | 'state' | 'national' | 'international';
}

export interface Achievement {
  id?: string;
  type: 'Achievement' | 'Failure-Learning' | 'Challenge Overcome' | 'Hackathon' | 'Conference' | 'Meetup' | 'Capstone Project' | 'Startup' | 'Industry Project' | 'Department Event' | 'Club';
  title: string;
  description: string;
  achievement_date?: string;
  organization?: string;
}

export interface PlacementProfile {
  student_id: string;
  placement_category: string;
  preferred_career: string;
  dream_company: string[];
  employability_score: number;
  skill_gap?: string[];
  suggested_certifications?: string[];
  higher_studies_interest: boolean;
  overall_potential?: number;
  research_potential?: number;
  need_from_department?: string;
}

export interface ScoreBreakdown {
  overallScore: number;
  academicsScore: number;
  codingScore: number;
  techSkillsScore: number;
  certsScore: number;
  softSkillsScore: number;
  achievementsScore: number;
  feedback: string[];
}

// ── Faculty Profile Types ──────────────────────────────────────────────────
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
export type FacultyDesignation = 'Assistant Professor' | 'Associate Professor' | 'Professor';
export type ActivityType = 'Conference' | 'Workshop' | 'FDP';
export type ActivityLevel = 'International' | 'National' | 'State';
export type PublicationCategory = 'SCI' | 'SCOPUS' | 'WoS' | 'Patent' | 'Unclassified';

export interface FacultyPersonalDetails {
  faculty_id: string;
  name: string;
  email: string;
  department: string;
  phone?: string;
  blood_group?: BloodGroup;
  linkedin_url?: string;
  scopus_id?: string;
  orcid_id?: string;
  joining_date?: string; // YYYY-MM-DD
  prior_experience_years?: number;
  prior_experience_months?: number;
  designation?: FacultyDesignation;
  designation_locked?: boolean;
}

export interface FacultyEducation {
  highest_qualification?: string;
  university?: string;
  year_of_passing?: number;
  specialization?: string;
}

export interface FacultyCertificationRecord {
  id: string;
  title: string;
  issuing_body: string;
  completion_date: string; // YYYY-MM-DD
  academic_year: string;  // e.g. "2024–25"
  certificate_file_url?: string;
  created_at?: string;
}

export interface FacultyActivityRecord {
  id: string;
  title: string;
  type: ActivityType;
  organizer: string;
  date: string; // YYYY-MM-DD
  level: ActivityLevel;
  academic_year: string; // e.g. "2024–25"
  document_url?: string;
}

export interface FacultyPublicationRecord {
  id: string;
  category: PublicationCategory;
  title: string;
  journal_name: string;
  year: number;
  doi_link?: string;
  co_authors?: string;
  document_url?: string;
  needs_review?: boolean;
}

export interface FacultyFullProfile {
  personal: FacultyPersonalDetails;
  education: FacultyEducation;
  certifications: FacultyCertificationRecord[];
  activities: FacultyActivityRecord[];
  publications: FacultyPublicationRecord[];
  domains: string[];
  scopus_id?: string;
  orcid_id?: string;
}

// ── Attendance Management Types ─────────────────────────────────────────────
export type SemesterLabel = '2-1' | '2-2' | '3-1' | '3-2' | '4-1' | '4-2';
export type SubjectType = 'Theory' | 'Lab';

export interface SubjectAllotment {
  id: string;
  semester_label: SemesterLabel;
  subject_name: string;
  subject_type: SubjectType;
  section: string;
  faculty_email: string;
  faculty_name: string;
  department: string;
  roster_count?: number;
  sessions_count?: number;
  created_at?: string;
}

export interface SubjectRosterEntry {
  id: string;
  allotment_id: string;
  roll_number: string;
  student_email: string;
  student_name?: string;
  student_department?: string;
  student_section?: string;
}

export interface AttendanceSession {
  id: string;
  allotment_id: string;
  session_date: string; // YYYY-MM-DD
  num_periods: number;
  period_start: number;
  recorded_by: string;
  subject_name?: string;
  subject_type?: SubjectType;
  section?: string;
  semester_label?: SemesterLabel;
  faculty_name?: string;
  total_marked?: number;
  present_count?: number;
  created_at?: string;
}

export interface AttendanceRecordItem {
  roll_number: string;
  is_present: boolean;
  student_name?: string;
}

export interface StudentSubjectAttendance {
  allotment_id: string;
  subject_name: string;
  subject_type: SubjectType;
  semester_label: SemesterLabel;
  faculty_name: string;
  periods_held: number;
  periods_attended: number;
  percentage: number;
}

export interface StudentAttendanceSummary {
  student: {
    roll_number: string;
    name?: string;
    department?: string;
    batch?: string;
    section?: string;
  };
  overall_percentage: number;
  total_periods_held: number;
  total_periods_attended: number;
  subjects: StudentSubjectAttendance[];
}

export interface DayPeriodRecord {
  is_present: boolean;
  subject_name: string;
  subject_type: SubjectType;
  period: number;
}

export interface DaywiseAttendanceItem {
  date: string;
  periods: (DayPeriodRecord | null)[];
}

export interface StudentDaywiseAttendanceResponse {
  rollNumber: string;
  fromDate: string;
  toDate: string;
  days: DaywiseAttendanceItem[];
}

export interface SubjectAttendanceStudentSummary {
  roll_number: string;
  student_name: string;
  section: string;
  periods_attended: number;
  periods_held: number;
  percentage: number;
}

export interface SubjectAttendanceSummaryResponse {
  allotment: SubjectAllotment;
  total_periods_held: number;
  sessions_count: number;
  total_students: number;
  students: SubjectAttendanceStudentSummary[];
}


