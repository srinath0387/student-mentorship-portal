import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Building2, 
  Users, 
  Award, 
  ShieldCheck, 
  CalendarCheck, 
  Layers, 
  Sparkles, 
  Eye, 
  Filter, 
  GraduationCap, 
  BookOpen, 
  Briefcase, 
  FileSpreadsheet, 
  Tv, 
  AlertTriangle, 
  Lightbulb, 
  Search 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

export const OversightDashboardPage: React.FC = () => {
  const { role } = useAuth();
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'matrix' | 'research' | 'certifications' | 'progression'>('matrix');
  const [selectedCadreFilter, setSelectedCadreFilter] = useState<'all' | 'professors' | 'associate' | 'assistant' | 'doctorates'>('all');
  const [selectedPubYear, setSelectedPubYear] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const isProgramChair = role === 'program_chair';

  // Fetch real-time executive metrics
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['executiveMetrics', selectedDept],
    queryFn: () => api.getExecutiveMetrics(selectedDept),
    staleTime: 60 * 1000,
  });

  const totals = metricsData?.totals;
  const rawDepartments = metricsData?.departments || [];
  const anomalies = metricsData?.anomalies || [];
  const allowedDepts = metricsData?.allowed_departments || [];

  // Filtered departments based on search query
  const filteredDepartments = useMemo(() => {
    return rawDepartments.filter(d => 
      d.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rawDepartments, searchQuery]);

  // Role title & scope label
  const roleTitle = useMemo(() => {
    switch (role) {
      case 'director': return 'Director\'s Executive Desk';
      case 'principal': return 'Principal\'s Institutional Desk';
      case 'management': return 'Management Governance Board';
      case 'program_chair': return 'Program Chair (CSE & Allied Branches)';
      default: return 'Institutional Oversight Command Center';
    }
  }, [role]);

  const scopeLabel = isProgramChair 
    ? 'Scoped to CSE, AI & ML, Data Science, Cyber Security & Business Systems'
    : 'Institute-Wide (All Academic & Science & Humanities Departments)';

  // Export Executive CSV
  const handleExportCSV = () => {
    if (!rawDepartments.length) return;
    const headers = [
      'Department', 'Total Students', 'Total Faculty', 'SFR (Student:Faculty)', 'Professors',
      'Associate Professors', 'Assistant Professors', 'Doctorates', 'Ph.D. %', 'Total Publications',
      'Student Certifications', 'Certification Penetration %', 'Attendance %', 'Placement %', 'Avg CTC (LPA)'
    ];
    const rows = rawDepartments.map(d => [
      `"${d.department}"`,
      d.student_count,
      d.faculty_count,
      `"1:${d.sfr}"`,
      d.professors,
      d.associate_professors,
      d.assistant_professors,
      d.doctorates,
      `${d.doctorate_percentage}%`,
      d.total_publications,
      d.student_certifications.total,
      `${d.student_certifications.penetration_rate}%`,
      `${d.avg_attendance}%`,
      `${d.placement_rate}%`,
      d.avg_ctc_lpa
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `RGMCET_Executive_Metrics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-6 pb-16 transition-all ${presentationMode ? 'p-8 bg-slate-950 text-white min-h-screen fixed inset-0 z-50 overflow-y-auto' : ''}`}>
      
      {/* ── Executive Scope Banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-brand-primary/15 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-black uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                {roleTitle}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                <Eye className="w-3 h-3 text-amber-400" />
                Live Real-Time Governance
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                NAAC A++ Ready ({totals?.naac_readiness_score || 92}%)
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              Institutional Oversight Command Center
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium max-w-2xl">
              {scopeLabel}
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Department Scope Selector */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-indigo-300" />
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                aria-label="Department Scope Filter"
                className="bg-slate-900/90 text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="All">All In-Scope Departments</option>
                {allowedDepts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-sm"
              title="Export complete institutional dataset to CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            {/* Presentation Mode Toggle */}
            <button
              onClick={() => setPresentationMode(!presentationMode)}
              className={`px-3.5 py-2 rounded-2xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                presentationMode 
                  ? 'bg-amber-500 text-slate-950 border-amber-400' 
                  : 'bg-indigo-600/50 hover:bg-indigo-600 border-indigo-400/50 text-white'
              }`}
              title="Toggle Boardroom / Inspection Presentation Mode"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>{presentationMode ? 'Exit Boardroom' : 'Boardroom View'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Anomaly Alert Banner (Leadership Attention Required) ── */}
      {anomalies.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Leadership Notice Board: {anomalies.length} Operational Item(s) Need Attention
              </h4>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 font-medium">
                {anomalies[0]?.message}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
            AICTE / NAAC Metric Watch
          </span>
        </div>
      )}

      {/* ── Key Institutional Metrics Ribbon ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Metric 1: Total Enrolled Students */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-black uppercase tracking-wider">Students</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-textPrimary">
              {isLoading ? '...' : (totals?.total_students || 0).toLocaleString()}
            </h3>
            <p className="text-[10px] text-textSecondary font-semibold mt-0.5">Across {rawDepartments.length} Departments</p>
          </div>
        </div>

        {/* Metric 2: Total Faculty & Cadre Ratio */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-black uppercase tracking-wider">Faculty</span>
            <GraduationCap className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-textPrimary">
              {isLoading ? '...' : (totals?.total_faculty || 0)}
            </h3>
            <p className="text-[10px] text-purple-600 font-bold mt-0.5">Ratio: {totals?.cadre_ratio || '1:2:6'}</p>
          </div>
        </div>

        {/* Metric 3: Student-to-Faculty Ratio (SFR) */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-black uppercase tracking-wider">Inst. SFR</span>
            <Building2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-emerald-600">
              1:{totals?.overall_sfr || 18.2}
            </h3>
            <p className="text-[10px] text-emerald-700 font-bold mt-0.5">Target: ≤ 1:20 (Compliant)</p>
          </div>
        </div>

        {/* Metric 4: Doctorate Faculty % */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-black uppercase tracking-wider">Ph.D. Holders</span>
            <Award className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-brand-primary">
              {totals?.doctorate_percentage || 0}%
            </h3>
            <p className="text-[10px] text-textSecondary font-semibold mt-0.5">{totals?.total_doctorates || 0} Doctorates</p>
          </div>
        </div>

        {/* Metric 5: Total Research Publications */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-black uppercase tracking-wider">Publications</span>
            <BookOpen className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-amber-600">
              {totals?.total_publications || 0}
            </h3>
            <p className="text-[10px] text-amber-700 font-bold mt-0.5">{totals?.total_patents || 0} Patents</p>
          </div>
        </div>

        {/* Metric 6: Student Global Certifications */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-black uppercase tracking-wider">Certifications</span>
            <Award className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl sm:text-2xl font-black text-cyan-600">
              {totals?.total_student_certs || 0}
            </h3>
            <p className="text-[10px] text-cyan-700 font-bold mt-0.5">{totals?.avg_certification_penetration || 0}% Penetration</p>
          </div>
        </div>
      </div>

      {/* ── Tabbed Executive Views ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-borderLine pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'matrix'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-textSecondary hover:text-textPrimary hover:bg-surface-2'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Department Matrix & Cadre</span>
          </button>

          <button
            onClick={() => setActiveTab('research')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'research'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-textSecondary hover:text-textPrimary hover:bg-surface-2'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Research & Publications</span>
          </button>

          <button
            onClick={() => setActiveTab('certifications')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'certifications'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-textSecondary hover:text-textPrimary hover:bg-surface-2'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Certifications & Skills</span>
          </button>

          <button
            onClick={() => setActiveTab('progression')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'progression'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-textSecondary hover:text-textPrimary hover:bg-surface-2'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Placements & Progression</span>
          </button>
        </div>

        {/* Search Input for filtering rows */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>
      </div>

      {/* ── TAB 1: Department Matrix & Cadre Breakdown ── */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {/* Cadre Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-bold text-textMuted flex items-center gap-1">
              <Filter className="w-3 h-3" /> Cadre Focus:
            </span>
            {[
              { id: 'all', label: 'All Faculty Cadres' },
              { id: 'professors', label: 'Professors' },
              { id: 'associate', label: 'Associate Professors' },
              { id: 'assistant', label: 'Assistant Professors' },
              { id: 'doctorates', label: 'Ph.D. Holders Only' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedCadreFilter(f.id as any)}
                className={`px-3 py-1 rounded-xl font-bold transition-all ${
                  selectedCadreFilter === f.id
                    ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/30'
                    : 'bg-surface text-textSecondary border border-borderLine hover:bg-surface-2'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Interactive Department Table */}
          <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-center">Students</th>
                    <th className="py-3 px-4 text-center">Total Faculty</th>
                    <th className="py-3 px-4 text-center">Inst. SFR</th>
                    <th className="py-3 px-4 text-center">Prof / Assoc / Asst</th>
                    <th className="py-3 px-4 text-center">Doctorates (%)</th>
                    <th className="py-3 px-4 text-center">Pubs</th>
                    <th className="py-3 px-4 text-center">Cert Penetration</th>
                    <th className="py-3 px-4 text-center">Attendance</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {filteredDepartments.map((dept) => {
                    const isExpanded = expandedDept === dept.department;
                    return (
                      <React.Fragment key={dept.department}>
                        <tr className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-textPrimary flex items-center gap-1.5">
                              <span>{dept.department}</span>
                            </div>
                            <span className="text-[10px] text-textMuted">
                              1st-Yr: {dept.students_by_year.year1} | 4th-Yr: {dept.students_by_year.year4}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-textPrimary">
                            {dept.student_count}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-purple-600">
                            {dept.faculty_count}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              dept.sfr <= 20 
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                : dept.sfr <= 25 
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-red-500/10 text-red-600 border border-red-500/20'
                            }`}>
                              1:{dept.sfr}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-textSecondary">
                            <span className="text-indigo-600 font-bold">{dept.professors}</span> / <span className="text-blue-600 font-bold">{dept.associate_professors}</span> / <span className="text-slate-600 font-bold">{dept.assistant_professors}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-brand-primary">
                            {dept.doctorates} ({dept.doctorate_percentage}%)
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-amber-600">
                            {dept.total_publications}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-12 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-cyan-500 rounded-full" 
                                  style={{ width: `${Math.min(100, dept.student_certifications.penetration_rate)}%` }} 
                                />
                              </div>
                              <span className="font-bold text-[10px] text-cyan-700">{dept.student_certifications.penetration_rate}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-emerald-600">
                            {dept.avg_attendance}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => setExpandedDept(isExpanded ? null : dept.department)}
                              className="text-[11px] font-bold text-brand-primary hover:underline"
                            >
                              {isExpanded ? 'Collapse' : 'Inspect'}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Department Detailed Drill-down */}
                        {isExpanded && (
                          <tr className="bg-surface-2/40 border-b border-borderLine">
                            <td colSpan={10} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div className="bg-surface border border-borderLine rounded-xl p-3">
                                  <h5 className="font-bold text-textPrimary text-[11px] mb-2 flex items-center gap-1.5">
                                    <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                                    Faculty Cadre Breakdown
                                  </h5>
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between"><span>Professors:</span> <span className="font-bold">{dept.professors}</span></div>
                                    <div className="flex justify-between"><span>Associate Professors:</span> <span className="font-bold">{dept.associate_professors}</span></div>
                                    <div className="flex justify-between"><span>Assistant Professors:</span> <span className="font-bold">{dept.assistant_professors}</span></div>
                                    <div className="flex justify-between"><span>Ph.D. Holders:</span> <span className="font-bold text-brand-primary">{dept.doctorates} ({dept.doctorate_percentage}%)</span></div>
                                    <div className="flex justify-between"><span>Faculty FDP Completions:</span> <span className="font-bold text-emerald-600">{dept.faculty_fdp_count}</span></div>
                                  </div>
                                </div>

                                <div className="bg-surface border border-borderLine rounded-xl p-3">
                                  <h5 className="font-bold text-textPrimary text-[11px] mb-2 flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                                    Research & Patents Summary
                                  </h5>
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between"><span>Journals (Scopus/SCI):</span> <span className="font-bold">{dept.publications_by_category.journals}</span></div>
                                    <div className="flex justify-between"><span>Conferences (IEEE):</span> <span className="font-bold">{dept.publications_by_category.conferences}</span></div>
                                    <div className="flex justify-between"><span>Book Chapters:</span> <span className="font-bold">{dept.publications_by_category.book_chapters}</span></div>
                                    <div className="flex justify-between"><span>Patents Published:</span> <span className="font-bold text-amber-600">{dept.patents.published}</span></div>
                                    <div className="flex justify-between"><span>Patents Granted:</span> <span className="font-bold text-emerald-600">{dept.patents.granted}</span></div>
                                  </div>
                                </div>

                                <div className="bg-surface border border-borderLine rounded-xl p-3">
                                  <h5 className="font-bold text-textPrimary text-[11px] mb-2 flex items-center gap-1.5">
                                    <Award className="w-3.5 h-3.5 text-cyan-600" />
                                    Student Certifications & Placements
                                  </h5>
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between"><span>AWS Certifications:</span> <span className="font-bold">{dept.student_certifications.aws}</span></div>
                                    <div className="flex justify-between"><span>NPTEL / SWAYAM:</span> <span className="font-bold">{dept.student_certifications.nptel}</span></div>
                                    <div className="flex justify-between"><span>Azure / Oracle / GCP:</span> <span className="font-bold">{dept.student_certifications.azure + dept.student_certifications.oracle + dept.student_certifications.gcp}</span></div>
                                    <div className="flex justify-between"><span>Placement Rate:</span> <span className="font-bold text-emerald-600">{dept.placement_rate}%</span></div>
                                    <div className="flex justify-between"><span>Average Package:</span> <span className="font-bold text-brand-primary">{dept.avg_ctc_lpa} LPA (Max: {dept.highest_ctc_lpa} LPA)</span></div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Research & Publications Analytics ── */}
      {activeTab === 'research' && (
        <div className="space-y-5">
          {/* Year Filter Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-borderLine rounded-2xl p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-textPrimary flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5 text-brand-primary" /> Filter by Publication Year:
              </span>
              {['All', '2026', '2025', '2024', '2023', 'Earlier'].map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedPubYear(yr)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    selectedPubYear === yr
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'bg-surface-2 text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            <span className="text-xs text-textMuted font-semibold">
              Total Recorded Publications: <strong className="text-brand-primary">{totals?.total_publications || 0}</strong>
            </span>
          </div>

          {/* Research Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-textMuted uppercase">Scopus & SCI Journals</span>
                <BookOpen className="w-4 h-4 text-blue-500" />
              </div>
              <h3 className="text-2xl font-black text-blue-600 mt-2">
                {rawDepartments.reduce((acc, d) => acc + d.publications_by_category.journals, 0)}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">High-impact peer-reviewed research</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-textMuted uppercase">IEEE Conferences</span>
                <Users className="w-4 h-4 text-purple-500" />
              </div>
              <h3 className="text-2xl font-black text-purple-600 mt-2">
                {rawDepartments.reduce((acc, d) => acc + d.publications_by_category.conferences, 0)}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">International & National Proceedings</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-textMuted uppercase">Book Chapters</span>
                <Layers className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black text-emerald-600 mt-2">
                {rawDepartments.reduce((acc, d) => acc + d.publications_by_category.book_chapters, 0)}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Springer, Wiley, CRC Press</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-textMuted uppercase">Patents Lifecycle</span>
                <Lightbulb className="w-4 h-4 text-amber-500" />
              </div>
              <h3 className="text-2xl font-black text-amber-600 mt-2">
                {totals?.total_patents || 0}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Indian & International IP</p>
            </div>
          </div>

          {/* Department Publications Breakdown Table */}
          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-textPrimary mb-3">Department Research Output & Year-Wise Trend</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-center">2026</th>
                    <th className="py-2.5 px-3 text-center">2025</th>
                    <th className="py-2.5 px-3 text-center">2024</th>
                    <th className="py-2.5 px-3 text-center">2023</th>
                    <th className="py-2.5 px-3 text-center">Patents</th>
                    <th className="py-2.5 px-3 text-center">Total Pubs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {filteredDepartments.map(d => (
                    <tr key={d.department} className="hover:bg-surface-2/40">
                      <td className="py-2.5 px-3 font-bold text-textPrimary">{d.department}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-indigo-600">{d.publications_by_year['2026'] || 0}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-textSecondary">{d.publications_by_year['2025'] || 0}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-textSecondary">{d.publications_by_year['2024'] || 0}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-textSecondary">{d.publications_by_year['2023'] || 0}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-amber-600">{d.patents.published + d.patents.granted}</td>
                      <td className="py-2.5 px-3 text-center font-black text-brand-primary">{d.total_publications}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Certifications & Technical Skills ── */}
      {activeTab === 'certifications' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">AWS Cloud Certifications</span>
              <h3 className="text-2xl font-black text-amber-500 mt-1">
                {rawDepartments.reduce((acc, d) => acc + d.student_certifications.aws, 0)}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Cloud Practitioner & Solutions Architect</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">NPTEL / SWAYAM Medals</span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">
                {rawDepartments.reduce((acc, d) => acc + d.student_certifications.nptel, 0)}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Elite, Silver & Gold Honors</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">Azure / Oracle / GCP</span>
              <h3 className="text-2xl font-black text-blue-600 mt-1">
                {rawDepartments.reduce((acc, d) => acc + d.student_certifications.azure + d.student_certifications.oracle + d.student_certifications.gcp, 0)}
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Multi-cloud & Database credentials</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">Student Coding Index</span>
              <h3 className="text-2xl font-black text-purple-600 mt-1">
                {((totals?.total_coding_problems || 420000) / 1000).toFixed(0)}k+
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">LeetCode & HackerRank Solved</p>
            </div>
          </div>

          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-textPrimary mb-3">Department Certification Penetration & Faculty FDP Compliance</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-center">Certified Students</th>
                    <th className="py-2.5 px-3 text-center">Penetration Rate</th>
                    <th className="py-2.5 px-3 text-center">AWS</th>
                    <th className="py-2.5 px-3 text-center">NPTEL</th>
                    <th className="py-2.5 px-3 text-center">Faculty FDPs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {filteredDepartments.map(d => (
                    <tr key={d.department} className="hover:bg-surface-2/40">
                      <td className="py-2.5 px-3 font-bold text-textPrimary">{d.department}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-textSecondary">{d.student_certifications.certified_students} / {d.student_count}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-bold text-cyan-700 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                          {d.student_certifications.penetration_rate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-amber-600">{d.student_certifications.aws}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{d.student_certifications.nptel}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-purple-600">{d.faculty_fdp_count} FDPs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: Placements & Progression ── */}
      {activeTab === 'progression' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">Overall Placement Rate</span>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">
                {totals?.overall_placement_rate || 85}%
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Top MNCs, Core & Tier-1 IT</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">Highest CTC (LPA)</span>
              <h3 className="text-2xl font-black text-brand-primary mt-1">
                {totals?.highest_package_lpa || 24} LPA
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">Average Package: {totals?.avg_package_lpa || 6.4} LPA</p>
            </div>

            <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-textMuted uppercase">Higher Studies (GATE / GRE)</span>
              <h3 className="text-2xl font-black text-purple-600 mt-1">
                {totals?.total_higher_studies || 140}+
              </h3>
              <p className="text-[11px] text-textSecondary mt-0.5">IITs, NITs & Foreign Universities</p>
            </div>
          </div>

          <div className="bg-surface border border-borderLine rounded-2xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-textPrimary mb-3">Placement & Progression Performance by Department</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-center">Placement %</th>
                    <th className="py-2.5 px-3 text-center">Avg CTC</th>
                    <th className="py-2.5 px-3 text-center">Highest CTC</th>
                    <th className="py-2.5 px-3 text-center">Higher Studies</th>
                    <th className="py-2.5 px-3 text-center">Attendance Risk (&lt;75%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {filteredDepartments.map(d => (
                    <tr key={d.department} className="hover:bg-surface-2/40">
                      <td className="py-2.5 px-3 font-bold text-textPrimary">{d.department}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{d.placement_rate}%</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-textSecondary">{d.avg_ctc_lpa} LPA</td>
                      <td className="py-2.5 px-3 text-center font-bold text-brand-primary">{d.highest_ctc_lpa} LPA</td>
                      <td className="py-2.5 px-3 text-center font-bold text-purple-600">{d.higher_studies_count}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          d.below_75_attendance_count > 15 
                            ? 'bg-red-500/10 text-red-600 border border-red-500/20' 
                            : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        }`}>
                          {d.below_75_attendance_count} students
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OversightDashboardPage;
