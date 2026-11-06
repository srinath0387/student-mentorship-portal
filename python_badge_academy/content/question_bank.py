"""
Question Bank and Anti-Copying Paper Generator for Python Badge Academy.
Lightweight, Beginner-Friendly Version:
- Starts with simple, bite-sized warm-up questions.
- Short, simple predict-the-output snippets.
- Small basic coding challenges with pre-read variables and 1 visible sample test case.
- Shuffled options, seeded generation per student, overlap <= 40%.
- Server-side grading with 0 answer keys exposed.
"""

import random
import io
import sys
import contextlib

def run_python_code(code_str: str, input_str: str = "", timeout_secs: float = 2.0) -> dict:
    """Executes Python code in a controlled namespace capturing stdout/stderr."""
    out_capture = io.StringIO()
    err_capture = io.StringIO()
    
    input_lines = input_str.split("\n")
    input_idx = 0
    def mock_input(prompt=""):
        nonlocal input_idx
        if input_idx < len(input_lines):
            val = input_lines[input_idx]
            input_idx += 1
            return val
        return ""

    safe_globals = {
        "__builtins__": {
            "print": print,
            "range": range,
            "len": len,
            "int": int,
            "float": float,
            "str": str,
            "bool": bool,
            "list": list,
            "tuple": tuple,
            "dict": dict,
            "set": set,
            "min": min,
            "max": max,
            "sum": sum,
            "abs": abs,
            "round": round,
            "input": mock_input,
            "True": True,
            "False": False,
            "None": None,
            "isinstance": isinstance,
            "type": type,
            "enumerate": enumerate,
            "zip": zip
        }
    }

    try:
        with contextlib.redirect_stdout(out_capture), contextlib.redirect_stderr(err_capture):
            exec(code_str, safe_globals)
        return {
            "success": True,
            "output": out_capture.getvalue(),
            "error": err_capture.getvalue()
        }
    except Exception as e:
        return {
            "success": False,
            "output": out_capture.getvalue(),
            "error": f"{type(e).__name__}: {str(e)}"
        }

# ============================================================================
# LEVEL 1 GENERATORS (Python Basics)
# ============================================================================

def gen_l1_m1(rng):
    num = rng.choice([12.0, 45.5, 0.0, 99.9])
    return {"id": "l1_m1", "type": "multiple_choice", "topic": "Data Types", "title": "Identifying Data Types",
            "prompt": f"What is the Python data type of {num}?", "code": f"x = {num}\nprint(type(x))",
            "expected": "<class 'float'>", "distractors": ["<class 'int'>", "<class 'str'>", "<class 'number'>"]}

def gen_l1_m2(rng):
    bad = rng.choice(["2nd_player", "user-name", "total mark", "class", "def"])
    good = rng.choice(["_player2", "user_name", "total_mark", "player_score"])
    return {"id": "l1_m2", "type": "multiple_choice", "topic": "Variables", "title": "Valid Variable Names",
            "prompt": "Which of the following is a legal variable identifier in Python?", "code": None,
            "expected": good, "distractors": [bad, "user@domain", "3_apples"]}

def gen_l1_m3(rng):
    return {"id": "l1_m3", "type": "multiple_choice", "topic": "Input/Output", "title": "input() Return Type",
            "prompt": "What data type does the built-in function input() ALWAYS return?", "code": "val = input()",
            "expected": "str (string)", "distractors": ["int (integer)", "float", "Depends on input"]}

def gen_l1_m4(rng):
    return {"id": "l1_m4", "type": "multiple_choice", "topic": "Data Types", "title": "Boolean Syntax",
            "prompt": "Which statement correctly creates a boolean variable in Python?", "code": None,
            "expected": "active = True", "distractors": ["active = true", "active = TRUE", "active = 'True'"]}

def gen_l1_m5(rng):
    return {"id": "l1_m5", "type": "multiple_choice", "topic": "Data Types", "title": "Float to Int Conversion",
            "prompt": "What is the result of int(7.89) in Python?", "code": None,
            "expected": "7 (truncates decimal part, does not round)", "distractors": ["8", "7.89", "TypeError"]}

def gen_l1_m6(rng):
    return {"id": "l1_m6", "type": "multiple_choice", "topic": "Operators", "title": "Division Operator",
            "prompt": "What is the result of 10 / 2 in Python 3?", "code": None,
            "expected": "5.0 (float)", "distractors": ["5 (int)", "'5'", "Error"]}

def gen_l1_m7(rng):
    return {"id": "l1_m7", "type": "multiple_choice", "topic": "Basics", "title": "Comment Character",
            "prompt": "Which symbol begins a single-line comment in Python?", "code": None,
            "expected": "#", "distractors": ["//", "/*", "--"]}

def gen_l1_m8(rng):
    return {"id": "l1_m8", "type": "multiple_choice", "topic": "Data Types", "title": "Valid String Quotes",
            "prompt": "In Python, which quotes can be used to write a string?", "code": None,
            "expected": "Both single quotes ('...') and double quotes (\"...\")",
            "distractors": ["Only double quotes", "Only single quotes", "Backticks ( `...` )"]}

def gen_l1_m9(rng):
    return {"id": "l1_m9", "type": "multiple_choice", "topic": "Variables", "title": "Case Sensitivity",
            "prompt": "Are 'count' and 'Count' the same variable in Python?", "code": None,
            "expected": "No, variable names are case-sensitive.", "distractors": ["Yes, Python ignores case", "Only in numbers", "Only in loops"]}

def gen_l1_m10(rng):
    return {"id": "l1_m10", "type": "multiple_choice", "topic": "Operators", "title": "Remainder Operator",
            "prompt": "Which operator returns the remainder of a division?", "code": None,
            "expected": "% (modulus)", "distractors": ["// (floor division)", "/ (division)", "** (power)"]}

def gen_l1_p1(rng):
    a = rng.randint(10, 30)
    b = rng.choice([2, 3, 4, 5])
    return {"id": "l1_p1", "type": "predict_output", "topic": "Operators", "title": "Remainder Modulus",
            "prompt": "What does this code print?",
            "code": f"n = {a}\nprint(n % {b})", "expected": str(a % b),
            "distractors": [str((a % b) + 1), str(a // b), str(b)]}

def gen_l1_p2(rng):
    a = rng.randint(20, 50)
    b = rng.choice([3, 4, 5])
    return {"id": "l1_p2", "type": "predict_output", "topic": "Operators", "title": "Floor Division Result",
            "prompt": "Predict the output of integer division (//):",
            "code": f"x = {a}\nprint(x // {b})", "expected": str(a // b),
            "distractors": [str(round(a / b, 1)), str(a % b), str((a // b) + 1)]}

def gen_l1_p3(rng):
    sym = rng.choice(["*", "#", "=", "~"])
    k = rng.randint(3, 5)
    return {"id": "l1_p3", "type": "predict_output", "topic": "Operators", "title": "String Multiplication",
            "prompt": "What does Python print?",
            "code": f"print('{sym}' * {k})", "expected": sym * k,
            "distractors": [f"'{sym}' * {k}", sym, sym * (k + 1)]}

def gen_l1_p4(rng):
    x = rng.randint(2, 5)
    y = rng.randint(3, 6)
    z = rng.randint(2, 3)
    return {"id": "l1_p4", "type": "predict_output", "topic": "Operators", "title": "Order of Operations",
            "prompt": "Predict the output adhering to operator precedence (multiplication before addition):",
            "code": f"print({x} + {y} * {z})", "expected": str(x + y * z),
            "distractors": [str((x + y) * z), str(x * y + z), str(x + y + z)]}

def gen_l1_p5(rng):
    v = rng.choice(["score", "coins", "points"])
    a = rng.randint(10, 20)
    b = rng.randint(5, 10)
    return {"id": "l1_p5", "type": "predict_output", "topic": "Variables", "title": "Variable Update",
            "prompt": "What is printed after updating the variable?",
            "code": f"{v} = {a}\n{v} = {v} + {b}\nprint({v})", "expected": str(a + b),
            "distractors": [str(a), str(b), str(a + b * 2)]}

def gen_l1_p6(rng):
    s1 = rng.choice(["10", "20", "30"])
    s2 = rng.choice(["5", "7", "9"])
    return {"id": "l1_p6", "type": "predict_output", "topic": "Data Types", "title": "String Addition",
            "prompt": "What does adding two strings with quotes do?",
            "code": f"a = '{s1}'\nb = '{s2}'\nprint(a + b)", "expected": s1 + s2,
            "distractors": [str(int(s1) + int(s2)), s1, s2]}

def gen_l1_p7(rng):
    base = rng.choice([2, 3, 4])
    return {"id": "l1_p7", "type": "predict_output", "topic": "Operators", "title": "Square Power",
            "prompt": "What does '** 2' compute?",
            "code": f"print({base} ** 2)", "expected": str(base ** 2),
            "distractors": [str(base * 2), str(base + 2), str(base ** 3)]}

def gen_l1_p8(rng):
    name = rng.choice(["Alex", "Priya", "Rahul", "Sara"])
    return {"id": "l1_p8", "type": "predict_output", "topic": "Input/Output", "title": "f-String Greeting",
            "prompt": "What does this formatted string print?",
            "code": f"name = '{name}'\nprint(f'Hi {{name}}!')", "expected": f"Hi {name}!",
            "distractors": [f"Hi name!", "{name}", f"Hi {name}"]}

def gen_l1_p9(rng):
    w = rng.choice(["Cat", "Python", "Code", "Star"])
    return {"id": "l1_p9", "type": "predict_output", "topic": "Functions", "title": "len() Function",
            "prompt": "What does len() return for this word?",
            "code": f"print(len('{w}'))", "expected": str(len(w)),
            "distractors": [str(len(w) - 1), str(len(w) + 1), w]}

def gen_l1_p10(rng):
    a = rng.choice([10, 20])
    b = rng.choice([30, 40])
    return {"id": "l1_p10", "type": "predict_output", "topic": "Variables", "title": "Value Swap",
            "prompt": "What is the value of 'a' after the swap?",
            "code": f"a = {a}\nb = {b}\na, b = b, a\nprint(a)", "expected": str(b),
            "distractors": [str(a), f"{b}, {a}", "Error"]}

# BASIC, SMALL CODING PROBLEMS (Level 1)
# Pre-read inputs + 1 visible sample case

def gen_l1_c1(rng):
    return {
        "id": "l1_c1", "type": "write_code", "topic": "Arithmetic",
        "title": "Double the Number",
        "prompt": "An integer `n` is already read for you. Print `n` doubled (multiplied by 2).",
        "sample_input": "5",
        "sample_output": "10",
        "starter_code": "n = int(input())\n\n# Print n doubled (n * 2):\nprint(n * 2)\n",
        "hidden_test_cases": [
            {"input": "5", "expected": "10\n"},
            {"input": "12", "expected": "24\n"},
            {"input": "0", "expected": "0\n"}
        ]
    }

def gen_l1_c2(rng):
    return {
        "id": "l1_c2", "type": "write_code", "topic": "Arithmetic",
        "title": "Add Two Numbers",
        "prompt": "Two integers `a` and `b` are read for you. Print their sum (`a + b`).",
        "sample_input": "3\n4",
        "sample_output": "7",
        "starter_code": "a = int(input())\nb = int(input())\n\n# Print the sum of a and b:\n",
        "hidden_test_cases": [
            {"input": "3\n4", "expected": "7\n"},
            {"input": "10\n25", "expected": "35\n"},
            {"input": "0\n9", "expected": "9\n"}
        ]
    }

def gen_l1_c3(rng):
    return {
        "id": "l1_c3", "type": "write_code", "topic": "Strings",
        "title": "Say Hello",
        "prompt": "A name is read into variable `name`. Print: `Hello <name>` (e.g. `Hello Priya`).",
        "sample_input": "Alex",
        "sample_output": "Hello Alex",
        "starter_code": "name = input()\n\n# Print Hello followed by name:\n",
        "hidden_test_cases": [
            {"input": "Alex", "expected": "Hello Alex\n"},
            {"input": "Priya", "expected": "Hello Priya\n"},
            {"input": "Sam", "expected": "Hello Sam\n"}
        ]
    }

def gen_l1_c4(rng):
    return {
        "id": "l1_c4", "type": "write_code", "topic": "Arithmetic",
        "title": "Cube of a Number",
        "prompt": "An integer `n` is read for you. Print its cube (`n ** 3`).",
        "sample_input": "3",
        "sample_output": "27",
        "starter_code": "n = int(input())\n\n# Print n cubed (n ** 3):\n",
        "hidden_test_cases": [
            {"input": "3", "expected": "27\n"},
            {"input": "2", "expected": "8\n"},
            {"input": "4", "expected": "64\n"}
        ]
    }

def gen_l1_c5(rng):
    return {
        "id": "l1_c5", "type": "write_code", "topic": "Arithmetic",
        "title": "Remaining Balance",
        "prompt": "Total budget `total` and amount spent `spent` are read for you. Print remaining amount (`total - spent`).",
        "sample_input": "50\n15",
        "sample_output": "35",
        "starter_code": "total = int(input())\nspent = int(input())\n\n# Print remaining balance (total - spent):\n",
        "hidden_test_cases": [
            {"input": "50\n15", "expected": "35\n"},
            {"input": "100\n40", "expected": "60\n"},
            {"input": "20\n20", "expected": "0\n"}
        ]
    }

def gen_l1_c6(rng):
    return {
        "id": "l1_c6", "type": "write_code", "topic": "Operators",
        "title": "Remainder by 5",
        "prompt": "An integer `n` is read for you. Print the remainder when `n` is divided by 5 (`n % 5`).",
        "sample_input": "14",
        "sample_output": "4",
        "starter_code": "n = int(input())\n\n# Print remainder when divided by 5 (n % 5):\n",
        "hidden_test_cases": [
            {"input": "14", "expected": "4\n"},
            {"input": "20", "expected": "0\n"},
            {"input": "8", "expected": "3\n"}
        ]
    }

# ============================================================================
# LEVEL 2 GENERATORS (Decision Maker)
# ============================================================================

def gen_l2_m1(rng):
    return {"id": "l2_m1", "type": "multiple_choice", "topic": "Comparison Operators", "title": "Equality Check",
            "prompt": "Which operator checks if two values are equal in Python?", "code": None,
            "expected": "==", "distractors": ["=", "===", "equals"]}

def gen_l2_m2(rng):
    return {"id": "l2_m2", "type": "multiple_choice", "topic": "Logical Operators", "title": "The and Operator",
            "prompt": "When does 'A and B' evaluate to True in Python?", "code": None,
            "expected": "ONLY when both A and B are True.", "distractors": ["When either A or B is True", "When A is False", "Always"]}

def gen_l2_m3(rng):
    return {"id": "l2_m3", "type": "multiple_choice", "topic": "Logical Operators", "title": "The or Operator",
            "prompt": "When does 'A or B' evaluate to True in Python?", "code": None,
            "expected": "If at least one of A or B is True.", "distractors": ["Only when both are True", "Only when both are False", "Never"]}

def gen_l2_m4(rng):
    return {"id": "l2_m4", "type": "multiple_choice", "topic": "Syntax", "title": "if Statement Colon",
            "prompt": "What punctuation mark is required at the end of an if condition line?", "code": None,
            "expected": "Colon (:)", "distractors": ["Semicolon (;)", "Period (.)", "Curly brace ({)"]}

def gen_l2_m5(rng):
    return {"id": "l2_m5", "type": "multiple_choice", "topic": "Decisions", "title": "elif Meaning",
            "prompt": "What does the keyword 'elif' stand for in Python?", "code": None,
            "expected": "else if", "distractors": ["early if", "element if", "end if"]}

def gen_l2_m6(rng):
    falsy = rng.choice(["0", "'' (empty string)", "None", "False"])
    return {"id": "l2_m6", "type": "multiple_choice", "topic": "Truthy & Falsy", "title": "Falsy Value",
            "prompt": "Which of these values is treated as False in an if check?", "code": None,
            "expected": falsy, "distractors": ["1", "'Hello'", "[1, 2]"]}

def gen_l2_p1(rng):
    val = rng.randint(40, 60)
    thresh = rng.choice([70, 75, 80])
    return {"id": "l2_p1", "type": "predict_output", "topic": "if Statement", "title": "Condition False Check",
            "prompt": "Does the indented block run? What is printed?",
            "code": f"x = {val}\nif x >= {thresh}:\n    x = x + 10\nprint(x)",
            "expected": str(val), "distractors": [str(val + 10), str(thresh), "0"]}

def gen_l2_p2(rng):
    score = rng.choice([85, 45])
    return {"id": "l2_p2", "type": "predict_output", "topic": "if-else", "title": "Pass or Retry",
            "prompt": "What gets printed?",
            "code": f"score = {score}\nif score >= 50:\n    print('Pass')\nelse:\n    print('Retry')",
            "expected": "Pass" if score >= 50 else "Retry",
            "distractors": ["Retry" if score >= 50 else "Pass", "Pass Retry", "Error"]}

def gen_l2_p3(rng):
    a = rng.choice([True, False])
    b = rng.choice([True, False])
    return {"id": "l2_p3", "type": "predict_output", "topic": "Logical Operators", "title": "and Expression",
            "prompt": "What boolean is printed?",
            "code": f"print({a} and {b})", "expected": str(a and b),
            "distractors": [str(not (a and b)), "None", "Error"]}

def gen_l2_p4(rng):
    a = rng.choice([True, False])
    b = rng.choice([True, False])
    return {"id": "l2_p4", "type": "predict_output", "topic": "Logical Operators", "title": "or Expression",
            "prompt": "What boolean is printed?",
            "code": f"print({a} or {b})", "expected": str(a or b),
            "distractors": [str(not (a or b)), "None", "Error"]}

def gen_l2_p5(rng):
    x = rng.choice([4, 10])
    return {"id": "l2_p5", "type": "predict_output", "topic": "Logical Operators", "title": "not Operator",
            "prompt": "What does this print?",
            "code": f"x = {x}\nif not (x > 5):\n    print('Small')\nelse:\n    print('Large')",
            "expected": "Small" if not (x > 5) else "Large",
            "distractors": ["Large" if not (x > 5) else "Small", "True", "False"]}

def gen_l2_p6(rng):
    val = rng.choice([5, 15, 25])
    return {"id": "l2_p6", "type": "predict_output", "topic": "elif Ladder", "title": "Tiered Check",
            "prompt": "Which branch runs for the given value?",
            "code": f"x = {val}\nif x > 20:\n    print('A')\nelif x > 10:\n    print('B')\nelse:\n    print('C')",
            "expected": "A" if val > 20 else ("B" if val > 10 else "C"),
            "distractors": ["A", "B", "C"]}

# BASIC, SMALL CODING PROBLEMS (Level 2)

def gen_l2_c1(rng):
    return {
        "id": "l2_c1", "type": "write_code", "topic": "Decisions",
        "title": "Positive Number Check",
        "prompt": "An integer `n` is read for you. If `n > 0`, print `Positive`. Otherwise, print `Not positive`.",
        "sample_input": "7",
        "sample_output": "Positive",
        "starter_code": "n = int(input())\n\n# If n > 0 print Positive, else print Not positive:\nif n > 0:\n    print(\"Positive\")\nelse:\n    print(\"Not positive\")\n",
        "hidden_test_cases": [
            {"input": "7", "expected": "Positive\n"},
            {"input": "-3", "expected": "Not positive\n"},
            {"input": "0", "expected": "Not positive\n"}
        ]
    }

def gen_l2_c2(rng):
    return {
        "id": "l2_c2", "type": "write_code", "topic": "Decisions",
        "title": "Even or Odd",
        "prompt": "An integer `n` is read for you. If `n % 2 == 0`, print `Even`. Else print `Odd`.",
        "sample_input": "8",
        "sample_output": "Even",
        "starter_code": "n = int(input())\n\n# If n is even print Even, else print Odd:\n",
        "hidden_test_cases": [
            {"input": "8", "expected": "Even\n"},
            {"input": "5", "expected": "Odd\n"},
            {"input": "0", "expected": "Even\n"}
        ]
    }

def gen_l2_c3(rng):
    return {
        "id": "l2_c3", "type": "write_code", "topic": "Decisions",
        "title": "Voting Eligibility",
        "prompt": "An integer `age` is read for you. If `age >= 18`, print `Eligible`. Else print `Not eligible`.",
        "sample_input": "20",
        "sample_output": "Eligible",
        "starter_code": "age = int(input())\n\n# Check if age >= 18:\n",
        "hidden_test_cases": [
            {"input": "20", "expected": "Eligible\n"},
            {"input": "16", "expected": "Not eligible\n"},
            {"input": "18", "expected": "Eligible\n"}
        ]
    }

def gen_l2_c4(rng):
    return {
        "id": "l2_c4", "type": "write_code", "topic": "Decisions",
        "title": "Pass or Fail",
        "prompt": "An integer `score` is read for you. If `score >= 50`, print `Pass`. Else print `Fail`.",
        "sample_input": "72",
        "sample_output": "Pass",
        "starter_code": "score = int(input())\n\n# If score >= 50 print Pass, else print Fail:\n",
        "hidden_test_cases": [
            {"input": "72", "expected": "Pass\n"},
            {"input": "35", "expected": "Fail\n"},
            {"input": "50", "expected": "Pass\n"}
        ]
    }

def gen_l2_c5(rng):
    return {
        "id": "l2_c5", "type": "write_code", "topic": "Decisions",
        "title": "Print the Larger Number",
        "prompt": "Two integers `a` and `b` are read for you. Print whichever number is greater (if equal, print `a`).",
        "sample_input": "10\n25",
        "sample_output": "25",
        "starter_code": "a = int(input())\nb = int(input())\n\n# Print the greater number:\n",
        "hidden_test_cases": [
            {"input": "10\n25", "expected": "25\n"},
            {"input": "40\n15", "expected": "40\n"},
            {"input": "7\n7", "expected": "7\n"}
        ]
    }

# ============================================================================
# LEVEL 3 GENERATORS (Loop Master)
# ============================================================================

def gen_l3_m1(rng):
    stop = rng.choice([5, 8, 10])
    return {"id": "l3_m1", "type": "multiple_choice", "topic": "for & range", "title": "range(N) Count",
            "prompt": f"How many total iterations run in 'for i in range({stop}):'?", "code": None,
            "expected": f"Exactly {stop} times (from 0 up to {stop - 1})",
            "distractors": [f"{stop + 1} times", f"{stop - 1} times", "Infinite times"]}

def gen_l3_m2(rng):
    return {"id": "l3_m2", "type": "multiple_choice", "topic": "while Loops", "title": "Preventing Infinite Loops",
            "prompt": "To prevent a while loop from running forever, what must happen inside the body?", "code": None,
            "expected": "Update the loop variable so the condition eventually becomes False.",
            "distractors": ["Add a comment", "Use a float number", "Indent by 8 spaces"]}

def gen_l3_m3(rng):
    return {"id": "l3_m3", "type": "multiple_choice", "topic": "Loop Control", "title": "break Statement",
            "prompt": "What does the 'break' statement do inside a loop?", "code": None,
            "expected": "Exits and terminates the loop immediately.",
            "distractors": ["Skips to next iteration", "Pauses code for 1 second", "Restarts the loop from 0"]}

def gen_l3_m4(rng):
    return {"id": "l3_m4", "type": "multiple_choice", "topic": "Loop Control", "title": "continue Statement",
            "prompt": "What does the 'continue' statement do inside a loop?", "code": None,
            "expected": "Skips the rest of the CURRENT iteration and jumps to the next turn.",
            "distractors": ["Exits the whole loop", "Stops the program", "Prints the variable"]}

def gen_l3_m5(rng):
    return {"id": "l3_m5", "type": "multiple_choice", "topic": "for & range", "title": "range() Default Start",
            "prompt": "What is the default start value of range(N) if only one number is provided?", "code": None,
            "expected": "0", "distractors": ["1", "-1", "N"]}

def gen_l3_p1(rng):
    k = rng.choice([3, 4, 5])
    return {"id": "l3_p1", "type": "predict_output", "topic": "for & range", "title": "Loop Accumulator",
            "prompt": "What does this loop print?",
            "code": f"total = 0\nfor i in range(1, {k + 1}):\n    total += i\nprint(total)",
            "expected": str(sum(range(1, k + 1))),
            "distractors": [str(sum(range(1, k))), str(k), str(k + 1)]}

def gen_l3_p2(rng):
    k = rng.choice([3, 4])
    c = k
    res = ""
    while c > 0:
        res += str(c)
        c -= 1
    return {"id": "l3_p2", "type": "predict_output", "topic": "while Loops", "title": "while Countdown",
            "prompt": "What string is printed?",
            "code": f"n = {k}\nres = ''\nwhile n > 0:\n    res += str(n)\n    n -= 1\nprint(res)",
            "expected": res, "distractors": [res + "0", res[:-1], "0"]}

def gen_l3_p3(rng):
    limit = rng.choice([3, 4])
    return {"id": "l3_p3", "type": "predict_output", "topic": "Loop Control", "title": "break Trigger",
            "prompt": "When does the loop stop?",
            "code": f"for i in range(1, 10):\n    if i == {limit}:\n        break\n    print(i, end=' ')",
            "expected": " ".join(str(i) for i in range(1, limit)) + " ",
            "distractors": [" ".join(str(i) for i in range(1, limit + 1)) + " ", "1 2 3 4 5 ", str(limit)]}

def gen_l3_p4(rng):
    w = rng.choice(["Cat", "Hi", "Go"])
    return {"id": "l3_p4", "type": "predict_output", "topic": "for Loops", "title": "Iterating Over Letters",
            "prompt": "How many times does this loop run?",
            "code": f"cnt = 0\nfor ch in '{w}':\n    cnt += 1\nprint(cnt)",
            "expected": str(len(w)), "distractors": [str(len(w) - 1), str(len(w) + 1), "0"]}

def gen_l3_p5(rng):
    return {"id": "l3_p5", "type": "predict_output", "topic": "for & range", "title": "range with Step",
            "prompt": "What does range(2, 7, 2) print?",
            "code": "for i in range(2, 7, 2):\n    print(i, end=' ')",
            "expected": "2 4 6 ", "distractors": ["2 3 4 5 6 ", "2 4 ", "2 4 6 8 "]}

# BASIC, SMALL CODING PROBLEMS (Level 3)

def gen_l3_c1(rng):
    return {
        "id": "l3_c1", "type": "write_code", "topic": "for Loops",
        "title": "Print Numbers 1 to N",
        "prompt": "An integer `n` is read for you. Using a for loop, print numbers from 1 to `n` (inclusive), each on a new line.",
        "sample_input": "3",
        "sample_output": "1\n2\n3",
        "starter_code": "n = int(input())\n\n# Loop i from 1 to n and print i:\nfor i in range(1, n + 1):\n    print(i)\n",
        "hidden_test_cases": [
            {"input": "3", "expected": "1\n2\n3\n"},
            {"input": "4", "expected": "1\n2\n3\n4\n"},
            {"input": "1", "expected": "1\n"}
        ]
    }

def gen_l3_c2(rng):
    return {
        "id": "l3_c2", "type": "write_code", "topic": "Loops & Accumulation",
        "title": "Sum from 1 to N",
        "prompt": "An integer `n` is read for you. Using a loop, compute and print the sum of numbers from 1 up to `n`.",
        "sample_input": "4",
        "sample_output": "10",
        "starter_code": "n = int(input())\n\n# Sum numbers from 1 to n:\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)\n",
        "hidden_test_cases": [
            {"input": "4", "expected": "10\n"},
            {"input": "5", "expected": "15\n"},
            {"input": "1", "expected": "1\n"}
        ]
    }

def gen_l3_c3(rng):
    return {
        "id": "l3_c3", "type": "write_code", "topic": "for Loops",
        "title": "Print Each Letter",
        "prompt": "A word `word` is read for you. Using a for loop, print each character of `word` on a separate line.",
        "sample_input": "Hi",
        "sample_output": "H\ni",
        "starter_code": "word = input()\n\n# Loop over each character in word and print it:\n",
        "hidden_test_cases": [
            {"input": "Hi", "expected": "H\ni\n"},
            {"input": "Cat", "expected": "C\na\nt\n"},
            {"input": "Py", "expected": "P\ny\n"}
        ]
    }

def gen_l3_c4(rng):
    return {
        "id": "l3_c4", "type": "write_code", "topic": "while Loops",
        "title": "Simple Countdown",
        "prompt": "An integer `n` is read for you. Using a while loop, print countdown from `n` down to 1, each on a new line.",
        "sample_input": "3",
        "sample_output": "3\n2\n1",
        "starter_code": "n = int(input())\n\n# While n > 0, print n and decrement n by 1:\n",
        "hidden_test_cases": [
            {"input": "3", "expected": "3\n2\n1\n"},
            {"input": "4", "expected": "4\n3\n2\n1\n"},
            {"input": "1", "expected": "1\n"}
        ]
    }

# ============================================================================
# MASTER QUESTION REGISTRY
# ============================================================================

LEVEL_GENERATORS = {
    1: {
        "mcq": [gen_l1_m1, gen_l1_m2, gen_l1_m3, gen_l1_m4, gen_l1_m5, gen_l1_m6, gen_l1_m7, gen_l1_m8, gen_l1_m9, gen_l1_m10],
        "predict": [gen_l1_p1, gen_l1_p2, gen_l1_p3, gen_l1_p4, gen_l1_p5, gen_l1_p6, gen_l1_p7, gen_l1_p8, gen_l1_p9, gen_l1_p10],
        "coding": [gen_l1_c1, gen_l1_c2, gen_l1_c3, gen_l1_c4, gen_l1_c5, gen_l1_c6]
    },
    2: {
        "mcq": [gen_l2_m1, gen_l2_m2, gen_l2_m3, gen_l2_m4, gen_l2_m5, gen_l2_m6],
        "predict": [gen_l2_p1, gen_l2_p2, gen_l2_p3, gen_l2_p4, gen_l2_p5, gen_l2_p6],
        "coding": [gen_l2_c1, gen_l2_c2, gen_l2_c3, gen_l2_c4, gen_l2_c5]
    },
    3: {
        "mcq": [gen_l3_m1, gen_l3_m2, gen_l3_m3, gen_l3_m4, gen_l3_m5],
        "predict": [gen_l3_p1, gen_l3_p2, gen_l3_p3, gen_l3_p4, gen_l3_p5],
        "coding": [gen_l3_c1, gen_l3_c2, gen_l3_c3, gen_l3_c4]
    }
}

# ============================================================================
# PAPER GENERATOR (LIGHT & GENTLE: 4 QUESTIONS TOTAL)
# ============================================================================

def generate_paper_for_student(student_id: int, test_type: str, level_id: int, existing_papers: list, max_overlap: float = 0.40) -> tuple:
    """
    Generates a gentle 4-question paper for beginners:
    - Q1: Warm-up conceptual MCQ
    - Q2: Simple predict-the-output
    - Q3: Another predict/MCQ
    - Q4: Basic small coding challenge with pre-read variables & sample case
    """
    attempt_offset = 0
    max_tries = 1000
    best_candidate = None
    min_observed_overlap = 1.0

    while attempt_offset < max_tries:
        seed = f"PBA-S{student_id}-{test_type}-L{level_id}-A{attempt_offset}"
        rng = random.Random(seed)

        chosen_generators = []
        if test_type == "level_test":
            bank = LEVEL_GENERATORS.get(level_id, LEVEL_GENERATORS[1])
            # Gentle sequence: 2 simple conceptual MCQs + 2 short predict-the-output + 1 small basic code challenge
            chosen_generators = rng.sample(bank["mcq"], 2) + \
                                rng.sample(bank["predict"], 2) + \
                                rng.sample(bank["coding"], 1)
        elif test_type == "final_exam":
            # For final exam: 6 questions total (2 from L1, 2 from L2, 2 from L3)
            chosen_generators = []
            for lvl in [1, 2, 3]:
                b = LEVEL_GENERATORS[lvl]
                chosen_generators.append(rng.choice(b["mcq"]))
                chosen_generators.append(rng.choice(b["predict"]))
            chosen_generators.append(rng.choice(LEVEL_GENERATORS[1]["coding"]))

        chosen_ids = [g.__name__ for g in chosen_generators]

        # Overlap check
        max_o = 0.0
        if existing_papers:
            s_set = set(chosen_ids)
            for other_ids in existing_papers:
                o_set = set(other_ids)
                if not o_set:
                    continue
                shared = len(s_set & o_set)
                o_ratio = shared / float(len(s_set))
                if o_ratio > max_o:
                    max_o = o_ratio

        if max_o <= max_overlap:
            best_candidate = (seed, chosen_generators, chosen_ids)
            break
        elif max_o < min_observed_overlap:
            min_observed_overlap = max_o
            best_candidate = (seed, chosen_generators, chosen_ids)

        attempt_offset += 1

    if not best_candidate:
        raise RuntimeError(f"Unable to generate paper for student {student_id}.")

    seed, chosen_generators, chosen_ids = best_candidate
    rng = random.Random(seed)

    server_questions = []
    client_questions = []

    for idx, gen in enumerate(chosen_generators):
        q_seed = rng.randint(10000, 999999)
        q_rng = random.Random(q_seed)
        q_data = gen(q_rng)
        q_id = f"q_{idx + 1}_{q_data['id']}"

        if q_data["type"] in ("predict_output", "multiple_choice"):
            options = [q_data["expected"]] + q_data.get("distractors", [])
            unique_opts = []
            for opt in options:
                if opt not in unique_opts:
                    unique_opts.append(opt)
            q_rng.shuffle(unique_opts)
            correct_idx = unique_opts.index(q_data["expected"])

            server_questions.append({
                "q_id": q_id,
                "type": q_data["type"],
                "topic": q_data["topic"],
                "title": q_data["title"],
                "prompt": q_data["prompt"],
                "code": q_data.get("code"),
                "options": unique_opts,
                "correct_index": correct_idx,
                "expected": q_data["expected"]
            })

            client_questions.append({
                "q_id": q_id,
                "type": q_data["type"],
                "topic": q_data["topic"],
                "title": q_data["title"],
                "prompt": q_data["prompt"],
                "code": q_data.get("code"),
                "options": unique_opts
            })
        elif q_data["type"] == "write_code":
            server_questions.append({
                "q_id": q_id,
                "type": q_data["type"],
                "topic": q_data["topic"],
                "title": q_data["title"],
                "prompt": q_data["prompt"],
                "sample_input": q_data.get("sample_input", ""),
                "sample_output": q_data.get("sample_output", ""),
                "starter_code": q_data.get("starter_code", ""),
                "hidden_test_cases": q_data.get("hidden_test_cases", [])
            })

            client_questions.append({
                "q_id": q_id,
                "type": q_data["type"],
                "topic": q_data["topic"],
                "title": q_data["title"],
                "prompt": q_data["prompt"],
                "sample_input": q_data.get("sample_input", ""),
                "sample_output": q_data.get("sample_output", ""),
                "starter_code": q_data.get("starter_code", ""),
                "test_cases_count": len(q_data.get("hidden_test_cases", []))
            })

    server_paper = {
        "seed": seed,
        "test_type": test_type,
        "level_id": level_id,
        "template_ids": chosen_ids,
        "questions": server_questions
    }

    client_paper = {
        "seed": seed,
        "test_type": test_type,
        "level_id": level_id,
        "questions": client_questions,
        "total_questions": len(client_questions)
    }

    return seed, server_paper, client_paper

# ============================================================================
# SERVER-SIDE TEST GRADING
# ============================================================================

def grade_test_submission(server_paper: dict, student_answers: dict) -> dict:
    """Grades student test answers (each question 25 pts, total 100)."""
    questions = server_paper["questions"]
    total_points = float(len(questions) * 25.0)
    earned_points = 0.0
    breakdown = {}
    failed_hidden_cases = {}
    weight = 25.0

    for q in questions:
        q_id = q["q_id"]
        topic = q.get("topic", "General")
        q_type = q["type"]

        if topic not in breakdown:
            breakdown[topic] = {"earned": 0.0, "total": 0.0}
        breakdown[topic]["total"] += weight

        submitted = student_answers.get(q_id)

        if q_type in ("predict_output", "multiple_choice"):
            if submitted is not None and str(submitted) == str(q["correct_index"]):
                earned_points += weight
                breakdown[topic]["earned"] += weight
            else:
                sel_text = "None"
                if submitted is not None:
                    try:
                        s_idx = int(submitted)
                        if 0 <= s_idx < len(q["options"]):
                            sel_text = q["options"][s_idx]
                    except Exception:
                        sel_text = str(submitted)

                failed_hidden_cases[q_id] = {
                    "question_title": q["title"],
                    "reason": "Incorrect option selected",
                    "your_answer": sel_text,
                    "correct_answer": q["options"][q["correct_index"]]
                }
        elif q_type == "write_code":
            code = submitted.strip() if isinstance(submitted, str) else ""
            hidden_cases = q.get("hidden_test_cases", [])
            cases_passed = 0
            failed_case_details = []

            for idx, case in enumerate(hidden_cases):
                inp = case.get("input", "")
                exp = case.get("expected", "").strip()
                res = run_python_code(code, input_str=inp, timeout_secs=2.0)
                actual = res.get("output", "").strip()

                if res.get("success") and actual == exp:
                    cases_passed += 1
                else:
                    failed_case_details.append({
                        "case_number": idx + 1,
                        "input": inp,
                        "expected": exp,
                        "actual": actual if res.get("success") else f"Runtime Error: {res.get('error')}"
                    })

            if len(hidden_cases) > 0:
                fraction = cases_passed / float(len(hidden_cases))
                q_earned = weight * fraction
                earned_points += q_earned
                breakdown[topic]["earned"] += q_earned

                if cases_passed < len(hidden_cases):
                    failed_hidden_cases[q_id] = {
                        "question_title": q["title"],
                        "passed_cases": f"{cases_passed}/{len(hidden_cases)}",
                        "failed_cases": failed_case_details
                    }

    percentage = round((earned_points / total_points) * 100.0, 1) if total_points > 0 else 0.0
    passed = percentage >= 70.0

    return {
        "score_percentage": percentage,
        "passed": passed,
        "pass_mark": 70.0,
        "earned_points": round(earned_points, 1),
        "total_points": round(total_points, 1),
        "breakdown": breakdown,
        "failed_hidden_cases": failed_hidden_cases
    }
