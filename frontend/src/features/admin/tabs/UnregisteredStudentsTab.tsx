import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Search,
  Download,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Building,
  GraduationCap,
  Mail,
  UserX,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { UnregisteredStudent } from '../../../types';
import { normalizeDepartmentName, VALID_DEPARTMENT_NAMES } from '../../../lib/validation/auth';

export const UnregisteredStudentsTab: React.FC = () => {
  const { user } = useAuth();

  const isSuperAdmin = Boolean(user?.isSuperAdmin) ||
    user?.department === '*' ||
    user?.department === 'All' ||
    ['principal', 'director', 'management', 'program_chair'].includes(user?.role || '');

  const userDept = user?.department ? normalizeDepartmentName(user.department) : '';

  const [selectedDept, setSelectedDept] = useState<string>(isSuperAdmin ? 'All' : userDept);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<string>('All');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRoll, setCopiedRoll] = useState<string | null>(null);

  const activeDeptFilter = isSuperAdmin ? selectedDept : userDept;

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['unregisteredStudents', activeDeptFilter],
    queryFn: () => api.getUnregisteredStudents(activeDeptFilter === 'All' ? undefined : activeDeptFilter),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const students: UnregisteredStudent[] = useMemo(() => {
    return Array.isArray(data?.students) ? data.students : [];
  }, [data]);

  // Extract available batches from roll numbers (e.g. "22" -> "2022")
  const batches = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const match = s.roll_number.match(/^(\d{2})/);
      if (match) {
        set.add(`20${match[1]}`);
      }
    });
    return Array.from(set).sort().reverse();
  }, [students]);

  // Filter students based on search and batch
  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return students.filter((s) => {
      const matchSearch =
        !q ||
        s.roll_number.toLowerCase().includes(q) ||
        s.mentor_name.toLowerCase().includes(q) ||
        s.mentor_email.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q);

      const matchBatch =
        selectedBatch === 'All' ||
        s.roll_number.startsWith(selectedBatch.slice(-2));

      return matchSearch && matchBatch;
    });
  }, [students, searchQuery, selectedBatch]);

  // Unique mentors count
  const uniqueMentorsCount = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.mentor_id) set.add(s.mentor_id);
    });
    return set.size;
  }, [students]);

  // Copy all roll numbers
  const handleCopyAll = () => {
    if (filteredStudents.length === 0) return;
    const rolls = filteredStudents.map((s) => s.roll_number).join('\n');
    navigator.clipboard.writeText(rolls);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Copy single roll number
  const handleCopySingle = (roll: string) => {
    navigator.clipboard.writeText(roll);
    setCopiedRoll(roll);
    setTimeout(() => setCopiedRoll(null), 2000);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredStudents.length === 0) return;
    const headers = ['S.No', 'Roll Number', 'Department', 'Assigned Mentor', 'Mentor Email', 'Assigned Date'];
    const rows = filteredStudents.map((s, idx) => [
      idx + 1,
      s.roll_number,
      s.department,
      s.mentor_name,
      s.mentor_email,
      s.assigned_at ? new Date(s.assigned_at).toLocaleDateString() : 'N/A',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    const deptSlug = (activeDeptFilter || 'all').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.setAttribute('download', `unregistered_students_${deptSlug}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-surface border border-borderLine rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-xs font-bold mb-2">
            <UserX className="w-3.5 h-3.5" />
            <span>Mentor Mapping vs Portal Registration Audit</span>
          </div>
          <h2 className="text-xl font-extrabold text-textPrimary flex items-center gap-2">
            Unregistered Students Roster
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />}
          </h2>
          <p className="text-xs text-textSecondary mt-1">
            Students who exist in the uploaded mentor-mentee mapping list but have not completed self-registration on the portal yet.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-borderLine text-textSecondary hover:text-textPrimary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleCopyAll}
            disabled={filteredStudents.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-borderLine bg-surface text-textPrimary hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAll ? 'Copied All!' : 'Copy Roll Numbers'}</span>
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredStudents.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors shadow-xs disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <UserX className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-textSecondary">Unregistered in Dept</p>
            <p className="text-2xl font-black text-textPrimary mt-0.5">{students.length}</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Pending self-registration</p>
          </div>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-textSecondary">Mapped Mentors</p>
            <p className="text-2xl font-black text-textPrimary mt-0.5">{uniqueMentorsCount}</p>
            <p className="text-[11px] text-textSecondary">Faculty awaiting student registration</p>
          </div>
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-textSecondary">Department Scope</p>
            <p className="text-base font-bold text-textPrimary mt-0.5 truncate max-w-[200px]" title={activeDeptFilter || 'All'}>
              {activeDeptFilter || 'All Departments'}
            </p>
            <p className="text-[11px] text-textSecondary">
              {isSuperAdmin ? 'Super Admin Mode' : 'Department Admin Scoped'}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-textSecondary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roll number, mentor name, mentor email..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-surface-2 border border-borderLine rounded-xl text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Department Filter (Dropdown for Super Admin, badge for Dept Admin) */}
          {isSuperAdmin ? (
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-textSecondary whitespace-nowrap">Dept:</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-2 text-xs bg-surface-2 border border-borderLine rounded-xl text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
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
            <div className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-soft text-brand-primary border border-brand-primary/20 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5" />
              <span>{userDept || 'My Department'}</span>
            </div>
          )}

          {/* Batch Filter */}
          {batches.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-textSecondary whitespace-nowrap">Batch:</label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="px-3 py-2 text-xs bg-surface-2 border border-borderLine rounded-xl text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="All">All Batches</option>
                {batches.map((b) => (
                  <option key={b} value={b}>
                    {b} Batch
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-3" />
            <p className="text-xs font-semibold text-textSecondary">Loading unregistered students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            {students.length === 0 ? (
              <div className="max-w-md mx-auto space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-base font-bold text-textPrimary">All Mapped Students Are Registered!</h3>
                <p className="text-xs text-textSecondary">
                  There are no unregistered students found in the mentor-mentee mapping list for {activeDeptFilter || 'your department'}.
                </p>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-2">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-textPrimary">No matching records found</h3>
                <p className="text-xs text-textSecondary">
                  No students matched your search criteria "{searchQuery}". Try clearing filters.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-borderLine bg-surface-2/60 text-textSecondary font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Assigned Mentor</th>
                  <th className="py-3 px-4">Mentor Email</th>
                  <th className="py-3 px-4">Mapped On</th>
                  <th className="py-3 px-4 text-center">Portal Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {filteredStudents.map((s, index) => (
                  <tr key={s.roll_number} className="hover:bg-surface-2/50 transition-colors">
                    <td className="py-3 px-4 text-center text-textSecondary font-mono text-[11px]">
                      {index + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-textPrimary tracking-wide text-xs">
                          {s.roll_number}
                        </span>
                        <button
                          onClick={() => handleCopySingle(s.roll_number)}
                          title="Copy Roll Number"
                          className="p-1 rounded-md text-textSecondary hover:text-textPrimary hover:bg-surface-2 transition-colors"
                        >
                          {copiedRoll === s.roll_number ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-textPrimary">
                      {s.department || 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-textPrimary">
                        {s.mentor_name}
                      </div>
                      {s.mentor_department && (
                        <div className="text-[10px] text-textSecondary">
                          {s.mentor_department}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {s.mentor_email ? (
                        <a
                          href={`mailto:${s.mentor_email}`}
                          className="inline-flex items-center gap-1 text-brand-primary hover:underline font-mono text-[11px]"
                        >
                          <Mail className="w-3 h-3" />
                          {s.mentor_email}
                        </a>
                      ) : (
                        <span className="text-textSecondary">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-textSecondary text-[11px] whitespace-nowrap">
                      {s.assigned_at
                        ? new Date(s.assigned_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Pre-assigned'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        Not Registered
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info */}
        {filteredStudents.length > 0 && (
          <div className="p-4 border-t border-borderLine bg-surface-2/40 flex items-center justify-between text-xs text-textSecondary">
            <span>
              Showing <strong className="text-textPrimary">{filteredStudents.length}</strong> of{' '}
              <strong className="text-textPrimary">{students.length}</strong> unregistered students
            </span>
            <span className="text-[11px]">
              Tip: Copy the roll numbers list and circulate to mentors to urge student onboarding.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
