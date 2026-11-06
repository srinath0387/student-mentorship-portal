path_api = '/Users/srinathreddy/DEPARTMENT/backend/src/handlers/api.ts'
path_oversight = '/Users/srinathreddy/DEPARTMENT/frontend/src/features/oversight/OversightDashboardPage.tsx'
path_compliance = '/Users/srinathreddy/DEPARTMENT/frontend/src/features/hod/tabs/MentoringComplianceTab.tsx'
path_placement = '/Users/srinathreddy/DEPARTMENT/frontend/src/features/placement/PlacementTrackerSection.tsx'

# ─── FIX 1: Backend — allow students to see their OWN meeting logs ──────────
with open(path_api, 'r', encoding='utf-8') as f:
    api = f.read()

OLD_AUTH = """    if (studentId) {
      // Student can only see their own; faculty/hod/admin can see any
      if (!['faculty','hod','admin','coordinator','principal','director','management'].includes(role) && authEmail !== studentId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      query = `SELECT * FROM mentor_meetings WHERE roll_number=$1 ORDER BY meeting_date DESC LIMIT 200`;
      params = [studentId.toUpperCase()];"""

NEW_AUTH = """    if (studentId) {
      // Student can only see their own; faculty/hod/admin can see any
      const isPrivileged = ['faculty','hod','admin','coordinator','principal','director','management'].includes(role);
      // Students auth by email — verify by checking their roll_number in students table
      if (!isPrivileged) {
        const ownerCheck = await db.query(
          `SELECT roll_number FROM students WHERE UPPER(roll_number) = UPPER($1) AND email = $2 LIMIT 1`,
          [studentId, authEmail]
        );
        if (ownerCheck.rowCount === 0) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      query = `SELECT * FROM mentor_meetings WHERE UPPER(roll_number)=UPPER($1) ORDER BY meeting_date DESC LIMIT 200`;
      params = [studentId];"""

if OLD_AUTH in api:
    api = api.replace(OLD_AUTH, NEW_AUTH)
    print("FIX 1: ✅ Student auth fix applied")
else:
    print("FIX 1: ❌ Old auth pattern not found exactly")

with open(path_api, 'w', encoding='utf-8') as f:
    f.write(api)

# ─── FIX 2: OversightDashboardPage — move meeting logs inside return, fix dept filter ────
with open(path_oversight, 'r', encoding='utf-8') as f:
    oversight = f.read()

# Fix 2a: move the misplaced meeting logs section — remove it from outside return
OLD_MISPLACED = """      {/* Meeting Logs Section */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          📋 Recent Mentor Meeting Logs
          <span className="text-xs font-normal text-white/40">(institution-wide)</span>
        </h3>
        <MeetingLogsView
          logs={oversightMeetingLogs}
          isLoading={meetingLogsLoading}
          showStudent={true}
          emptyMessage="No mentor meeting logs found."
        />
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return ("""

NEW_FIXED = """    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return ("""

if OLD_MISPLACED in oversight:
    oversight = oversight.replace(OLD_MISPLACED, NEW_FIXED)
    print("FIX 2a: ✅ Removed misplaced meeting logs section from outside return")
else:
    print("FIX 2a: ❌ Misplaced section pattern not found")

# Fix 2b: fix dept filter ('All' vs 'all') and add meeting logs inside the main return
OLD_QUERY = """  const { data: oversightMeetingLogs = [], isLoading: meetingLogsLoading } = useQuery<any[]>({
    queryKey: ['oversightMeetingLogs', selectedDept],
    queryFn: () => api.getDeptMeetingLogs(selectedDept !== 'all' ? selectedDept : undefined),"""

NEW_QUERY = """  const { data: oversightMeetingLogs = [], isLoading: meetingLogsLoading } = useQuery<any[]>({
    queryKey: ['oversightMeetingLogs', selectedDept],
    queryFn: () => api.getDeptMeetingLogs(selectedDept && selectedDept.toLowerCase() !== 'all' ? selectedDept : undefined),"""

if OLD_QUERY in oversight:
    oversight = oversight.replace(OLD_QUERY, NEW_QUERY)
    print("FIX 2b: ✅ Dept filter 'All' vs 'all' fixed")
else:
    print("FIX 2b: ❌ Query pattern not found")

# Fix 2c: Find the closing of the main return JSX (the last </div> before ); ) and inject meeting logs before it
# The file ends with:   </div>\n  );\n};\n\nexport default OversightDashboardPage;
OLD_CLOSE = """    </div>
  );
};

export default OversightDashboardPage;"""

NEW_CLOSE = """      {/* Meeting Logs Section */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          📋 Recent Mentor Meeting Logs
          <span className="text-xs font-normal text-white/40">(institution-wide)</span>
        </h3>
        <MeetingLogsView
          logs={oversightMeetingLogs}
          isLoading={meetingLogsLoading}
          showStudent={true}
          emptyMessage="No mentor meeting logs found."
        />
      </div>

    </div>
  );
};

export default OversightDashboardPage;"""

if OLD_CLOSE in oversight:
    oversight = oversight.replace(OLD_CLOSE, NEW_CLOSE)
    print("FIX 2c: ✅ Meeting logs injected inside main return JSX")
else:
    print("FIX 2c: ❌ Closing pattern not found")

with open(path_oversight, 'w', encoding='utf-8') as f:
    f.write(oversight)

# ─── FIX 3: HOD MentoringComplianceTab — parseInt total_meetings ────────────
with open(path_compliance, 'r', encoding='utf-8') as f:
    compliance = f.read()

OLD_COUNT = "  const totalMeetings = compliance.reduce((s, f) => s + Number(f.total_meetings), 0);"
NEW_COUNT = "  const totalMeetings = compliance.reduce((s, f) => s + parseInt(String(f.total_meetings || '0'), 10), 0);"

if OLD_COUNT in compliance:
    compliance = compliance.replace(OLD_COUNT, NEW_COUNT)
    print("FIX 3: ✅ HOD total_meetings parseInt fix applied")
else:
    print("FIX 3: ❌ Count pattern not found")

# Also fix table cell rendering to use parseInt too
OLD_CELL = "<td className=\"px-3 py-2.5 text-center text-white/60\">{f.total_meetings}</td>"
NEW_CELL = "<td className=\"px-3 py-2.5 text-center text-white/60\">{parseInt(String(f.total_meetings || 0), 10)}</td>"
if OLD_CELL in compliance:
    compliance = compliance.replace(OLD_CELL, NEW_CELL)
    print("FIX 3b: ✅ HOD table cell parseInt fix applied")
else:
    print("FIX 3b: ❌ Cell pattern not found")

with open(path_compliance, 'w', encoding='utf-8') as f:
    f.write(compliance)

# ─── FIX 4: PlacementTrackerSection CSS — polish ────────────────────────────
with open(path_placement, 'r', encoding='utf-8') as f:
    placement = f.read()

# Fix dark overlay cards for student view to match portal theme
OLD_FORM_BG = "    <form onSubmit={handleSubmit} className=\"bg-white/5 border border-white/10 rounded-xl p-4 space-y-3\">"
NEW_FORM_BG = "    <form onSubmit={handleSubmit} className=\"bg-slate-800/70 border border-slate-700/60 rounded-xl p-4 space-y-3\">"
if OLD_FORM_BG in placement:
    placement = placement.replace(OLD_FORM_BG, NEW_FORM_BG)
    print("FIX 4a: ✅ Placement form bg fixed")

OLD_INPUT = "            className=\"w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30\"\n          />\n        </div>\n        <div>\n          <label className=\"text-xs text-white/50 mb-1 block\">Role / Job Title *</label>\n          <input\n            required\n            value={form.role_title}"
if OLD_INPUT in placement:
    NEW_INPUT = "            className=\"w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500\"\n          />\n        </div>\n        <div>\n          <label className=\"text-xs text-slate-400 mb-1 block\">Role / Job Title *</label>\n          <input\n            required\n            value={form.role_title}"
    placement = placement.replace(OLD_INPUT, NEW_INPUT)
    print("FIX 4b: ✅ Placement input CSS fixed")

# Fix "Top Companies" section padding
OLD_TOP_CO = "        <div className=\"bg-white/5 border border-white/10 rounded-xl p-4\">"
NEW_TOP_CO = "        <div className=\"bg-slate-800/50 border border-slate-700/50 rounded-xl p-4\">"
if OLD_TOP_CO in placement:
    placement = placement.replace(OLD_TOP_CO, NEW_TOP_CO)
    print("FIX 4c: ✅ Top companies card bg fixed")

with open(path_placement, 'w', encoding='utf-8') as f:
    f.write(placement)

print("\nAll fixes applied!")
