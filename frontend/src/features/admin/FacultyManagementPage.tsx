import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, Mail, Pencil, Link, Trash2, AlertTriangle, Users, Check, X, ShieldAlert, UserCheck, RefreshCw, UserPlus, Eye, Filter, Building, Sparkles, Wand2, GitMerge } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { VALID_DEPARTMENT_NAMES, normalizeDepartmentName } from '../../lib/validation/auth';
import { AddMenteeModal } from './components/AddMenteeModal';
import { FacultyProfileInspectionModal } from '../faculty/components/FacultyProfileInspectionModal';

interface FacultyRow {
  faculty_id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  mentee_count: number;
  year1_count?: number;
  year2_count?: number;
  year3_count?: number;
  year4_count?: number;
}

interface MenteeRow {
  roll_number: string;
  name: string | null;
  email: string | null;
  year: string | null;
  section: string | null;
  cgpa: number | null;
  registered: boolean;
}

interface BlockedEmail {
  email: string;
  blocked_at: string;
  reason: string;
}

export default function FacultyManagementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const isSuperAdmin = user?.isSuperAdmin === true || user?.department === 'All' || user?.department === '*' || !user?.department;
  const [selectedDept, setSelectedDept] = useState<string>(
    isSuperAdmin ? 'All' : normalizeDepartmentName(user?.department || 'CSE')
  );

  const [selectedFaculty, setSelectedFaculty] = useState<FacultyRow | null>(null);
  const [inspectingFaculty, setInspectingFaculty] = useState<FacultyRow | null>(null);
  const [showAddMenteeModal, setShowAddMenteeModal] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [linkEmailId, setLinkEmailId] = useState<string | null>(null);
  const [linkEmailValue, setLinkEmailValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBlocked, setShowBlocked] = useState(false);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  // Manual Merge state
  const [mergeSourceFac, setMergeSourceFac] = useState<FacultyRow | null>(null);
  const [mergeTargetFacId, setMergeTargetFacId] = useState<string>('');
  const [mergeReport, setMergeReport] = useState<{
    mergedCount: number;
    merged: any[];
    remainingUnlinkedCount: number;
    remainingUnlinked: any[];
    message: string;
  } | null>(null);

  const { data: faculty = [], isLoading: facLoading } = useQuery<FacultyRow[]>({
    queryKey: ['adminFaculty', selectedDept],
    queryFn: () => api.getAllFaculty(selectedDept === 'All' ? undefined : selectedDept),
  });

  const { data: mentees = [], isLoading: menteesLoading } = useQuery<MenteeRow[]>({
    queryKey: ['facultyMenteeDetail', selectedFaculty?.faculty_id],
    queryFn: () => api.getFacultyMenteeList(selectedFaculty!.faculty_id),
    enabled: !!selectedFaculty,
  });

  const { data: blocked = [] } = useQuery<BlockedEmail[]>({
    queryKey: ['blockedEmails'],
    queryFn: () => api.getBlockedEmails(),
    enabled: showBlocked,
  });

  const [changeDeptId, setChangeDeptId] = useState<string | null>(null);
  const [changeDeptValue, setChangeDeptValue] = useState<string>('CSE');

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patchFacultyName(id, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminFaculty'] }); setRenameId(null); },
    onError: (e: any) => setActionError(p => ({ ...p, rename: e.message })),
  });

  const changeDeptMut = useMutation({
    mutationFn: ({ id, department }: { id: string; department: string }) => api.patchFacultyDepartment(id, department),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminFaculty'] });
      qc.invalidateQueries({ queryKey: ['adminFacultyLeaveCredits'] });
      setChangeDeptId(null);
    },
    onError: (e: any) => setActionError(p => ({ ...p, changeDept: e.message })),
  });

  const linkEmailMut = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => api.patchFacultyEmail(id, email),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['adminFaculty'] });
      qc.invalidateQueries({ queryKey: ['facultyMenteeDetail'] });
      setLinkEmailId(null);
      if (data?.message) {
        setSyncResult(data.message);
        setTimeout(() => setSyncResult(null), 6000);
      }
    },
    onError: (e: any) => setActionError(p => ({ ...p, linkEmail: e.message })),
  });

  const autoMergeMut = useMutation({
    mutationFn: () => api.smartAutoMergeFaculty(),
    onSuccess: (data) => {
      setMergeReport(data);
      qc.invalidateQueries({ queryKey: ['adminFaculty'] });
      qc.invalidateQueries({ queryKey: ['facultyMenteeDetail'] });
      setSyncResult(data.message);
      setTimeout(() => setSyncResult(null), 6000);
    },
    onError: (e: any) => setSyncResult(`Auto-merge failed: ${e.message}`),
  });

  const manualMergeMut = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      api.mergeFacultyRecords(sourceId, targetId),
    onSuccess: (data) => {
      setSyncResult(data.message || 'Records merged successfully');
      qc.invalidateQueries({ queryKey: ['adminFaculty'] });
      qc.invalidateQueries({ queryKey: ['facultyMenteeDetail'] });
      setMergeSourceFac(null);
      setMergeTargetFacId('');
      setTimeout(() => setSyncResult(null), 6000);
    },
    onError: (e: any) => setActionError(p => ({ ...p, merge: e.message })),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteFaculty(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminFaculty'] });
      qc.invalidateQueries({ queryKey: ['blockedEmails'] });
      if (selectedFaculty?.faculty_id === deleteConfirm) setSelectedFaculty(null);
      setDeleteConfirm(null);
    },
    onError: (e: any, id: string) => setActionError(p => ({ ...p, [id]: (e as any).message })),
  });

  const unblockMut = useMutation({
    mutationFn: (email: string) => api.unblockFaculty(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blockedEmails'] }),
  });

  const unassignMut = useMutation({
    mutationFn: ({ facId, roll }: { facId: string; roll: string }) => api.unassignMentee(facId, roll),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facultyMenteeDetail', selectedFaculty?.faculty_id] }),
  });

  const [syncResult, setSyncResult] = useState<string | null>(null);
  const syncMut = useMutation({
    mutationFn: () => api.syncMentorAssignments(),
    onSuccess: (data) => {
      setSyncResult(data.message);
      qc.invalidateQueries({ queryKey: ['adminFaculty'] });
      setTimeout(() => setSyncResult(null), 6000);
    },
    onError: (e: any) => setSyncResult(`Sync failed: ${e.message}`),
  });

  // Detect unlinked faculty with mentees (possible duplicates or orphaned records)
  const unlinkedWithMentees = faculty.filter(f => (!f.email || f.email.startsWith('pending_')) && (f.mentee_count ?? 0) > 0);
  const totalUnlinked = faculty.filter(f => !f.email || f.email.startsWith('pending_'));

  const filtered = faculty.filter(f => {
    const matchSearch =
      (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.faculty_id || '').toLowerCase().includes(search.toLowerCase());
    const matchDept = selectedDept === 'All' || f.department === selectedDept;
    return matchSearch && matchDept;
  });

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-xs font-semibold mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Faculty Portal</span>
          </div>
          <h1 className="text-xl font-extrabold text-textPrimary">Faculty Management</h1>
          <p className="mt-0.5 text-xs text-textSecondary">
            {faculty.length} faculty member{faculty.length !== 1 ? 's' : ''} {selectedDept !== 'All' ? `(${selectedDept})` : ''} — select a row to view assigned mentees
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Department Filter for Super Admin or Locked Badge for Dept Admin */}
          {isSuperAdmin ? (
            <div className="flex items-center gap-1.5 bg-surface-2 border border-borderLine rounded-xl px-3 py-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-textSecondary" />
              <span className="font-bold text-textMuted uppercase text-[10px]">Dept:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-transparent text-xs font-bold text-textPrimary focus:outline-none cursor-pointer"
              >
                <option value="All">All Departments</option>
                {VALID_DEPARTMENT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-brand-soft border border-brand-primary/30 rounded-xl px-3.5 py-2 text-xs font-bold text-brand-primary">
              <Users className="w-3.5 h-3.5" />
              <span>Dept: {user?.department || selectedDept}</span>
            </div>
          )}

          {/* Smart Auto-Link & Merge Button */}
          <button
            id="smart-auto-merge-btn"
            onClick={() => autoMergeMut.mutate()}
            disabled={autoMergeMut.isPending}
            title="Scan and auto-merge duplicate unlinked CSV records into real registered faculty accounts using AI fuzzy name matching"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-500/40 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold hover:bg-purple-600 hover:text-white transition-colors disabled:opacity-60 shadow-xs"
          >
            <Sparkles className={`w-3.5 h-3.5 ${autoMergeMut.isPending ? 'animate-spin text-purple-400' : 'text-purple-600 dark:text-purple-400'}`} />
            <span>{autoMergeMut.isPending ? 'Auto-Merging…' : '✨ Smart Auto-Link & Merge'}</span>
          </button>

          {/* Sync button: reconciles mentor_assignments ↔ students.faculty_mentor_id */}
          <button
            id="sync-mentor-assignments-btn"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            title="Reconcile mentor_assignments table with students.faculty_mentor_id"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-brand-primary/40 bg-brand-soft text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMut.isPending ? 'animate-spin' : ''}`} />
            <span>{syncMut.isPending ? 'Syncing…' : 'Sync Assignments'}</span>
          </button>
          <button
            onClick={() => setShowBlocked(p => !p)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-bold transition-colors ${
              showBlocked
                ? 'bg-alert border-alert text-white'
                : 'bg-surface border-alert/50 text-alert hover:bg-alert-soft'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{showBlocked ? 'Hide' : 'Show'} Blocked Emails</span>
          </button>
        </div>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
          syncResult.startsWith('Sync failed') || syncResult.startsWith('Auto-merge failed')
            ? 'bg-alert-soft border-alert/40 text-alert'
            : 'bg-success-soft border-success/40 text-success'
        }`}>
          <RefreshCw className="w-3.5 h-3.5" />
          {syncResult}
        </div>
      )}

      {/* Unlinked-with-mentees warning banner with Instant 1-Click Auto-Merge Action */}
      {unlinkedWithMentees.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300/60 rounded-2xl p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-xs">
          <div className="flex gap-3 items-start flex-1 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                {unlinkedWithMentees.length} unlinked faculty record{unlinkedWithMentees.length > 1 ? 's' : ''} with mentees assigned
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                These records were auto-created from CSV with name variations (case, initials, surname expansions). Click <strong>Smart Auto-Link</strong> to automatically match and merge them with registered faculty accounts, or click <strong>Link / Merge</strong> on any row.
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1 truncate max-w-3xl font-medium">
                Records: {unlinkedWithMentees.map(f => f.name).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto">
            <button
              onClick={() => autoMergeMut.mutate()}
              disabled={autoMergeMut.isPending}
              className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-60"
            >
              <Sparkles className={`w-4 h-4 ${autoMergeMut.isPending ? 'animate-spin' : ''}`} />
              <span>{autoMergeMut.isPending ? 'Auto-Merging…' : '✨ Auto-Merge All Unlinked'}</span>
            </button>
          </div>
        </div>
      )}


      {/* Blocked Emails panel */}
      {showBlocked && (
        <div className="bg-alert-soft border border-alert/30 rounded-2xl p-5 shadow-xs">
          <h3 className="text-xs font-bold text-alert uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            <span>Blocked Emails ({blocked.length})</span>
          </h3>
          {blocked.length === 0 ? (
            <p className="text-sm text-textSecondary">No blocked emails.</p>
          ) : blocked.map(b => (
            <div key={b.email} className="flex items-center gap-3 bg-surface border border-alert/20 rounded-xl px-4 py-3 mb-2">
              <div className="flex-1 min-w-0">
                <span className="font-bold text-alert text-xs">{b.email}</span>
                <span className="ml-2.5 text-textMuted text-[11px]">{b.reason}</span>
              </div>
              <button
                onClick={() => unblockMut.mutate(b.email)}
                className="px-3.5 py-1.5 rounded-lg border border-success/50 bg-surface text-success font-bold text-xs hover:bg-success-soft transition-colors"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT — Faculty list */}
        <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden flex flex-col max-h-[75vh]">
          <div className="px-4 py-3.5 border-b border-borderLine">
            <div className="relative">
              <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                placeholder="Search name, email, ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-borderLine bg-background text-sm text-textPrimary placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {facLoading
              ? <div className="p-10 text-center text-textSecondary text-sm">Loading...</div>
              : filtered.length === 0
              ? <div className="p-10 text-center text-textSecondary text-sm">No faculty found</div>
              : filtered.map(f => {
                const sel = selectedFaculty?.faculty_id === f.faculty_id;
                const isLinked = f.email && !f.email.startsWith('pending_');
                const isDeleting = deleteConfirm === f.faculty_id;
                return (
                  <div
                    key={f.faculty_id}
                    onClick={() => setSelectedFaculty(f)}
                    className={`px-4 py-3.5 border-b border-borderLine cursor-pointer transition-all border-l-[3px] ${
                      sel ? 'bg-brand-soft border-l-brand-primary' : 'bg-surface border-l-transparent hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex-1 min-w-0">
                        {renameId === f.faculty_id ? (
                          <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              className="flex-1 px-2.5 py-1 rounded-lg border border-brand-primary bg-background text-sm text-textPrimary focus:outline-none"
                              onKeyDown={e => {
                                if (e.key === 'Enter') renameMut.mutate({ id: f.faculty_id, name: renameValue });
                                if (e.key === 'Escape') setRenameId(null);
                              }}
                            />
                            <button
                              onClick={() => renameMut.mutate({ id: f.faculty_id, name: renameValue })}
                              className="px-2.5 py-1 rounded-lg bg-brand-primary text-white text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Save
                            </button>
                            <button
                              onClick={() => setRenameId(null)}
                              className="px-2 py-1 rounded-lg bg-background text-textSecondary text-xs border border-borderLine"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="font-semibold text-sm text-textPrimary truncate">{f.name}</div>
                        )}
                        <div className="text-[11px] text-textSecondary mt-0.5">{f.faculty_id}</div>
                      </div>
                      {/* Mentee count badge with year breakdown */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                          !isLinked && (f.mentee_count ?? 0) > 0
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 ring-1 ring-amber-300'
                            : 'bg-brand-soft text-brand-primary'
                        }`}>
                          {f.mentee_count ?? 0} mentees
                          {!isLinked && (f.mentee_count ?? 0) > 0 && ' ⚠️'}
                        </span>
                        {/* Year mini-pills — only shown when mentees exist */}
                        {(f.mentee_count ?? 0) > 0 && (
                          <div className="flex gap-1 flex-wrap justify-end">
                            {(f.year4_count ?? 0) > 0 && (
                              <span className="rounded-full px-1.5 py-px text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                                4th:{f.year4_count}
                              </span>
                            )}
                            {(f.year3_count ?? 0) > 0 && (
                              <span className="rounded-full px-1.5 py-px text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                                3rd:{f.year3_count}
                              </span>
                            )}
                            {(f.year2_count ?? 0) > 0 && (
                              <span className="rounded-full px-1.5 py-px text-[9px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                                2nd:{f.year2_count}
                              </span>
                            )}
                            {(f.year1_count ?? 0) > 0 && (
                              <span className="rounded-full px-1.5 py-px text-[9px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                                1st:{f.year1_count}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5">
                      {linkEmailId === f.faculty_id ? (
                        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={linkEmailValue}
                            onChange={e => setLinkEmailValue(e.target.value)}
                            placeholder="email@rgmcet.edu.in"
                            className="flex-1 px-2.5 py-1 rounded-lg border border-sky-400 bg-background text-xs text-textPrimary focus:outline-none"
                            onKeyDown={e => {
                              if (e.key === 'Enter') linkEmailMut.mutate({ id: f.faculty_id, email: linkEmailValue });
                              if (e.key === 'Escape') setLinkEmailId(null);
                            }}
                          />
                          <button
                            onClick={() => linkEmailMut.mutate({ id: f.faculty_id, email: linkEmailValue })}
                            className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Link className="w-3 h-3" /> Link
                          </button>
                          <button
                            onClick={() => setLinkEmailId(null)}
                            className="px-2 py-1 rounded-lg bg-background text-textSecondary text-xs border border-borderLine"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs font-medium inline-flex items-center gap-1 ${isLinked ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`}>
                          {isLinked ? <><Mail className="w-3 h-3" /> {f.email}</> : <><AlertTriangle className="w-3 h-3" /> Not linked</>}
                        </span>
                      )}
                    </div>

                    {actionError[f.faculty_id] && (
                      <div className="text-[11px] text-alert mt-1">{actionError[f.faculty_id]}</div>
                    )}

                    <div className="flex gap-1.5 mt-2.5 flex-wrap" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setInspectingFaculty(f)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand-primary/30 bg-brand-soft text-brand-primary text-xs font-semibold hover:bg-brand-primary hover:text-white transition-colors"
                        title="View Full 360° Profile"
                      >
                        <Eye className="w-3 h-3" /> Profile
                      </button>
                      <button
                        onClick={() => { setRenameId(f.faculty_id); setRenameValue(f.name); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-borderLine bg-surface text-textSecondary text-xs font-semibold hover:bg-background transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Rename
                      </button>
                      <button
                        onClick={() => { setChangeDeptId(f.faculty_id); setChangeDeptValue(f.department || 'CSE'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-400/40 bg-surface text-purple-600 dark:text-purple-400 text-xs font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                        title="Transfer / Change Department"
                      >
                        <Building className="w-3 h-3" /> Change Dept
                      </button>
                      <button
                        onClick={() => { setLinkEmailId(f.faculty_id); setLinkEmailValue(f.email || ''); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-400/40 bg-surface text-sky-600 dark:text-sky-400 text-xs font-semibold hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                      >
                        <Mail className="w-3 h-3" /> {isLinked ? 'Update Email' : 'Link Email'}
                      </button>
                      {!isLinked && (
                        <button
                          onClick={() => { setMergeSourceFac(f); setMergeTargetFacId(''); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-500/40 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-600 hover:text-white transition-colors"
                          title="Merge this unlinked placeholder into a registered faculty account"
                        >
                          <GitMerge className="w-3 h-3" /> Merge Record
                        </button>
                      )}
                      {isDeleting ? (
                        <>
                          <button
                            onClick={() => deleteMut.mutate(f.faculty_id)}
                            disabled={deleteMut.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-alert text-white text-xs font-bold disabled:opacity-60"
                          >
                            <AlertTriangle className="w-3 h-3" /> {deleteMut.isPending ? 'Deleting...' : 'Confirm Delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 rounded-lg bg-background text-textSecondary text-xs border border-borderLine"
                          >Cancel</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(f.faculty_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-alert/40 bg-surface text-alert text-xs font-semibold hover:bg-alert-soft transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )}
                    </div>

                    {changeDeptId === f.faculty_id && (
                      <div className="flex items-center gap-1.5 mt-2.5 p-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-300 dark:border-purple-800" onClick={e => e.stopPropagation()}>
                        <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300">Dept:</span>
                        <select
                          value={changeDeptValue}
                          onChange={e => setChangeDeptValue(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs rounded-lg border border-purple-400 bg-background text-textPrimary font-semibold focus:outline-none"
                        >
                          {VALID_DEPARTMENT_NAMES.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => changeDeptMut.mutate({ id: f.faculty_id, department: changeDeptValue })}
                          disabled={changeDeptMut.isPending}
                          className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-purple-700 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button
                          onClick={() => setChangeDeptId(null)}
                          className="px-2 py-1 rounded-lg bg-background text-textSecondary text-xs border border-borderLine hover:bg-surface-2 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* RIGHT — Mentee directory */}
        <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden flex flex-col max-h-[75vh]">
          {!selectedFaculty ? (
            <div className="flex-1 flex flex-col items-center justify-center text-textSecondary gap-3 p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-primary flex items-center justify-center">
                <UserCheck className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium">Select a faculty member to view their assigned mentees</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-borderLine bg-surface-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-textPrimary">{selectedFaculty.name}</h3>
                  <p className="text-xs text-textMuted mt-0.5">
                    {selectedFaculty.faculty_id} &middot; {mentees.length} assigned mentees
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInspectingFaculty(selectedFaculty)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-soft text-brand-primary text-xs font-bold border border-brand-primary/30 hover:bg-brand-primary hover:text-white shadow-xs transition-colors shrink-0"
                    title="View Complete Faculty 360° Profile"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View 360° Profile</span>
                  </button>
                  <button
                    id="admin-add-mentees-btn"
                    onClick={() => setShowAddMenteeModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-hover shadow-xs transition-colors shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Mentees</span>
                  </button>
                </div>
              </div>
              {/* Year breakdown bar */}
              {mentees.length > 0 && !menteesLoading && (() => {
                const yr4 = mentees.filter(m => m.year === '4th Year').length;
                const yr3 = mentees.filter(m => m.year === '3rd Year').length;
                const yr2 = mentees.filter(m => m.year === '2nd Year').length;
                const yr1 = mentees.filter(m => m.year === '1st Year').length;
                const total = mentees.length || 1;
                return (
                  <div className="px-5 pt-3 pb-2">
                    <div className="text-[10px] font-semibold text-textSecondary mb-1.5 uppercase tracking-wide">Mentees by Year</div>
                    <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
                      {yr4 > 0 && <div className="bg-green-500" style={{ width: `${(yr4/total)*100}%` }} title={`4th Year: ${yr4}`} />}
                      {yr3 > 0 && <div className="bg-blue-500" style={{ width: `${(yr3/total)*100}%` }} title={`3rd Year: ${yr3}`} />}
                      {yr2 > 0 && <div className="bg-orange-500" style={{ width: `${(yr2/total)*100}%` }} title={`2nd Year: ${yr2}`} />}
                      {yr1 > 0 && <div className="bg-yellow-400" style={{ width: `${(yr1/total)*100}%` }} title={`1st Year: ${yr1}`} />}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      {yr4 > 0 && <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">4th: {yr4}</span>}
                      {yr3 > 0 && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">3rd: {yr3}</span>}
                      {yr2 > 0 && <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">2nd: {yr2}</span>}
                      {yr1 > 0 && <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold">1st: {yr1}</span>}
                    </div>
                  </div>
                );
              })()}
              <div className="overflow-y-auto flex-1">
                {menteesLoading
                  ? <div className="p-10 text-center text-textSecondary text-sm">Loading mentees...</div>
                  : mentees.length === 0
                  ? <div className="p-10 text-center text-textSecondary text-sm">No mentees assigned.</div>
                  : mentees.map(m => (
                    <div key={m.roll_number} className="flex items-center gap-3 px-4 py-3 border-b border-borderLine">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.registered ? 'bg-green-500' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-textPrimary">{m.name || m.roll_number}</div>
                        <div className="text-xs text-textSecondary flex gap-2 flex-wrap mt-0.5">
                          <span>{m.roll_number}</span>
                          {m.year && <span>Y{m.year}</span>}
                          {m.section && <span>Sec {m.section}</span>}
                          {m.cgpa != null && <span>CGPA {m.cgpa}</span>}
                        </div>
                        {!m.registered && (
                          <span className="text-[11px] text-amber-500 font-semibold">Not yet registered</span>
                        )}
                      </div>
                      <button
                        onClick={() => unassignMut.mutate({ facId: selectedFaculty.faculty_id, roll: m.roll_number })}
                        disabled={unassignMut.isPending}
                        className="px-2.5 py-1.5 rounded-lg border border-alert/40 bg-surface text-alert text-[11px] font-bold hover:bg-alert-soft transition-colors disabled:opacity-50"
                      >Unassign</button>
                    </div>
                  ))}
              </div>
              <div className="px-4 py-2.5 border-t border-borderLine flex gap-4 text-[11px] text-textSecondary">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Registered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pending
                </span>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Add Mentee Modal (Admin Only) */}
      <AddMenteeModal
        isOpen={showAddMenteeModal}
        onClose={() => setShowAddMenteeModal(false)}
        faculty={selectedFaculty}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['adminFaculty'] });
          if (selectedFaculty) {
            qc.invalidateQueries({ queryKey: ['facultyMenteeDetail', selectedFaculty.faculty_id] });
          }
        }}
      />

      {/* ── Faculty 360° Profile Modal (HOD & Admin) ── */}
      {inspectingFaculty && (
        <FacultyProfileInspectionModal
          faculty={inspectingFaculty}
          onClose={() => setInspectingFaculty(null)}
        />
      )}

      {/* ── Auto-Merge Report Modal ── */}
      {mergeReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-borderLine">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-textPrimary">Auto-Merge Complete</h3>
                  <p className="text-xs text-textSecondary">{mergeReport.message}</p>
                </div>
              </div>
              <button onClick={() => setMergeReport(null)} className="p-1 rounded-lg hover:bg-surface-2 text-textSecondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto space-y-3 flex-1">
              {mergeReport.merged.length > 0 ? (
                <div>
                  <h4 className="text-xs font-bold text-success uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Successfully Merged ({mergeReport.merged.length})
                  </h4>
                  <div className="space-y-2">
                    {mergeReport.merged.map((m: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl bg-surface-2 border border-borderLine text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-amber-600 dark:text-amber-400">{m.unlinkedName}</span>
                          <span className="text-textSecondary">➔</span>
                          <span className="text-green-600 dark:text-green-400">{m.mergedIntoName}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-textSecondary">
                          <span>Email: <strong className="text-textPrimary">{m.mergedIntoEmail}</strong></span>
                          <span>{m.menteesMigrated} mentee(s) transferred</span>
                        </div>
                        <p className="text-[10px] text-textMuted italic">{m.reason} ({m.confidence}% match)</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface-2 text-center text-xs text-textSecondary">
                  No automated high-confidence matches found for remaining unlinked records. You can link emails or merge manually below.
                </div>
              )}

              {mergeReport.remainingUnlinked && mergeReport.remainingUnlinked.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Still Unlinked ({mergeReport.remainingUnlinked.length})
                  </h4>
                  <p className="text-[11px] text-textSecondary mb-2">
                    These faculty members haven't registered on the portal yet or have unique names. You can click <strong>Link Email</strong> on their row once they sign up.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {mergeReport.remainingUnlinked.map((f: any) => (
                      <span key={f.faculty_id} className="px-2.5 py-1 rounded-lg bg-amber-100/70 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
                        {f.name} ({f.mentee_count ?? 0} mentees)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-borderLine flex justify-end">
              <button
                onClick={() => setMergeReport(null)}
                className="px-4 py-2 rounded-xl bg-brand-primary text-white font-bold text-xs hover:bg-brand-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Merge Modal ── */}
      {mergeSourceFac && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-borderLine">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-textPrimary">Merge Faculty Record</h3>
                  <p className="text-xs text-textSecondary">Transfer all mentees & allotments to registered account</p>
                </div>
              </div>
              <button onClick={() => setMergeSourceFac(null)} className="p-1 rounded-lg hover:bg-surface-2 text-textSecondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300/40">
                <span className="font-bold text-amber-800 dark:text-amber-300 block mb-0.5">Source (Unlinked CSV Record):</span>
                <p className="font-semibold text-textPrimary text-sm">{mergeSourceFac.name}</p>
                <p className="text-[11px] text-textSecondary mt-0.5">ID: {mergeSourceFac.faculty_id} • Mentees: {mergeSourceFac.mentee_count ?? 0}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-textPrimary mb-1.5">
                  Merge into Registered Faculty Account:
                </label>
                <select
                  value={mergeTargetFacId}
                  onChange={(e) => setMergeTargetFacId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-borderLine bg-background text-xs font-semibold text-textPrimary focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Select Registered Faculty Member --</option>
                  {faculty
                    .filter((f) => f.faculty_id !== mergeSourceFac.faculty_id && f.email && !f.email.startsWith('pending_'))
                    .map((f) => (
                      <option key={f.faculty_id} value={f.faculty_id}>
                        {f.name} ({f.email}) - {f.department}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-textMuted mt-1.5">
                  All assigned mentees ({mergeSourceFac.mentee_count ?? 0}), timetable classes, and subject allotments will be transferred to this faculty member. The unlinked placeholder record will then be safely removed.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-borderLine flex justify-end gap-2">
              <button
                onClick={() => setMergeSourceFac(null)}
                className="px-3.5 py-2 rounded-xl border border-borderLine bg-surface text-textSecondary text-xs font-semibold hover:bg-background"
              >
                Cancel
              </button>
              <button
                disabled={!mergeTargetFacId || manualMergeMut.isPending}
                onClick={() => manualMergeMut.mutate({ sourceId: mergeSourceFac.faculty_id, targetId: mergeTargetFacId })}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{manualMergeMut.isPending ? 'Merging…' : 'Confirm Merge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

