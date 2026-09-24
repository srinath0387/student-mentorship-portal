/**
 * lib/constants.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 6 — Application-wide constants and enums.
 *
 * Extracted so that:
 *   1. No magic strings scattered across the codebase
 *   2. TypeScript enums provide autocomplete and rename-safety
 *   3. A single source of truth for values used on both client and server
 *
 * USAGE (backend):
 *   import { ROLES, DEPARTMENTS } from '../lib/constants';
 *   if (role === ROLES.FACULTY) { ... }
 *
 * USAGE (frontend):
 *   import { DEPARTMENTS, PLATFORMS } from '../lib/constants';
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── User Roles ───────────────────────────────────────────────────────────────

export const ROLES = {
  STUDENT:     'student',
  FACULTY:     'faculty',
  HOD:         'hod',
  ADMIN:       'admin',
  COORDINATOR: 'coordinator',
  SUPER_ADMIN: 'super_admin',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// ─── Departments ──────────────────────────────────────────────────────────────

export const DEPARTMENTS = [
  'CSE',
  'CSE (AIML)',
  'CSE (DS)',
  'ECE',
  'EEE',
  'MECH',
  'CIVIL',
  'IT',
  'MBA',
  'MCA',
] as const;

export type Department = typeof DEPARTMENTS[number];

// ─── Academic Years ───────────────────────────────────────────────────────────

export const YEARS = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
] as const;

export type Year = typeof YEARS[number];

// ─── Sections ─────────────────────────────────────────────────────────────────

export const SECTIONS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Section = typeof SECTIONS[number];

// ─── Coding Platforms ─────────────────────────────────────────────────────────

export const PLATFORMS = {
  LEETCODE:     'LeetCode',
  GITHUB:       'GitHub',
  GFG:          'GeeksForGeeks',
  EDUSKILLS:    'EduSkills',
  HACKERRANK:   'HackerRank',
  CODECHEF:     'CodeChef',
  CODEFORCES:   'Codeforces',
} as const;

export type Platform = typeof PLATFORMS[keyof typeof PLATFORMS];

// ─── Leave Statuses ───────────────────────────────────────────────────────────

export const LEAVE_STATUS = {
  PENDING:   'pending',
  APPROVED:  'approved',
  REJECTED:  'rejected',
} as const;

export type LeaveStatus = typeof LEAVE_STATUS[keyof typeof LEAVE_STATUS];

// ─── Leave Types ──────────────────────────────────────────────────────────────

export const LEAVE_TYPES = [
  'casual',
  'earned',
  'medical',
  'maternity',
  'paternity',
  'special',
  'on_duty',
] as const;

export type LeaveType = typeof LEAVE_TYPES[number];

// ─── Verification Statuses ────────────────────────────────────────────────────

export const VERIFICATION_STATUS = {
  PENDING:  'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type VerificationStatus = typeof VERIFICATION_STATUS[keyof typeof VERIFICATION_STATUS];

// ─── Gender Options ───────────────────────────────────────────────────────────

export const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;
export type Gender = typeof GENDERS[number];

// ─── Lateral Entry Patterns ───────────────────────────────────────────────────

/** Roll number patterns that identify lateral entry students (joined in 2nd year) */
export const LATERAL_ENTRY_PATTERNS = [
  /^22[A-Z]{2}[0-9]{2}A[A-Z]5[0-9]{2}$/i,  // 22-batch lateral
  /^23[A-Z]{2}[0-9]{2}A[A-Z]5[0-9]{2}$/i,  // 23-batch lateral
  /^24[A-Z]{2}[0-9]{2}A[A-Z]5[0-9]{2}$/i,  // 24-batch lateral
] as const;

// ─── Semester Periods ─────────────────────────────────────────────────────────

export const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'] as const;
export type Semester = typeof SEMESTERS[number];

// ─── HTTP Header Constants ────────────────────────────────────────────────────

export const HEADERS = {
  ADMIN_SECRET:  'x-admin-secret',
  CALLER_EMAIL:  'x-caller-email',
  CACHE_STATUS:  'x-cache',
} as const;

// ─── Cache TTL (in seconds) ───────────────────────────────────────────────────

export const CACHE_TTL = {
  PLATFORM_STATS:   7200,   // 2 hours (LeetCode, GitHub, GFG)
  HOD_ANALYTICS:    3600,   // 1 hour
  PLACEMENT_REPORT: 1800,   // 30 minutes
} as const;

// ─── Pagination Defaults ──────────────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_LIMIT:  50,
  MAX_LIMIT:     500,
  STUDENT_LIMIT: 200,
} as const;
