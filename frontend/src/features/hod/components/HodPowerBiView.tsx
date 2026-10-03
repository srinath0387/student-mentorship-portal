import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, Users, GraduationCap, TrendingUp, BadgeCheck,
  Briefcase, FlaskConical, ChevronRight, X, Search, Filter,
  ExternalLink, BarChart2, ShieldCheck, Star, ArrowUpRight,
} from 'lucide-react';
import { api } from '../../../lib/api';
import type { OversightFacultyProfile, OversightPublication } from '../../../types';

type CadreFilter = 'all' | 'professors' | 'associate' | 'assistant' | 'doctorates';

// ── Shared Sub-components ────────────────────────────────────────────────────

function PBIKpiTile({ label, value, sub, color, onClick }: {
  label: string; value: string | number; sub?: string; color: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-4 text-white shadow-lg relative overflow-hidden ${color} ${onClick ? 'cursor-pointer hover:scale-[1.02] transition-transform' : ''}`}
    >
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-4 -mt-4" />
      <div className="relative">
        <div className="text-2xl font-black">{value}</div>
        <div className="text-[11px] font-bold opacity-80 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] opacity-70 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function DonutRing({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-surface-2" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="36" y="40" textAnchor="middle" fontSize="12" fontWeight="900" fill="currentColor" className="text-textPrimary">{pct}%</text>
      </svg>
      <div className="text-[10px] font-bold text-textPrimary text-center">{label}</div>
      <div className="text-[9px] text-textMuted text-center">{sub}</div>
    </div>
  );
}

function HBarChart({ data, maxVal, color, onClick, activeLabel }: {
  data: { label: string; value: number }[];
  maxVal: number; color: string;
  onClick?: (item: { label: string; value: number }) => void;
  activeLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {data.map(item => {
        const isActive = activeLabel === item.label;
        return (
          <div
            key={item.label}
            onClick={() => onClick?.(item)}
            className={`flex items-center gap-2 text-xs transition-all rounded-xl ${onClick ? 'cursor-pointer hover:bg-surface-2/60 p-1 -mx-1 group' : ''}`}
          >
            <div className={`w-24 text-right text-[10px] shrink-0 truncate font-medium ${isActive ? 'text-amber-600 font-black' : 'text-textSecondary group-hover:text-brand-primary'}`}>
              {item.label}
            </div>
            <div className="flex-1 h-5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${color} flex items-center justify-end pr-2 transition-all duration-700`}
                style={{ width: maxVal > 0 ? `${Math.max(2, (item.value / maxVal) * 100)}%` : '2%' }}
              >
                <span className="text-[9px] font-black text-white">{item.value}</span>
              </div>
            </div>
            {onClick && (
              <span className="text-[9px] font-bold text-amber-600 opacity-0 group-hover:opacity-100 shrink-0 flex items-center gap-0.5">
                View <ChevronRight className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SlicerPill<T extends string>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold text-textMuted">{label}:</span>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
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

function FacultyCard({ fac }: { fac: OversightFacultyProfile }) {
  const initials = fac.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-teal-600', 'bg-cyan-600', 'bg-fuchsia-600'];
  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-3 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-xs ${colors[fac.name.charCodeAt(0) % colors.length]}`}>
          {fac.photo_url ? <img src={fac.photo_url} alt={fac.name} className="w-full h-full object-cover rounded-xl" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-textPrimary text-xs truncate">{fac.name}</div>
          <div className="text-[10px] text-textSecondary truncate">{fac.designation || 'Faculty'}</div>
        </div>
        {fac.is_phd && <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[9px] font-black flex-shrink-0">Ph.D</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {fac.publications_count > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 text-[9px] font-bold border border-amber-500/20">📄 {fac.publications_count}</span>
        )}
        {fac.fdps_count > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[9px] font-bold border border-emerald-500/20">🎓 {fac.fdps_count} FDPs</span>
        )}
      </div>
    </div>
  );
}

function PublicationCard({ pub }: { pub: OversightPublication }) {
  const cat = (pub.category || 'Journal').toLowerCase();
  const catColor =
    cat.includes('sci') || cat.includes('scopus') ? 'bg-violet-500/10 text-violet-700 border-violet-500/30' :
    cat.includes('conference') ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' :
    cat.includes('patent') ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' :
    'bg-indigo-500/10 text-indigo-700 border-indigo-500/30';
  return (
    <div className="bg-surface border border-borderLine rounded-2xl p-4 space-y-2.5 hover:shadow-md transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${catColor}`}>{pub.category || 'Journal'}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px] font-black">{pub.year}</span>
        </div>
        {pub.doi_link && (
          <a href={pub.doi_link.startsWith('http') ? pub.doi_link : `https://doi.org/${pub.doi_link}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white transition-all text-[10px] font-bold"
          >
            DOI <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div>
        <h4 className="font-bold text-textPrimary text-xs leading-snug">{pub.title}</h4>
        {pub.journal_name && pub.journal_name !== 'N/A' && (
          <p className="text-[11px] text-textSecondary italic mt-1">{pub.journal_name}</p>
        )}
      </div>
      <div className="pt-2 border-t border-borderLine flex items-center gap-2 text-[10px]">
        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center text-[9px] flex-shrink-0">
          {pub.faculty_name?.charAt(0).toUpperCase() || 'F'}
        </div>
        <span className="font-bold text-textPrimary">{pub.faculty_name}</span>
        <span className="text-textMuted">({pub.designation || 'Faculty'})</span>
        {pub.co_authors && <span className="text-textMuted truncate ml-1">| Co: {pub.co_authors}</span>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOD POWER BI VIEW (Department-Scoped)
// ══════════════════════════════════════════════════════════════════════════════
interface HodPowerBiViewProps {
  department: string;
}

export const HodPowerBiView: React.FC<HodPowerBiViewProps> = ({ department }) => {
  const [cadreFilter, setCadreFilter] = useState<CadreFilter>('all');
  const [certProvider, setCertProvider] = useState<string>('all');

  // Faculty Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCadre, setDrawerCadre] = useState<CadreFilter>('all');
  const [profileSearch, setProfileSearch] = useState('');

  // Publications Drawer state
  const [pubDrawerOpen, setPubDrawerOpen] = useState(false);
  const [pubYear, setPubYear] = useState('2026');
  const [pubCategoryFilter, setPubCategoryFilter] = useState('all');
  const [pubSearch, setPubSearch] = useState('');

  // ── Data Queries ────────────────────────────────────────────────────────────
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['hodPowerBiMetrics', department],
    queryFn: () => api.getExecutiveMetrics(department),
    staleTime: 60 * 1000,
  });

  const { data: cadreData, isLoading: cadreLoading } = useQuery({
    queryKey: ['hodFacultyByCadre', department, drawerCadre],
    queryFn: () => api.getFacultyByCadre(department, drawerCadre),
    enabled: drawerOpen,
    staleTime: 60 * 1000,
  });

  const { data: pubData, isLoading: pubLoading } = useQuery({
    queryKey: ['hodPublications', department, pubYear, pubCategoryFilter, pubSearch],
    queryFn: () => api.getPublications(department, pubYear, pubCategoryFilter, pubSearch),
    enabled: pubDrawerOpen,
    staleTime: 60 * 1000,
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const deptData = metricsData?.departments?.[0]; // HOD → always 1 department
  const totals = metricsData?.totals;
  const pubTrend = metricsData?.publications_trend || {};

  const pubBars = useMemo(() => {
    const bars = Object.entries(pubTrend)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([yr, cnt]) => ({ label: yr, value: cnt as number }));
    // Always show 2026 even if count is 0
    if (!bars.some(b => b.label === '2026')) bars.unshift({ label: '2026', value: 0 });
    return bars.slice(0, 8);
  }, [pubTrend]);
  const maxPub = Math.max(...pubBars.map(d => d.value), 1);

  const pubYears = useMemo(() => {
    const yrs = new Set<string>(['2026', '2025', '2024', '2023']);
    Object.keys(pubTrend).forEach(y => yrs.add(y));
    return ['All', ...Array.from(yrs).sort((a, b) => b.localeCompare(a))];
  }, [pubTrend]);

  // Certification bars — respond to certProvider slicer
  const certBars = useMemo(() => {
    if (!deptData) return [];
    const certs = deptData.student_certifications;
    const providerVal =
      certProvider === 'aws' ? certs.aws :
      certProvider === 'nptel' ? certs.nptel :
      certProvider === 'azure' ? certs.azure :
      certProvider === 'oracle' ? certs.oracle :
      certProvider === 'gcp' ? certs.gcp :
      certProvider === 'cisco' ? certs.cisco : certs.total;
    return [{ label: department.replace('CSE (', 'CSE('), value: providerVal }];
  }, [deptData, certProvider, department]);

  // Cadre bars for the pyramid
  const cadreBars = useMemo(() => {
    if (!deptData) return [];
    const showProf = cadreFilter === 'all' || cadreFilter === 'professors';
    const showAssoc = cadreFilter === 'all' || cadreFilter === 'associate';
    const showAsst = cadreFilter === 'all' || cadreFilter === 'assistant';
    const showDoc = cadreFilter === 'all' || cadreFilter === 'doctorates';
    return [
      ...(showProf ? [{ label: '👑 Professors', value: deptData.professors, color: 'bg-indigo-600' }] : []),
      ...(showAssoc ? [{ label: '🎓 Associate', value: deptData.associate_professors, color: 'bg-blue-500' }] : []),
      ...(showAsst ? [{ label: '📚 Assistant', value: deptData.assistant_professors, color: 'bg-slate-400' }] : []),
      ...(showDoc ? [{ label: '🔬 Ph.D Holders', value: deptData.doctorates, color: 'bg-brand-primary' }] : []),
    ];
  }, [deptData, cadreFilter]);
  const maxCadre = Math.max(...cadreBars.map(d => d.value), 1);

  const profileFaculty = useMemo(() => {
    if (!cadreData?.faculty) return [];
    if (!profileSearch) return cadreData.faculty;
    return cadreData.faculty.filter(f =>
      f.name.toLowerCase().includes(profileSearch.toLowerCase()) ||
      (f.designation || '').toLowerCase().includes(profileSearch.toLowerCase())
    );
  }, [cadreData, profileSearch]);

  const phdPct = totals?.doctorate_percentage ?? 0;
  const certPct = totals?.avg_certification_penetration ?? 0;
  const placePct = totals?.overall_placement_rate ?? 0;

  const openFacultyDrawer = (cadre: CadreFilter) => {
    setDrawerCadre(cadre);
    setProfileSearch('');
    setDrawerOpen(true);
  };

  const openPubDrawer = (year: string = '2026') => {
    setPubYear(year);
    setPubCategoryFilter('all');
    setPubSearch('');
    setPubDrawerOpen(true);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-9 h-9 border-4 border-brand-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-textMuted">Loading Power BI Canvas…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Slicers Bar ── */}
      <div className="bg-surface border border-borderLine rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
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
            onChange={v => { setCadreFilter(v); openFacultyDrawer(v); }}
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
        {/* Quick 2026 Research button */}
        <button
          onClick={() => openPubDrawer('2026')}
          className="px-3.5 py-1.5 rounded-xl font-black text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:brightness-110 transition-all flex items-center gap-1.5"
        >
          <BookOpen className="w-3.5 h-3.5" /> 2026 Research Papers ({pubTrend['2026'] || 0}) <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Department KPI Tiles ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <PBIKpiTile label="Total Students" value={deptData?.student_count ?? 0} color="bg-gradient-to-br from-indigo-600 to-indigo-800" />
        <PBIKpiTile
          label={cadreFilter === 'all' ? 'Total Faculty' : `${cadreFilter} Count`}
          value={
            cadreFilter === 'professors' ? deptData?.professors ?? 0 :
            cadreFilter === 'associate' ? deptData?.associate_professors ?? 0 :
            cadreFilter === 'assistant' ? deptData?.assistant_professors ?? 0 :
            cadreFilter === 'doctorates' ? deptData?.doctorates ?? 0 :
            deptData?.faculty_count ?? 0
          }
          sub={`SFR 1:${deptData?.sfr ?? 0}`}
          color="bg-gradient-to-br from-violet-600 to-violet-800"
          onClick={() => openFacultyDrawer(cadreFilter)}
        />
        <PBIKpiTile
          label="Publications"
          value={deptData?.total_publications ?? 0}
          sub="Click → view papers"
          color="bg-gradient-to-br from-amber-500 to-orange-600"
          onClick={() => openPubDrawer('All')}
        />
        <PBIKpiTile
          label={certProvider === 'all' ? 'Certs Issued' : `${certProvider.toUpperCase()} Certs`}
          value={
            certProvider === 'aws' ? deptData?.student_certifications.aws ?? 0 :
            certProvider === 'nptel' ? deptData?.student_certifications.nptel ?? 0 :
            certProvider === 'azure' ? deptData?.student_certifications.azure ?? 0 :
            certProvider === 'oracle' ? deptData?.student_certifications.oracle ?? 0 :
            certProvider === 'gcp' ? deptData?.student_certifications.gcp ?? 0 :
            certProvider === 'cisco' ? deptData?.student_certifications.cisco ?? 0 :
            deptData?.student_certifications.total ?? 0
          }
          sub={`${deptData?.student_certifications.penetration_rate ?? 0}% penetration`}
          color="bg-gradient-to-br from-cyan-600 to-teal-700"
        />
        <PBIKpiTile
          label="Placement Rate"
          value={`${deptData?.placement_rate ?? 0}%`}
          sub={`Avg ${deptData?.avg_ctc_lpa ?? 0} LPA`}
          color="bg-gradient-to-br from-emerald-600 to-green-700"
        />
        <PBIKpiTile
          label="Ph.D Faculty"
          value={`${phdPct}%`}
          sub={phdPct >= 30 ? '✅ NAAC Compliant' : '⚠ Below 30% Target'}
          color="bg-gradient-to-br from-rose-600 to-pink-700"
          onClick={() => openFacultyDrawer('doctorates')}
        />
      </div>

      {/* ── Visuals Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* KPI Rings */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" /> Dept KPI Rings
          </h4>
          <div className="flex justify-around flex-wrap gap-3">
            <DonutRing pct={phdPct} color="#7c3aed" label="Ph.D Faculty" sub="NAAC: ≥30%" />
            <DonutRing pct={certPct} color="#0891b2" label="Cert Penetration" sub="Student avg" />
            <DonutRing pct={placePct} color="#059669" label="Placement Rate" sub="Final yr" />
          </div>
        </div>

        {/* Publications Trend — Clickable bars */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-amber-600" /> Research by Year
            </h4>
            <span className="text-[10px] text-amber-600 font-bold">Click year →</span>
          </div>
          {pubBars.length > 0 ? (
            <HBarChart
              data={pubBars}
              maxVal={maxPub}
              color="bg-gradient-to-r from-amber-400 to-orange-500"
              onClick={item => openPubDrawer(item.label)}
              activeLabel={pubYear}
            />
          ) : (
            <div className="text-xs text-textMuted text-center py-6">No publication data yet</div>
          )}
          <div className="mt-3 pt-2 border-t border-borderLine text-[10px] text-textMuted">
            💡 Click any year bar to view paper titles, authors & DOI links
          </div>
        </div>

        {/* Faculty Cadre Pyramid — Responds to Cadre slicer */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider flex items-center gap-2">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" /> Cadre Distribution
            </h4>
            {cadreFilter !== 'all' && (
              <span className="text-[10px] font-bold text-brand-primary uppercase">{cadreFilter}</span>
            )}
          </div>
          {cadreBars.length > 0 ? (
            <div className="space-y-2">
              {cadreBars.map(bar => (
                <div key={bar.label}
                  onClick={() => openFacultyDrawer(
                    bar.label.includes('Prof') && !bar.label.includes('Assoc') && !bar.label.includes('Asst') ? 'professors' :
                    bar.label.includes('Assoc') ? 'associate' :
                    bar.label.includes('Asst') ? 'assistant' : 'doctorates'
                  )}
                  className="flex items-center gap-3 p-1 -mx-1 rounded-xl cursor-pointer hover:bg-surface-2/60 transition-all group"
                >
                  <div className="w-28 text-right text-[10px] text-textSecondary font-medium shrink-0 group-hover:text-brand-primary">{bar.label}</div>
                  <div className="flex-1 h-5 bg-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bar.color} flex items-center justify-end pr-2`}
                      style={{ width: `${Math.max(5, (bar.value / maxCadre) * 100)}%` }}
                    >
                      <span className="text-[9px] text-white font-black">{bar.value}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-textMuted pt-1">Click a bar to view individual faculty profiles</div>
            </div>
          ) : (
            <div className="text-xs text-textMuted text-center py-6">No faculty data</div>
          )}
        </div>

        {/* Student Intake by Year */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-cyan-600" /> Student Intake by Year
          </h4>
          {deptData ? (
            <div className="space-y-2">
              {[
                { label: '1st Year', value: deptData.students_by_year.year1, color: 'bg-gradient-to-r from-cyan-500 to-blue-600' },
                { label: '2nd Year', value: deptData.students_by_year.year2, color: 'bg-gradient-to-r from-blue-500 to-indigo-600' },
                { label: '3rd Year', value: deptData.students_by_year.year3, color: 'bg-gradient-to-r from-indigo-500 to-violet-600' },
                { label: '4th Year', value: deptData.students_by_year.year4, color: 'bg-gradient-to-r from-violet-500 to-purple-600' },
              ].map(row => {
                const total = deptData.student_count || 1;
                return (
                  <div key={row.label} className="flex items-center gap-2 text-xs">
                    <div className="w-16 text-right text-[10px] text-textSecondary shrink-0">{row.label}</div>
                    <div className="flex-1 h-5 bg-surface-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${row.color} flex items-center justify-end pr-2 transition-all duration-700`}
                        style={{ width: `${Math.max(3, (row.value / total) * 100)}%` }}
                      >
                        <span className="text-[9px] font-black text-white">{row.value}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="text-[10px] text-textMuted pt-1">Total: {deptData.student_count} students</div>
            </div>
          ) : (
            <div className="text-xs text-textMuted text-center py-6">No enrollment data</div>
          )}
        </div>

        {/* Certifications by Provider — Responds to Provider slicer */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider flex items-center gap-2">
              <BadgeCheck className="w-3.5 h-3.5 text-teal-600" /> Certifications
            </h4>
            {certProvider !== 'all' && (
              <span className="text-[10px] font-bold text-teal-600 uppercase">{certProvider}</span>
            )}
          </div>
          {deptData ? (
            <div className="space-y-2">
              {[
                { label: '🔶 AWS', value: deptData.student_certifications.aws, color: 'bg-orange-500', active: certProvider === 'aws' },
                { label: '🔴 NPTEL', value: deptData.student_certifications.nptel, color: 'bg-red-500', active: certProvider === 'nptel' },
                { label: '🔷 Azure', value: deptData.student_certifications.azure, color: 'bg-blue-500', active: certProvider === 'azure' },
                { label: '🔴 Oracle', value: deptData.student_certifications.oracle, color: 'bg-red-700', active: certProvider === 'oracle' },
                { label: '🟢 GCP', value: deptData.student_certifications.gcp, color: 'bg-teal-500', active: certProvider === 'gcp' },
                { label: '🩵 Cisco', value: deptData.student_certifications.cisco, color: 'bg-teal-700', active: certProvider === 'cisco' },
              ].filter(r => certProvider === 'all' || r.active).map(row => {
                const maxV = Math.max(deptData.student_certifications.aws, deptData.student_certifications.nptel, deptData.student_certifications.azure, 1);
                return (
                  <div key={row.label} className="flex items-center gap-2 text-xs">
                    <div className="w-20 text-right text-[10px] text-textSecondary shrink-0">{row.label}</div>
                    <div className="flex-1 h-4 bg-surface-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${row.color} flex items-center justify-end pr-1.5`}
                        style={{ width: `${Math.max(3, (row.value / maxV) * 100)}%` }}
                      >
                        <span className="text-[9px] font-black text-white">{row.value}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-borderLine flex items-center justify-between text-[10px]">
                <span className="text-textMuted">Total: <span className="font-black text-cyan-600">{deptData.student_certifications.total}</span></span>
                <span className="font-bold text-cyan-600">{deptData.student_certifications.penetration_rate}% penetration</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-textMuted text-center py-6">No certification data</div>
          )}
        </div>

        {/* AICTE SFR Compliance Meter */}
        <div className="bg-surface border border-borderLine rounded-2xl p-4">
          <h4 className="font-black text-textPrimary text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> AICTE SFR Compliance
          </h4>
          {deptData ? (
            <div className="space-y-4">
              {/* Big SFR display */}
              <div className="text-center">
                <div className={`text-4xl font-black ${deptData.sfr_status === 'compliant' ? 'text-emerald-600' : deptData.sfr_status === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                  1:{deptData.sfr || 0}
                </div>
                <div className="text-xs text-textMuted mt-1">Student-to-Faculty Ratio</div>
              </div>
              {/* Status badge */}
              <div className={`text-center py-2 rounded-xl text-xs font-black ${
                deptData.sfr_status === 'compliant' ? 'bg-emerald-500/10 text-emerald-700' :
                deptData.sfr_status === 'warning' ? 'bg-amber-500/10 text-amber-700' :
                'bg-red-500/10 text-red-700'
              }`}>
                {deptData.sfr_status === 'compliant' ? '✅ AICTE Compliant (≤ 1:20)' :
                 deptData.sfr_status === 'warning' ? '⚠️ Approaching Limit (1:21–25)' :
                 '🔴 Exceeds AICTE Limit (> 1:25)'}
              </div>
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] text-textMuted mb-1">
                  <span>1:15</span>
                  <span className="text-emerald-600 font-bold">1:20 ← Ideal</span>
                  <span className="text-red-500">1:25</span>
                </div>
                <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      deptData.sfr_status === 'compliant' ? 'bg-emerald-500' :
                      deptData.sfr_status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, ((deptData.sfr || 0) / 30) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-center">
                <div className="bg-surface-2 rounded-xl p-2">
                  <div className="font-black text-violet-600 text-lg">{deptData.faculty_count}</div>
                  <div className="text-textMuted">Faculty</div>
                </div>
                <div className="bg-surface-2 rounded-xl p-2">
                  <div className="font-black text-indigo-600 text-lg">{deptData.student_count}</div>
                  <div className="text-textMuted">Students</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-textMuted text-center py-6">No SFR data</div>
          )}
        </div>

      </div>

      {/* ── Faculty Profile Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-lg bg-surface border-l border-borderLine shadow-2xl overflow-y-auto flex flex-col">
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
                <p className="text-indigo-200 text-xs mt-0.5">{department} • {cadreData?.total ?? 0} found</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-borderLine sticky top-[72px] z-10 bg-surface">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search by name or designation…"
                  value={profileSearch} onChange={e => setProfileSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-surface-2 border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>
            <div className="flex-1 p-4">
              {cadreLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin w-6 h-6 border-4 border-brand-primary border-t-transparent rounded-full" />
                </div>
              ) : profileFaculty.length === 0 ? (
                <div className="text-center py-16 text-textMuted">
                  <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No faculty profiles found</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {profileFaculty.map(fac => <FacultyCard key={fac.faculty_id} fac={fac} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Research Publications Drawer ── */}
      {pubDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setPubDrawerOpen(false)} />
          <div className="w-full max-w-2xl bg-surface border-l border-borderLine shadow-2xl overflow-y-auto flex flex-col">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-5 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="font-black text-base flex items-center gap-2">
                  <BookOpen className="w-5 h-5" /> Research Publications
                </h3>
                <p className="text-amber-100 text-xs mt-0.5">
                  {department} • Year: <span className="font-black text-white">{pubYear === 'All' ? 'All Years' : pubYear}</span>
                  {pubData && ` • ${pubData.total} papers found`}
                </p>
              </div>
              <button onClick={() => setPubDrawerOpen(false)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-borderLine bg-surface space-y-3 sticky top-[72px] z-10">
              <div className="flex flex-wrap items-center gap-2">
                <select value={pubYear} onChange={e => setPubYear(e.target.value)}
                  className="text-xs bg-surface-2 border border-borderLine rounded-xl px-2.5 py-1.5 font-bold text-textPrimary focus:outline-none"
                >
                  {pubYears.map(yr => (
                    <option key={yr} value={yr}>{yr === 'All' ? 'All Years' : `Year ${yr}`}</option>
                  ))}
                </select>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'journal', label: 'Journals' },
                  { id: 'conference', label: 'Conferences' },
                  { id: 'patent', label: 'Patents' },
                  { id: 'book', label: 'Book Chapters' },
                ].map(c => (
                  <button key={c.id} onClick={() => setPubCategoryFilter(c.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                      pubCategoryFilter === c.id
                        ? 'bg-amber-500 text-white border-transparent'
                        : 'bg-surface-2 text-textSecondary border-borderLine hover:border-amber-500/30'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search by title, author, journal or DOI…"
                  value={pubSearch} onChange={e => setPubSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-surface-2 border border-borderLine rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3">
              {pubLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="animate-spin w-7 h-7 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-2" />
                    <p className="text-xs text-textMuted">Loading {pubYear} publications…</p>
                  </div>
                </div>
              ) : !pubData || pubData.publications.length === 0 ? (
                <div className="text-center py-20">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-25 text-amber-600" />
                  <p className="text-sm font-bold text-textPrimary">No publications found</p>
                  <p className="text-xs text-textSecondary mt-1">
                    No papers for {department} in {pubYear === 'All' ? 'any year' : pubYear} match the selected filters.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-[11px] font-bold text-textMuted px-1">
                    <span>Showing {pubData.publications.length} papers</span>
                    <span>{department} · {pubYear}</span>
                  </div>
                  {pubData.publications.map(pub => <PublicationCard key={pub.id} pub={pub} />)}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HodPowerBiView;
