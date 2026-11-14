# Advitiyans — Student 360° & Placement Readiness Platform (AWS-Cloud)

**Advitiyans** is a full-stack, serverless web application built for higher education institutions (RGMCET). It enables students to track academics, technical skills, coding profiles (GitHub, LeetCode, HackerRank, Kaggle), certifications, soft skills, achievements, and real-time employability scoring.

---

## 🏗️ Architecture Overview

```
React (Vite + TypeScript + Tailwind CSS)
        │
        ▼
   S3 Bucket ── served via ── CloudFront CDN (HTTPS)
        │
        ▼ API Calls (Cognito JWT)
  Amazon API Gateway (REST API)
        │
        ▼
  AWS Lambda (Node.js 20.x, Express Router)
        │
        ▼
  Amazon RDS PostgreSQL (db.t4g.micro, Single-AZ)
  + Amazon Cognito User Pool (with Pre Sign-Up Validation Trigger)
  + Amazon S3 Bucket (Pre-signed file upload URLs)
```

---

## 📁 Repository Monorepo Structure

- `/frontend` — React 18 + Vite + TypeScript + Tailwind CSS SPA with Sidebar shell, `/login` (Student self-signup & exact regex rules, Faculty/Admin stubs), `/dashboard` (60/40 layout, completion ring, radar skill chart, recent achievements, announcements, prompt nudge cards), `/profile` (8 read/write tabs).
- `/backend` — Node.js 20.x Lambda API, Zod validation, PostgreSQL client, Cognito Pre Sign-Up validation trigger (`cognito-pre-signup.ts`), and weighted employability score calculator engine.
- `/infra` — AWS CDK v2 TypeScript project provisioning VPC, RDS PostgreSQL, Cognito, API Gateway, S3, CloudFront, Secrets Manager, and IAM roles.
- `schema.sql` — PostgreSQL DDL with unique constraints, regex format checks (`^\d{5}[A-Za-z]32\d{2}$`), indexes, and realistic seed data for 5 sample students.
- `deploy.sh` — Automated build & deployment script for AWS.

---

## ⚡ Local Development Setup

### 1. Run Backend API Locally
```bash
cd backend
npm install
npm start
```
The API server starts on `http://localhost:4000`. Health check: `http://localhost:4000/health`.

### 2. Run Frontend SPA Locally
```bash
cd frontend
npm install
npm run dev
```
The Vite web server starts on `http://localhost:3000`.

---

## 📋 Business Rules & Validation (Section 4.0)

- **Registration Number**: Exactly 10 characters matching `^\d{5}[A-Za-z]32\d{2}$` (e.g. `23091A3251`). Positions 7–8 MUST be `32`. Transformed & stored in UPPERCASE.
- **Email**: Must match `@rgmcet.edu.in`. Transformed & stored in LOWERCASE.
- **Uniqueness**: Enforced across 2 backend layers (Cognito Pre Sign-Up Lambda trigger + PostgreSQL `UNIQUE` constraints) and checked live inline during sign-up via `GET /auth/check-availability`.

---

## 🚀 Deployment to AWS (Section 11 Checklist)

### 1. Prerequisites
- AWS CLI v2 configured (`aws configure`)
- Node.js 20.x LTS & npm
- AWS CDK CLI installed globally (`npm install -g aws-cdk`)

### 2. Deploy Infrastructure Stack
```bash
cd infra
npm install
npm run build
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
cdk deploy
```

### 3. Initialize RDS Database Schema
Execute `schema.sql` against the newly provisioned RDS PostgreSQL instance via AWS SSM Session Manager port forwarding or a migration Lambda:
```bash
psql -h <RDS_ENDPOINT> -U postgres -d advitiyans -f schema.sql
```

### 4. Build & Deploy Frontend to S3 & CloudFront
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📊 Employability Score Algorithm

The system automatically calculates a student's employability score (0–100) using a weighted formula:
- **Academics (25%)**: Average GPA scaled out of 10.
- **Coding Profiles (20%)**: Linked platforms, LeetCode ratings, GitHub commit activity.
- **Tech Skills (20%)**: Self & faculty verified tool ratings.
- **Certifications (15%)**: Verified industry certificates (AWS, NPTEL, Coursera).
- **Soft Skills (10%)**: Core interpersonal skill ratings.
- **Achievements (10%)**: Hackathon wins, capstone projects, and conferences.

## 🗳️ Faculty Selection (students choose faculty per subject)

Students on a round's eligible list pick one faculty per subject for their semester, first come first served.
Every confirmed pick puts the student straight onto that faculty's existing attendance roster for the student's
own section (`subject_allotments` / `subject_rosters`). There is no second attendance system.

**Who does what**
- Department admin and that department's HOD: create rounds, add eligible students (paste / Excel / CSV), groups, sections,
  subjects, faculty options with seats per section, open/close, live dashboard, release / assign / move, Excel + PDF exports, audit log.
- Student: `#/faculty-selection` (menu shows only when on an open round's list) and `#/faculty-selection/allotted`.
- Faculty (and HOD): `#/faculty-selection/my-students` (read-only, semester › subject › section).

**Rules enforced on the server**
- Seats are per (subject, group, section, faculty); `UPDATE … SET filled = filled + 1 WHERE filled < capacity` claims a seat atomically.
- `UNIQUE (round_id, roll_number, subject_id)`: the first confirmed choice is final; only admin/HOD can release, assign or move.
- Group lock: the first pick fixes the student's group; picks from another group are refused (403).
- A released student cannot pick again; admin assigns.
- A class is never shared between departments (refused with a hint to rename the subject).

**Database** — new tables only (`fs_rounds`, `fs_eligible_students`, `fs_groups`, `fs_subjects`, `fs_offerings`,
`fs_student_groups`, `fs_selections`, `fs_created_rows`, `fs_audit_log`). They are created automatically on first use;
to create them by hand:
```bash
cd backend && npm run fs:migrate            # idempotent, CREATE … IF NOT EXISTS only
cd backend && npm run fs:rollback -- --confirm   # removes only the roster/class rows this module created, then drops fs_ tables
```
Both scripts use the same `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (or DB_SECRET_ARN) / DB_SSL` variables as `npm run db:init`.

**Routes** (prefix `/faculty-selection`): `rounds`, `rounds/:id`, `rounds/:id/status`, `rounds/:id/eligible[/:roll]`,
`rounds/:id/groups`, `groups/:gid`, `rounds/:id/subjects`, `subjects/:sid`, `subjects/:sid/offerings`, `offerings/:oid`,
`faculty-options`, `rounds/:id/dashboard`, `rounds/:id/selections`, `rounds/:id/audit`, `rounds/:id/assign`,
`selections/:sid/release`, `selections/:sid/reassign`, `department-summary`, `my-students`, `me`, `me/rounds/:id`,
`me/rounds/:id/seats`, `me/rounds/:id/select`, `me/allotted`.

**Deploy** — nothing new: `git push` to the deploy remote runs the usual GitHub Actions / `deploy.sh` flow.
No new environment variables, no infrastructure changes.

**Timetable note** — the "Attendance Not Posted" report counts only `timetable_entries`. Classes created by selection appear
there once admin adds timetable rows for each section (faculty email + period). The timetable allows one subject per section per
period, so two faculty teaching parts of one section at the same hour cannot both be in that section's timetable.

**Tests**
```bash
cd backend && npx jest tests/smoke/facultySelection.test.ts
# Last-seat race, group lock, per-section classes, release, rollback — needs a throwaway Postgres:
docker run -d --name fs-pg -e POSTGRES_PASSWORD=fs -e POSTGRES_DB=fstest -p 55432:5432 postgres:16-alpine
FS_TEST_DATABASE_URL=postgres://postgres:fs@localhost:55432/fstest npx jest tests/integration
```
Manual checklist: [docs/FACULTY_SELECTION_TEST_CHECKLIST.md](docs/FACULTY_SELECTION_TEST_CHECKLIST.md)
