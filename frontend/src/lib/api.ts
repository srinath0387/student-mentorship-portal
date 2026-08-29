import {
  StudentProfile,
  AcademicRecord,
  CodingProfile,
  TechSkill,
  Certification,
  SoftSkill,
  Achievement,
  PlacementProfile,
  ScoreBreakdown,
} from '../types';
import { getIdToken } from './cognitoAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://caam6j4dbh.execute-api.ap-south-1.amazonaws.com/prod';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  // ── Token resolution priority ──────────────────────────────────────────────
  // 1. sessionStorage JWT (tab-isolated, set on login)
  // 2. Cognito session (student/faculty real JWT — only if no sessionStorage token)
  //
  // IMPORTANT: Never fall through to Cognito if we already have a token in
  // sessionStorage. Admin/HOD use demo_token_admin_... stored in sessionStorage.
  // Cognito's shared localStorage may still hold a student's JWT from a previous
  // login on the same browser — using it would override admin's role to "student".
  // ─────────────────────────────────────────────────────────────────────────────

  // Check sessionStorage first — it's tab-isolated and authoritative
  const sessionToken = sessionStorage.getItem('advitiyans_jwt_token');

  let token: string | null = sessionToken;

  let userEmail = '';
  let userRole = '';
  try {
    const savedUser = sessionStorage.getItem('advitiyans_auth_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      userEmail = parsed.email || '';
      userRole = parsed.role || '';
    }
  } catch { /* ignore */ }

  // Only fall back to Cognito if sessionStorage has nothing (fresh page load for students)
  if (!token) {
    // HOD/Admin/Coordinator use demo tokens — Cognito would return null or a wrong-role token.
    // Reconstruct the demo token directly from the saved user rather than hitting Cognito.
    if ((userRole === 'hod' || userRole === 'admin' || userRole === 'coordinator') && userEmail) {
      token = `demo_token_${userRole}_${encodeURIComponent(userEmail)}_${Date.now()}`;
      // Restore it to sessionStorage so subsequent requests don't need to reconstruct
      sessionStorage.setItem('advitiyans_jwt_token', token);
    } else {
      try {
        token = await getIdToken();
      } catch { /* ignore */ }
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userEmail ? { 'X-Caller-Email': userEmail } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    if (!response.ok) {
      let errMsg = `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
      try {
        const text = await response.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            errMsg = parsed.message || parsed.error || errMsg;
          } catch {
            errMsg = text.length > 200 ? text.substring(0, 200) + '...' : text;
          }
        }
      } catch {
        /* ignore text parse error */
      }
      if (response.status === 413) {
        errMsg = 'File size is too large (exceeds server limit). Please upload a file smaller than 4.5 MB.';
      } else if (response.status === 403) {
        errMsg = 'Permission denied. Please ensure you are logged in as Admin or HOD.';
      }
      throw new Error(errMsg);
    }
    return await response.json();
  } catch (err) {
    console.warn(`[API] Network call to ${endpoint} failed, utilizing local fallback state.`);
    throw err;
  }
}

export const api = {
  // Auth Availability
  checkAvailability: async (type: 'email' | 'regNo', value: string) => {
    return fetchWithAuth(`/auth/check-availability?type=${type}&value=${encodeURIComponent(value)}`);
  },

  // My Mentor — student/parent facing: returns assigned mentor details + faculty remarks
  getMyMentor: async (rollNumber?: string): Promise<{
    assigned: boolean;
    faculty_id?: string;
    name?: string;
    email?: string | null;
    department?: string;
    role?: string;
    remarks?: string | null;
  }> => {
    const query = rollNumber ? `?rollNumber=${encodeURIComponent(rollNumber)}` : '';
    return fetchWithAuth(`/student/mentor${query}`);
  },

  // Single-Session Enforcement
  // Called immediately after login to register the session token with the backend.
  // This overwrites any existing session for this email, kicking out other devices.
  registerSession: async (email: string, sessionToken: string, role: string): Promise<{ success: boolean }> => {
    try {
      return await fetchWithAuth('/auth/session', {
        method: 'POST',
        body: JSON.stringify({ email, session_token: sessionToken, role }),
      });
    } catch {
      return { success: false };
    }
  },

  // Check whether this session_token is still the active session for the given email.
  // Returns { valid: true } if OK, { valid: false, reason: string } if superseded/expired.
  validateSession: async (email: string, sessionToken: string): Promise<{ valid: boolean; reason?: string }> => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/validate-session?email=${encodeURIComponent(email)}&session_token=${encodeURIComponent(sessionToken)}`
      );
      if (!res.ok) return { valid: true }; // network errors: be lenient, don't kick out
      return await res.json();
    } catch {
      return { valid: true }; // network errors: be lenient, don't kick out
    }
  },
  // Admin & HOD Login — credentials validated server-side (never stored in frontend)
  adminLogin: async (email: string, password: string, department?: string): Promise<{ valid: boolean; role?: 'admin' | 'hod'; isSuperAdmin?: boolean; department?: string; error?: string }> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s max
      const res = await fetch(`${API_BASE_URL}/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, department }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return await res.json();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { valid: false, error: 'Login timed out. Please try again — Lambda may be warming up.' };
      }
      return { valid: false, error: 'Could not reach authentication server. Please check your connection.' };
    }
  },


  // Faculty/HOD Registration Key Validation (SEC-01 fix: validated server-side)
  validateFacultyKey: async (securityKey: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/validate-faculty-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ securityKey }),
      });
      return await res.json();
    } catch {
      return { valid: false, error: 'Could not reach the server. Please try again.' };
    }
  },

  getAllStudents: async (params?: { department?: string; batch?: string; section?: string; search?: string }): Promise<StudentProfile[]> => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = val;
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    return fetchWithAuth(`/students${query ? `?${query}` : ''}`);
  },

  createStudent: async (data: Partial<StudentProfile>): Promise<{ message: string; student: StudentProfile }> => {
    return fetchWithAuth(`/students`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteStudent: async (id: string): Promise<{ message: string }> => {
    return fetchWithAuth(`/students/${id}`, {
      method: 'DELETE',
    });
  },

  bulkDeleteStudents: async (rollNumbers: string[]): Promise<{ deleted: number; message: string }> => {
    return fetchWithAuth('/admin/students/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ roll_numbers: rollNumbers }),
    });
  },

  deleteAllStudents: async (): Promise<{ message: string }> => {
    return fetchWithAuth('/students', { method: 'DELETE' });
  },

  getStudentByEmail: async (email: string): Promise<StudentProfile | null> => {
    try {
      return await fetchWithAuth(`/students/by-email/${encodeURIComponent(email)}`);
    } catch {
      return null;
    }
  },

  // Student Profile
  getStudentProfile: async (id: string): Promise<StudentProfile> => {
    return fetchWithAuth(`/students/${id}`);
  },

  updateStudentProfile: async (id: string, data: Partial<StudentProfile>): Promise<StudentProfile> => {
    return fetchWithAuth(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Sub-resources
  getAcademics: async (id: string): Promise<AcademicRecord[]> => {
    return fetchWithAuth(`/students/${id}/academics`);
  },

  saveAcademicRecord: async (id: string, data: AcademicRecord): Promise<AcademicRecord[]> => {
    return fetchWithAuth(`/students/${id}/academics`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCodingProfiles: async (id: string): Promise<CodingProfile[]> => {
    return fetchWithAuth(`/students/${id}/coding-profiles`);
  },

  saveCodingProfile: async (id: string, data: CodingProfile): Promise<CodingProfile[]> => {
    return fetchWithAuth(`/students/${id}/coding-profiles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteCodingProfile: async (id: string, platform: string): Promise<CodingProfile[]> => {
    return fetchWithAuth(`/students/${id}/coding-profiles/${encodeURIComponent(platform)}`, {
      method: 'DELETE',
    });
  },

  getLeetCodeStats: async (handle: string): Promise<any> => {
    return fetchWithAuth(`/proxy/leetcode/${encodeURIComponent(handle)}`);
  },

  getTechSkills: async (id: string): Promise<TechSkill[]> => {
    return fetchWithAuth(`/students/${id}/tech-skills`);
  },

  saveTechSkill: async (id: string, data: TechSkill): Promise<TechSkill[]> => {
    return fetchWithAuth(`/students/${id}/tech-skills`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCertifications: async (id: string): Promise<Certification[]> => {
    return fetchWithAuth(`/students/${id}/certifications`);
  },

  saveCertification: async (id: string, data: Certification): Promise<Certification[]> => {
    return fetchWithAuth(`/students/${id}/certifications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCertification: async (id: string, certId: string, data: Certification): Promise<Certification[]> => {
    return fetchWithAuth(`/students/${id}/certifications/${certId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteCertification: async (id: string, certId: string): Promise<Certification[]> => {
    return fetchWithAuth(`/students/${id}/certifications/${certId}`, {
      method: 'DELETE',
    });
  },

  getSoftSkills: async (id: string): Promise<SoftSkill[]> => {
    return fetchWithAuth(`/students/${id}/soft-skills`);
  },

  saveSoftSkill: async (id: string, data: SoftSkill): Promise<SoftSkill[]> => {
    return fetchWithAuth(`/students/${id}/soft-skills`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getAchievements: async (id: string): Promise<Achievement[]> => {
    return fetchWithAuth(`/students/${id}/achievements`);
  },

  saveAchievement: async (id: string, data: Achievement): Promise<Achievement[]> => {
    return fetchWithAuth(`/students/${id}/achievements`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getPlacementProfile: async (id: string): Promise<PlacementProfile> => {
    return fetchWithAuth(`/students/${id}/placement-profile`);
  },

  updatePlacementProfile: async (id: string, data: Partial<PlacementProfile>): Promise<PlacementProfile> => {
    return fetchWithAuth(`/students/${id}/placement-profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Employability Score
  getEmployabilityScore: async (id: string): Promise<ScoreBreakdown> => {
    return fetchWithAuth(`/students/${id}/employability-score`);
  },

  // Upload Presigned URL
  getUploadUrl: async (id: string, fileName: string, uploadType: string) => {
    return fetchWithAuth(`/students/${id}/upload-url?fileName=${encodeURIComponent(fileName)}&uploadType=${uploadType}`);
  },

  // Get View URL for existing files
  getViewUrl: async (id: string, fileKey: string) => {
    return fetchWithAuth(`/students/${id}/view-url?fileKey=${encodeURIComponent(fileKey)}`);
  },

  // Faculty Management
  createFaculty: async (data: { faculty_id: string; name: string; email: string; department: string; role?: string }) => {
    return fetchWithAuth('/faculty', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getFacultyByEmail: async (email: string) => {
    return fetchWithAuth(`/faculty/by-email/${encodeURIComponent(email)}`);
  },

  // Faculty Full Profile (Personal, Education, Certs, Activities, Publications, Domains)
  getFacultyFullProfile: async (email: string): Promise<any> => {
    return fetchWithAuth(`/faculty/full-profile/${encodeURIComponent(email)}`);
  },

  updateFacultyFullProfile: async (email: string, data: any): Promise<any> => {
    return fetchWithAuth(`/faculty/full-profile/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Faculty Mentees — by faculty_id
  getFacultyMentees: async (facultyId: string): Promise<any[]> => {
    return fetchWithAuth(`/faculty/${facultyId}/mentees`);
  },

  // Faculty Mentees — by email (resolves all records for same person across multiple faculty_ids)
  // Returns a StudentProfile[] array with an extra `.yearBreakdown` property attached.
  getMenteesByEmail: async (email: string): Promise<any[]> => {
    const resp = await fetchWithAuth(`/faculty/mentees/by-email/${encodeURIComponent(email)}`);
    // Backend now returns { mentees: [], yearBreakdown: {...}, total: n }
    // Stay backward-compatible: return the array but attach yearBreakdown for stat cards.
    if (resp && !Array.isArray(resp) && Array.isArray(resp.mentees)) {
      const arr: any[] = resp.mentees;
      (arr as any).yearBreakdown = resp.yearBreakdown || { '1st Year': 0, '2nd Year': 0, '3rd Year': 0, '4th Year': 0 };
      return arr;
    }
    // Old server or mock: plain array — compute breakdown locally
    const arr: any[] = Array.isArray(resp) ? resp : [];
    (arr as any).yearBreakdown = {
      '1st Year': arr.filter((m: any) => m.year === '1st Year').length,
      '2nd Year': arr.filter((m: any) => m.year === '2nd Year').length,
      '3rd Year': arr.filter((m: any) => m.year === '3rd Year').length,
      '4th Year': arr.filter((m: any) => m.year === '4th Year').length,
    };
    return arr;
  },

  // Get all faculty with mentee counts (admin/HOD)
  getAllFaculty: async (department?: string): Promise<any[]> => {
    return fetchWithAuth(`/faculty${department && department !== 'All' ? `?department=${encodeURIComponent(department)}` : ''}`);
  },

  // Verify student password set by admin if Cognito rejects credentials
  verifyStudentPassword: async (email: string, password: string): Promise<any> => {
    return fetchWithAuth('/auth/verify-student-password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // Link email to faculty record (admin)
  patchFacultyEmail: async (facultyId: string, email: string): Promise<any> => {
    return fetchWithAuth(`/faculty/${facultyId}/email`, {
      method: 'PATCH',
      body: JSON.stringify({ email }),
    });
  },

  // Update faculty display name (admin)
  patchFacultyName: async (facultyId: string, name: string): Promise<any> => {
    return fetchWithAuth(`/faculty/${facultyId}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  // Delete a faculty record (admin) — also blocks their email
  deleteFaculty: async (facultyId: string): Promise<any> => {
    return fetchWithAuth(`/faculty/${facultyId}`, { method: 'DELETE' });
  },

  // Get detailed mentee list for a specific faculty (admin)
  getFacultyMenteeList: async (facultyId: string): Promise<any[]> => {
    return fetchWithAuth(`/faculty/${encodeURIComponent(facultyId)}/mentees-detail`);
  },

  // Unblock a faculty email so they can re-register (admin)
  unblockFaculty: async (email: string): Promise<any> => {
    return fetchWithAuth(`/faculty/unblock/${encodeURIComponent(email)}`, { method: 'POST' });
  },

  // Get list of all blocked emails (admin)
  getBlockedEmails: async (): Promise<any[]> => {
    return fetchWithAuth(`/faculty/blocked`);
  },

  // Unassign a student from a faculty mentor (admin)
  unassignMentee: async (facultyId: string, rollNumber: string): Promise<any> => {
    return fetchWithAuth(`/mentor-assignments/${encodeURIComponent(facultyId)}/${encodeURIComponent(rollNumber)}`, { method: 'DELETE' });
  },

  // Manually assign roll numbers to a faculty mentor (admin)
  addMenteesToFaculty: async (facultyId: string, rolls: string[]): Promise<any> => {
    return fetchWithAuth(`/faculty/${encodeURIComponent(facultyId)}/mentees`, {
      method: 'POST',
      body: JSON.stringify({ rolls }),
    });
  },

  // Search students with assignment status for autocomplete (admin)
  searchAssignableStudents: async (query: string): Promise<any[]> => {
    return fetchWithAuth(`/students/search-assignable?q=${encodeURIComponent(query)}`);
  },

  // HOD & Admin: look up a student by roll no / name and get their assigned mentor details
  studentMentorLookup: async (query: string): Promise<any[]> => {
    return fetchWithAuth(`/students/mentor-lookup?q=${encodeURIComponent(query)}`);
  },


  // Upload mentor assignment CSV rows
  uploadMentorAssignments: async (rows: { rolls: string[]; facultyName: string }[]): Promise<any> => {
    return fetchWithAuth(`/mentor-assignments/upload`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },

  // Sync mentor_assignments → students.faculty_mentor_id (admin utility, idempotent)
  syncMentorAssignments: async (): Promise<{ success: boolean; synced: number; cleared: number; message: string }> => {
    return fetchWithAuth(`/mentor-assignments/sync`, { method: 'POST' });
  },

  // Departments
  getDepartments: async (): Promise<{ code: string; name: string; short_name: string }[]> => {
    return fetchWithAuth(`/departments`);
  },

  // Reports & Analytics
  getDepartmentReport: async (dept?: string) => {
    return fetchWithAuth(`/reports/department/${dept ? encodeURIComponent(dept) : ''}`);
  },

  getHodAnalytics: async (dept?: string) => {
    const q = dept ? `?department=${encodeURIComponent(dept)}` : '';
    return fetchWithAuth(`/reports/hod-analytics${q}`);
  },

  getPlacementSummary: async (dept?: string) => {
    const q = dept ? `?department=${encodeURIComponent(dept)}` : '';
    return fetchWithAuth(`/reports/placement-summary${q}`);
  },

  bulkImportStudents: async (students: any[]) => {
    return fetchWithAuth(`/students/bulk-import`, {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
  },

  triggerCronSync: async () => {
    return fetchWithAuth(`/reports/cron-sync`, {
      method: 'POST',
    });
  },

  // HOD Credential Management
  // Fetch current HOD email & password (admin-facing — shows DB override or env default)
  getHodCredentials: async (department?: string): Promise<{ email: string; password: string; department: string; source: string; updated_at: string | null }> => {
    const q = department ? `?department=${encodeURIComponent(department)}` : '';
    return fetchWithAuth(`/auth/hod-credentials${q}`);
  },

  // HOD updates their own email/password — no current password required
  updateHodCredentials: async (newEmail?: string, newPassword?: string, department?: string): Promise<{ success: boolean; message: string; email: string }> => {
    return fetchWithAuth('/auth/hod-credentials', {
      method: 'PUT',
      body: JSON.stringify({ new_email: newEmail || undefined, new_password: newPassword || undefined, department }),
    });
  },

  // Admin resets HOD credentials without needing the current password
  adminResetHodCredentials: async (newEmail?: string, newPassword?: string, department?: string): Promise<{ success: boolean; message: string; email: string }> => {
    return fetchWithAuth('/auth/hod-credentials/admin-reset', {
      method: 'POST',
      body: JSON.stringify({ new_email: newEmail || undefined, new_password: newPassword || undefined, department }),
    });
  },

  // Semester unlock settings
  getSemesterUnlockSettings: async (): Promise<{ year_label: string; max_semester: number }[]> => {
    return fetchWithAuth('/settings/semester-unlock');
  },

  updateSemesterUnlock: async (yearLabel: string, maxSemester: number): Promise<{ year_label: string; max_semester: number; deleted_count?: number }> => {
    return fetchWithAuth('/settings/semester-unlock', {
      method: 'PUT',
      body: JSON.stringify({ year_label: yearLabel, max_semester: maxSemester }),
    });
  },

  // Admin student password management
  getStudentPasswords: async (): Promise<{ roll_number: string; name: string; email: string; year: string; section: string; password: string }[]> => {
    return fetchWithAuth('/admin/student-passwords');
  },

  setStudentPassword: async (rollNo: string, password: string): Promise<{ success: boolean }> => {
    return fetchWithAuth(`/students/${rollNo}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  },

  // ── Super Admin: Manage Regular Admins ──────────────────────────────────────
  // callerEmail is sent with every request; backend validates it against super_admin_credentials.

  getSuperAdminAdmins: async (callerEmail: string): Promise<{ email: string; name: string; password: string; created_by: string; created_at: string }[]> => {
    return fetchWithAuth(`/super-admin/admins?caller_email=${encodeURIComponent(callerEmail)}`);
  },

  createAdmin: async (callerEmail: string, name: string, email: string, password: string, department?: string): Promise<{ success: boolean }> => {
    return fetchWithAuth('/super-admin/admins', {
      method: 'POST',
      body: JSON.stringify({ caller_email: callerEmail, name, email, password, department }),
    });
  },

  deleteAdmin: async (callerEmail: string, targetEmail: string): Promise<{ success: boolean }> => {
    return fetchWithAuth(`/super-admin/admins/${encodeURIComponent(targetEmail)}`, {
      method: 'DELETE',
      body: JSON.stringify({ caller_email: callerEmail }),
    });
  },

  setAdminPassword: async (callerEmail: string, targetEmail: string, password: string): Promise<{ success: boolean }> => {
    return fetchWithAuth(`/super-admin/admins/${encodeURIComponent(targetEmail)}/password`, {
      method: 'PUT',
      body: JSON.stringify({ caller_email: callerEmail, password }),
    });
  },

  // Super admin changes ONLY their own password (my_email scoped server-side)
  changeSuperAdminMyPassword: async (myEmail: string, newPassword: string): Promise<{ success: boolean }> => {
    return fetchWithAuth('/super-admin/my-password', {
      method: 'PUT',
      body: JSON.stringify({ my_email: myEmail, new_password: newPassword }),
    });
  },

  // ── Tier 1A: Manage Tier 1B Super-Admin Accounts ────────────────────────────
  // Only the 3 Gmail Tier 1A accounts can call these endpoints.

  getTier1BAdmins: async (callerEmail: string): Promise<{ email: string; password: string; updated_at: string }[]> => {
    return fetchWithAuth(`/super-admin/tier1b?caller_email=${encodeURIComponent(callerEmail)}`);
  },

  createTier1BAdmin: async (callerEmail: string, email: string, password: string): Promise<{ success: boolean }> => {
    return fetchWithAuth('/super-admin/tier1b', {
      method: 'POST',
      body: JSON.stringify({ caller_email: callerEmail, email, password }),
    });
  },

  deleteTier1BAdmin: async (callerEmail: string, targetEmail: string): Promise<{ success: boolean }> => {
    return fetchWithAuth(`/super-admin/tier1b/${encodeURIComponent(targetEmail)}`, {
      method: 'DELETE',
      body: JSON.stringify({ caller_email: callerEmail }),
    });
  },

  // ── Attendance Management System API ───────────────────────────────────────
  uploadAllotments: async (semester: string, allotments: any[]) => {
    return fetchWithAuth('/attendance/allotments/upload', {
      method: 'POST',
      body: JSON.stringify({ semester, allotments }),
    });
  },

  getAllotments: async (semester?: string, department?: string) => {
    const params = new URLSearchParams();
    if (semester) params.append('semester', semester);
    if (department) params.append('department', department);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchWithAuth(`/attendance/allotments${query}`);
  },

  createSingleAllotment: async (data: {
    semester: string;
    department: string;
    section: string;
    subject_name: string;
    subject_type: 'Theory' | 'Lab';
    faculty_name: string;
    faculty_email: string;
  }) => {
    return fetchWithAuth('/attendance/allotments/single', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteAllotment: async (id: string) => {
    return fetchWithAuth(`/attendance/allotments/${id}`, {
      method: 'DELETE',
    });
  },

  uploadRoster: async (allotmentId: string, roster: any[]) => {
    return fetchWithAuth('/attendance/rosters/upload', {
      method: 'POST',
      body: JSON.stringify({ allotment_id: allotmentId, roster }),
    });
  },

  createSingleRosterStudent: async (data: {
    allotment_id: string;
    roll_number: string;
    student_name?: string;
    student_email?: string;
    joining_date?: string;
  }) => {
    return fetchWithAuth('/attendance/rosters/single', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteRosterStudent: async (rosterId: string) => {
    return fetchWithAuth(`/attendance/rosters/${encodeURIComponent(rosterId)}`, {
      method: 'DELETE',
    });
  },

  getRoster: async (allotmentId: string, date?: string) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return fetchWithAuth(`/attendance/rosters/${allotmentId}${query}`);
  },

  getMyAttendanceSubjects: async (semester?: string) => {
    const query = semester ? `?semester=${encodeURIComponent(semester)}` : '';
    return fetchWithAuth(`/attendance/my-subjects${query}`);
  },

  saveAttendanceSession: async (data: {
    allotment_id: string;
    session_date: string;
    num_periods: number;
    period_start: number;
    records: { roll_number: string; is_present: boolean }[];
  }) => {
    return fetchWithAuth('/attendance/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getAttendanceSessions: async (allotmentId?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (allotmentId) params.append('allotment_id', allotmentId);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchWithAuth(`/attendance/sessions${query}`);
  },

  getSessionDetails: async (sessionId: string) => {
    return fetchWithAuth(`/attendance/sessions/${sessionId}`);
  },

  deleteAttendanceSession: async (sessionId: string) => {
    return fetchWithAuth(`/attendance/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  },

  updateAttendanceSession: async (sessionId: string, records: { roll_number: string; is_present: boolean }[]) => {
    return fetchWithAuth(`/attendance/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ records }),
    });
  },

  getNotPostedAttendance: async (params?: { date?: string; semester?: string; department?: string; section?: string; faculty_email?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.append('date', params.date);
    if (params?.semester) qs.append('semester', params.semester);
    if (params?.department) qs.append('department', params.department);
    if (params?.section) qs.append('section', params.section);
    if (params?.faculty_email) qs.append('faculty_email', params.faculty_email);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return fetchWithAuth(`/attendance/not-posted${query}`);
  },

  getDailyPeriodGrid: async (params?: { date?: string; semester?: string; department?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.append('date', params.date);
    if (params?.semester) qs.append('semester', params.semester);
    if (params?.department) qs.append('department', params.department);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return fetchWithAuth(`/attendance/daily-period-grid${query}`);
  },

  getStudentAttendance: async (rollNumber: string) => {
    return fetchWithAuth(`/attendance/student/${encodeURIComponent(rollNumber)}`);
  },

  getStudentDaywiseAttendance: async (rollNumber: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchWithAuth(`/attendance/student/${encodeURIComponent(rollNumber)}/daywise${query}`);
  },

  getSubjectAttendanceSummary: async (allotmentId: string) => {
    return fetchWithAuth(`/attendance/subject/${encodeURIComponent(allotmentId)}/summary`);
  },

  updateStudentJoiningDate: async (rosterId: string, joiningDate: string) => {
    return fetchWithAuth(`/attendance/rosters/${encodeURIComponent(rosterId)}/joining-date`, {
      method: 'PUT',
      body: JSON.stringify({ joining_date: joiningDate }),
    });
  },

  uploadTimetable: async (semester: string, section: string, department: string, entries: any[]) => {
    return fetchWithAuth('/attendance/timetable/upload', {
      method: 'POST',
      body: JSON.stringify({ semester, section, department, entries }),
    });
  },

  getTimetable: async (params: { semester?: string; section?: string; department?: string; day?: string }) => {
    const query = new URLSearchParams();
    if (params.semester) query.append('semester', params.semester);
    if (params.section) query.append('section', params.section);
    if (params.department) query.append('department', params.department);
    if (params.day) query.append('day', params.day);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/attendance/timetable${queryString}`);
  },

  deleteTimetableEntry: async (id: string) => {
    return fetchWithAuth(`/attendance/timetable/${id}`, {
      method: 'DELETE',
    });
  },

  clearSectionTimetable: async (semester: string, section?: string, department?: string) => {
    const query = new URLSearchParams({ semester });
    if (section) query.append('section', section);
    if (department) query.append('department', department);
    return fetchWithAuth(`/attendance/timetable/clear/section?${query.toString()}`, {
      method: 'DELETE',
    });
  },

  getTodayTimetableSlots: async (params: { semester?: string; section?: string; date?: string; faculty_email?: string }) => {
    const query = new URLSearchParams();
    if (params.semester) query.append('semester', params.semester);
    if (params.section) query.append('section', params.section);
    if (params.date) query.append('date', params.date);
    if (params.faculty_email) query.append('faculty_email', params.faculty_email);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/attendance/timetable/today-slots${queryString}`);
  },

  getYearAttendanceReport: async (params: { year?: string; department?: string; section?: string }) => {
    const query = new URLSearchParams();
    if (params.year) query.append('year', params.year);
    if (params.department) query.append('department', params.department);
    if (params.section) query.append('section', params.section);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/attendance/reports/year-summary${queryString}`);
  },

  getSemesterAttendanceSummary: async (params: { semester?: string; department?: string; section?: string; view_mode?: string }) => {
    const query = new URLSearchParams();
    if (params.semester) query.append('semester', params.semester);
    if (params.department && params.department !== 'All') query.append('department', params.department);
    if (params.section && params.section !== 'All') query.append('section', params.section);
    if (params.view_mode) query.append('view_mode', params.view_mode);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/attendance/analytics/semester-summary${queryString}`);
  },

  uploadTimetableDocument: async (data: {
    semester: string;
    section: string;
    department?: string;
    file_name: string;
    file_data: string;
    file_size?: number;
  }) => {
    return fetchWithAuth('/attendance/timetable/document/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getTimetableDocument: async (params: { semester: string; section?: string; department?: string }) => {
    const query = new URLSearchParams({ semester: params.semester });
    if (params.section) query.append('section', params.section);
    if (params.department) query.append('department', params.department);
    return fetchWithAuth(`/attendance/timetable/document?${query.toString()}`);
  },

  deleteTimetableDocument: async (id: string) => {
    return fetchWithAuth(`/attendance/timetable/document/${id}`, {
      method: 'DELETE',
    });
  },

  // ── 19. 1st Year System: Fresher, Coordinator, & Class Incharge ─────────────
  uploadFresherRoster: async (students: any[]) => {
    return fetchWithAuth('/admin/freshers/upload-roster', {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
  },

  checkUsernameAvailability: async (username: string) => {
    return fetchWithAuth(`/auth/check-username-availability?username=${encodeURIComponent(username)}`);
  },

  fresherLogin: async (credentials: {
    admissionId?: string;
    dob?: string;
    username?: string;
    password?: string;
  }) => {
    return fetchWithAuth('/auth/fresher-login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  fresherSetupPassword: async (data: {
    admissionId: string;
    dob: string;
    username: string;
    password: string;
  }) => {
    return fetchWithAuth('/auth/fresher-setup-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  linkCollegeEmail: async (data: {
    collegeEmail: string;
    currentPassword: string;
  }) => {
    return fetchWithAuth('/student/link-college-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateUsername: async (data: {
    newUsername: string;
    currentPassword: string;
  }) => {
    return fetchWithAuth('/student/username', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getCoordinatorFreshers: async (params: {
    department?: string;
    section?: string;
    stage?: string;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params.department) query.append('department', params.department);
    if (params.section) query.append('section', params.section);
    if (params.stage !== undefined) query.append('stage', params.stage);
    if (params.search) query.append('search', params.search);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/coordinator/freshers${queryString}`);
  },

  getCoordinatorFresherStats: async () => {
    return fetchWithAuth('/coordinator/freshers/stats');
  },

  getFresherDuplicates: async (): Promise<any[]> => {
    return fetchWithAuth('/coordinator/freshers/duplicates');
  },

  assignClassIncharge: async (data: {
    semester_label: '1-1' | '1-2';
    department: string;
    section: string;
    faculty_email: string;
    faculty_name?: string;
  }) => {
    return fetchWithAuth('/coordinator/class-incharge', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getClassIncharges: async (params?: { semester?: string; department?: string }) => {
    const query = new URLSearchParams();
    if (params?.semester) query.append('semester', params.semester);
    if (params?.department) query.append('department', params.department);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/coordinator/class-incharge${queryString}`);
  },

  deleteClassIncharge: async (id: string) => {
    return fetchWithAuth(`/coordinator/class-incharge/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getFacultyInchargeSections: async () => {
    return fetchWithAuth('/faculty/incharge-sections');
  },

  getInchargeSectionAnalytics: async (params: {
    semester: string;
    department: string;
    section: string;
  }) => {
    const query = new URLSearchParams({
      semester: params.semester,
      department: params.department,
      section: params.section,
    });
    return fetchWithAuth(`/faculty/incharge-section-analytics?${query.toString()}`);
  },

  promoteSection: async (department: string, section?: string) => {
    return fetchWithAuth('/coordinator/promote-section', {
      method: 'POST',
      body: JSON.stringify({ department, section }),
    });
  },

  fresherSectionSync: async (data: {
    semester: string;
    department: string;
    section: string;
  }) => {
    return fetchWithAuth('/attendance/allotments/fresher-section-sync', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCoordinatorFresherAttendance: async (params?: {
    semester?: string;
    department?: string;
    section?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.semester) query.append('semester', params.semester);
    if (params?.department) query.append('department', params.department);
    if (params?.section) query.append('section', params.section);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchWithAuth(`/coordinator/fresher-attendance${queryString}`);
  },

  getFresherMyAttendance: async () => {
    return fetchWithAuth('/freshers/my-attendance');
  },

  // ── MODULE 4: Subjects Handled (Results) ──────────────────────────────────
  getFacultySubjectsHandled: async (email: string) => {
    return fetchWithAuth(`/faculty/subjects-handled/${encodeURIComponent(email)}`);
  },

  saveFacultySubjectsHandled: async (email: string, records: any | any[]) => {
    return fetchWithAuth(`/faculty/subjects-handled/${encodeURIComponent(email)}`, {
      method: 'POST',
      body: JSON.stringify(records),
    });
  },

  deleteFacultySubjectHandled: async (id: string) => {
    return fetchWithAuth(`/faculty/subjects-handled/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // ── MODULE 5: Holiday Calendar ────────────────────────────────────────────
  getHolidays: async () => {
    return fetchWithAuth('/holidays');
  },

  addHoliday: async (date: string, title: string, type?: string) => {
    return fetchWithAuth('/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, title, type }),
    });
  },

  updateHoliday: async (id: string, date: string, title: string, type?: string) => {
    return fetchWithAuth(`/holidays/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ date, title, type }),
    });
  },

  deleteHoliday: async (id: string) => {
    return fetchWithAuth(`/holidays/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // ── MODULE 6: Academic Calendar (Semester Windows) ────────────────────────
  getAcademicCalendars: async (academicYear?: string) => {
    const query = academicYear ? `?academic_year=${encodeURIComponent(academicYear)}` : '';
    return fetchWithAuth(`/academic-calendar${query}`);
  },

  saveAcademicCalendar: async (data: {
    academic_year: string;
    semester: string;
    start_date: string;
    end_date: string;
    description?: string;
  }) => {
    return fetchWithAuth('/academic-calendar', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteAcademicCalendar: async (id: string) => {
    return fetchWithAuth(`/academic-calendar/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // ── MODULE 5: Faculty Leaves ──────────────────────────────────────────────
  getMyFacultyLeaveSummary: async (email?: string) => {
    const qs = email ? `?caller_email=${encodeURIComponent(email)}` : '';
    return fetchWithAuth(`/faculty/leaves/my-summary${qs}`);
  },

  getReassignedDuties: async (email?: string) => {
    const qs = email ? `?caller_email=${encodeURIComponent(email)}` : '';
    return fetchWithAuth(`/faculty/leaves/reassigned-duties${qs}`);
  },

  applyFacultyLeave: async (data: {
    leave_type: string;
    from_date: string;
    to_date: string;
    reason: string;
    adjustments?: any[];
    faculty_email?: string;
  }) => {
    return fetchWithAuth('/faculty/leaves/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getHodFacultyLeaves: async () => {
    return fetchWithAuth('/hod/leaves/faculty');
  },

  updateFacultyLeaveStatus: async (id: string, status: 'Approved' | 'Rejected', hod_remarks?: string) => {
    return fetchWithAuth(`/hod/leaves/faculty/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, hod_remarks }),
    });
  },

  deleteFacultyLeave: async (id: string): Promise<{ success: boolean; message: string }> => {
    return fetchWithAuth(`/faculty/leaves/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  deleteHodFacultyLeave: async (id: string): Promise<{ success: boolean; message: string }> => {
    return fetchWithAuth(`/hod/leaves/faculty/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  respondToAdjustment: async (adjId: string, status: 'Accepted' | 'Rejected', rejected_reason?: string, callerEmail?: string) => {
    return fetchWithAuth(`/faculty/leaves/adjustments/${encodeURIComponent(adjId)}/respond`, {
      method: 'POST',
      body: JSON.stringify({ status, rejected_reason, caller_email: callerEmail }),
    });
  },

  reassignDutyColleague: async (adjId: string, new_faculty_email: string, new_faculty_name?: string) => {
    return fetchWithAuth(`/faculty/leaves/adjustments/${encodeURIComponent(adjId)}/reassign`, {
      method: 'PUT',
      body: JSON.stringify({ new_faculty_email, new_faculty_name }),
    });
  },

  principalApproveFacultyLeave: async (id: string, status: 'Approved' | 'Rejected', principal_remarks?: string) => {
    return fetchWithAuth(`/principal/leaves/faculty/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, principal_remarks }),
    });
  },

  getFacultyLeaveCredits: async (): Promise<any[]> => {
    return fetchWithAuth('/admin/faculty/leave-credits');
  },

  adjustFacultyLeaveCredit: async (data: {
    faculty_email: string;
    leave_type: string;
    new_quota: number;
    reason: string;
  }) => {
    return fetchWithAuth('/admin/faculty/leave-credits/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getFacultyCreditLogs: async (email: string): Promise<any[]> => {
    return fetchWithAuth(`/admin/faculty/leave-credits/logs/${encodeURIComponent(email)}`);
  },

  // ── MODULE 5: Student Permissions (On-Duty / Leaves) ──────────────────────
  applyStudentPermission: async (data: {
    roll_number?: string;
    permission_type: string;
    from_date: string;
    to_date: string;
    reason: string;
    proof_url: string;
  }) => {
    return fetchWithAuth('/student/permissions/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMyStudentPermissions: async (rollNumber?: string) => {
    const query = rollNumber ? `?rollNumber=${encodeURIComponent(rollNumber)}` : '';
    return fetchWithAuth(`/student/permissions/my-history${query}`);
  },

  getHodStudentPermissions: async () => {
    return fetchWithAuth('/hod/permissions/students');
  },

  updateStudentPermissionStatus: async (id: string, status: 'Approved' | 'Rejected', hod_remarks?: string) => {
    return fetchWithAuth(`/hod/permissions/students/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, hod_remarks }),
    });
  },

  deleteHodStudentPermission: async (id: string): Promise<{ success: boolean; message: string }> => {
    return fetchWithAuth(`/hod/permissions/students/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // ── MODULE: First Year Bulk Onboarding ────────────────────────────────────
  generateFirstYearRollNumbers: async (students: any[], batch_year?: string | number) => {
    return fetchWithAuth('/first-year/generate-roll-numbers', {
      method: 'POST',
      body: JSON.stringify({ students, batch_year }),
    });
  },

  bulkCreateFirstYearStudents: async (students: any[]) => {
    return fetchWithAuth('/first-year/bulk-create', {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
  },

  getFirstYearStudents: async (dept?: string, batch_year?: string) => {
    const params = new URLSearchParams();
    if (dept) params.set('dept', dept);
    if (batch_year) params.set('batch_year', batch_year);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return fetchWithAuth(`/first-year/students${qs}`);
  },
};
