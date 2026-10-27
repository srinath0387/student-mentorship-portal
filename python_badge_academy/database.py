"""
Database layer for Python Badge Academy.
Uses SQLite for robust local/lab persistence with zero configuration.
Ready for hosted databases (Supabase/PostgreSQL) via connection string if configured.
"""

import os
import sqlite3
import json
import secrets
from datetime import datetime

DB_PATH = os.environ.get("ACADEMY_DB_PATH", os.path.join(os.path.dirname(__file__), "academy.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def init_db():
    """Initializes all database tables with indices for fast lookups."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Students table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                roll_or_email TEXT NOT NULL UNIQUE,
                xp INTEGER DEFAULT 0,
                current_level INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 2. Level Progress table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS level_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                level_id INTEGER NOT NULL,
                learn_completed BOOLEAN DEFAULT 0,
                practice_completed BOOLEAN DEFAULT 0,
                test_passed BOOLEAN DEFAULT 0,
                test_attempts INTEGER DEFAULT 0,
                highest_score REAL DEFAULT 0.0,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                UNIQUE(student_id, level_id)
            )
        """)

        # 3. Exercise Progress table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS exercise_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                level_id INTEGER NOT NULL,
                exercise_id TEXT NOT NULL,
                passed BOOLEAN DEFAULT 0,
                hints_used INTEGER DEFAULT 0,
                submitted_code TEXT,
                plan_choice TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, exercise_id)
            )
        """)

        # 4. Test Attempts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS test_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                type TEXT NOT NULL, -- 'level_test' or 'final_exam'
                level_id INTEGER,
                seed TEXT NOT NULL,
                paper_json TEXT NOT NULL,
                answers_json TEXT,
                score REAL DEFAULT 0.0,
                passed BOOLEAN DEFAULT 0,
                breakdown_json TEXT,
                failed_cases_json TEXT,
                duration_seconds INTEGER DEFAULT 0,
                tab_switches INTEGER DEFAULT 0,
                pastes INTEGER DEFAULT 0,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)

        # 5. Badges table (prevent duplicates with UNIQUE on student_id and badge_type)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                verification_id TEXT NOT NULL UNIQUE,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                badge_type TEXT NOT NULL, -- 'level_1', 'level_2', ..., 'final_exam'
                badge_title TEXT NOT NULL,
                badge_icon TEXT NOT NULL,
                skills_json TEXT NOT NULL,
                score REAL NOT NULL,
                issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, badge_type)
            )
        """)

        # 6. Integrity / Anti-Cheat event logs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS integrity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id INTEGER REFERENCES test_attempts(id) ON DELETE SET NULL,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()

# --- Student Methods ---

def get_or_create_student(name: str, roll_or_email: str):
    name = name.strip()
    roll_or_email = roll_or_email.strip().lower()
    if not name or not roll_or_email:
        raise ValueError("Name and Roll Number / Email are required.")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM students WHERE roll_or_email = ?", (roll_or_email,))
        row = cursor.fetchone()
        
        now = datetime.utcnow().isoformat()
        if row:
            # Update name if changed and touch last_active
            cursor.execute("UPDATE students SET name = ?, last_active = ? WHERE id = ?", (name, now, row["id"]))
            conn.commit()
            cursor.execute("SELECT * FROM students WHERE id = ?", (row["id"],))
            return dict(cursor.fetchone())
        else:
            cursor.execute("""
                INSERT INTO students (name, roll_or_email, xp, current_level, created_at, last_active)
                VALUES (?, ?, 0, 1, ?, ?)
            """, (name, roll_or_email, now, now))
            student_id = cursor.lastrowid

            # Initialize Level 1 as unlocked
            cursor.execute("""
                INSERT INTO level_progress (student_id, level_id, learn_completed, practice_completed, test_passed, unlocked_at)
                VALUES (?, 1, 0, 0, 0, ?)
            """, (student_id, now))
            conn.commit()

            cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
            return dict(cursor.fetchone())

def get_student_by_id(student_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def touch_student_active(student_id: int, xp_increment: int = 0):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE students 
            SET last_active = CURRENT_TIMESTAMP, xp = xp + ?
            WHERE id = ?
        """, (xp_increment, student_id))
        conn.commit()

# --- Level & Exercise Progress Methods ---

def get_all_level_progress(student_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM level_progress WHERE student_id = ? ORDER BY level_id ASC", (student_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

def mark_learn_completed(student_id: int, level_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO level_progress (student_id, level_id, learn_completed, unlocked_at)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id, level_id) DO UPDATE SET
                learn_completed = 1
        """, (student_id, level_id))
        # Add 50 XP for completing lessons
        cursor.execute("UPDATE students SET xp = xp + 50, last_active = CURRENT_TIMESTAMP WHERE id = ?", (student_id,))
        conn.commit()

def save_exercise_submission(student_id: int, level_id: int, exercise_id: str, passed: bool, hints_used: int, code: str, plan_choice: str = ""):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT passed, hints_used FROM exercise_progress WHERE student_id = ? AND exercise_id = ?", (student_id, exercise_id))
        prev = cursor.fetchone()
        
        cursor.execute("""
            INSERT INTO exercise_progress (student_id, level_id, exercise_id, passed, hints_used, submitted_code, plan_choice, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id, exercise_id) DO UPDATE SET
                passed = CASE WHEN exercise_progress.passed = 1 THEN 1 ELSE excluded.passed END,
                hints_used = MAX(exercise_progress.hints_used, excluded.hints_used),
                submitted_code = excluded.submitted_code,
                plan_choice = excluded.plan_choice,
                updated_at = CURRENT_TIMESTAMP
        """, (student_id, level_id, exercise_id, 1 if passed else 0, hints_used, code, plan_choice))

        # Award XP if newly passed
        if passed and (not prev or not prev["passed"]):
            # Base 30 XP minus 5 XP per hint (min 10 XP)
            earned_xp = max(10, 30 - (hints_used * 5))
            cursor.execute("UPDATE students SET xp = xp + ?, last_active = CURRENT_TIMESTAMP WHERE id = ?", (earned_xp, student_id))
        
        conn.commit()

def get_student_exercises(student_id: int, level_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM exercise_progress WHERE student_id = ? AND level_id = ?", (student_id, level_id))
        return [dict(r) for r in cursor.fetchall()]

# --- Test Attempts & Badges ---

def record_test_start(student_id: int, test_type: str, level_id: int, seed: str, paper_json: dict) -> int:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO test_attempts (student_id, type, level_id, seed, paper_json, started_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (student_id, test_type, level_id, seed, json.dumps(paper_json)))
        conn.commit()
        return cursor.lastrowid

def record_test_completion(attempt_id: int, answers_json: dict, score: float, passed: bool, breakdown_json: dict, failed_cases_json: dict, duration_seconds: int, tab_switches: int = 0, pastes: int = 0):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE test_attempts
            SET answers_json = ?,
                score = ?,
                passed = ?,
                breakdown_json = ?,
                failed_cases_json = ?,
                duration_seconds = ?,
                tab_switches = ?,
                pastes = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            json.dumps(answers_json),
            score,
            1 if passed else 0,
            json.dumps(breakdown_json),
            json.dumps(failed_cases_json),
            duration_seconds,
            tab_switches,
            pastes,
            attempt_id
        ))

        cursor.execute("SELECT student_id, type, level_id FROM test_attempts WHERE id = ?", (attempt_id,))
        attempt = cursor.fetchone()
        if not attempt:
            conn.commit()
            return

        student_id = attempt["student_id"]
        test_type = attempt["type"]
        level_id = attempt["level_id"]

        if test_type == "level_test" and level_id:
            cursor.execute("""
                INSERT INTO level_progress (student_id, level_id, test_passed, test_attempts, highest_score, completed_at)
                VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(student_id, level_id) DO UPDATE SET
                    test_passed = CASE WHEN level_progress.test_passed = 1 THEN 1 ELSE excluded.test_passed END,
                    test_attempts = level_progress.test_attempts + 1,
                    highest_score = MAX(level_progress.highest_score, excluded.highest_score),
                    completed_at = CASE WHEN excluded.test_passed = 1 THEN CURRENT_TIMESTAMP ELSE level_progress.completed_at END
            """, (student_id, level_id, 1 if passed else 0, score))

            if passed:
                next_level = level_id + 1
                # Unlock next level
                cursor.execute("""
                    INSERT INTO level_progress (student_id, level_id, unlocked_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(student_id, level_id) DO NOTHING
                """, (student_id, next_level))
                # Update student current level
                cursor.execute("""
                    UPDATE students 
                    SET current_level = MAX(current_level, ?), xp = xp + 100, last_active = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (next_level, student_id))
        elif test_type == "final_exam" and passed:
            cursor.execute("UPDATE students SET xp = xp + 300, last_active = CURRENT_TIMESTAMP WHERE id = ?", (student_id,))

        conn.commit()

def issue_badge(student_id: int, badge_type: str, badge_title: str, badge_icon: str, skills: list, score: float) -> dict:
    """Issues a unique verification badge. If already issued, returns existing badge."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM badges WHERE student_id = ? AND badge_type = ?", (student_id, badge_type))
        existing = cursor.fetchone()
        if existing:
            return dict(existing)
        
        # Generate 12-char cryptographically random verification ID
        verification_id = f"PBA-{secrets.token_hex(4).upper()}-{secrets.token_hex(2).upper()}"
        cursor.execute("""
            INSERT INTO badges (verification_id, student_id, badge_type, badge_title, badge_icon, skills_json, score, issued_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (verification_id, student_id, badge_type, badge_title, badge_icon, json.dumps(skills), score))
        conn.commit()

        cursor.execute("SELECT * FROM badges WHERE verification_id = ?", (verification_id,))
        return dict(cursor.fetchone())

def get_badges_for_student(student_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM badges WHERE student_id = ? ORDER BY id ASC", (student_id,))
        return [dict(r) for r in cursor.fetchall()]

def get_badge_by_verification_id(verification_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, s.name as student_name, s.roll_or_email
            FROM badges b
            JOIN students s ON b.student_id = s.id
            WHERE b.verification_id = ?
        """, (verification_id.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None

# --- Anti-Cheat Integrity Logging ---

def log_integrity_event(student_id: int, attempt_id: int, event_type: str, details: str = ""):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO integrity_logs (student_id, attempt_id, event_type, details, timestamp)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (student_id, attempt_id, event_type, details))
        
        # Also update counts in test_attempts table
        if attempt_id:
            if event_type in ("tab_switch", "window_blur"):
                cursor.execute("UPDATE test_attempts SET tab_switches = tab_switches + 1 WHERE id = ?", (attempt_id,))
            elif event_type == "paste":
                cursor.execute("UPDATE test_attempts SET pastes = pastes + 1 WHERE id = ?", (attempt_id,))
        conn.commit()

# --- Instructor Analytics ---

def get_instructor_summary():
    with get_db() as conn:
        cursor = conn.cursor()
        # All students with progress summary
        cursor.execute("""
            SELECT 
                s.id,
                s.name,
                s.roll_or_email,
                s.xp,
                s.current_level,
                s.created_at,
                s.last_active,
                (SELECT COUNT(*) FROM badges b WHERE b.student_id = s.id) as badges_count,
                (SELECT COALESCE(SUM(t.tab_switches), 0) FROM test_attempts t WHERE t.student_id = s.id) as total_tab_switches,
                (SELECT COALESCE(SUM(t.pastes), 0) FROM test_attempts t WHERE t.student_id = s.id) as total_pastes,
                (SELECT MAX(t.score) FROM test_attempts t WHERE t.student_id = s.id AND t.type = 'final_exam') as final_exam_score
            FROM students s
            ORDER BY s.id DESC
        """)
        students = [dict(r) for r in cursor.fetchall()]

        # Per level pass rates
        cursor.execute("""
            SELECT 
                level_id,
                COUNT(*) as enrolled,
                SUM(CASE WHEN test_passed = 1 THEN 1 ELSE 0 END) as passed,
                AVG(highest_score) as avg_score
            FROM level_progress
            GROUP BY level_id
            ORDER BY level_id ASC
        """)
        pass_rates = [dict(r) for r in cursor.fetchall()]

        # Recent test attempts
        cursor.execute("""
            SELECT 
                t.id, t.student_id, s.name as student_name, s.roll_or_email,
                t.type, t.level_id, t.score, t.passed, t.duration_seconds,
                t.tab_switches, t.pastes, t.completed_at
            FROM test_attempts t
            JOIN students s ON t.student_id = s.id
            WHERE t.completed_at IS NOT NULL
            ORDER BY t.id DESC
            LIMIT 50
        """)
        recent_tests = [dict(r) for r in cursor.fetchall()]

        return {
            "students": students,
            "pass_rates": pass_rates,
            "recent_tests": recent_tests,
            "total_students": len(students)
        }

def get_exact_student_paper(attempt_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.*, s.name as student_name, s.roll_or_email
            FROM test_attempts t
            JOIN students s ON t.student_id = s.id
            WHERE t.id = ?
        """, (attempt_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
