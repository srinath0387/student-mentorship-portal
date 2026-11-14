# Faculty Selection — manual test checklist

Use a test round first (e.g. title "TEST — delete me") with 3–4 test student accounts.

## 1. Admin / HOD setup
- [ ] Admin › Assign › **Faculty Selection** (HOD: Academic Quality › Faculty Selection) › **New round**: semester 4-1, open/close times. Round starts as **Draft**.
- [ ] HOD/department admin: the round's department is always their own (super admin chooses the department).
- [ ] **Eligible students**: paste rolls with one duplicate, one wrong roll, one other-department roll → result shows *added / duplicate / not in students / other department*, and each student's section.
- [ ] **Groups, subjects & seats**: add Group A and Group B; add a section (e.g. E) if needed.
- [ ] Add subject "Deep Learning" (Theory). Add faculty: Group A · Sec A · Srinath · 2 seats; Group B · Sec A · Suleman · 30 seats; Group A · Sec B · Penchal …
- [ ] Try adding a faculty who already teaches the same subject + section + semester in another department → refused with a rename hint.
- [ ] **Open round** is refused while there are no students or a subject has no faculty; succeeds afterwards.

## 2. Group A/B lock
- [ ] Student (Sec A) sees only Sec A options, one per group, with seats left.
- [ ] Choose a Group A faculty for subject 1 and a Group B faculty for subject 2 in one go → "All choices must be from the same group".
- [ ] Confirm a Group A choice → chip shows "Section A · Group A"; Group B options are greyed ("Not your group").

## 3. Last-seat race
- [ ] Set a faculty to 1 seat left. Two students press **Confirm** at the same moment → exactly one gets it; the other sees "No seats left … Pick another faculty. Seats have been refreshed."
- [ ] Live dashboard shows filled = capacity, never more.

## 4. First choice is final
- [ ] After confirming, the subject shows a lock and "Locked — contact the admin for changes"; no way to change it.
- [ ] Admin **Release** → student sees "Your choice was released. The admin will assign your faculty." and cannot pick again.
- [ ] Admin **Assign faculty** (Released tab) and **Move** (Selected tab) work; seat counts update on both faculty; audit log records each action.
- [ ] Capacity cannot be set below the seats already filled.
- [ ] Close the round → students get "Selection is closed."

## 5. Faculty view
- [ ] Faculty › Attendance › **My Selected Students**: grouped by semester › subject › section with counts; "Show list" lists reg no + name; PDF downloads.
- [ ] HOD/Admin round page: **Faculty-wise PDF** (one page per faculty: subject, section, reg no, name), **All allotments PDF**, **Excel** (all picks in order, one sheet per faculty, pending students).

## 6. Attendance per section
- [ ] Faculty › **Take Attendance**: the subject appears once per section ("Deep Learning — Sec A", "— Sec B"), each with only that section's selected students, names included.
- [ ] A faculty who teaches in two semesters (e.g. 3-2 and 4-1) sees both, separately.
- [ ] Post attendance for one section → the student's **My Attendance** shows the elective, and still shows their section's normal subjects.
- [ ] Add timetable rows for these classes if they should appear in "Attendance Not Posted".
