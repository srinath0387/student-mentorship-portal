import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, ChevronDown, ChevronUp, CheckCircle2,
  Clock, XCircle, FileText, ExternalLink, AlertTriangle, Users,
  Trash2, Download, RefreshCw, Repeat,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const ACADEMIC_DUTY_TYPES = [
  'NAAC', 'NBA', 'JNTU Report', 'Exam Duty', 'Question Paper Setting',
  'Valuation Duty', 'Monthly Duty', 'Committee Work', 'Department Event', 'Other Academic',
];

const DUTY_SUGGESTED_POINTS: Record<string, number> = {
  'NAAC': 5, 'NBA': 5, 'JNTU Report': 4, 'Exam Duty': 3,
  'Question Paper Setting': 3, 'Valuation Duty': 3,
  'Monthly Duty': 2, 'Committee Work': 3, 'Department Event': 2, 'Other Academic': 2,
};

const RECURRENCE_OPTIONS = ['Monthly', 'Quarterly', 'Semester', 'Annual'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function deadlineBadge(deadline: string | null) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Overdue', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (days <= 3) return { label: `Due in ${days}d`, cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  return {
    label: `Due ${new Date(deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
    cls: 'bg-green-100 text-green-700 border-green-200',
  };
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-700',
    Submitted: 'bg-blue-100 text-blue-700',
    Approved: 'bg-green-100 text-green-700',
    Rejected: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, React.ReactNode> = {
    Pending: <Clock className="w-3 h-3" />,
    Submitted: <FileText className="w-3 h-3" />,
    Approved: <CheckCircle2 className="w-3 h-3" />,
    Rejected: <XCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-gray-100 text-gray-600'}`}>
      {icons[s]} {s}
    </span>
  );
}

function roleBadge(role: string) {
  if (role === 'coordinator') return <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Coordinator</span>;
  if (role === 'co_coordinator') return <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">Co-Coord</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Assigned</span>;
}

function exportToCSV(duty: any) {
  const rows = [['Faculty Name', 'Email', 'Role', 'Status', 'Points', 'Total Points', 'Cycles', 'Submitted At', 'Proof URL']];
  for (const a of duty.assignees || []) {
    const role = duty.coordinator_email?.toLowerCase() === a.faculty_email?.toLowerCase()
      ? 'Coordinator'
      : duty.co_coordinator_email?.toLowerCase() === a.faculty_email?.toLowerCase()
      ? 'Co-Coordinator' : 'Assigned';
    rows.push([a.faculty_name || '', a.faculty_email, role, a.submission_status,
      a.points_awarded ?? '', a.total_points_earned ?? '', a.cycles_approved ?? '',
      a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '', a.proof_url || '']);
  }
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `duty_${duty.title.replace(/\s+/g, '_')}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Review Panel ─────────────────────────────────────────────────────────────
function ReviewPanel({ assignee, dutyType, isRecurring, onDone }: {
  assignee: any; dutyType: string; isRecurring: boolean; onDone: () => void;
}) {
  // Auto-calculate points, HOD can override
  const autoPoints = DUTY_SUGGESTED_POINTS[dutyType] ?? 2;
  const [pts, setPts] = useState<string>(String(autoPoints));
  const [remarks, setRemarks] = useState(assignee.hod_remarks ?? '');
  const [rejectReason, setRejectReason] = useState('');
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === 'approve') {
        await api.approveAcademicDutyAssignee(assignee.id, {
          points_override: parseFloat(pts) || autoPoints,
          hod_remarks: remarks || undefined,
        } as any);
      } else {
        await api.rejectAcademicDutyAssignee(assignee.id, {
          reject_reason: rejectReason,
          hod_remarks: remarks || undefined,
        });
      }
      setDone(true);
      setTimeout(onDone, 800);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  if (done) return (
    <div className={`text-xs font-medium py-2 ${isRecurring ? 'text-blue-600' : 'text-green-600'}`}>
      {isRecurring ? '🔄 Approved & reset for next cycle' : '✅ Saved'}
    </div>
  );

  return (
    <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
      {/* Submission text */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1">Submission</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {(assignee.submission_text || '').split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) =>
            /^https?:\/\//.test(part)
              ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline break-all">{part}</a>
              : part
          )}
        </p>
      </div>

      {/* Proof URL — always visible prominently */}
      {assignee.proof_url ? (
        <div className="flex items-center gap-2 p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
          <ExternalLink className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
          <a href={assignee.proof_url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-indigo-700 font-medium hover:underline truncate">
            View Proof / Document
          </a>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No proof URL submitted</p>
      )}

      {assignee.completed_at && (
        <p className="text-xs text-gray-500">
          Completed: {new Date(assignee.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      )}

      {/* HOD remarks */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Your Remarks (optional)</label>
        <input type="text" placeholder="Good work, minor correction…" value={remarks}
          onChange={e => setRemarks(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 focus:outline-none" />
      </div>

      {mode === 'approve' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Points
            <span className="ml-1 text-gray-400">(auto: {autoPoints} for {dutyType})</span>
          </label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={15} step={0.5} value={pts}
              onChange={e => setPts(e.target.value)}
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-indigo-400 focus:outline-none" />
            <button type="button" onClick={() => setPts(String(autoPoints))}
              className="text-xs text-indigo-500 hover:underline">Reset to auto</button>
          </div>
          {isRecurring && (
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <Repeat className="w-3 h-3" /> Recurring duty — will reset to Pending for next cycle after approval
            </p>
          )}
        </div>
      )}
      {mode === 'reject' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
          <input type="text" placeholder="Reason…" value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-red-400 focus:outline-none" />
        </div>
      )}

      <div className="flex gap-2">
        {!mode ? (
          <>
            <button onClick={() => setMode('approve')} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors">
              {isRecurring ? '✓ Approve Cycle' : 'Approve'}
            </button>
            <button onClick={() => setMode('reject')} className="flex-1 py-2 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 transition-colors">Reject</button>
          </>
        ) : (
          <>
            <button onClick={submit} disabled={loading || (mode === 'reject' && !rejectReason.trim())}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? 'Saving…' : mode === 'approve' ? 'Confirm' : 'Confirm Reject'}
            </button>
            <button onClick={() => setMode(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">Back</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Duty Assignment Card ──────────────────────────────────────────────────────
function DutyCard({ duty, refetch }: { duty: any; refetch: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const qc = useQueryClient();

  const badge = deadlineBadge(duty.deadline);
  const pct = duty.total > 0 ? Math.round((duty.approved / duty.total) * 100) : 0;

  const cancelMut = useMutation({
    mutationFn: () => api.cancelAcademicDuty(duty.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['academic-duties'] }); refetch(); },
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
              <span className="inline-flex px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">{duty.duty_type}</span>
              {duty.is_recurring && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium">
                  <Repeat className="w-3 h-3" /> {duty.recurrence_period || 'Recurring'}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">{duty.title}</h3>
              {duty.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{duty.description}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
                {duty.coordinator_name && (
                  <span>Coordinator: <span className="font-medium text-gray-700">{duty.coordinator_name}</span></span>
                )}
                {duty.co_coordinator_name && (
                  <span>Co: <span className="font-medium text-gray-700">{duty.co_coordinator_name}</span></span>
                )}
                <span>By: {duty.assigned_by_name || duty.assigned_by}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {badge && <span className={`text-xs px-2 py-1 rounded-full border font-medium ${badge.cls}`}>{badge.label}</span>}
            <button onClick={() => exportToCSV(duty)} title="Export CSV"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { if (window.confirm('Cancel this duty assignment?')) cancelMut.mutate(); }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{duty.approved}/{duty.total} approved</span>
            <span>
              {duty.submitted - duty.approved > 0 && `${duty.submitted - duty.approved} pending review · `}
              {duty.total - duty.submitted} not submitted
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <button onClick={() => setExpanded(v => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide' : 'Show'} Faculty ({duty.total})
        </button>
      </div>

      {/* Expanded faculty list */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold text-gray-600">Faculty</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Role</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Status</th>
                {/* Proof link column — always visible */}
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Proof</th>
                {duty.is_recurring && (
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Cycles / Pts</th>
                )}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(duty.assignees || []).map((a: any) => {
                const role = duty.coordinator_email?.toLowerCase() === a.faculty_email?.toLowerCase()
                  ? 'coordinator'
                  : duty.co_coordinator_email?.toLowerCase() === a.faculty_email?.toLowerCase()
                  ? 'co_coordinator' : 'assigned';
                const isReviewing = reviewing === a.id;
                const colSpan = duty.is_recurring ? 6 : 5;
                return (
                  <>
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800">{a.faculty_name}</div>
                        <div className="text-gray-400">{a.faculty_email}</div>
                      </td>
                      <td className="px-3 py-3">{roleBadge(role)}</td>
                      <td className="px-3 py-3">{statusBadge(a.submission_status)}</td>
                      {/* Proof URL — always visible in table row */}
                      <td className="px-3 py-3">
                        {a.proof_url ? (
                          <a href={a.proof_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline font-medium">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {duty.is_recurring && (
                        <td className="px-3 py-3 text-gray-600">
                          <span className="font-semibold">{a.cycles_approved ?? 0}</span>
                          <span className="text-gray-400"> cycles · </span>
                          <span className="font-semibold text-indigo-600">{a.total_points_earned ?? 0}pt</span>
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        {a.submission_status === 'Submitted' && (
                          <button onClick={() => setReviewing(isReviewing ? null : a.id)}
                            className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors">
                            {isReviewing ? 'Close' : 'Review'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isReviewing && (
                      <tr key={`review-${a.id}`}>
                        <td colSpan={colSpan} className="px-5 pb-4 pt-0">
                          <ReviewPanel
                            assignee={a}
                            dutyType={duty.duty_type}
                            isRecurring={!!duty.is_recurring}
                            onDone={() => { setReviewing(null); refetch(); }}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = ['Assign Duty', 'Active Duties', 'Completed / Archived'] as const;

export default function AcademicDutiesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true || user?.department === '*';
  const callerDept = user?.department || '';
  const [tab, setTab] = useState<typeof TABS[number]>('Active Duties');
  const [deptFilter, setDeptFilter] = useState(isSuperAdmin ? '' : callerDept);

  const { data: facultyData } = useQuery({
    queryKey: ['faculty-list', deptFilter],
    queryFn: () => api.getAllFaculty(deptFilter || undefined),
    enabled: tab === 'Assign Duty' && !!deptFilter,
  });
  const facultyList: any[] = Array.isArray(facultyData) ? facultyData : [];

  const { data: activeDuties, refetch: refetchActive } = useQuery({
    queryKey: ['academic-duties', 'Active', deptFilter],
    queryFn: () => api.getAcademicDuties({ status: 'Active', department: deptFilter || undefined }),
    enabled: tab === 'Active Duties',
  });

  const { data: completedDuties, refetch: refetchCompleted } = useQuery({
    queryKey: ['academic-duties', 'Completed', deptFilter],
    queryFn: async () => {
      const [c1, c2] = await Promise.all([
        api.getAcademicDuties({ status: 'Completed', department: deptFilter || undefined }),
        api.getAcademicDuties({ status: 'Cancelled', department: deptFilter || undefined }),
      ]);
      return [...(Array.isArray(c1) ? c1 : []), ...(Array.isArray(c2) ? c2 : [])];
    },
    enabled: tab === 'Completed / Archived',
  });

  // ── Assign Form ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    duty_type: '', title: '', description: '', deadline: '',
    coordinator_email: '', co_coordinator_email: '',
    faculty_emails: [] as string[],
    is_recurring: false, recurrence_period: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const toggleFaculty = (email: string) => {
    setForm(f => ({
      ...f,
      faculty_emails: f.faculty_emails.includes(email)
        ? f.faculty_emails.filter(e => e !== email)
        : [...f.faculty_emails, email],
    }));
  };

  const selectAll = () => {
    const emails = facultyList.map((f: any) => f.email?.toLowerCase()).filter(Boolean);
    const allSelected = emails.every(e => form.faculty_emails.includes(e));
    setForm(f => ({ ...f, faculty_emails: allSelected ? [] : emails }));
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.duty_type || !form.title) { setFormError('Duty type and title are required.'); return; }
    if (!form.faculty_emails.length) { setFormError('Select at least one faculty member.'); return; }
    if (form.is_recurring && !form.recurrence_period) { setFormError('Select a recurrence period for recurring duty.'); return; }
    setFormLoading(true); setFormError(''); setFormSuccess('');
    try {
      await api.createAcademicDuty({
        duty_type: form.duty_type, title: form.title,
        description: form.description || undefined,
        deadline: form.deadline || undefined,
        coordinator_email: form.coordinator_email || undefined,
        co_coordinator_email: form.co_coordinator_email || undefined,
        faculty_emails: form.faculty_emails,
        department: deptFilter || callerDept,
        is_recurring: form.is_recurring,
        recurrence_period: form.is_recurring ? form.recurrence_period : undefined,
      });
      setFormSuccess('Duty assigned successfully!');
      setForm({ duty_type: '', title: '', description: '', deadline: '', coordinator_email: '', co_coordinator_email: '', faculty_emails: [], is_recurring: false, recurrence_period: '' });
      setTimeout(() => { setFormSuccess(''); setTab('Active Duties'); }, 1200);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to assign duty');
    } finally { setFormLoading(false); }
  };

  const duties = tab === 'Active Duties'
    ? (Array.isArray(activeDuties) ? activeDuties : [])
    : (Array.isArray(completedDuties) ? completedDuties : []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-100">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Academic Duties</h1>
            <p className="text-sm text-gray-500">Assign, track, and approve faculty academic duties</p>
          </div>
        </div>
        {isSuperAdmin ? (
          <input type="text" placeholder="Filter by department…" value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48" />
        ) : (
          <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">{callerDept}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-white shadow text-indigo-700' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Assign Tab ── */}
      {tab === 'Assign Duty' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" /> New Duty Assignment
          </h2>
          <form onSubmit={handleAssign} className="space-y-5 max-w-2xl">
            {formSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                <CheckCircle2 className="w-5 h-5" /> {formSuccess}
              </div>
            )}
            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertTriangle className="w-5 h-5" /> {formError}
              </div>
            )}

            {/* Type + Title */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duty Type <span className="text-red-500">*</span></label>
                <select value={form.duty_type} onChange={e => setForm(f => ({ ...f, duty_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">Select type…</option>
                  {ACADEMIC_DUTY_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {form.duty_type && (
                  <p className="text-xs text-indigo-600 mt-1">
                    Auto points: <strong>{DUTY_SUGGESTED_POINTS[form.duty_type] ?? 2} pts</strong> per approval
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. NAAC Criterion 2 Documentation"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {/* Recurring toggle */}
            <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={form.is_recurring}
                    onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked, recurrence_period: '' }))} />
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.is_recurring ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_recurring ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                    <Repeat className="w-4 h-4 text-indigo-500" /> Recurring Duty
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">Faculty submits every cycle; HOD approves each cycle. No re-assignment needed.</p>
                </div>
              </label>
              {form.is_recurring && (
                <div className="ml-auto flex-shrink-0">
                  <select value={form.recurrence_period} onChange={e => setForm(f => ({ ...f, recurrence_period: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Select period…</option>
                    {RECURRENCE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Description + Deadline */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400">(optional)</span></label>
                <textarea rows={2} placeholder="Brief description…"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.is_recurring ? 'Next Deadline' : 'Deadline'} <span className="text-gray-400">(optional)</span>
                </label>
                <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {/* Coordinator + Co-coordinator */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coordinator <span className="text-gray-400">(optional)</span></label>
                <select value={form.coordinator_email} onChange={e => setForm(f => ({ ...f, coordinator_email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">None</option>
                  {facultyList.map((f: any) => <option key={f.email} value={f.email?.toLowerCase()}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Co-coordinator <span className="text-gray-400">(optional)</span></label>
                <select value={form.co_coordinator_email} onChange={e => setForm(f => ({ ...f, co_coordinator_email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">None</option>
                  {facultyList.map((f: any) => <option key={f.email} value={f.email?.toLowerCase()}>{f.name}</option>)}
                </select>
              </div>
            </div>

            {/* Faculty multi-select */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Assign to Faculty <span className="text-red-500">*</span>
                  <span className="ml-2 text-gray-400 font-normal">{form.faculty_emails.length} selected</span>
                </label>
                <button type="button" onClick={selectAll} className="text-xs text-indigo-600 hover:underline">
                  {form.faculty_emails.length === facultyList.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              {facultyList.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
                  {deptFilter ? 'No faculty found for this department' : 'Select a department first to load faculty'}
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
                  {facultyList.map((f: any) => (
                    <label key={f.email} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={form.faculty_emails.includes(f.email?.toLowerCase())}
                        onChange={() => toggleFaculty(f.email?.toLowerCase())}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <div>
                        <span className="text-sm font-medium text-gray-800">{f.name}</span>
                        <span className="ml-2 text-xs text-gray-400">{f.email}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={formLoading}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2">
              {formLoading ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Assigning…</>
              ) : (
                <><Plus className="w-4 h-4" /> Assign Duty</>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── Active / Completed ── */}
      {tab !== 'Assign Duty' && (
        <div className="space-y-4">
          {/* Recurring duties notice */}
          {tab === 'Active Duties' && duties.some((d: any) => d.is_recurring) && (
            <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-700">
              <Repeat className="w-4 h-4 flex-shrink-0" />
              <span><strong>Recurring duties</strong> auto-reset to Pending after each approval cycle — no re-assignment needed.</span>
            </div>
          )}
          {!duties.length ? (
            <div className="text-center py-16 text-gray-400">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No duties found.</p>
            </div>
          ) : (
            duties.map((d: any) => (
              <DutyCard key={d.id} duty={d}
                refetch={tab === 'Active Duties' ? refetchActive : refetchCompleted} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
