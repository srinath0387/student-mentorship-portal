"""
Python Badge Academy - Core Application Server.
Provides RESTful APIs for:
- Student authentication and dashboard progress
- Topic lessons following 10-part teaching style
- In-browser and server Python execution
- Practice exercises with Problem-Plan-Code loop
- Anti-copying parameterized Level Tests and Final Exam
- Badge generation, verification, and PNG export
- Instructor dashboard with PIN, tab-switch logging, exact paper view, and CSV export
"""

import os
import json
import csv
import io
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory, Response

import database as db
from content.question_bank import generate_paper_for_student, grade_test_submission, run_python_code

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "python-badge-academy-secret-2026")

INSTRUCTOR_PIN = os.environ.get("INSTRUCTOR_PIN", "1234")

# Load static levels configuration
CONTENT_DIR = os.path.join(os.path.dirname(__file__), "content")

def load_json_file(filename):
    path = os.path.join(CONTENT_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

LEVELS_META = load_json_file("levels.json")
LESSONS_CACHE = {
    1: load_json_file("lessons_level1.json"),
    2: load_json_file("lessons_level2.json"),
    3: load_json_file("lessons_level3.json")
}
PRACTICE_CACHE = {
    1: load_json_file("practice_level1.json"),
    2: load_json_file("practice_level2.json"),
    3: load_json_file("practice_level3.json")
}

# Initialize database schema on startup
db.init_db()

# ============================================================================
# PAGE ROUTES
# ============================================================================

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify/<verification_id>")
def verify_page(verification_id):
    badge = db.get_badge_by_verification_id(verification_id)
    return render_template("verify.html", badge=badge, verification_id=verification_id)

# ============================================================================
# AUTH & STUDENT API
# ============================================================================

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    roll_or_email = data.get("roll_or_email", "").strip()

    if not name or not roll_or_email:
        return jsonify({"success": False, "error": "Full Name and Roll Number / Email are required."}), 400

    try:
        student = db.get_or_create_student(name, roll_or_email)
        progress = db.get_all_level_progress(student["id"])
        badges = db.get_badges_for_student(student["id"])

        return jsonify({
            "success": True,
            "student": student,
            "progress": progress,
            "badges": badges
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/student/<int:student_id>/dashboard", methods=["GET"])
def student_dashboard(student_id):
    student = db.get_student_by_id(student_id)
    if not student:
        return jsonify({"success": False, "error": "Student not found"}), 404

    progress = db.get_all_level_progress(student_id)
    badges = db.get_badges_for_student(student_id)

    # Determine "continue where you left off" state
    continue_target = {"level_id": 1, "step": "learn"}
    for p in progress:
        lvl = p["level_id"]
        if not p["learn_completed"]:
            continue_target = {"level_id": lvl, "step": "learn"}
            break
        elif not p["practice_completed"]:
            continue_target = {"level_id": lvl, "step": "practice"}
            break
        elif not p["test_passed"]:
            continue_target = {"level_id": lvl, "step": "test"}
            break
        else:
            continue_target = {"level_id": lvl + 1, "step": "learn"}

    return jsonify({
        "success": True,
        "student": student,
        "progress": progress,
        "badges": badges,
        "levels": LEVELS_META,
        "continue_target": continue_target
    })

# ============================================================================
# CONTENT APIS (LEVELS, LESSONS, PRACTICE)
# ============================================================================

@app.route("/api/levels", methods=["GET"])
def get_levels():
    return jsonify({"success": True, "levels": LEVELS_META})

@app.route("/api/learn/<int:level_id>", methods=["GET"])
def get_lessons(level_id):
    lessons = LESSONS_CACHE.get(level_id)
    if not lessons:
        # Return placeholder for levels 4 to 10
        level_info = next((l for l in LEVELS_META if l["id"] == level_id), None)
        title = level_info["title"] if level_info else f"Level {level_id}"
        return jsonify({
            "success": True,
            "level_id": level_id,
            "is_placeholder": True,
            "title": title,
            "message": f"{title} content is scheduled for upcoming release."
        })
    return jsonify({"success": True, "level_id": level_id, "is_placeholder": False, "lessons": lessons})

@app.route("/api/learn/complete", methods=["POST"])
def complete_learn():
    data = request.get_json() or {}
    student_id = data.get("student_id")
    level_id = data.get("level_id")

    if not student_id or not level_id:
        return jsonify({"success": False, "error": "Missing student_id or level_id"}), 400

    db.mark_learn_completed(student_id, level_id)
    student = db.get_student_by_id(student_id)
    return jsonify({"success": True, "student": student})

@app.route("/api/practice/<int:level_id>", methods=["GET"])
def get_practice(level_id):
    student_id = request.args.get("student_id", type=int)
    exercises = PRACTICE_CACHE.get(level_id)

    if not exercises:
        return jsonify({
            "success": True,
            "level_id": level_id,
            "is_placeholder": True,
            "message": "Practice exercises for this level will be unlocked soon."
        })

    # Annotate with student progress if student_id is provided
    student_exercises = {}
    if student_id:
        records = db.get_student_exercises(student_id, level_id)
        for r in records:
            student_exercises[r["exercise_id"]] = r

    annotated = []
    for ex in exercises:
        ex_copy = dict(ex)
        # Solution code is kept hidden from initial payload until solved
        prog = student_exercises.get(ex["id"])
        if prog and prog.get("passed"):
            ex_copy["passed"] = True
            ex_copy["saved_code"] = prog.get("submitted_code")
            ex_copy["plan_choice"] = prog.get("plan_choice")
        else:
            ex_copy["passed"] = False
            ex_copy["solution_code"] = None
            if prog:
                ex_copy["saved_code"] = prog.get("submitted_code")
                ex_copy["plan_choice"] = prog.get("plan_choice")
        annotated.append(ex_copy)

    return jsonify({"success": True, "level_id": level_id, "is_placeholder": False, "exercises": annotated})

@app.route("/api/practice/submit", methods=["POST"])
def submit_practice():
    data = request.get_json() or {}
    student_id = data.get("student_id")
    level_id = data.get("level_id")
    exercise_id = data.get("exercise_id")
    code = data.get("code", "")
    plan_choice = data.get("plan_choice", "")
    hints_used = data.get("hints_used", 0)

    if not student_id or not level_id or not exercise_id:
        return jsonify({"success": False, "error": "Missing required fields"}), 400

    exercises = PRACTICE_CACHE.get(level_id, [])
    target_ex = next((e for e in exercises if e["id"] == exercise_id), None)
    if not target_ex:
        return jsonify({"success": False, "error": "Exercise not found"}), 404

    # Run visible test cases
    results = []
    all_passed = True

    for idx, tc in enumerate(target_ex["visible_test_cases"]):
        inp = tc.get("input", "")
        exp = tc.get("expected", "").strip()
        run_res = run_python_code(code, input_str=inp, timeout_secs=2.0)
        actual = run_res.get("output", "").strip()
        passed = run_res.get("success") and (actual == exp)
        if not passed:
            all_passed = False

        results.append({
            "test_case": idx + 1,
            "input": inp,
            "expected": exp,
            "actual": actual if run_res.get("success") else f"Error: {run_res.get('error')}",
            "passed": passed
        })

    # Save progress
    db.save_exercise_submission(student_id, level_id, exercise_id, all_passed, hints_used, code, plan_choice)

    # Check if all exercises in this level are completed
    student_exs = db.get_student_exercises(student_id, level_id)
    passed_count = sum(1 for e in student_exs if e.get("passed"))
    if passed_count >= len(exercises):
        with db.get_db() as conn:
            conn.execute("""
                UPDATE level_progress 
                SET practice_completed = 1 
                WHERE student_id = ? AND level_id = ?
            """, (student_id, level_id))
            conn.commit()

    student = db.get_student_by_id(student_id)

    return jsonify({
        "success": True,
        "all_passed": all_passed,
        "test_results": results,
        "model_plan": target_ex.get("model_plan"),
        "solution_code": target_ex.get("solution_code") if all_passed else None,
        "student": student
    })

# ============================================================================
# PYTHON EXECUTION BACKEND (Pyodide Fallback / Runner)
# ============================================================================

@app.route("/api/run_python", methods=["POST"])
def api_run_python():
    data = request.get_json() or {}
    code = data.get("code", "")
    input_str = data.get("input", "")
    res = run_python_code(code, input_str=input_str, timeout_secs=2.5)
    return jsonify(res)

# ============================================================================
# TEST & EXAM ENGINE (ANTI-COPYING, TIMED, SEEDED)
# ============================================================================

@app.route("/api/test/start", methods=["POST"])
def start_test():
    data = request.get_json() or {}
    student_id = data.get("student_id")
    test_type = data.get("test_type", "level_test") # 'level_test' or 'final_exam'
    level_id = data.get("level_id", 1)

    if not student_id:
        return jsonify({"success": False, "error": "student_id is required"}), 400

    # Gentle retry - no frustrating cooldown for beginners
    with db.get_db() as conn:
        cursor = conn.cursor()

        # Fetch existing template question lists across all students to guarantee <= 40% overlap
        cursor.execute("SELECT paper_json FROM test_attempts WHERE type = ? AND level_id = ?", (test_type, level_id))
        existing_papers = []
        for row in cursor.fetchall():
            try:
                pj = json.loads(row["paper_json"])
                existing_papers.append(pj.get("template_ids", []))
            except Exception:
                pass

    # Generate student paper with overlap constraint & seeding
    seed, server_paper, client_paper = generate_paper_for_student(student_id, test_type, level_id, existing_papers)

    # Save to database
    attempt_id = db.record_test_start(student_id, test_type, level_id, seed, server_paper)

    return jsonify({
        "success": True,
        "attempt_id": attempt_id,
        "paper": client_paper,
        "duration_minutes": 90 if test_type == "final_exam" else 20
    })

@app.route("/api/test/submit", methods=["POST"])
def submit_test():
    data = request.get_json() or {}
    attempt_id = data.get("attempt_id")
    answers = data.get("answers", {})
    duration_seconds = data.get("duration_seconds", 0)
    tab_switches = data.get("tab_switches", 0)
    pastes = data.get("pastes", 0)

    if not attempt_id:
        return jsonify({"success": False, "error": "attempt_id is required"}), 400

    attempt = db.get_exact_student_paper(attempt_id)
    if not attempt:
        return jsonify({"success": False, "error": "Attempt record not found"}), 404

    server_paper = json.loads(attempt["paper_json"])
    student_id = attempt["student_id"]
    test_type = attempt["type"]
    level_id = attempt["level_id"]

    # Grade on server
    grading_result = grade_test_submission(server_paper, answers)
    score = grading_result["score_percentage"]
    passed = grading_result["passed"]

    # Record completion
    db.record_test_completion(
        attempt_id=attempt_id,
        answers_json=answers,
        score=score,
        passed=passed,
        breakdown_json=grading_result["breakdown"],
        failed_cases_json=grading_result["failed_hidden_cases"],
        duration_seconds=duration_seconds,
        tab_switches=tab_switches,
        pastes=pastes
    )

    badge = None
    if passed:
        level_info = next((l for l in LEVELS_META if l["id"] == level_id), None)
        if test_type == "level_test" and level_info:
            badge = db.issue_badge(
                student_id=student_id,
                badge_type=f"level_{level_id}",
                badge_title=level_info["badge_title"],
                badge_icon=level_info["badge_icon"],
                skills=level_info["skills"],
                score=score
            )
        elif test_type == "final_exam":
            # Collect all skills from Levels 1-3
            all_skills = []
            for lvl in LEVELS_META[:3]:
                all_skills.extend(lvl.get("skills", []))
            badge = db.issue_badge(
                student_id=student_id,
                badge_type="final_exam",
                badge_title="Python Foundations Certified",
                badge_icon="🏆",
                skills=all_skills,
                score=score
            )

    student = db.get_student_by_id(student_id)
    badges = db.get_badges_for_student(student_id)

    return jsonify({
        "success": True,
        "score_percentage": score,
        "passed": passed,
        "pass_mark": 70.0,
        "breakdown": grading_result["breakdown"],
        "failed_hidden_cases": grading_result["failed_hidden_cases"],
        "badge": badge,
        "student": student,
        "badges": badges
    })

# ============================================================================
# ANTI-CHEAT INTEGRITY LOGGING
# ============================================================================

@app.route("/api/integrity/log", methods=["POST"])
def integrity_log():
    data = request.get_json() or {}
    student_id = data.get("student_id")
    attempt_id = data.get("attempt_id")
    event_type = data.get("event_type", "tab_switch")
    details = data.get("details", "")

    if student_id:
        db.log_integrity_event(student_id, attempt_id, event_type, details)

    return jsonify({"success": True})

# ============================================================================
# BADGE & VERIFICATION APIS
# ============================================================================

@app.route("/api/badge/<verification_id>", methods=["GET"])
def get_badge(verification_id):
    badge = db.get_badge_by_verification_id(verification_id)
    if not badge:
        return jsonify({"success": False, "error": "Badge verification ID not found"}), 404
    badge["skills"] = json.loads(badge["skills_json"])
    return jsonify({"success": True, "badge": badge})

# ============================================================================
# INSTRUCTOR VIEW & ANALYTICS (PIN-PROTECTED)
# ============================================================================

@app.route("/api/instructor/login", methods=["POST"])
def instructor_login():
    data = request.get_json() or {}
    pin = str(data.get("pin", "")).strip()
    if pin == str(INSTRUCTOR_PIN):
        return jsonify({"success": True, "token": "instructor-session-token"})
    return jsonify({"success": False, "error": "Invalid instructor PIN."}), 401

@app.route("/api/instructor/summary", methods=["GET"])
def instructor_summary():
    # Require authorization header or pin
    auth_pin = request.headers.get("X-Instructor-PIN") or request.args.get("pin")
    if auth_pin != str(INSTRUCTOR_PIN):
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    summary = db.get_instructor_summary()
    return jsonify({"success": True, "data": summary})

@app.route("/api/instructor/paper/<int:attempt_id>", methods=["GET"])
def instructor_view_paper(attempt_id):
    auth_pin = request.headers.get("X-Instructor-PIN") or request.args.get("pin")
    if auth_pin != str(INSTRUCTOR_PIN):
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    paper_record = db.get_exact_student_paper(attempt_id)
    if not paper_record:
        return jsonify({"success": False, "error": "Attempt record not found"}), 404

    paper_record["paper"] = json.loads(paper_record["paper_json"])
    paper_record["answers"] = json.loads(paper_record["answers_json"]) if paper_record["answers_json"] else {}
    paper_record["breakdown"] = json.loads(paper_record["breakdown_json"]) if paper_record["breakdown_json"] else {}
    paper_record["failed_cases"] = json.loads(paper_record["failed_cases_json"]) if paper_record["failed_cases_json"] else {}

    return jsonify({"success": True, "record": paper_record})

@app.route("/api/instructor/export_csv", methods=["GET"])
def instructor_export_csv():
    auth_pin = request.headers.get("X-Instructor-PIN") or request.args.get("pin")
    if auth_pin != str(INSTRUCTOR_PIN):
        return "Unauthorized", 401

    summary = db.get_instructor_summary()
    students = summary["students"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Student ID", "Full Name", "Roll / Email", "XP", "Current Level",
        "Badges Earned", "Tab Switches", "Paste Events", "Final Exam Score", "Last Active"
    ])

    for s in students:
        writer.writerow([
            s["id"], s["name"], s["roll_or_email"], s["xp"], s["current_level"],
            s["badges_count"], s["total_tab_switches"], s["total_pastes"],
            s.get("final_exam_score") or "N/A", s["last_active"]
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=python_badge_academy_students.csv"}
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"🚀 Python Badge Academy starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
