/**
 * Course Execution Plan helpers that save typing: the context sent for an AI draft, merging that draft into the
 * plan (empty cells only), and filling the student-name cells from the class list (no AI involved).
 */
import type { ExecPlan } from './execPlan';

const isBlank = (v: unknown) => !String(v ?? '').trim();
const cut = (v: unknown, n: number) => String(v ?? '').slice(0, n);

/** What the AI drafts from: the subject, its syllabus and outcomes, and the plan's units and weeks */
export function execAiInput(plan: ExecPlan, ctx: { allot: any; syllabus?: any; lessonPlan?: any; deptTools?: string }) {
  const a = ctx.allot || {};
  const outcomes = (ctx.syllabus?.outcomes?.length ? ctx.syllabus.outcomes : ctx.lessonPlan?.outcomes || [])
    .filter((o: any) => o?.text).slice(0, 12).map((o: any) => ({ code: cut(o.code, 10), text: cut(o.text, 600) }));
  return {
    subject: cut(plan.initial.subject_title || a.subject_name, 200), semester: cut(a.semester_label, 10), department: cut(a.department, 80),
    regulation: cut(ctx.syllabus?.regulation, 20),
    objectives: cut(ctx.syllabus?.objectives || ctx.lessonPlan?.objectives, 4000),
    outcomes,
    units: plan.brief.filter(u => u.heading || u.topics).slice(0, 12)
      .map(u => ({ unit: cut(u.unit, 20), heading: cut(u.heading, 200), topics: cut(u.topics, 3000), cos: cut(u.cos, 80), hours: cut(u.hours, 10) })),
    weeks: plan.weekly.slice(0, 30).map(w => ({ week: cut(w.week, 5), topic: cut(w.topic, 1500), co: cut(w.co, 80) })),
    teaching_weeks: cut(plan.initial.teaching_weeks, 5), hours_per_week: cut(plan.initial.hours_per_week, 5), strength: cut(plan.initial.strength, 5),
    dept_tools: cut(ctx.deptTools, 1000),
  };
}

export interface ExecDraft {
  vision: string; competencies: string; industry_problem: string; faculty_tool: string; tool_a: string; tool_b: string; tool_c: string;
  assessment: string; support: string;
  units: { unit: string; tool: string; evidence: string }[];
  weeks: { week: string; method: string; activity: string; tool: string; deliverable: string }[];
  experts: { role: string; specialization: string; topic: string; mode: string; outcomes: string }[];
  teams: { week: string; tool: string; feature: string; objective: string }[];
}

/** Put the AI draft into every cell that is still empty; what the faculty member typed is never changed */
export function applyExecDraft(plan: ExecPlan, d: ExecDraft): { plan: ExecPlan; filled: number } {
  let filled = 0;
  const fill = <T extends Record<string, string>>(row: T, patch: Partial<Record<keyof T, string>>): T => {
    const out = { ...row };
    for (const [k, v] of Object.entries(patch)) if (v && isBlank((out as any)[k])) { (out as any)[k] = String(v).trim(); filled++; }
    return out;
  };
  const byWeek = <R extends { week: string }>(list: R[]) => new Map(list.map(x => [String(x.week).replace(/\D/g, ''), x]));
  const unitNo = (u: string) => String(u).replace(/\D/g, '');
  const weeks = byWeek(d.weeks || []); const teams = byWeek(d.teams || []);
  const units = new Map((d.units || []).map(u => [unitNo(u.unit), u]));
  const next: ExecPlan = {
    initial: fill(plan.initial, { vision: d.vision, competencies: d.competencies, industry_problem: d.industry_problem, faculty_tool: d.faculty_tool,
      tool_a: d.tool_a, tool_b: d.tool_b, tool_c: d.tool_c, assessment: d.assessment, support: d.support } as any),
    brief: plan.brief.map(r => { const u = units.get(unitNo(r.unit)); return u && (r.heading || r.topics) ? fill(r, { tool: u.tool, evidence: u.evidence }) : r; }),
    weekly: plan.weekly.map(r => { const w = weeks.get(String(r.week).replace(/\D/g, '')); return w ? fill(r, { method: w.method, activity: w.activity, tool: w.tool, deliverable: w.deliverable }) : r; }),
    experts: plan.experts.map((r, i) => { const e = d.experts?.[i]; return e ? fill(r, { role: e.role, specialization: e.specialization, topic: e.topic, mode: e.mode, outcomes: e.outcomes }) : r; }),
    teams: plan.teams.map(r => { const t = teams.get(String(r.week).replace(/\D/g, '')); return t ? fill(r, { tool: t.tool, feature: t.feature, objective: t.objective }) : r; }),
  };
  return { plan: next, filled };
}

/**
 * Students for the weekly groups (A and B, three names each) and the weekly team demonstrations, taken from the
 * class list in turn so that everyone gets a turn. Fills empty cells only.
 */
export function fillNamesFromClass(plan: ExecPlan, students: string[]): { plan: ExecPlan; filled: number } {
  const names = students.map(s => String(s || '').trim()).filter(Boolean);
  if (!names.length) return { plan, filled: 0 };
  let filled = 0; let next = 0;
  const take = (k: number) => Array.from({ length: k }, () => names[(next++) % names.length]);
  const weekly = plan.weekly.map(r => {
    const a = take(3).join(', '); const b = take(3).join(', ');
    const out = { ...r };
    if (isBlank(out.group_a)) { out.group_a = a; filled++; }
    if (isBlank(out.group_b)) { out.group_b = b; filled++; }
    return out;
  });
  const teams = plan.teams.map(r => {
    const [x, y, z] = take(3);
    const out = { ...r };
    if (isBlank(out.s1) && isBlank(out.s2) && isBlank(out.s3)) { out.s1 = x!; out.s2 = y!; out.s3 = z!; filled += 3; }
    return out;
  });
  return { plan: { ...plan, weekly, teams }, filled };
}
