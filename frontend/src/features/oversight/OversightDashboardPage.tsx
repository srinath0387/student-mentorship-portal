import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, GraduationCap, BookOpen, Award, BarChart2,
  ShieldCheck, Eye, Sparkles, Filter, Search, Download, Users,
  TrendingUp, Building2, X, ChevronRight, Briefcase,
  FlaskConical, BadgeCheck, Star
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { ExecutiveDepartmentMetrics, OversightFacultyProfile } from '../../types';

type MainTab = 'students' | 'faculty' | 'certifications' | 'research' | 'placements';
type ViewMode = 'grid' | 'powerbi';
type CadreFilter = 'all' | 'professors' | 'associate' | 'assistant' | 'doctorates';

// ── Stat Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  accent: string; icon: React.ElementType;
}) {
  return (
    <div className={`bg-surface border border-borderLine rounded-2xl p-4 flex items-start gap-3 shadow-xs`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-black text-textPrimary truncate">{value}</div>
        <div className="text-[11px] font-bold text-textMuted leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-textMuted mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Power BI KPI Tile ──────────────────────────────────────────────────────────
function PBIKpiTile({ label, value, sub, color, delta }: {
  label: string; value: string | number; sub?: string; color: string; delta?: string;
}) {
  return (
    <div className={`rounded-2xl p-4 text-white shadow-lg relative overflow-hidden ${color}`}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6" />
      <div className="relative">
        <div className="text-3xl font-black">{value}</div>
        <div className="text-[11px] font-bold opacity-80 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] opacity-70 mt-1">{sub}</div>}
        {delta && <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">{delta}</div>}
      </div>
    </div>
  );
}

// ── Bar Visual (CSS only, Power BI style) ─────────────────────────────────────
function HBarChart({ data, maxVal, color }: { data: { label: string; value: number }[]; maxVal: number; color: string }) {
  return (
    <div className="space-y-2">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <div className="w-28 text-textSecondary font-medium text-right text-[10px] shrink-0 truncate">{label}</div>
          <div className="flex-1 h-5 bg-surface-2 rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-700 ${color} flex items-center justify-end pr-2`}
              style={{ width: maxVal > 0 ? `${Math.max(2, (value / maxVal) * 100)}%` : '2%' }}
            >
              <span className="text-[9px] font-black text-white">{value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Donut-style ring (CSS SVG) ─────────────────────────────────────────────────
function DonutRing({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-2" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="40" y="44" textAnchor="middle" fontSize="14" fontWeight="900" fill="currentColor" className="text-textPrimary">{pct}%</text>
      </svg>
      <div className="text-[10px] font-bold text-textPrimary text-center">{label}</div>
      <div className="text-[9px] text-textMuted text-center">{sub}</div>
    </div>
  );
}

// ── Faculty Profile Card ───────────────────────────────────────────────────────
function FacultyProfileCard({ fac }: { fac: OversightFacultyProfile }) {
  const initials = fac.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-teal-600', 'bg-cyan-600', 'bg-fuchsia-600'];
  const colorIdx = fac.name.charCodeAt(0) % colors.length;
  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-3 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm ${colors[colorIdx]}`}>
          {fac.photo_url ? <img src={fac.photo_url} alt={fac.name} className="w-full h-full object-cover rounded-xl" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-textPrimary text-xs truncate">{fac.name}</div>
          <div className="text-[10px] text-textSecondary truncate">{fac.designation || 'Faculty'}</div>
          <div className="text-[10px] text-textMuted">{fac.department}</div>
        </div>
        {fac.is_phd && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[9px] font-black">Ph.D</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {fac.publications_count > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 text-[9px] font-bold border border-amber-500/20">
            📄 {fac.publications_count} Pubs
          </span>
        )}
        {fac.fdps_count > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[9px] font-bold border border-emerald-500/20">
            🎓 {fac.fdps_count} FDPs
          </span>
        )}
        {fac.highest_qualification && (
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 text-[9px] font-bold border border-indigo-500/20 truncate max-w-[120px]">
            {fac.highest_qualification}
          </span>
        )}
      </div>
      {fac.email && (
        <div className="mt-1.5 text-[9px] text-textMuted truncate">{fac.email}</div>
      )}
    </div>
  );
}

// ── Slicer Pill (Power BI style) ──────────────────────────────────────────────
function SlicerPill<T extends string>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: string }[];
  onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold text-textMuted">{label}:</span>
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
            value === o.id
              ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
              : 'bg-surface text-textSecondary border-borderLine hover:border-brand-primary/40'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export const OversightDashboardPage: React.FC = () => {
  const { role } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MainTab>('students');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [cadreFilter, setCadreFilter] = useState<CadreFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPubYear, setSelectedPubYear] = useState<string>('All');
  const [certProvider, setCertProvider] = useState<string>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDept, setDrawerDept] = useState<string>('All');
  const [drawerCadre, setDrawerCadre] = useState<CadreFilter>('all');
  const [profileSearch, setProfileSearch] = useState('');

  const isProgramChair = role === 'program_chair';

  // ── Data Queries ───────────────────────────────────────────────────────────
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['executiveMetrics', selectedDept],
    queryFn: () => api.getExecutiveMetrics(selectedDept),
    staleTime: 60 * 1000,
  });

  const { data: cadreData, isLoading: cadreLoading } = useQuery({
    queryKey: ['facultyByCadre', drawerDept, drawerCadre],
    queryFn: () => api.getFacultyByCadre(drawerDept, drawerCadre),
    enabled: drawerOpen,
    staleTime: 60 * 1000,
  });

  // ── Derived Data ───────────────────────────────────────────────────────────
  const totals = metricsData?.totals;
  const rawDepts = metricsData?.departments || [];
  const anomalies = metricsData?.anomalies || [];
  const allowedDepts = metricsData?.allowed_departments || [];
  const pubTrend = metricsData?.publications_trend || {};

  const filteredDepts = useMemo(() => {
    let list = rawDepts;
    if (searchQuery) list = list.filter(d => d.department.toLowerCase().includes(searchQuery.toLowerCase()));
    if (cadreFilter !== 'all') {
      list = list.filter(d => {
        if (cadreFilter === 'professors') return d.professors > 0;
        if (cadreFilter === 'associate') return d.associate_professors > 0;
        if (cadreFilter === 'assistant') return d.assistant_professors > 0;
        if (cadreFilter === 'doctorates') return d.doctorates > 0;
        return true;
      });
    }
    return list;
  }, [rawDepts, searchQuery, cadreFilter]);

  const profileFaculty = useMemo(() => {
    if (!cadreData?.faculty) return [];
    if (!profileSearch) return cadreData.faculty;
    return cadreData.faculty.filter(f =>
      f.name.toLowerCase().includes(profileSearch.toLowerCase()) ||
      f.designation.toLowerCase().includes(profileSearch.toLowerCase())
    );
  }, [cadreData, profileSearch]);

  const pubYears = useMemo(() => {
    const yrs = new Set<string>();
    rawDepts.forEach(d => Object.keys(d.publications_by_year).forEach(y => yrs.add(y)));
    return ['All', ...Array.from(yrs).sort((a, b) => b.localeCompare(a))];
  }, [rawDepts]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const roleTitle = useMemo(() => {
    switch (role) {
      case 'director': return "Director's Executive Desk";
      case 'principal': return "Principal's Institutional Desk";
      case 'management': return 'Management Governance Board';
      case 'program_chair': return 'Program Chair — CSE & Allied Branches';
      default: return 'Institutional Oversight Command Center';
    }
  }, [role]);

  const openProfileDrawer = (dept: string, cadre: CadreFilter) => {
    setDrawerDept(dept);
    setDrawerCadre(cadre);
    setProfileSearch('');
    setDrawerOpen(true);
  };

  const handleExportCSV = () => {
    if (!rawDepts.length) return;
    const headers = [
      'Department', 'Students', 'Faculty', 'SFR', 'Professors', 'Associate Profs',
      'Assistant Profs', 'Doctorates', 'PhD%', 'Publications', 'Total Certs',
      'Cert Penetration%', 'Placed', 'Placement%', 'Avg CTC (LPA)', 'Max CTC (LPA)'
    ];
    const rows = rawDepts.map(d => [
      `"${d.department}"`, d.student_count, d.faculty_count, d.sfr,
      d.professors, d.associate_professors, d.assistant_professors,
      d.doctorates, `${d.doctorate_percentage}%`, d.total_publications,
      d.student_certifications.total, `${d.student_certifications.penetration_rate}%`,
      d.placed_count, `${d.placement_rate}%`, d.avg_ctc_lpa, d.highest_ctc_lpa
    ]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `RGMCET_Executive_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Tabs config ────────────────────────────────────────────────────────────
  const tabs: { id: MainTab; label: string; icon: React.ElementType }[] = [
    { id: 'students', label: '🎓 Student Analytics', icon: Users },
    { id: 'faculty', label: '👨‍🏫 Faculty Analytics', icon: GraduationCap },
    { id: 'certifications', label: '🏆 Certifications', icon: BadgeCheck },
    { id: 'research', label: '📄 Research', icon: BookOpen },
    { id: 'placements', label: '💼 Placements', icon: Briefcase },
  ];

  // ── Power BI Canvas ────────────────────────────────────────────────────────
  const renderPowerBICanvas = () => {
    const cadreBars = rawDepts.map(d => ({
      label: d.department.replace('CSE (', 'CSE('),
      profs: d.professors,
      assoc: d.associate_professors,
      asst: d.assistant_professors,
    }));
    const maxCadre = Math.max(...cadreBars.map(d => d.profs + d.assoc + d.asst), 1);

    const certBars = rawDepts.map(d => ({
      label: d.department.replace('CSE (', 'CSE('),
      value: d.student_certifications.total,
    })).filter(d => d.value > 0).slice(0, 10);
    const maxCert = Math.max(...certBars.map(d => d.value), 1);

    const pubBars = Object.entries(pubTrend)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([yr, cnt]) => ({ label: yr, value: cnt as number }));
    const maxPub = Math.max(...pubBars.map(d => d.value), 1);

    const deptStudentBars = rawDepts.map(d => ({ label: d.department.replace('CSE (', 'CSE('), value: d.student_count }))
      .filter(d => d.value > 0).slice(0, 10);
    const maxStudent = Math.max(...deptStudentBars.map(d => d.value), 1);

    const overallPhdPct = totals?.doctorate_percentage ?? 0;
    const certPct = totals?.avg_certification_penetration ?? 0;
    const placePct = totals?.overall_placement_rate ?? 0;

    return (
      <div className="space-y-5">
        {/* Slicers Bar */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4 flex flex-wrap gap-4">
          <SlicerPill<MainTab>
            label="Analytics"
            value={activeTab}
            options={tabs.map(t => ({ id: t.id, label: t.label }))}
            onChange={setActiveTab}
          />
          <SlicerPill<CadreFilter>
            label="Cadre"
            value={cadreFilter}
            options={[
              { id: 'all', label: 'All' },
              { id: 'professors', label: 'Professors' },
              { id: 'associate', label: 'Associate' },
              { id: 'assistant', label: 'Assistant' },
              { id: 'doctorates', label: 'Ph.D' },
            ]}
            onChange={setCadreFilter}
          />
          <SlicerPill<string>
            label="Provider"
            value={certProvider}
            options={[
              { id: 'all', label: 'All' },
              { id: 'aws', label: 'AWS' },
              { id: 'nptel', label: 'NPTEL' },
              { id: 'azure', label: 'Azure' },
              { id: 'oracle', label: 'Oracle' },
              { id: 'gcp', label: 'GCP' },
              { id: 'cisco', label: 'Cisco' },
            ]}
            onChange={setCertProvider}
          />
        </div>

        {/* Executive KPI Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <PBIKpiTile label="Total Students" value={totals?.total_students ?? 0} color="bg-gradient-to-br from-indigo-600 to-indigo-800" />
          <PBIKpiTile label="Total Faculty" value={totals?.total_faculty ?? 0} sub={`SFR 1:${totals?.overall_sfr ?? 0}`} color="bg-gradient-to-br from-violet-600 to-violet-800" />
          <PBIKpiTile label="Publications" value={totals?.total_publications ?? 0} color="bg-gradient-to-br from-amber-500 to-orange-600" />
          <PBIKpiTile label="Certs Issued" value={totals?.total_student_certs ?? 0} sub={`${totals?.avg_certification_penetration ?? 0}% penetration`} color="bg-gradient-to-br from-cyan-600 to-teal-700" />
          <PBIKpiTile label="Placements" value={`${totals?.overall_placement_rate ?? 0}%`} sub={`Max ${totals?.highest_package_lpa ?? 0} LPA`} color="bg-gradient-to-br from-emerald-600 to-green-700" />
          <PBIKpiTile label="Doctorates" value={`${totals?.doctorate_percentage ?? 0}%`} sub="NAAC target ≥ 30%" color="bg-gradient-to-br from-rose-600 to-pink-700" delta={overallPhdPct >= 30 ? '✅ Compliant' : '⚠ Below Target'} />
        </div>

        {/* Visual Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Donut Rings */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
              <FlaskConical className="w-3.5 h-3.5 text-brand-primary" /> Institutional KPI Rings
            </h4>
            <div className="flex justify-around flex-wrap gap-3">
              <DonutRing pct={overallPhdPct} color="#7c3aed" label="Ph.D Faculty" sub="NAAC: ≥ 30%" />
              <DonutRing pct={certPct} color="#0891b2" label="Cert Penetration" sub="Student avg" />
              <DonutRing pct={placePct} color="#059669" label="Placement Rate" sub="All depts" />
            </div>
          </div>

          {/* Cadre Pyramid */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" /> Faculty Cadre Distribution
            </h4>
            {cadreBars.slice(0, 8).length > 0 ? (
              <div className="space-y-1.5">
                {cadreBars.slice(0, 8).map(d => {
                  const total = d.profs + d.assoc + d.asst;
                  return (
                    <div key={d.label} className="text-[9px]">
                      <div className="flex justify-between text-textMuted mb-0.5">
                        <span className="truncate max-w-[80px]">{d.label}</span>
                        <span>{total}</span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
                        {d.profs > 0 && <div style={{ width: `${(d.profs / (maxCadre || 1)) * 100}%` }} className="bg-indigo-600" title={`Professors: ${d.profs}`} />}
                        {d.assoc > 0 && <div style={{ width: `${(d.assoc / (maxCadre || 1)) * 100}%` }} className="bg-blue-500" title={`Assoc: ${d.assoc}`} />}
                        {d.asst > 0 && <div style={{ width: `${(d.asst / (maxCadre || 1)) * 100}%` }} className="bg-slate-400" title={`Asst: ${d.asst}`} />}
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-3 text-[9px] text-textMuted mt-2">
                  <span><span className="inline-block w-2 h-2 bg-indigo-600 rounded-sm mr-1" />Prof</span>
                  <span><span className="inline-block w-2 h-2 bg-blue-500 rounded-sm mr-1" />Assoc</span>
                  <span><span className="inline-block w-2 h-2 bg-slate-400 rounded-sm mr-1" />Asst</span>
                </div>
              </div>
            ) : <div className="text-xs text-textMuted text-center py-6">No faculty data available</div>}
          </div>

          {/* Student Enrollment */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-cyan-600" /> Enrollment by Dept
            </h4>
            {deptStudentBars.length > 0
              ? <HBarChart data={deptStudentBars} maxVal={maxStudent} color="bg-gradient-to-r from-cyan-500 to-blue-600" />
              : <div className="text-xs text-textMuted text-center py-6">No enrollment data</div>}
          </div>

          {/* Publications Trend */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-amber-600" /> Research Publications by Year
            </h4>
            {pubBars.length > 0
              ? <HBarChart data={pubBars} maxVal={maxPub} color="bg-gradient-to-r from-amber-400 to-orange-500" />
              : <div className="text-xs text-textMuted text-center py-6">No publication data available</div>}
          </div>

          {/* Certifications by Dept */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2">
              <BadgeCheck className="w-3.5 h-3.5 text-teal-600" /> Certifications by Dept
            </h4>
            {certBars.length > 0
              ? <HBarChart data={certBars} maxVal={maxCert} color="bg-gradient-to-r from-teal-500 to-cyan-600" />
              : <div className="text-xs text-textMuted text-center py-6">No certification data</div>}
          </div>

          {/* SFR Compliance */}
          <div className="bg-surface border border-borderLine rounded-2xl p-4">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> SFR Compliance
            </h4>
            <div className="space-y-1.5">
              {rawDepts.filter(d => d.faculty_count > 0).slice(0, 8).map(d => (
                <div key={d.department} className="flex items-center gap-2 text-[10px]">
                  <div className="w-24 truncate text-textSecondary">{d.department.replace('CSE (', 'CSE(')}</div>
                  <div className="flex-1 h-4 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full flex items-center justify-end pr-1.5 ${
                        d.sfr_status === 'compliant' ? 'bg-emerald-500' : d.sfr_status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, (d.sfr / 30) * 100)}%` }}
                    >
                      <span className="text-[9px] text-white font-bold">1:{d.sfr}</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold ${d.sfr_status === 'compliant' ? 'text-emerald-600' : d.sfr_status === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                    {d.sfr_status === 'compliant' ? '✅' : d.sfr_status === 'warning' ? '⚠️' : '🔴'}
                  </span>
                </div>
              ))}
              {rawDepts.filter(d => d.faculty_count === 0).length > 0 && (
                <div className="text-[10px] text-textMuted pt-1">* {rawDepts.filter(d => d.faculty_count === 0).length} depts have no faculty data</div>
              )}
            </div>
            <div className="flex gap-3 text-[9px] text-textMuted mt-3">
              <span><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm mr-1" />≤1:20 Compliant</span>
              <span><span className="inline-block w-2 h-2 bg-amber-500 rounded-sm mr-1" />1:21–25</span>
              <span><span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1" />&gt;1:25</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Student Analytics View ─────────────────────────────────────────────────
  const renderStudentAnalytics = () => (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Enrolled" value={totals?.total_students ?? 0} icon={Users} accent="bg-indigo-500/10 text-indigo-600" />
        <KpiCard label="Total Certs Issued" value={totals?.total_student_certs ?? 0} sub={`${totals?.avg_certification_penetration ?? 0}% penetration`} icon={BadgeCheck} accent="bg-cyan-500/10 text-cyan-600" />
        <KpiCard label="Placement Rate" value={`${totals?.overall_placement_rate ?? 0}%`} sub={`${totals?.total_placed_students ?? 0} placed`} icon={Briefcase} accent="bg-emerald-500/10 text-emerald-600" />
        <KpiCard label="Max Package" value={totals?.highest_package_lpa ? `${totals.highest_package_lpa} LPA` : '—'} icon={Star} accent="bg-amber-500/10 text-amber-600" />
        <KpiCard label="Avg Package" value={totals?.avg_package_lpa ? `${totals.avg_package_lpa} LPA` : '—'} icon={TrendingUp} accent="bg-violet-500/10 text-violet-600" />
        <KpiCard label="At-Risk Attendance" value={totals?.students_at_risk_attendance ?? 0} sub="<75% attendance" icon={Eye} accent="bg-red-500/10 text-red-600" />
      </div>

      {/* Enrollment + Placement Table */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600/10 via-transparent to-transparent border-b border-borderLine">
          <h3 className="font-black text-textPrimary text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" /> Student Enrollment & Placement Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-3 text-center">Total</th>
                <th className="py-3 px-3 text-center">1st Yr</th>
                <th className="py-3 px-3 text-center">2nd Yr</th>
                <th className="py-3 px-3 text-center">3rd Yr</th>
                <th className="py-3 px-3 text-center">4th Yr</th>
                <th className="py-3 px-3 text-center">Certs</th>
                <th className="py-3 px-3 text-center">Cert %</th>
                <th className="py-3 px-3 text-center">Placed</th>
                <th className="py-3 px-3 text-center">Place %</th>
                <th className="py-3 px-3 text-center">Avg CTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {filteredDepts.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-textMuted text-xs">
                  {isLoading ? 'Loading real-time data…' : 'No data in database yet. All values reflect live records.'}
                </td></tr>
              ) : filteredDepts.map(d => (
                <tr key={d.department} className="hover:bg-surface-2/60 transition-colors">
                  <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                  <td className="py-2.5 px-3 text-center font-black text-indigo-600">{d.student_count}</td>
                  <td className="py-2.5 px-3 text-center text-textSecondary">{d.students_by_year.year1}</td>
                  <td className="py-2.5 px-3 text-center text-textSecondary">{d.students_by_year.year2}</td>
                  <td className="py-2.5 px-3 text-center text-textSecondary">{d.students_by_year.year3}</td>
                  <td className="py-2.5 px-3 text-center text-textSecondary">{d.students_by_year.year4}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-cyan-600">{d.student_certifications.total}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-10 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${d.student_certifications.penetration_rate}%` }} />
                      </div>
                      <span className="font-bold text-[10px] text-cyan-700">{d.student_certifications.penetration_rate}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{d.placed_count}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{d.placement_rate}%</td>
                  <td className="py-2.5 px-3 text-center text-brand-primary font-bold">
                    {d.avg_ctc_lpa > 0 ? `${d.avg_ctc_lpa.toFixed(1)} LPA` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Faculty Analytics View ──────────────────────────────────────────────────
  const renderFacultyAnalytics = () => (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Faculty" value={totals?.total_faculty ?? 0} icon={GraduationCap} accent="bg-violet-500/10 text-violet-600" />
        <KpiCard label="Professors" value={totals?.total_professors ?? 0} icon={ShieldCheck} accent="bg-indigo-500/10 text-indigo-600" />
        <KpiCard label="Associate Profs" value={totals?.total_associate_professors ?? 0} icon={Award} accent="bg-blue-500/10 text-blue-600" />
        <KpiCard label="Assistant Profs" value={totals?.total_assistant_professors ?? 0} icon={Users} accent="bg-slate-500/10 text-slate-600" />
        <KpiCard label="Ph.D Holders" value={totals?.total_doctorates ?? 0} sub={`${totals?.doctorate_percentage ?? 0}% of faculty`} icon={FlaskConical} accent="bg-brand-primary/10 text-brand-primary" />
        <KpiCard label="Faculty FDPs" value={totals?.total_faculty_fdps ?? 0} sub="Total completions" icon={BookOpen} accent="bg-emerald-500/10 text-emerald-600" />
      </div>

      {/* Cadre Filter Pills */}
      <div className="bg-surface border border-borderLine rounded-2xl p-3 flex flex-wrap gap-2">
        <span className="text-[11px] font-bold text-textMuted flex items-center gap-1 self-center"><Filter className="w-3 h-3" /> Cadre Filter:</span>
        {([
          { id: 'all', label: 'All Faculty Cadres', color: 'bg-slate-600' },
          { id: 'professors', label: '👑 Professors', color: 'bg-indigo-600' },
          { id: 'associate', label: '🎓 Associate Professors', color: 'bg-blue-600' },
          { id: 'assistant', label: '📚 Assistant Professors', color: 'bg-slate-500' },
          { id: 'doctorates', label: '🔬 Ph.D. Holders', color: 'bg-brand-primary' },
        ] as { id: CadreFilter; label: string; color: string }[]).map(f => (
          <button
            key={f.id}
            onClick={() => setCadreFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
              cadreFilter === f.id
                ? `${f.color} text-white border-transparent`
                : 'bg-surface text-textSecondary border-borderLine hover:bg-surface-2'
            }`}
          >
            {f.label}
            {cadreFilter === f.id && f.id !== 'all' && (
              <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded-full text-[9px]">
                {filteredDepts.length}
              </span>
            )}
          </button>
        ))}
        {cadreFilter !== 'all' && (
          <button
            onClick={() => openProfileDrawer('All', cadreFilter)}
            className="ml-auto px-3 py-1.5 rounded-xl font-bold text-xs bg-brand-primary/10 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary hover:text-white transition-all flex items-center gap-1"
          >
            <Users className="w-3 h-3" /> View All Profiles <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Faculty Table */}
      <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-violet-600/10 via-transparent to-transparent border-b border-borderLine">
          <h3 className="font-black text-textPrimary text-sm flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet-600" /> Faculty Cadre Intelligence Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-3 text-center">Total Faculty</th>
                <th className="py-3 px-3 text-center">SFR</th>
                <th className="py-3 px-3 text-center">Professors</th>
                <th className="py-3 px-3 text-center">Associate</th>
                <th className="py-3 px-3 text-center">Assistant</th>
                <th className="py-3 px-3 text-center">Ph.D (%)</th>
                <th className="py-3 px-3 text-center">Publications</th>
                <th className="py-3 px-3 text-center">FDPs</th>
                <th className="py-3 px-3 text-center">Profiles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {filteredDepts.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-textMuted text-xs">
                  {isLoading ? 'Loading real-time faculty data…' : 'No faculty data in database for the current filter.'}
                </td></tr>
              ) : filteredDepts.map(d => (
                <tr key={d.department} className="hover:bg-surface-2/60 transition-colors">
                  <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                  <td className="py-2.5 px-3 text-center font-black text-violet-600">{d.faculty_count}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      d.sfr_status === 'compliant' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' :
                      d.sfr_status === 'warning' ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20' :
                      'bg-red-500/10 text-red-700 border border-red-500/20'
                    }`}>1:{d.sfr || '—'}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => openProfileDrawer(d.department, 'professors')}
                      className={`font-black text-indigo-600 hover:underline ${cadreFilter === 'professors' ? 'ring-1 ring-indigo-400 rounded px-1' : ''}`}
                    >{d.professors}</button>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => openProfileDrawer(d.department, 'associate')}
                      className={`font-black text-blue-600 hover:underline ${cadreFilter === 'associate' ? 'ring-1 ring-blue-400 rounded px-1' : ''}`}
                    >{d.associate_professors}</button>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => openProfileDrawer(d.department, 'assistant')}
                      className={`font-black text-slate-600 hover:underline ${cadreFilter === 'assistant' ? 'ring-1 ring-slate-400 rounded px-1' : ''}`}
                    >{d.assistant_professors}</button>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`font-bold ${d.doctorate_percentage >= 30 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.doctorates} ({d.doctorate_percentage}%)
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-amber-600">{d.total_publications}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{d.faculty_fdp_count}</td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => openProfileDrawer(d.department, cadreFilter)}
                      className="text-[10px] font-bold text-brand-primary hover:underline flex items-center gap-0.5"
                    >
                      View <ChevronRight className="w-2.5 h-2.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Certifications Deep Dive ───────────────────────────────────────────────
  const renderCertifications = () => {
    const providerTotals = {
      AWS: rawDepts.reduce((a, d) => a + d.student_certifications.aws, 0),
      NPTEL: rawDepts.reduce((a, d) => a + d.student_certifications.nptel, 0),
      Azure: rawDepts.reduce((a, d) => a + d.student_certifications.azure, 0),
      Oracle: rawDepts.reduce((a, d) => a + d.student_certifications.oracle, 0),
      GCP: rawDepts.reduce((a, d) => a + d.student_certifications.gcp, 0),
      Cisco: rawDepts.reduce((a, d) => a + d.student_certifications.cisco, 0),
      Other: rawDepts.reduce((a, d) => a + d.student_certifications.other, 0),
    };
    const totalCerts = totals?.total_student_certs ?? 0;

    return (
      <div className="space-y-5">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Certs Issued" value={totalCerts} icon={BadgeCheck} accent="bg-cyan-500/10 text-cyan-600" />
          <KpiCard label="Avg Cert Penetration" value={`${totals?.avg_certification_penetration ?? 0}%`} sub="Students with ≥1 cert" icon={TrendingUp} accent="bg-teal-500/10 text-teal-600" />
          <KpiCard label="Total Faculty FDPs" value={totals?.total_faculty_fdps ?? 0} icon={BookOpen} accent="bg-violet-500/10 text-violet-600" />
          <KpiCard label="Active Depts" value={rawDepts.filter(d => d.student_certifications.total > 0).length} sub="with certifications" icon={Building2} accent="bg-indigo-500/10 text-indigo-600" />
        </div>

        {/* Provider Breakdown Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {(Object.entries(providerTotals) as [string, number][]).map(([provider, count]) => {
            const pct = totalCerts > 0 ? Math.round((count / totalCerts) * 100) : 0;
            const provColors: Record<string, string> = {
              AWS: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
              NPTEL: 'bg-red-500/10 text-red-700 border-red-500/20',
              Azure: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
              Oracle: 'bg-red-600/10 text-red-800 border-red-600/20',
              GCP: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
              Cisco: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
              Other: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
            };
            return (
              <div key={provider} className={`rounded-2xl border p-3 text-center ${provColors[provider] || ''}`}>
                <div className="text-2xl font-black">{count}</div>
                <div className="text-[10px] font-bold mt-0.5">{provider}</div>
                <div className="text-[9px] mt-0.5 opacity-70">{pct}% of total</div>
              </div>
            );
          })}
        </div>

        {/* Department-wise breakdown */}
        <div className="bg-surface border border-borderLine rounded-2xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-cyan-600/10 via-transparent to-transparent border-b border-borderLine">
            <h3 className="font-black text-textPrimary text-sm flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-cyan-600" /> Certification Provider Breakdown by Department
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-3 text-center">Students</th>
                  <th className="py-3 px-3 text-center">Total Certs</th>
                  <th className="py-3 px-3 text-center">AWS</th>
                  <th className="py-3 px-3 text-center">NPTEL</th>
                  <th className="py-3 px-3 text-center">Azure</th>
                  <th className="py-3 px-3 text-center">Oracle</th>
                  <th className="py-3 px-3 text-center">GCP</th>
                  <th className="py-3 px-3 text-center">Cisco</th>
                  <th className="py-3 px-3 text-center">Others</th>
                  <th className="py-3 px-3 text-center">Penetration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {rawDepts.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-textMuted text-xs">
                    {isLoading ? 'Loading…' : 'No certification records found in the database.'}
                  </td></tr>
                ) : rawDepts.map(d => (
                  <tr key={d.department} className="hover:bg-surface-2/60">
                    <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.student_count}</td>
                    <td className="py-2.5 px-3 text-center font-black text-cyan-600">{d.student_certifications.total}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-orange-600">{d.student_certifications.aws}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-red-600">{d.student_certifications.nptel}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-blue-600">{d.student_certifications.azure}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-red-700">{d.student_certifications.oracle}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-teal-600">{d.student_certifications.gcp}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-teal-700">{d.student_certifications.cisco}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-600">{d.student_certifications.other}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-12 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${d.student_certifications.penetration_rate}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-cyan-700">{d.student_certifications.penetration_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Research Tab ──────────────────────────────────────────────────────────
  const renderResearch = () => {
    const filteredByYear = rawDepts.map(d => {
      const pubs = selectedPubYear === 'All'
        ? d.total_publications
        : (d.publications_by_year[selectedPubYear] ?? 0);
      return { ...d, filteredPubs: pubs };
    }).filter(d => selectedPubYear === 'All' || d.filteredPubs > 0);

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Publications" value={totals?.total_publications ?? 0} icon={BookOpen} accent="bg-amber-500/10 text-amber-600" />
          <KpiCard label="Total Patents" value={totals?.total_patents ?? 0} icon={FlaskConical} accent="bg-violet-500/10 text-violet-600" />
          <KpiCard label="Faculty FDPs" value={totals?.total_faculty_fdps ?? 0} icon={GraduationCap} accent="bg-teal-500/10 text-teal-600" />
          <KpiCard label="Depts with Research" value={rawDepts.filter(d => d.total_publications > 0).length} icon={BarChart2} accent="bg-indigo-500/10 text-indigo-600" />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-[11px] font-bold text-textMuted self-center">Year:</span>
          {pubYears.map(yr => (
            <button key={yr} onClick={() => setSelectedPubYear(yr)}
              className={`px-3 py-1 rounded-xl text-[10px] font-bold transition-all border ${
                selectedPubYear === yr
                  ? 'bg-amber-500 text-white border-transparent'
                  : 'bg-surface text-textSecondary border-borderLine hover:bg-surface-2'
              }`}
            >{yr}</button>
          ))}
        </div>

        <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-borderLine">
            <h3 className="font-black text-textPrimary text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-600" /> Research & Publications
              {selectedPubYear !== 'All' && <span className="text-amber-600">— {selectedPubYear}</span>}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-3 text-center">Publications</th>
                  <th className="py-3 px-3 text-center">Journals</th>
                  <th className="py-3 px-3 text-center">Conferences</th>
                  <th className="py-3 px-3 text-center">Book Chapters</th>
                  <th className="py-3 px-3 text-center">Patents Filed</th>
                  <th className="py-3 px-3 text-center">Patents Granted</th>
                  <th className="py-3 px-3 text-center">FDPs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLine">
                {filteredByYear.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-textMuted">No research data found</td></tr>
                ) : filteredByYear.map(d => (
                  <tr key={d.department} className="hover:bg-surface-2/60">
                    <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                    <td className="py-2.5 px-3 text-center font-black text-amber-600">{d.filteredPubs}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.publications_by_category.journals}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.publications_by_category.conferences}</td>
                    <td className="py-2.5 px-3 text-center text-textSecondary">{d.publications_by_category.book_chapters}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-violet-600">{d.patents.filed}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{d.patents.granted}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-teal-600">{d.faculty_fdp_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Placements Tab ──────────────────────────────────────────────────────────
  const renderPlacements = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Overall Placement %" value={`${totals?.overall_placement_rate ?? 0}%`} icon={Briefcase} accent="bg-emerald-500/10 text-emerald-600" />
        <KpiCard label="Total Placed" value={totals?.total_placed_students ?? 0} icon={Users} accent="bg-teal-500/10 text-teal-600" />
        <KpiCard label="Highest Package" value={totals?.highest_package_lpa ? `${totals.highest_package_lpa} LPA` : '—'} icon={Star} accent="bg-amber-500/10 text-amber-600" />
        <KpiCard label="Avg Package" value={totals?.avg_package_lpa ? `${totals.avg_package_lpa} LPA` : '—'} icon={TrendingUp} accent="bg-violet-500/10 text-violet-600" />
      </div>

      <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLine">
          <h3 className="font-black text-textPrimary text-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-emerald-600" /> Placement & CTC Intelligence
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-surface-2 border-b border-borderLine text-textMuted font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-3 text-center">Total Students</th>
                <th className="py-3 px-3 text-center">Placed</th>
                <th className="py-3 px-3 text-center">Placement %</th>
                <th className="py-3 px-3 text-center">Avg CTC (LPA)</th>
                <th className="py-3 px-3 text-center">Max CTC (LPA)</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {rawDepts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-textMuted text-xs">
                  {isLoading ? 'Loading…' : 'No placement data in database.'}
                </td></tr>
              ) : rawDepts.map(d => (
                <tr key={d.department} className="hover:bg-surface-2/60">
                  <td className="py-2.5 px-4 font-bold text-textPrimary">{d.department}</td>
                  <td className="py-2.5 px-3 text-center text-textSecondary">{d.student_count}</td>
                  <td className="py-2.5 px-3 text-center font-black text-emerald-600">{d.placed_count}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-10 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.placement_rate}%` }} />
                      </div>
                      <span className="font-bold text-[10px] text-emerald-700">{d.placement_rate}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-brand-primary">
                    {d.avg_ctc_lpa > 0 ? `${d.avg_ctc_lpa.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center font-black text-amber-600">
                    {d.highest_ctc_lpa > 0 ? `${d.highest_ctc_lpa.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      d.placement_rate >= 80 ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' :
                      d.placement_rate >= 60 ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' :
                      d.placed_count === 0 && d.student_count === 0 ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' :
                      'bg-red-500/10 text-red-700 border-red-500/20'
                    }`}>
                      {d.placed_count === 0 && d.student_count === 0 ? 'No Data' :
                       d.placement_rate >= 80 ? 'Excellent' : d.placement_rate >= 60 ? 'Good' : 'Needs Improvement'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 pb-20">

      {/* ── Header Banner ── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-5 shadow-xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-brand-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-black uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" /> {roleTitle}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                <Eye className="w-3 h-3" /> Live Real-Time Governance
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                <Sparkles className="w-3 h-3" /> Pure Real-Time Data
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">Institutional Oversight Command Center</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {isProgramChair ? 'Scoped to CSE & Allied Branches' : 'Institute-Wide — All Departments & Sciences'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Department Selector */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-3 py-2 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-indigo-300" />
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="bg-slate-900/90 text-white text-xs font-semibold px-2 py-1 rounded-xl border border-indigo-400/30 focus:outline-none"
              >
                <option value="All">All Departments</option>
                {allowedDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex bg-white/10 border border-white/15 rounded-2xl p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10'}`}
              >
                📋 Grid
              </button>
              <button
                onClick={() => setViewMode('powerbi')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${viewMode === 'powerbi' ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10'}`}
              >
                📊 Power BI Canvas
              </button>
            </div>

            {/* Export */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Anomaly Alerts ── */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.slice(0, 3).map(a => (
            <div key={a.id} className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-xs ${
              a.level === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              a.level === 'critical' ? 'bg-red-50 border-red-200 text-red-800' :
              'bg-indigo-50 border-indigo-200 text-indigo-800'
            }`}>
              <span className="text-base">{a.level === 'warning' ? '⚠️' : a.level === 'critical' ? '🔴' : 'ℹ️'}</span>
              <div>
                <span className="font-black">{a.title}</span>
                <span className="ml-2">{a.message}</span>
                <span className="ml-2 font-bold">Metric: {a.metric} | Benchmark: {a.benchmark}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Power BI Canvas mode ── */}
      {viewMode === 'powerbi' ? (
        renderPowerBICanvas()
      ) : (
        <>
          {/* ── Tab Navigation ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 bg-surface border border-borderLine rounded-2xl p-1">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === t.id
                      ? 'bg-brand-primary text-white shadow-sm'
                      : 'text-textSecondary hover:bg-surface-2'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search department…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-surface border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>

          {/* ── Tab Content ── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-textMuted text-sm">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full mx-auto mb-3" />
                Loading real-time institutional data…
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'students' && renderStudentAnalytics()}
              {activeTab === 'faculty' && renderFacultyAnalytics()}
              {activeTab === 'certifications' && renderCertifications()}
              {activeTab === 'research' && renderResearch()}
              {activeTab === 'placements' && renderPlacements()}
            </>
          )}
        </>
      )}

      {/* ── Faculty Profile Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-lg bg-surface border-l border-borderLine shadow-2xl overflow-y-auto flex flex-col">
            {/* Drawer Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white px-5 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="font-black text-base flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {drawerCadre === 'all' ? 'All Faculty' :
                   drawerCadre === 'professors' ? '👑 Professors' :
                   drawerCadre === 'associate' ? '🎓 Associate Professors' :
                   drawerCadre === 'assistant' ? '📚 Assistant Professors' :
                   '🔬 Ph.D. Holders'}
                </h3>
                <p className="text-indigo-200 text-xs mt-0.5">
                  {drawerDept === 'All' ? 'All Departments' : drawerDept}
                  {cadreData && ` — ${cadreData.total} found`}
                </p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search within profiles */}
            <div className="px-4 py-3 border-b border-borderLine bg-surface sticky top-[72px] z-10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search faculty by name or designation…"
                  value={profileSearch}
                  onChange={e => setProfileSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-surface-2 border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>

            {/* Profile Cards */}
            <div className="flex-1 p-4">
              {cadreLoading ? (
                <div className="flex items-center justify-center py-16 text-textMuted text-xs">
                  <div className="text-center">
                    <div className="animate-spin w-6 h-6 border-4 border-brand-primary border-t-transparent rounded-full mx-auto mb-2" />
                    Loading faculty profiles…
                  </div>
                </div>
              ) : profileFaculty.length === 0 ? (
                <div className="text-center py-16 text-textMuted">
                  <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No faculty profiles found</p>
                  <p className="text-xs mt-1">Faculty profiles require data in the faculty_full_profiles table</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {profileFaculty.map(fac => <FacultyProfileCard key={fac.faculty_id} fac={fac} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OversightDashboardPage;
