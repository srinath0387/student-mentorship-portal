# 🔍 Advitiyans Portal — Full QA & Security Audit Report

**Product**: Student Mentorship & Placement Readiness Portal  
**Stack**: React + Vite + TanStack Query + AWS Cognito → Node.js Lambda + PostgreSQL (RDS)  
**Audited**: Sept 2, 2026  

---

## Executive Summary

| Severity | Backend | Frontend | Total |
|:---|:---:|:---:|:---:|
| 🔴 **CRITICAL** | 7 | 4 | **11** |
| 🟠 **HIGH** | 7 | 4 | **11** |
| 🟡 **MEDIUM** | 6 | 4 | **10** |
| 🟢 **LOW** | 4 | 3 | **7** |
| **Total** | **24** | **15** | **39** |

---

## 🔴 CRITICAL (Fix Immediately — Production Risk)

---

### [BE-C1] JWT Signature Verification is DISABLED — Full Auth Bypass
- **File**: `backend/src/lib/authMiddleware.ts:36-50`
- **Description**: `decodeJwtPayload()` base64-decodes the JWT payload but **never verifies the HMAC/RSA cryptographic signature** against Cognito JWKS. Anyone can forge a JWT with `{"alg":"none"}` and claims `{"email":"admin@rgmcet.edu.in","custom:role":"admin"}` and gain full admin access.
- **Repro**:
  1. Craft JWT: `btoa('{"alg":"none"}') + "." + btoa('{"email":"admin@rgmcet.edu.in","custom:role":"admin"}') + ".fake"`
  2. `curl -H "Authorization: Bearer <forged>" https://<api>/super-admin/admins`
  3. Returns admin data.
- **Fix**: Integrate `aws-jwt-verify` package and validate against Cognito User Pool JWKS endpoint.

---

### [BE-C2] `X-Caller-Email` Header Overrides Authenticated Identity (Privilege Escalation)
- **File**: `backend/src/lib/authMiddleware.ts:72, 79`
- **Description**: Any request can include `X-Caller-Email: jayakrushna1622@gmail.com` to override the caller's identity to Super Admin, regardless of their actual JWT claims.
- **Repro**:
  1. Use any student auth token.
  2. Add header `X-Caller-Email: jayakrushna1622@gmail.com`
  3. Call `DELETE /students` — executes with full super-admin privileges.
- **Fix**: Remove `X-Caller-Email` header trust entirely. Derive caller identity exclusively from validated JWT claims.

---

### [BE-C3] `demo_token_` Backdoor Active in Production
- **File**: `backend/src/lib/authMiddleware.ts:151-272`
- **Description**: `Authorization: Bearer demo_token_admin` + `?caller_email=jayakrushna1622@gmail.com` grants full unauthenticated Super Admin access. Not gated to dev/test environments.
- **Repro**:
  1. `curl -H "Authorization: Bearer demo_token_admin" "https://<api>/super-admin/admins?caller_email=jayakrushna1622@gmail.com"`
  2. Returns full admin list.
- **Fix**: Gate `demo_token_` logic strictly to `process.env.NODE_ENV === 'test' && process.env.USE_MOCK === 'true'`.

---

### [BE-C4] Admin Passwords Stored & Returned in Plaintext
- **File**: `backend/src/handlers/api.ts:583-686`
- **Description**: Passwords for Super Admins, Admins, and HODs are stored in the DB as plaintext. `GET /super-admin/tier1b` and `GET /super-admin/admins` return the `password` column directly in JSON responses.
- **Repro**:
  1. `GET /super-admin/admins` → response body contains `"password": "actual_password"`
- **Fix**: Hash all passwords with bcrypt on write. Never SELECT the password column in responses.

---

### [BE-C5] Hardcoded Backdoor Secret in Cleanup Endpoint
- **File**: `backend/src/handlers/api.ts:68-71`
- **Description**: `process.env.ADMIN_SECRET || 'advitiyans-cleanup-2026'` — if env var missing, anyone can run DB cleanup/deletion by sending `x-admin-secret: advitiyans-cleanup-2026`.
- **Fix**: Remove the hardcoded fallback. Require `ADMIN_SECRET` at startup or throw if unset.

---

### [BE-C6] S3 Upload/View URLs Are Publicly Accessible (IDOR)
- **File**: `backend/src/handlers/api.ts:3440-3515`
- **Description**: `GET /students/:id/upload-url` and `GET /students/:id/view-url` have no authentication. Any unauthenticated party can generate presigned S3 PUT/GET URLs for any student's documents (resume, certificates, ID).
- **Repro**:
  1. `curl https://<api>/students/23091A3201/view-url?fileKey=students/23091A3201/docs/resume.pdf`
  2. Returns 24-hour signed S3 URL.
- **Fix**: Apply `requireAuth` + ownership check (`requireOwnerOrRole`) before generating S3 URLs.

---

### [BE-C7] `POST /students` is Unauthenticated and Allows Profile Overwriting
- **File**: `backend/src/handlers/api.ts:1586-1660`
- **Description**: Student creation uses `ON CONFLICT DO UPDATE` with no auth middleware — any unauthenticated caller can overwrite any student's name, email, and year.
- **Fix**: Add `requireAuth` middleware. From the frontend path, this should be called only after successful Cognito sign-up.

---

### [FE-C1] Missing Role-Based Route Guards (Privilege Escalation)
- **File**: `src/App.tsx:169-183`, `src/features/admin/FacultyManagementPage.tsx:43-46`
- **Description**: Only checks `isAuthenticated`, not role. Any logged-in student can navigate to `#/admin/faculty` and access the Admin panel. Additionally `isSuperAdmin = !user?.department` means students without a department string are treated as Super Admin.
- **Fix**: Create `<ProtectedRoute allowedRoles={['admin']} />` wrapper for all `/admin/*`, `/hod/*`, `/coordinator/*` routes.

---

### [FE-C2] Parent Login Uses Client-Side Password Check (No Real Auth)
- **File**: `src/features/auth/AuthPage.tsx:600-640`
- **Description**: Parent login checks `password === rollNumber` entirely in browser — no Cognito or backend call made. Anyone knowing a student's roll number can access their full profile.
- **Repro**:
  1. Open `#/parent-login`
  2. Enter `23091a3252@rgmcet.edu.in` / password `23091A3252`
  3. Instant access to student records.
- **Fix**: Validate credentials via a secure backend endpoint (or OTP to registered parent mobile).

---

### [FE-C3] Full Auth Bypass When Cognito is Unreachable
- **File**: `src/features/auth/AuthPage.tsx:746-765, 826-836`
- **Description**: When `isCognitoConfigError()` is true, the app logs the user in using only their DB record — without verifying the entered password. Any wrong password works if Cognito is down.
- **Fix**: On Cognito error, show "Service unavailable — try again" instead of granting unauthenticated DB access.

---

### [FE-C4] Production AWS Cognito Credentials Hardcoded in Source
- **File**: `src/lib/cognitoAuth.ts:14-15`, `src/lib/api.ts:14`
- **Description**: `USER_POOL_ID: 'ap-south-1_sYp8CvKjn'`, `CLIENT_ID: '6ufn4tstvrk6718ujcsjun6lpe'`, and `API_BASE_URL: 'https://caam6j4dbh.execute-api.ap-south-1.amazonaws.com/prod'` are baked into the source as fallbacks, ending up in public JS bundles.
- **Fix**: Require `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_API_BASE_URL` and fail build if unset.

---

## 🟠 HIGH

---

### [BE-H1] All Student PII Endpoints Have No Authentication
- **File**: `backend/src/handlers/api.ts` — `GET /students`, `/students/:id`, `/students/:id/academics`, `/students/:id/certifications`, `/students/:id/placement-profile`, `/reports/*`
- **Description**: Any unauthenticated request can scrape the full student directory including names, emails, phone numbers, home addresses, CGPAs, certifications, and placement preferences.
- **Fix**: Apply `requireAuth` to all `/students*` and `/reports/*` read endpoints.

---

### [BE-H2] SQL Injection in Bulk-Delete via Template String Interpolation
- **File**: `backend/src/handlers/api.ts:2301-2305`
- **Description**: `department ILIKE '%${callerDept}%'` — `callerDept` comes from auth claims and is interpolated directly, not parameterized.
- **Fix**: Use `$1` parameterized bind variable for all dynamic WHERE clauses.

---

### [BE-H3] Schema `CHECK` Constraint Rejects All Non-CSE-DS Students
- **File**: `backend/src/schema.sql:43`
- **Description**: `CHECK (roll_number ~ '^\d{5}[A-Za-z]32\d{2}$')` hardcodes department code `32` (CSE Data Science). ECE, CSE, Mechanical, Civil, MCA, MBA etc. students all fail insert.
- **Fix**: Replace with the full multi-department regex pattern already in `validation.ts`.

---

### [BE-H4] Students Can Self-Modify Their CGPA
- **File**: `backend/src/handlers/api.ts:1973-2059`
- **Description**: `PUT /students/:id` accepts `cgpa` from the request body and saves it. If the student has no semester rows, the self-reported CGPA persists on dashboards and leaderboards.
- **Fix**: Only allow CGPA updates from `admin`/`hod` role, or compute exclusively from semester averages.

---

### [BE-H5] Faculty Merge Silently Fails (Wrong Table Names & Columns)
- **File**: `backend/src/services/facultyMatching.ts:273-294`
- **Description**:
  - Queries `timetable` (table is actually `timetable_entries`)
  - References `subject_allotments.updated_at` (column doesn't exist)
  Both errors swallowed by `.catch(() => {})`, leaving orphaned records after "successful" merge.
- **Fix**: Correct table name to `timetable_entries`, remove `updated_at` from `subject_allotments` UPDATE, and log errors instead of silently suppressing.

---

### [BE-H6] Multi-Table Operations Missing DB Transactions
- **File**: `backend/src/services/facultyMatching.ts:228-306`, `api.ts:985-995`, `api.ts:2134-2147`
- **Description**: Faculty merges, student bulk deletes, and semester locks perform multiple sequential table updates without `BEGIN/COMMIT`. A mid-operation failure leaves the database in a partially-mutated inconsistent state.
- **Fix**: Wrap all multi-statement operations in `BEGIN/COMMIT/ROLLBACK` transactions using a pooled client.

---

### [BE-H7] `ON CONFLICT (LOWER(department))` Fails — No Unique Index Exists
- **File**: `backend/src/handlers/api.ts:821-826`
- **Description**: `PUT /auth/hod-credentials` uses `ON CONFLICT (LOWER(department))` but no functional unique index exists on that expression, causing PostgreSQL to throw 500.
- **Fix**: Add `CREATE UNIQUE INDEX ... ON hod_credentials (LOWER(department))` to the schema migration.

---

### [FE-H1] JWT Expiry Unhandled — Silent 401 UI Breakage
- **File**: `src/lib/api.ts:16-97`, `src/context/AuthContext.tsx:153-165`
- **Description**: After 1 hour, Cognito tokens expire. `fetchWithAuth` throws 401s but never logs out the user or attempts token refresh. Users are stuck on broken screens.
- **Fix**: Add a 401 interceptor in `fetchWithAuth` that calls `cognitoRefreshToken()` or `logout()`.

---

### [FE-H2] Demo Token Headers Can Be Forged to Impersonate Super Admin
- **File**: `src/lib/api.ts:48-63`, `src/context/AuthContext.tsx:156`
- **Description**: `demo_token_{role}_{email}` tokens are generated client-side and `X-Caller-Email` is sent for admin/hod roles. Any user who modifies `sessionStorage` can impersonate any admin.
- **Fix**: Use real signed JWTs for all roles. Remove `X-Caller-Email` trust from backend.

---

### [FE-H3] Faculty Auto-Created in DB During Login (No Security Key Required)
- **File**: `src/features/auth/AuthPage.tsx:778-801`
- **Description**: The `onLogin` handler automatically calls `api.createFaculty()` if a faculty account is not found. This bypasses the security passcode (`securityKey`) check required at sign-up. Any person with an `@rgmcet.edu.in` email can get a faculty record.
- **Fix**: Remove auto-creation from login flow. Require explicit sign-up with security key validation.

---

### [FE-H4] Hardcoded `'CSE (Data Science)'` Default Department Affects All Roles
- **File**: `src/features/auth/AuthPage.tsx` — 12+ locations
- **Description**: Department defaults to `'CSE (Data Science)'` in state, form defaults, and faculty-create calls. An ECE/EEE/Mech faculty who leaves the default dropdown selection gets saved to the DB as CSE (Data Science).
- **Fix**: Remove all pre-selected department defaults. Force explicit selection. Never save without validation.

---

## 🟡 MEDIUM

---

### [BE-M1] `POST /auth/verify-student-password` Has No Rate Limiting
- **Description**: Fully public endpoint. Brute-force attacks possible. Endpoint also returns student object on success, enabling user enumeration.
- **Fix**: Add rate limiting (e.g., `express-rate-limit`). Return only `{ valid: true/false }` — never the student object.

### [BE-M2] Unauthenticated EduSkills Certification Injection
- **File**: `backend/src/handlers/api.ts:2954-3004`
- **Description**: `POST /proxy/eduskills/sync-student/:rollNumber` has no auth — anyone can inject `verified=true` certifications for any student.
- **Fix**: Require student self-auth or admin role.

### [BE-M3] No Pagination on Large Queries (Lambda Memory Risk)
- **File**: `GET /students`, `GET /faculty`, `GET /coordinator/freshers`
- **Description**: No `LIMIT/OFFSET`. At scale (5,000+ students), responses exceed Lambda's 6MB payload limit.
- **Fix**: Add `LIMIT 100 OFFSET $n` and return pagination metadata.

### [BE-M4] `uuid_generate_v4()` Requires Extension Not Available on All RDS
- **File**: `backend/src/schema.sql:49`
- **Description**: Requires `uuid-ossp` extension. `db/index.ts` already uses `gen_random_uuid()` (built-in since PG 13).
- **Fix**: Replace `uuid_generate_v4()` with `gen_random_uuid()` in schema.sql.

### [BE-M5] Null Crash in Attendance Period Grid
- **File**: `backend/src/handlers/api.ts:6507-6518`
- **Description**: If `period_start` is 0 or NaN, `secData.periods[p - 1]` is `undefined` → runtime crash → HTTP 500.
- **Fix**: Add bounds check: `if (p >= 1 && p <= 7)` before array access.

### [BE-M6] Mentee Count Double-Counted in Merge Summary
- **File**: `backend/src/services/facultyMatching.ts:298`
- **Description**: `rowCount` from `mentor_assignments` + `students` are added together, double-counting mentees present in both tables.
- **Fix**: Count only `mentor_assignments` rows or deduplicate by roll number.

### [FE-M1] API Error Shows "No Records" Instead of Error State
- **File**: `src/features/admin/components/FacultyRecordsTable.tsx:13-16`
- **Description**: `useQuery` doesn't check `isError`. When API fails, empty `faculty=[]` array shows "No faculty records yet — upload a CSV" instead of an error message.
- **Fix**: Add `isError` check and render an error card with Retry button.

### [FE-M2] Silent Mutation Failures in Admin Faculty Panel
- **File**: `src/features/admin/FacultyManagementPage.tsx:158-166`
- **Description**: `unassignMut` and `unblockMut` mutations have no `onError` handlers. Admin has no feedback when actions fail.
- **Fix**: Add `onError: (err) => setActionError(err.message)` to all admin mutations.

### [FE-M3] URL Path Parameters Not Encoded
- **File**: `src/lib/api.ts` — 10+ locations
- **Description**: `/students/${id}/academics` without `encodeURIComponent`. IDs with `#`, `/`, `?` break the URL.
- **Fix**: Wrap all path params in `encodeURIComponent(param)`.

### [FE-M4] Memory Leak — Async State Updates After Unmount
- **File**: `src/features/auth/AuthPage.tsx:257-327`
- **Description**: `setTimeout`-delayed state updates in signup form effects run on unmounted components if user navigates away quickly.
- **Fix**: Use `AbortController` or `isMounted` flag in `useEffect` cleanups.

---

## 🟢 LOW

### [BE-L1] Wildcard CORS — All Origins Allowed
- **Fix**: Restrict CORS to `https://<your-cloudfront-domain>`.

### [BE-L2] Missing Helmet Security Headers
- **Fix**: `app.use(require('helmet')())` in Express setup.

### [BE-L3] Department Code Mapping Inconsistency
- `validation.ts` uses `'1E00'/'F00'` — DB seeds only `'MBA'/'MCA'`. Cross-reference lookups fail.

### [BE-L4] `uuid-ossp` vs Native UUID Inconsistency
- Already covered in M4 — also classify as Low for schema hygiene.

### [FE-L1] `window.alert()` Blocks UI in Smart Auto-Merge
- **File**: `src/features/admin/components/FacultyRecordsTable.tsx:81-90`
- **Fix**: Replace with toast notifications.

### [FE-L2] Direct Object Mutation (Non-Immutable State)
- **File**: `src/features/auth/AuthPage.tsx:941`, `src/lib/api.ts:392-403`
- `faculty.department = loginDept` mutates fetched object directly. Use spread: `{ ...faculty, department: loginDept }`.

### [FE-L3] Faculty Signup Default Department Mismatch
- **File**: `src/features/auth/AuthPage.tsx:129`, `src/lib/validation/auth.ts:17`
- `defaultValues: { department: 'Data Science' }` but valid value is `'CSE (Data Science)'`.

---

## 🛠 Recommended Fix Priority Order

| # | Fix | Severity | Effort |
|---|-----|----------|--------|
| 1 | Implement JWKS signature verification in `authMiddleware.ts` | 🔴 CRITICAL | Medium |
| 2 | Remove `X-Caller-Email` header trust & `demo_token_` backdoor from production | 🔴 CRITICAL | Low |
| 3 | Add `requireAuth` + ownership checks to all student PII & S3 endpoints | 🔴 CRITICAL | Medium |
| 4 | Fix Parent login to use real server-side auth (not client-side roll-number compare) | 🔴 CRITICAL | Medium |
| 5 | Remove auth bypass on Cognito failure | 🔴 CRITICAL | Low |
| 6 | Bcrypt all stored passwords + strip password from API responses | 🔴 CRITICAL | Medium |
| 7 | Add Role-Based Route Guards in React App.tsx | 🔴 CRITICAL | Low |
| 8 | Remove `ADMIN_SECRET` hardcoded fallback | 🔴 CRITICAL | Low |
| 9 | Fix schema CHECK constraint to support all departments | 🟠 HIGH | Low |
| 10 | Wrap multi-table ops in DB transactions | 🟠 HIGH | Medium |
| 11 | Fix faculty merge SQL (wrong table name, missing column) | 🟠 HIGH | Low |
| 12 | Block student self-CGPA modification | 🟠 HIGH | Low |
| 13 | Add 401 interceptor + token refresh in `fetchWithAuth` | 🟠 HIGH | Medium |
| 14 | Remove faculty auto-creation from login | 🟠 HIGH | Low |
| 15 | Remove all `'CSE (Data Science)'` hardcoded fallbacks | 🟠 HIGH | Medium |
| 16 | Add rate limiting + sanitize `/auth/verify-student-password` | 🟡 MEDIUM | Low |
| 17 | Add pagination to large list endpoints | 🟡 MEDIUM | Low |
| 18 | Add `isError` state handling in FacultyRecordsTable | 🟡 MEDIUM | Low |
| 19 | Encode URL path parameters in `api.ts` | 🟡 MEDIUM | Low |
| 20 | Restrict CORS + add Helmet | 🟢 LOW | Low |
