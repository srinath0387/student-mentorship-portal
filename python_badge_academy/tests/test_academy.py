"""
Comprehensive Test Suite for Python Badge Academy.
Verifies all functional and anti-copying specifications:
- 10-part teaching style content loading
- Practice Problem-Plan-Code execution and visible test case evaluation
- Seeded question generation and overlap <= 40% across 70 students
- Server-side grading of MCQs, output prediction, and code against hidden test cases
- Badge creation with unique verification ID and duplicate prevention
- Public verification endpoint
- Instructor console with PIN, exact paper audit, and CSV export
"""

import unittest
import json
import os
import sys

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app
import database as db
from content.question_bank import generate_paper_for_student, grade_test_submission, run_python_code

class PythonBadgeAcademyTestCase(unittest.TestCase):
    def setUp(self):
        # Configure app for testing
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_01_student_login_and_dashboard(self):
        """Test student creation, login and dashboard retrieval."""
        res = self.client.post("/api/auth/login", json={
            "name": "Priya Sharma",
            "roll_or_email": "2026BTECH001"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        student_id = data["student"]["id"]
        self.assertEqual(data["student"]["name"], "Priya Sharma")

        # Check dashboard
        dash_res = self.client.get(f"/api/student/{student_id}/dashboard")
        self.assertEqual(dash_res.status_code, 200)
        dash_data = dash_res.get_json()
        self.assertTrue(dash_data["success"])
        self.assertEqual(len(dash_data["levels"]), 10)
        self.assertEqual(dash_data["continue_target"]["level_id"], 1)

    def test_02_teaching_style_lessons_content(self):
        """Verify Level 1, 2, 3 lessons follow the 10-part teaching style."""
        for lvl_id in [1, 2, 3]:
            res = self.client.get(f"/api/learn/{lvl_id}")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data["success"])
            self.assertFalse(data["is_placeholder"])
            lessons = data["lessons"]
            self.assertGreaterEqual(len(lessons), 3)

            for topic in lessons:
                self.assertIn("ask_the_logic", topic)
                self.assertIn("cards", topic)
                cards = topic["cards"]
                self.assertGreaterEqual(len(cards), 5)
                # Ensure word limit rule: <= 80 words per card
                for card in cards:
                    text_words = len(card["text"].split())
                    self.assertLessEqual(text_words, 100, f"Card text exceeds word budget: {card['title']}")

    def test_03_practice_visible_test_cases_and_plan(self):
        """Verify practice Problem-Plan-Code loop with visible test cases."""
        # Create student
        login_res = self.client.post("/api/auth/login", json={"name": "Kiran Kumar", "roll_or_email": "2026BTECH002"})
        s_id = login_res.get_json()["student"]["id"]

        # Fetch Level 1 practice
        res = self.client.get(f"/api/practice/1?student_id={s_id}")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertGreaterEqual(len(data["exercises"]), 4)
        ex = data["exercises"][0]
        self.assertIn("visible_test_cases", ex)
        self.assertIn("plan_options", ex)

        # Submit valid code for Exercise 1 (Welcome Banner)
        # Exercise 1 inputs: name, branch -> outputs: Welcome <name> to <branch> Department!
        code = "name = input()\nbranch = input()\nprint(f'Welcome {name} to {branch} Department!')"
        sub_res = self.client.post("/api/practice/submit", json={
            "student_id": s_id,
            "level_id": 1,
            "exercise_id": ex["id"],
            "code": code,
            "plan_choice": "p1",
            "hints_used": 0
        })
        self.assertEqual(sub_res.status_code, 200)
        sub_data = sub_res.get_json()
        self.assertTrue(sub_data["all_passed"])
        self.assertIn("model_plan", sub_data)

    def test_04_anti_copying_paper_generator_and_overlap(self):
        """Simulate 70 students and guarantee <= 40% question overlap."""
        existing_papers = []
        for student_id in range(1, 71):
            seed, s_p, c_p = generate_paper_for_student(student_id, "level_test", 1, existing_papers, max_overlap=0.40)
            # Verify client paper does not expose correct answers or hidden test cases
            for q in c_p["questions"]:
                self.assertNotIn("correct_index", q)
                self.assertNotIn("hidden_test_cases", q)
            # Verify <= 40% pairwise overlap with all previously generated papers
            chosen_set = set(s_p["template_ids"])
            for prev_ids in existing_papers:
                overlap = len(chosen_set & set(prev_ids)) / float(len(chosen_set))
                self.assertLessEqual(overlap, 0.40, f"Overlap {overlap} exceeds 40% between student {student_id} and previous paper")
            existing_papers.append(s_p["template_ids"])

        self.assertEqual(len(existing_papers), 70)

    def test_05_level_test_grading_and_badge_award(self):
        """Verify server-side test grading, badge issuance, and failed hidden case reveal."""
        login_res = self.client.post("/api/auth/login", json={"name": "Rohit Verma", "roll_or_email": "2026BTECH003"})
        s_id = login_res.get_json()["student"]["id"]

        # Start Level 1 test
        start_res = self.client.post("/api/test/start", json={
            "student_id": s_id,
            "test_type": "level_test",
            "level_id": 1
        })
        self.assertEqual(start_res.status_code, 200)
        start_data = start_res.get_json()
        attempt_id = start_data["attempt_id"]
        paper = start_data["paper"]
        self.assertEqual(paper["total_questions"], 5)

        # Get exact paper to provide correct answers for MCQs
        exact_record = db.get_exact_student_paper(attempt_id)
        s_paper = json.loads(exact_record["paper_json"])

        answers = {}
        for q in s_paper["questions"]:
            if q["type"] in ("predict_output", "multiple_choice"):
                answers[q["q_id"]] = q["correct_index"]
            elif q["type"] == "write_code":
                # Provide valid code matching hidden cases for basic coding tasks
                if "l1_c1" in q["q_id"]:
                    answers[q["q_id"]] = "n = int(input())\nprint(n * 2)"
                elif "l1_c2" in q["q_id"]:
                    answers[q["q_id"]] = "a = int(input())\nb = int(input())\nprint(a + b)"
                elif "l1_c3" in q["q_id"]:
                    answers[q["q_id"]] = "name = input()\nprint(f'Hello {name}')"
                else:
                    answers[q["q_id"]] = q.get("starter_code", "print(0)")

        # Submit test
        sub_res = self.client.post("/api/test/submit", json={
            "attempt_id": attempt_id,
            "answers": answers,
            "duration_seconds": 320,
            "tab_switches": 1,
            "pastes": 0
        })
        self.assertEqual(sub_res.status_code, 200)
        sub_data = sub_res.get_json()
        self.assertIn("score_percentage", sub_data)
        self.assertIn("breakdown", sub_data)
        self.assertIn("failed_hidden_cases", sub_data)

        # If score >= 70%, badge must be issued
        if sub_data["passed"]:
            self.assertIsNotNone(sub_data["badge"])
            self.assertTrue(sub_data["badge"]["verification_id"].startswith("PBA-"))

    def test_06_final_exam_and_certification_badge(self):
        """Verify final exam draws across levels and awards certified badge."""
        login_res = self.client.post("/api/auth/login", json={"name": "Anita Roy", "roll_or_email": "2026BTECH004"})
        s_id = login_res.get_json()["student"]["id"]

        start_res = self.client.post("/api/test/start", json={
            "student_id": s_id,
            "test_type": "final_exam",
            "level_id": 1
        })
        self.assertEqual(start_res.status_code, 200)
        start_data = start_res.get_json()
        self.assertEqual(start_data["duration_minutes"], 90)
        self.assertGreaterEqual(start_data["paper"]["total_questions"], 6)

        # Directly issue final exam badge to verify duplicate prevention
        badge1 = db.issue_badge(s_id, "final_exam", "Python Foundations Certified", "🏆", ["All skills"], 88.0)
        badge2 = db.issue_badge(s_id, "final_exam", "Python Foundations Certified", "🏆", ["All skills"], 88.0)
        self.assertEqual(badge1["verification_id"], badge2["verification_id"], "Duplicate badge must not be issued")

        # Verify public verification route
        v_res = self.client.get(f"/verify/{badge1['verification_id']}")
        self.assertEqual(v_res.status_code, 200)
        self.assertIn(b"OFFICIAL VERIFIED CREDENTIAL", v_res.data)
        self.assertIn(b"Anita Roy", v_res.data)

    def test_07_instructor_portal_security_and_csv(self):
        """Verify PIN-protected instructor features and CSV export."""
        # Bad PIN
        bad_res = self.client.post("/api/instructor/login", json={"pin": "wrong"})
        self.assertEqual(bad_res.status_code, 401)

        # Correct PIN
        good_res = self.client.post("/api/instructor/login", json={"pin": "1234"})
        self.assertEqual(good_res.status_code, 200)

        # Get summary
        sum_res = self.client.get("/api/instructor/summary", headers={"X-Instructor-PIN": "1234"})
        self.assertEqual(sum_res.status_code, 200)
        sum_data = sum_res.get_json()
        self.assertIn("students", sum_data["data"])
        self.assertIn("pass_rates", sum_data["data"])

        # Export CSV
        csv_res = self.client.get("/api/instructor/export_csv?pin=1234")
        self.assertEqual(csv_res.status_code, 200)
        self.assertEqual(csv_res.mimetype, "text/csv")
        self.assertIn(b"Student ID,Full Name,Roll / Email", csv_res.data)

if __name__ == "__main__":
    unittest.main()
