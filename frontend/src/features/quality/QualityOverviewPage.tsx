/**
 * Department Progress — for the principal, director, management, program chair and college admin.
 * Every department side by side: course execution plans, lesson plans & syllabus coverage, events this year,
 * plus an automatic "needs attention" list. Every number opens the department's detail page.
 */
import { AcademicYearPicker } from '../../components/common/AcademicYearPicker';
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, FileSpreadsheet, Presentation, BookOpenCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { BouncingDots } from '../../components/common/BouncingDots';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const btnGhost = 'px-3 py-2 rounded-xl text-xs font-bold border border-borderLine text-textSecondary hover:bg-surface-2 disabled:opacity-50';
const enc = encodeURIComponent;
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const rs = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

type Dept = {
  key: string; department: string; plans_due: string | null;
  plans: { total: number; not_started: number; in_progress: number; ready: number } | null;
  lessons: { total: number; approved: number; submitted: number; missing: number; behind: number; coverage_pct: number } | null;
  events: { total: number; approved: number; awaiting_hod: number; drafts: number; attended: number; spent: number } | null;
  requests: { total: number; reports_due: number; upcoming: number; requested: number; awaiting_hod: number; awaiting_principal: number; approved: number } | null;
};
type Issue = { dept: string; level: 3 | 2 | 1; text: string; to: string };

const links = (d: string) => ({
  plans: `/lesson-plans/execution?department=${enc(d)}`,
  lessons: `/lesson-plans/review?department=${enc(d)}`,
  behind: `/lesson-plans/review?department=${enc(d)}&filter=behind`,
  toApprove: `/lesson-plans/review?department=${enc(d)}&filter=submitted`,
  events: `/events?department=${enc(d)}`,
  eventsHod: `/events?department=${enc(d)}&status=submitted`,
  requests: `/events?department=${enc(d)}&tab=requests`,
});

/** What a principal would want to follow up, most urgent first */
function issuesOf(rows: Dept[], today: string): Issue[] {
  const out: Issue[] = [];
  for (const r of rows) {
    const L = links(r.department);
    const pending = r.plans ? r.plans.not_started + r.plans.in_progress : 0;
    if (r.plans && pending) {
      const overdue = !!r.plans_due && r.plans_due < today;
      out.push({ dept: r.department, level: overdue ? 3 : r.plans.not_started ? 2 : 1, to: L.plans,
        text: `${pending} course execution plan${pending === 1 ? '' : 's'} not complete${overdue ? ` — due ${fmtDate(r.plans_due!)} has passed` : r.plans_due ? `, due ${fmtDate(r.plans_due)}` : ''}` });
    }
    if (r.requests?.awaiting_principal) out.push({ dept: r.department, level: 3, to: L.requests, text: `${r.requests.awaiting_principal} event request${r.requests.awaiting_principal === 1 ? '' : 's'} recommended by the HOD, waiting for Principal approval` });
    if (r.requests?.awaiting_hod) out.push({ dept: r.department, level: 1, to: L.requests, text: `${r.requests.awaiting_hod} event request${r.requests.awaiting_hod === 1 ? '' : 's'} waiting for the HOD's recommendation` });
    if (r.lessons?.behind) out.push({ dept: r.department, level: 3, to: L.behind, text: `${r.lessons.behind} class${r.lessons.behind === 1 ? ' is' : 'es are'} behind the lesson plan schedule` });
    if (r.requests?.reports_due) out.push({ dept: r.department, level: 2, to: L.requests, text: `${r.requests.reports_due} event report${r.requests.reports_due === 1 ? '' : 's'} not written after the event` });
    if (r.lessons?.missing) out.push({ dept: r.department, level: 2, to: L.lessons, text: `${r.lessons.missing} subject${r.lessons.missing === 1 ? '' : 's'} without a submitted lesson plan` });
    if (r.lessons?.submitted) out.push({ dept: r.department, level: 1, to: L.toApprove, text: `${r.lessons.submitted} lesson plan${r.lessons.submitted === 1 ? '' : 's'} waiting for HOD approval` });
    if (r.events?.awaiting_hod) out.push({ dept: r.department, level: 1, to: L.eventsHod, text: `${r.events.awaiting_hod} event report${r.events.awaiting_hod === 1 ? '' : 's'} waiting for HOD approval` });
  }
  return out.sort((a, b) => b.level - a.level || a.dept.localeCompare(b.dept));
}

/** Ready / in progress / not started as one bar */
function PlanBar({ p }: { p: NonNullable<Dept['plans']> }) {
  const w = (n: number) => `${p.total ? (n / p.total) * 100 : 0}%`;
  return (
    <div className="min-w-[150px]">
      <div className="flex h-2 rounded-full overflow-hidden bg-surface-2" role="img" aria-label={`${p.ready} ready, ${p.in_progress} in progress, ${p.not_started} not started`}>
        <span className="bg-emerald-500" style={{ width: w(p.ready) }} />
        <span className="bg-amber-400" style={{ width: w(p.in_progress) }} />
        <span className="bg-rose-400/70" style={{ width: w(p.not_started) }} />
      </div>
      <p className="mt-1 text-[11px] text-textSecondary tabular-nums"><b className="text-textPrimary">{p.ready}</b>/{p.total} ready{p.not_started ? ` · ${p.not_started} not started` : ''}</p>
    </div>
  );
}
function Coverage({ pct }: { pct: number }) {
  return (
    <div className="min-w-[110px]">
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className={`h-full rounded-full ${pct >= 60 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-[11px] text-textSecondary tabular-nums"><b className="text-textPrimary">{pct}%</b> covered</p>
    </div>
  );
}
const Num = ({ n, tone, to, label }: { n: number; tone?: 'warn' | 'bad'; to: string; label: string }) => (
  <Link to={to} className={`inline-flex items-baseline gap-1 rounded-lg px-1.5 py-0.5 hover:bg-surface-2 ${n && tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : n && tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-textSecondary'}`}>
    <b className="text-sm tabular-nums">{n}</b><span className="text-[11px]">{label}</span>
  </Link>
);

export default function QualityOverviewPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['qualityOverview'], queryFn: () => api.getQualityOverview(), staleTime: 60_000 });
  const rows: Dept[] = data?.departments || [];
  const issues = useMemo(() => issuesOf(rows, data?.today || ''), [rows, data?.today]);
  const t = useMemo(() => {
    const sum = (f: (r: Dept) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
    const topics = rows.filter(r => r.lessons?.total).length;
    return {
      plansReady: sum(r => r.plans?.ready || 0), plansTotal: sum(r => r.plans?.total || 0),
      lpApproved: sum(r => r.lessons?.approved || 0), lpTotal: sum(r => r.lessons?.total || 0),
      coverage: topics ? Math.round(sum(r => (r.lessons?.total ? r.lessons.coverage_pct : 0)) / topics) : 0,
      behind: sum(r => r.lessons?.behind || 0),
      events: sum(r => r.events?.approved || 0), spent: sum(r => r.events?.spent || 0),
      due: sum(r => r.requests?.reports_due || 0), awaiting: sum(r => (r.events?.awaiting_hod || 0) + (r.lessons?.submitted || 0)),
    };
  }, [rows]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const sheet = rows.map(r => ({
      Department: r.department,
      'Execution plans': r.plans?.total ?? 0, 'EP ready (90%+)': r.plans?.ready ?? 0, 'EP in progress': r.plans?.in_progress ?? 0, 'EP not started': r.plans?.not_started ?? 0,
      'EP due date': r.plans_due || '',
      'Lesson plans approved': r.lessons?.approved ?? 0, 'LP waiting for HOD': r.lessons?.submitted ?? 0, 'LP not submitted': r.lessons?.missing ?? 0,
      'Syllabus covered %': r.lessons?.coverage_pct ?? 0, 'Classes behind schedule': r.lessons?.behind ?? 0,
      'Event reports approved': r.events?.approved ?? 0, 'Of which attended': r.events?.attended ?? 0, 'Reports waiting for HOD': r.events?.awaiting_hod ?? 0,
      'Requests waiting for Principal': r.requests?.awaiting_principal ?? 0, 'Requests waiting for HOD': r.requests?.awaiting_hod ?? 0,
      'Requests approved': r.requests?.approved ?? 0, 'Event reports due': r.requests?.reports_due ?? 0, 'Upcoming events': r.requests?.upcoming ?? 0,
      'Budget requested (Rs)': Math.round(r.requests?.requested || 0), 'Spent, approved reports (Rs)': Math.round(r.events?.spent || 0),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Department Progress');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issues.map(i => ({ Priority: ['', 'Low', 'Medium', 'High'][i.level], Department: i.dept, 'Needs attention': i.text }))), 'Needs attention');
    XLSX.writeFile(wb, `Department Progress ${String(data?.academic_year || '').replace('–', '-')} (${data?.today || ''}).xlsx`);
  };

  if (isLoading) return <div className="p-10 text-center"><BouncingDots size="md" className="text-textMuted" /></div>;
  if (error || !data) return <div className={`${card} p-6 text-sm text-rose-600`}>{(error as any)?.message || 'Could not load'}</div>;

  const kpis: [string, React.ReactNode, string, React.ElementType][] = [
    ['Course execution plans', <><b>{t.plansReady}</b> <span className="text-base font-bold text-textMuted">/ {t.plansTotal} ready</span></>, t.plansTotal ? `${Math.round((t.plansReady / t.plansTotal) * 100)}% of subjects` : 'No subjects allotted', ClipboardList],
    ['Lesson plans approved', <><b>{t.lpApproved}</b> <span className="text-base font-bold text-textMuted">/ {t.lpTotal}</span></>, `Syllabus covered ${t.coverage}% · ${t.behind} classes behind`, BookOpenCheck],
    ['Events reported this year', <b>{t.events}</b>, `${rs(t.spent)} spent (approved reports)`, Presentation],
    ['Needs follow-up', <b className={t.due + t.awaiting ? 'text-amber-700 dark:text-amber-300' : ''}>{t.due + t.awaiting}</b>, `${t.due} event reports due · ${t.awaiting} awaiting HOD`, AlertTriangle],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Department Progress</h1>
          <p className="text-xs text-textSecondary">Academic year {data.academic_year} · {data.scope === 'All' ? 'all departments' : data.scope} · as of {fmtDate(data.today)}. Click any number to open the details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AcademicYearPicker value={data.academic_year} />
          <button className={btnGhost} onClick={exportExcel} disabled={!rows.length}><FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />Download Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map(([label, value, sub, Icon]) => (
          <div key={label} className={`${card} p-4`}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-textMuted"><Icon className="w-3.5 h-3.5" />{label}</p>
            <p className="mt-1 text-2xl font-black text-textPrimary tabular-nums">{value}</p>
            <p className="text-[11px] text-textSecondary">{sub}</p>
          </div>
        ))}
      </div>

      <div className={`${card} p-4 space-y-2`}>
        <p className="text-sm font-black text-textPrimary">Needs attention</p>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="w-4 h-4" />Nothing pending. Every department is up to date.</p>
        ) : (
          <ul className="divide-y divide-borderLine">
            {issues.slice(0, 12).map((i, n) => (
              <li key={n}>
                <Link to={i.to} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 py-2 hover:bg-surface-2/60 rounded-lg px-1">
                  <span className={`shrink-0 w-16 text-center py-0.5 rounded-full text-[10px] font-black ${i.level === 3 ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' : i.level === 2 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'}`}>
                    {i.level === 3 ? 'High' : i.level === 2 ? 'Medium' : 'Low'}</span>
                  <span className="text-xs font-bold text-textPrimary sm:w-44 sm:shrink-0 sm:truncate">{i.dept}</span>
                  <span className="text-xs text-textSecondary basis-full sm:basis-auto sm:flex-1">{i.text}</span>
                  <ChevronRight className="hidden sm:block w-4 h-4 text-textMuted shrink-0" />
                </Link>
              </li>
            ))}
            {issues.length > 12 && <li className="pt-2 text-[11px] text-textMuted">{issues.length - 12} more in the Excel download.</li>}
          </ul>
        )}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-3 border-b border-borderLine flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-textSecondary">
          <span className="font-black text-textPrimary text-sm mr-auto">By department</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Ready (90%+ filled)</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-amber-400" />In progress</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-rose-400/70" />Not started</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs text-left">
            <thead className="bg-surface-2 text-[10px] uppercase font-bold text-textSecondary">
              <tr>
                <th className="px-3 py-2">Department</th><th className="px-3 py-2">Course execution plans</th><th className="px-3 py-2">Lesson plans</th>
                <th className="px-3 py-2">Syllabus</th><th className="px-3 py-2">Events this year</th><th className="px-3 py-2">Event requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {rows.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-textMuted">No departments with subjects or events yet.</td></tr> : rows.map(r => {
                const L = links(r.department);
                const overdue = !!r.plans_due && r.plans_due < data.today && !!r.plans && r.plans.ready < r.plans.total;
                return (
                  <tr key={r.key} className="align-top">
                    <td className="px-3 py-3 font-bold text-textPrimary whitespace-nowrap">{r.department}</td>
                    <td className="px-3 py-3">
                      {r.plans ? <Link to={L.plans} className="block hover:opacity-80"><PlanBar p={r.plans} /></Link> : <span className="text-textMuted">—</span>}
                      {r.plans_due && <p className={`text-[10px] font-bold ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-textMuted'}`}>Due {fmtDate(r.plans_due)}{overdue ? ' · overdue' : ''}</p>}
                    </td>
                    <td className="px-3 py-3">
                      {r.lessons ? (
                        <div className="flex flex-col items-start">
                          <Num n={r.lessons.approved} to={L.lessons} label={`/ ${r.lessons.total} approved`} />
                          <Num n={r.lessons.submitted} tone="warn" to={L.toApprove} label="waiting for HOD" />
                          <Num n={r.lessons.missing} tone="warn" to={L.lessons} label="not submitted" />
                        </div>
                      ) : <span className="text-textMuted">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {r.lessons ? <><Link to={L.lessons} className="block hover:opacity-80"><Coverage pct={r.lessons.coverage_pct} /></Link><Num n={r.lessons.behind} tone="bad" to={L.behind} label="classes behind" /></> : <span className="text-textMuted">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start">
                        <Num n={r.events?.approved || 0} to={L.events} label={`approved${r.events?.attended ? ` (${r.events.attended} attended)` : ''}`} />
                        <Num n={r.events?.awaiting_hod || 0} tone="warn" to={L.eventsHod} label="waiting for HOD" />
                        {!!r.events?.spent && <span className="px-1.5 text-[11px] text-textSecondary tabular-nums">{rs(r.events.spent)} spent</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start">
                        <Num n={r.requests?.awaiting_principal || 0} tone="bad" to={L.requests} label="waiting for Principal" />
                        <Num n={r.requests?.awaiting_hod || 0} tone="warn" to={L.requests} label="waiting for HOD" />
                        <Num n={r.requests?.upcoming || 0} to={L.requests} label="upcoming" />
                        <Num n={r.requests?.reports_due || 0} tone="bad" to={L.requests} label="reports due" />
                        {!!r.requests?.requested && <span className="px-1.5 text-[11px] text-textSecondary tabular-nums">{rs(r.requests.requested)} requested</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
