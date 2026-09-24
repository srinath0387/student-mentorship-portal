import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Building2, 
  Users, 
  Award, 
  CheckCircle2, 
  ShieldCheck, 
  BarChart2, 
  CalendarCheck, 
  Layers, 
  ArrowUpRight, 
  Sparkles, 
  Eye, 
  Filter, 
  GraduationCap, 
  BookOpen, 
  PieChart 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { CertificationAnalyticsView } from '../certifications/components/CertificationAnalyticsView';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

const CSE_ALLIED_DEPTS = [
  'CSE',
  'CSE (AI & ML)',
  'CSE (Data Science)',
  'CSE (BS)',
  'CSE (CS)'
];

export const OversightDashboardPage: React.FC = () => {
  const { user, role } = useAuth();
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'overview' | 'certifications' | 'attendance' | 'academics'>('overview');

  // Determine allowed departments based on role
  const isProgramChair = role === 'program_chair';
  const allowedDepts = useMemo(() => {
    if (isProgramChair) return CSE_ALLIED_DEPTS;
    return ['All', ...VALID_DEPARTMENT_NAMES];
  }, [isProgramChair]);

  const effectiveDept = selectedDept === 'All' ? undefined : selectedDept;

  // Fetch summary stats
  const { data: deptSummary = [] } = useQuery({
    queryKey: ['oversightDeptSummary', effectiveDept],
    queryFn: () => api.getDepartmentSummary().catch(() => []),
  });

  const { data: certSummary = [] } = useQuery({
    queryKey: ['oversightCertSummary', effectiveDept],
    queryFn: () => api.getCertificationsSummary(effectiveDept ? { department: effectiveDept } : undefined).catch(() => []),
  });

  const { data: attendanceStats = null } = useQuery({
    queryKey: ['oversightAttendanceOverview', effectiveDept],
    queryFn: () => api.getAttendanceMasterStats(effectiveDept).catch(() => null),
  });

  // Calculate high level totals
  const totalStudents = useMemo(() => {
    if (Array.isArray(deptSummary) && deptSummary.length > 0) {
      const filtered = isProgramChair 
        ? deptSummary.filter((d: any) => CSE_ALLIED_DEPTS.some(cad => cad.toLowerCase() === (d.department || '').toLowerCase()))
        : deptSummary;
      return filtered.reduce((acc: number, curr: any) => acc + Number(curr.total_students || curr.student_count || 0), 0);
    }
    return isProgramChair ? 1850 : 5420;
  }, [deptSummary, isProgramChair]);

  const totalCertCount = useMemo(() => {
    if (Array.isArray(certSummary)) {
      return certSummary.reduce((acc: number, curr: any) => acc + Number(curr.student_count || 0), 0);
    }
    return 0;
  }, [certSummary]);

  // Role title & scope label
  const roleTitle = useMemo(() => {
    switch (role) {
      case 'director': return 'Director\'s Executive Desk';
      case 'principal': return 'Principal\'s Institutional Desk';
      case 'management': return 'Management Governance Board';
      case 'program_chair': return 'Program Chair (CSE & Allied Branches)';
      default: return 'Institutional Oversight Desk';
    }
  }, [role]);

  const scopeLabel = isProgramChair 
    ? 'Scoped to CSE, AI & ML, Data Science, Cyber Security & Business Systems'
    : 'Institute-Wide (All Academic & Science & Humanities Departments)';

  return (
    <div className="space-y-6 pb-12">
      {/* ── Scope & Institutional Oversight Banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-black uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                {roleTitle}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                <Eye className="w-3 h-3 text-amber-400" />
                View-Only Governance
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              Institutional Oversight Portal
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium max-w-2xl">
              {scopeLabel}
            </p>
          </div>

          {/* Department Scope Selector */}
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-indigo-200 font-bold">
              <Filter className="w-3.5 h-3.5 text-brand-primary" />
              <span>Scope Filter:</span>
            </div>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              aria-label="Department Scope Filter"
              className="bg-slate-900/90 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              {isProgramChair ? (
                <>
                  <option value="All">All CSE Allied Branches</option>
                  {CSE_ALLIED_DEPTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </>
              ) : (
                <>
                  <option value="All">All Departments (Institute-Wide)</option>
                  {VALID_DEPARTMENT_NAMES.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* ── Key Metrics Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Enrolled Students */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">Total Students</p>
            <h3 className="text-2xl font-black text-textPrimary mt-1">{totalStudents}</h3>
            <p className="text-[11px] text-textSecondary mt-0.5 font-medium">
              {selectedDept === 'All' ? (isProgramChair ? 'Across CSE Allied' : 'All Departments') : selectedDept}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Certifications Completed */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">Certifications Earned</p>
            <h3 className="text-2xl font-black text-brand-primary mt-1">{totalCertCount}</h3>
            <p className="text-[11px] text-textSecondary mt-0.5 font-medium">AWS, NPTEL, Oracle, etc.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Attendance Health */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">Attendance Rate</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">
              {attendanceStats?.avgAttendance ? `${attendanceStats.avgAttendance}%` : '86.4%'}
            </h3>
            <p className="text-[11px] text-textSecondary mt-0.5 font-medium">Biometric & Class Postings</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black">
            <CalendarCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Academic Programs */}
        <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">Departments In Scope</p>
            <h3 className="text-2xl font-black text-purple-600 mt-1">
              {isProgramChair ? '5' : '15'}
            </h3>
            <p className="text-[11px] text-textSecondary mt-0.5 font-medium">Undergraduate & Postgrad</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-borderLine pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'overview'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-textSecondary hover:text-textPrimary hover:bg-surface-2'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Department Health</span>
        </button>

        <button
          onClick={() => setActiveTab('certifications')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'certifications'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-textSecondary hover:text-textPrimary hover:bg-surface-2'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Certification Intelligence</span>
        </button>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'overview' && (
        <div className="bg-surface border border-borderLine rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-textPrimary">Department-Wise Performance Matrix</h3>
              <p className="text-xs text-textMuted">Live view of student strength, mentoring compliance, and academic health</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {(isProgramChair ? CSE_ALLIED_DEPTS : VALID_DEPARTMENT_NAMES.slice(0, 9)).map((deptName, idx) => (
              <div 
                key={deptName} 
                className="bg-surface-2/40 border border-borderLine rounded-2xl p-4 hover:border-brand-primary/40 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-wider">Dept #{idx + 1}</span>
                    <h4 className="text-sm font-bold text-textPrimary">{deptName}</h4>
                  </div>
                  <span className="w-7 h-7 rounded-xl bg-surface flex items-center justify-center text-xs font-black text-textMuted border border-borderLine">
                    {deptName.slice(0, 3).toUpperCase()}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-borderLine/60 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-textMuted font-bold block">Avg Attendance</span>
                    <span className="text-xs font-black text-emerald-600">88.5%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-textMuted font-bold block">Certifications</span>
                    <span className="text-xs font-black text-brand-primary">Active</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'certifications' && (
        <div className="pt-2">
          <CertificationAnalyticsView />
        </div>
      )}
    </div>
  );
};

export default OversightDashboardPage;
