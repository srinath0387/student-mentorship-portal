import pdfplumber
import re
import os
from fpdf import FPDF

# Paths
MENTORS_PDF = "II-I_2026-Assigned_Mentors-PS_NO.pdf"
STATEMENTS_PDF = "Hackathon_150_Problem_Statements.md.pdf"
OUTPUT_DIR = "mentor_pdfs"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# 1. Extract Mentor to Problem Statement mapping
mentor_map = {}
print("Parsing mentors PDF...")
with pdfplumber.open(MENTORS_PDF) as pdf:
    for i, page in enumerate(pdf.pages):
        table = page.extract_table()
        if not table:
            continue
        
        # The first row is header, if "S.No" in it.
        start_idx = 0
        if "S.No" in str(table[0]):
            start_idx = 1
            
        for row in table[start_idx:]:
            if not row:
                continue
            reg_no_1 = row[1]
            if reg_no_1: reg_no_1 = reg_no_1.replace('\n', ' ').strip()
            
            reg_no_2 = row[2]
            if reg_no_2: reg_no_2 = reg_no_2.replace('\n', ' ').strip()
            
            mentor_name = row[3]
            if mentor_name:
                mentor_name = mentor_name.replace('\n', ' ').strip()
            ps_no_str = row[4]
            if not mentor_name or not ps_no_str:
                continue
            
            # Clean mentor name (remove extra spaces and bad characters for filenames)
            mentor_name = re.sub(r'\s+', ' ', mentor_name)
            
            try:
                ps_no = int(ps_no_str.strip())
                if mentor_name not in mentor_map:
                    mentor_map[mentor_name] = []
                mentor_map[mentor_name].append((ps_no, reg_no_1, reg_no_2))
            except ValueError:
                print(f"Failed to parse problem statement number: {ps_no_str}")

print(f"Found {len(mentor_map)} mentors.")

# 2. Extract Problem Statements text
print("Parsing problem statements PDF...")
all_text = ""
with pdfplumber.open(STATEMENTS_PDF) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            all_text += text + "\n"

# 3. Parse Problem Statements using regex
print("Extracting individual statements...")
statements = {}
# Find all occurrences of "Number. Title..." at the start of a line
# (?m) enables multiline mode for ^
# ^(\d+)\.\s+ matches the start
# ([\s\S]*?) matches the content non-greedily
# (?=^\d+\.\s+|\Z) matches until the next number or end of string
matches = re.finditer(r"(?m)^(\d+)\.\s+([\s\S]*?)(?=(?:^\d+\.\s+)|\Z)", all_text)
for match in matches:
    num = int(match.group(1))
    content = match.group(2).strip()
    # Remove weird newlines within a paragraph if necessary, but preserving them is fine.
    statements[num] = content

print(f"Extracted {len(statements)} problem statements.")

# 4. Generate PDFs for each mentor
print("Generating PDFs...")
for mentor, ps_list in mentor_map.items():
    pdf = FPDF()
    pdf.add_page()
    pdf.add_font("BookAntiqua", "", "/System/Library/Fonts/Palatino.ttc")
    pdf.set_font("BookAntiqua", '', 16)
    
    # Title
    pdf.multi_cell(0, 10, f"Hackathon Problem Statements", align='C')
    pdf.ln(10)
    
    pdf.set_font("BookAntiqua", size=12)
    
    for item in sorted(ps_list, key=lambda x: x[0]):
        ps_no, reg1, reg2 = item
        if ps_no in statements:
            pdf.set_font("BookAntiqua", '', 12)
            regs = [r for r in (reg1, reg2) if r]
            pdf.cell(0, 10, f"Regd No: {', '.join(regs)}", ln=True)
            pdf.cell(0, 10, f"Problem Statement No: {ps_no}", ln=True)
            pdf.set_font("BookAntiqua", size=12)
            content = statements[ps_no]
            # No need to encode/decode for latin-1 since uni=True supports unicode
            pdf.multi_cell(0, 8, content, align='J')
            pdf.ln(10)
        else:
            print(f"Warning: Problem statement {ps_no} not found for {mentor}")
            pdf.set_font("BookAntiqua", '', 12)
            regs = [r for r in (reg1, reg2) if r]
            pdf.cell(0, 10, f"Regd No: {', '.join(regs)}", ln=True)
            pdf.cell(0, 10, f"Problem Statement No: {ps_no}", ln=True)
            pdf.set_font("BookAntiqua", size=12)
            pdf.multi_cell(0, 8, "[Content not found in Hackathon PDF]", align='J')
            pdf.ln(10)
            
    # Save the PDF
    # Clean filename
    safe_name = re.sub(r'[^a-zA-Z0-9\.\-]', '_', mentor)
    filename = os.path.join(OUTPUT_DIR, f"{safe_name}.pdf")
    try:
        pdf.output(filename)
        print(f"Created {filename}")
    except Exception as e:
        print(f"Failed to create {filename}: {e}")

print("Done.")
