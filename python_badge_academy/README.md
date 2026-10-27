# Python Badge Academy

A web-based learning platform built specifically for B.Tech students who are beginners in Python.

Students master Python level-by-level through a strict 3-step loop:
1. **LEARN**: Logic-first lessons following the 10-part teaching style, with an interactive step-by-step visualizer, variable memory box panel, trace tables, flowcharts, and "Ask the Logic" panels.
2. **PRACTISE**: Hands-on exercises following the **Problem, Plan, Code** method. Students select or write their plain-English plan before coding. All test cases are visible with friendly line-number error messages. Plan hints are offered before code hints, and model plans are shown for comparison after submission.
3. **LEVEL TEST**: Timed, randomized tests with hidden test cases for coding problems, predict-the-output, and multiple-choice questions. Failed hidden test cases are revealed after submission to promote learning.

Passing a level test awards that level's badge and unlocks the next level. After all foundation levels are completed, students take a comprehensive 90-minute **Final Exam** to earn the **"Python Foundations Certified"** credential.

---

## Anti-Copying & Anti-Cheat System (For ~70 Students)

- **Large Parameterized Question Bank**: Over 30 question generators per level (more than 6x exam size).
- **Parameterized Questions**: Variables, numbers, and strings are dynamically generated (e.g., `score = 47; print(score % 6)` vs `tokens = 63; print(tokens % 4)`). Expected answers are computed dynamically by reference execution on the server.
- **Seeded Papers**: Seeded against student ID so refreshing never changes the paper, while retries after cooldown receive a fresh paper.
- **Pairwise Overlap Guarantee**: A redraw algorithm ensures **no two students get the same paper** and **no two papers share more than 40% of questions**.
- **Zero Client Leaks**: Correct answers, reference solutions, and hidden test cases are kept strictly on the server and never exposed to the client.
- **Anti-Cheat Event Logging**: Browser window blur, tab-switching, and paste events are logged silently and surfaced in the instructor console.

---

## Levels Overview

| Level | Badge Name | Icon | Core Skills | Status |
|---|---|---|---|---|
| **Level 1: Python Basics** | Python Foundations Novice | 🐍 | Variables, types, I/O, operators, casting | **Fully Complete** |
| **Level 2: Decision Maker** | Logic Pathfinder | ⚖️ | if / elif / else, boolean ops, truthy/falsy | **Fully Complete** |
| **Level 3: Loop Master** | Iteration Architect | 🔁 | while, for, range, break, continue | **Fully Complete** |
| **Level 4: Pattern Builder** | Pattern Craftsman | 💠 | Nested loops, star/number grids | Placeholder Ready |
| **Level 5: String Handler** | Text Maestro | 🔤 | Indexing, slicing, string methods | Placeholder Ready |
| **Level 6: List & Tuple Tamer** | Collection Wrangler | 📋 | List ops, tuples, mutability, copy vs ref | Placeholder Ready |
| **Level 7: Dict & Set Explorer** | Key-Value Cartographer | 🗂️ | Dict ops, set math, hash lookups | Placeholder Ready |
| **Level 8: Function Builder** | Modular Engineer | ⚙️ | def, params, return, scope, recursion | Placeholder Ready |
| **Level 9: Error Handler** | Resilient Coder | 🛡️ | try/except/finally, file I/O | Placeholder Ready |
| **Level 10: Object Builder** | Object Artisan | 🏗️ | Classes, \_\_init\_\_, methods, inheritance | Placeholder Ready |
| **Final Exam** | Python Foundations Certified | 🏆 | Comprehensive mastery across foundation levels | **Fully Complete** |

---

## 10-Part Teaching Style

Every topic in Levels 1 to 3 follows this exact sequence:
1. **The problem**: Real-life situation requiring the concept.
2. **The idea in one sentence**: Everyday analogy mapped to code.
3. **The rule**: Smallest labelled syntax with keyword, condition, colon, and body.
4. **Logic first, code second**: Plain-English plan beside the Python code.
5. **See it run**: Interactive visualizer with active line highlighting, live memory box panel, and trace table.
6. **A diagram**: Flowchart for decisions and loops; memory box diagram for variables.
7. **What if...?:** A small change students predict before testing.
8. **Common mistake**: Wrong code, logical explanation, and the fix.
9. **Check yourself**: Conceptual questions with explanatory feedback.
10. **Skill recap**: "You can now..." linked directly to the badge skill.

Beside each lesson is an **"Ask the logic"** panel with questions such as *"Why did the loop stop?"* that students answer before seeing the explanation.

---

## Starting the Platform

From the workspace root:

```bash
./venv_new/bin/python python_badge_academy/app.py
```

Open your browser to:
```
http://localhost:5050
```

### Instructor Access
- Click **"Instructor"** in the navigation header.
- Enter Faculty PIN: `1234` (configurable via `INSTRUCTOR_PIN` environment variable).
- View student rosters, real-time tab-switch counts, per-level pass rates, audit exact student papers, and export marks to CSV.

### Running Automated Tests
```bash
./venv_new/bin/python python_badge_academy/tests/test_academy.py
```
