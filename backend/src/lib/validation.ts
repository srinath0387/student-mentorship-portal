import { z } from 'zod';

// Registration Number Regex:
// B.Tech (Regular: 23091A0428 | Lateral: 23095A0428)
// MBA: Strictly Regular (25091E0001)
// MCA: Strictly Regular (25091F0001)
export const REGISTRATION_NUMBER_REGEX = /^(\d{4}[15]A(01|02|03|04|05|32|33|34|37)[0-9A-Za-z]{2}|\d{4}1E00[0-9A-Za-z]{2}|\d{4}1F00[0-9A-Za-z]{2})$/i;
export const RGMCET_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@rgmcet\.edu\.in$/i;

// ── Department Code Map ─────────────────────────────────────────────────────
export const DEPARTMENT_CODE_MAP: Record<string, string> = {
  '01': 'Civil',
  '02': 'EEE',
  '03': 'Mechanical',
  '04': 'ECE',
  '05': 'CSE',
  '32': 'CSE (Data Science)',
  '33': 'CSE (AI & ML)',
  '34': 'CSE (BS)',
  '37': 'CSE (CS)',
  'E00': 'MBA',
  '1E00': 'MBA',
  '1E': 'MBA',
  'E0': 'MBA',
  'F00': 'MCA',
  '1F00': 'MCA',
  '1F': 'MCA',
  'F0': 'MCA',
  'MCA': 'MCA',
  'MBA': 'MBA',
};

export const VALID_DEPARTMENT_CODES = Object.keys(DEPARTMENT_CODE_MAP);
export const VALID_DEPARTMENT_NAMES = Array.from(new Set(Object.values(DEPARTMENT_CODE_MAP)));

/** Extract the department code from a roll number */
export function getDeptCodeFromRollNumber(rollNumber: string): string {
  const upper = (rollNumber || '').trim().toUpperCase();
  if (upper.length >= 8) {
    if (upper.substring(5, 8) === 'E00' || upper.substring(4, 6) === '1E') return 'E00';
    if (upper.substring(5, 8) === 'F00' || upper.substring(4, 6) === '1F') return 'F00';
    return upper.substring(6, 8);
  }
  return upper;
}

/** Get department name from roll number */
export function getDeptFromRollNumber(rollNumber: string): string {
  const upper = (rollNumber || '').trim().toUpperCase();
  if (upper.includes('1E00') || upper.substring(5, 8) === 'E00' || upper.substring(4, 6) === '1E') {
    return 'MBA';
  }
  if (upper.includes('1F00') || upper.substring(5, 8) === 'F00' || upper.substring(4, 6) === '1F') {
    return 'MCA';
  }
  const code = getDeptCodeFromRollNumber(upper);
  return DEPARTMENT_CODE_MAP[code] || 'Unknown';
}

/** Check if a roll number indicates lateral entry (FDH) — only B.Tech position 4 is '5' */
export function isLateralEntry(rollNumber: string): boolean {
  const upper = (rollNumber || '').trim().toUpperCase();
  return upper.length === 10 && upper.charAt(4) === '5' && upper.charAt(5) === 'A';
}

/** Get department code from department name */
export function getDeptCodeFromName(deptName: string): string | undefined {
  return Object.entries(DEPARTMENT_CODE_MAP).find(([, name]) => name === deptName)?.[0];
}

export const registrationNumberSchema = z.string()
  .trim()
  .regex(REGISTRATION_NUMBER_REGEX, {
    message: "Registration number must be 10 characters (e.g. 23091A3251, 25091E0001 for MBA, or 25091F0001 for MCA).",
  })
  .transform((val) => val.toUpperCase());

export const emailSchema = z.string()
  .trim()
  .regex(RGMCET_EMAIL_REGEX, {
    message: "Email must be a valid @rgmcet.edu.in address.",
  })
  .transform((val) => val.toLowerCase());

export const studentSignUpSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(100),
  registrationNumber: registrationNumberSchema,
  year: z.enum(['1st Year', '2nd Year', '3rd Year', '4th Year']),
  department: z.string().min(1, "Please select your department"),
  email: emailSchema,
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/\d/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
}).refine((data) => {
  const expectedEmail = `${data.registrationNumber.toLowerCase()}@rgmcet.edu.in`;
  return data.email.toLowerCase() === expectedEmail;
}, {
  message: "Student email must match registration number (e.g. 23091a3205@rgmcet.edu.in)",
  path: ["email"],
}).refine((data) => {
  // Validate that the selected department matches the roll number code
  const deptCode = getDeptCodeFromRollNumber(data.registrationNumber.toUpperCase());
  const expectedDept = DEPARTMENT_CODE_MAP[deptCode];
  return expectedDept === data.department;
}, {
  message: "Selected department does not match your registration number. Please select the correct department.",
  path: ["department"],
});

export const facultySignUpSchema = z.object({
  fullName: z.string().min(2).max(100),
  department: z.string().min(1, "Please select department"),
  securityKey: z.string().min(1, "Faculty secret passcode is required"),
  email: emailSchema,
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const yearEnum = z.enum(['1st Year', '2nd Year', '3rd Year', '4th Year']);
const hostelEnum = z.enum(['Hostel', 'Day Scholar']);

export const studentProfileSchema = z.object({
  name: z.string().optional().nullable(),
  roll_number: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  year: z.union([yearEnum, z.literal(''), z.null()]).optional().transform((v) => (v === '' ? undefined : v)),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  native_place: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  batch: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  hostel_day_scholar: z.union([hostelEnum, z.literal(''), z.null()]).optional().transform((v) => (v === '' ? undefined : v)),
  driving_license: z.boolean().optional(),
  passport: z.boolean().optional(),
  relocation_willingness: z.boolean().optional(),
  family_business: z.string().optional().nullable(),
  financial_background: z.string().optional().nullable(),
  faculty_mentor_id: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  resume_url: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  cgpa: z.union([z.number(), z.string().transform((v) => parseFloat(v) || 0)]).optional().nullable(),
});

export const academicSchema = z.object({
  semester: z.number().int().min(1).max(8),
  semester_gpa: z.number().min(0).max(10),
  programming_grade: z.string().optional().nullable(),
  attendance_pct: z.number().min(0).max(100),
  theory_grade: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const codingProfileSchema = z.object({
  platform: z.enum([
    'GitHub',
    'LeetCode',
    'GeeksforGeeks',
    'HackerRank',
    'Codeforces',
    'CodeChef',
    'Kaggle',
    'StackOverflow',
    'GSoC-LFX',
  ]),
  handle: z.string().min(1),
  streak: z.number().int().nonnegative().default(0),
  repositories_count: z.number().int().nonnegative().default(0),
  commits_count: z.number().int().nonnegative().default(0),
  prs_merged: z.number().int().nonnegative().default(0),
  score_rating: z.number().nonnegative().default(0),
  easy_count: z.number().int().nonnegative().optional().default(0),
  medium_count: z.number().int().nonnegative().optional().default(0),
  hard_count: z.number().int().nonnegative().optional().default(0),
  contest_rating: z.number().optional().default(0),
});

export const techSkillSchema = z.object({
  skill_category: z.string().min(1),
  specific_tool: z.string().min(1),
  self_rating: z.number().int().min(1).max(5),
  verified: z.boolean().default(false),
});

export const certificationSchema = z.object({
  provider: z.string().min(1),
  title: z.string().min(1),
  date_completed: z.string().optional().nullable(),
  certificate_file_url: z.string().optional().nullable(),
  suggested: z.boolean().default(false),
});

export const softSkillSchema = z.object({
  skill: z.enum(['Leadership', 'Communication', 'Teamwork', 'Time Management', 'Public Speaking', 'Learning Ability', 'Professionalism']),
  rating: z.number().int().min(1).max(5),
  rated_by: z.enum(['self', 'faculty']).default('self'),
});

export const achievementSchema = z.object({
  type: z.enum(['Achievement', 'Failure-Learning', 'Challenge Overcome', 'Hackathon', 'Conference', 'Meetup', 'Capstone Project', 'Startup', 'Industry Project', 'Department Event', 'Club']),
  title: z.string().min(1),
  description: z.string().min(1),
  achievement_date: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
});

export const placementProfileSchema = z.object({
  placement_category: z.string().default('Product Companies'),
  preferred_career: z.string().default('AI & Full Stack Engineer'),
  dream_company: z.array(z.string()).default([]),
  higher_studies_interest: z.boolean().default(false),
  need_from_department: z.string().optional().nullable(),
});
