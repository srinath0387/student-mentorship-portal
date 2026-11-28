/**
 * AI first drafts for the long forms faculty fill: the Course Execution Plan (from the syllabus, course outcomes and the
 * week-by-week topics) and the descriptive parts of the Faculty Comprehensive Profile.
 *
 * The model only drafts planning text and descriptions. It never invents people, companies, dates, links, marks or
 * anything that happened — those stay with the faculty member. The page fills only cells that are still empty.
 */
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AiKind } from './aiTicket';

const s = (max: number) => z.string().max(max);
const opt = (max: number) => z.string().max(max).optional().default('');

// ── Course Execution Plan ───────────────────────────────────────────────────────────────────────────────────
export const ExecPlanInput = z.object({
  subject: s(200), semester: s(10), department: s(80), regulation: opt(20),
  objectives: opt(4000),
  outcomes: z.array(z.object({ code: s(10), text: s(600) })).max(12).default([]),
  units: z.array(z.object({ unit: s(20), heading: opt(200), topics: opt(3000), cos: opt(80), hours: opt(10) })).max(12).default([]),
  weeks: z.array(z.object({ week: s(5), topic: opt(1500), co: opt(80) })).max(30).default([]),
  teaching_weeks: opt(5), hours_per_week: opt(5), strength: opt(5), dept_tools: opt(1000),
});
export type ExecPlanInputT = z.infer<typeof ExecPlanInput>;

export const ExecPlanDraft = z.object({
  vision: z.string(),
  competencies: z.string(),
  industry_problem: z.string(),
  faculty_tool: z.string(),
  tool_a: z.string(), tool_b: z.string(), tool_c: z.string(),
  assessment: z.string(),
  support: z.string(),
  units: z.array(z.object({ unit: z.string(), tool: z.string(), evidence: z.string() })),
  weeks: z.array(z.object({ week: z.string(), method: z.string(), activity: z.string(), tool: z.string(), deliverable: z.string() })),
  experts: z.array(z.object({ role: z.string(), specialization: z.string(), topic: z.string(), mode: z.enum(['Online', 'In-campus']), outcomes: z.string() })),
  teams: z.array(z.object({ week: z.string(), tool: z.string(), feature: z.string(), objective: z.string() })),
});
export type ExecPlanDraftT = z.infer<typeof ExecPlanDraft>;

const EXEC_SYSTEM = `You draft the Course Execution Plan of one subject for a faculty member at an engineering college in Andhra Pradesh, India (JNTUA-affiliated, B.Tech). The department's template asks for an initial plan, a unit-wise brief, a week-by-week plan, two industry expert sessions and weekly student team demonstrations. The faculty member reviews and edits your draft before submitting it.

How to write it:
- Base everything on the syllabus units, course outcomes and week-by-week topics you are given. Do not add topics that are not in the syllabus.
- Make it industry-relevant: name real, widely used tools that students can get for free (open-source software, free tiers, community editions, software common in college labs). Group A, B and C each get a different tool related to the faculty-led tool, so the three groups can compare.
- About 70% of the hours are classroom teaching and 30% online or student-collaboration work; plan activities to match.
- vision: one or two sentences consolidating the course outcomes.
- competencies: exactly three numbered lines, each starting with an action verb (Bloom's taxonomy), specific to this subject.
- industry_problem: one or two real industry problems or applications this subject helps solve, in two or three sentences.
- faculty_tool: the tool and what it will be used for. tool_a / tool_b / tool_c: "Tool – what the group does with it".
- assessment: how learning will be evidenced (quizzes, lab records, GitHub commits, recorded demos, mini-project), in two or three sentences.
- support: the help a colleague or another department could give (for example a lab in-charge or a faculty member from a related department). Do not name people.
- units: one row per unit given, using the same unit labels, with the tool or activity for that unit and the evidence or deliverable.
- weeks: one row per week given, using the same week numbers. method is a short phrase (for example "Lecture + live demo", "Flipped classroom", "Think-pair-share"); activity says what the teacher and the students do; tool is the tool or feature used that week; deliverable is concrete evidence (worksheet, quiz, screenshot, commit, short report).
- experts: exactly two sessions. Describe the kind of expert needed (role, specialization), the topic and the syllabus unit it links to, the mode, and the expected outcomes. Never invent a person's name, a company, an email address, a LinkedIn link or a date.
- teams: one row per week given, with the tool, the feature a student team demonstrates that week and its learning objective. Never name students.
- Keep each cell short: a phrase, or one or two sentences. Plain text in Indian English, no markdown, no bullet symbols.`;

function execUser(i: ExecPlanInputT): string {
  const lines = [
    `Subject: ${i.subject} (semester ${i.semester}, ${i.department}${i.regulation ? `, regulation ${i.regulation}` : ''})`,
    `Teaching weeks: ${i.teaching_weeks || 'not set'}; instructional hours per week: ${i.hours_per_week || 'not set'}; class strength: ${i.strength || 'not set'}`,
    i.dept_tools ? `Tools the department lists for this subject: ${i.dept_tools}` : '',
    i.objectives ? `Course objectives:\n${i.objectives}` : '',
    i.outcomes.length ? `Course outcomes:\n${i.outcomes.map(o => `${o.code}: ${o.text}`).join('\n')}` : '',
    i.units.length ? `Units:\n${i.units.map(u => `${u.unit}: ${u.heading}${u.hours ? ` (${u.hours} hours)` : ''}${u.cos ? ` [${u.cos}]` : ''}\n  ${u.topics}`).join('\n')}` : '',
    i.weeks.length ? `Week-by-week topics:\n${i.weeks.map(w => `Week ${w.week}: ${w.topic || '(no topic yet)'}${w.co ? ` [${w.co}]` : ''}`).join('\n')}` : '',
  ];
  return `${lines.filter(Boolean).join('\n\n')}\n\nDraft the execution plan.`;
}

// ── Faculty Comprehensive Profile (descriptive parts only) ──────────────────────────────────────────────────
export const PROFILE_DOMAINS = ['Cyber Security', 'Data related', 'Compilers', 'Cloud', 'AI', 'Other Software'] as const;

export const ProfileInput = z.object({
  specialization: opt(200),
  research_areas: z.array(s(150)).max(3).default([]),
  courses: z.array(s(300)).max(8).default([]),
  programmes: z.array(z.object({ id: s(40), title: s(300), organiser: opt(200), role: z.enum(['attended', 'organised']) })).max(40).default([]),
  connections: z.array(z.object({ id: s(40), org: opt(200), designation: opt(150), role: opt(150) })).max(20).default([]),
  creative_count: z.number().int().min(0).max(6).default(0),
});
export type ProfileInputT = z.infer<typeof ProfileInput>;

export const ProfileDraft = z.object({
  programmes: z.array(z.object({ id: z.string(), objectives: z.string(), tech: z.string() })),
  connections: z.array(z.object({ id: z.string(), type: z.string(), expertise: z.string(), domain: z.enum(PROFILE_DOMAINS) })),
  creative: z.array(z.object({ problem: z.string(), idea: z.string(), why: z.string() })),
});
export type ProfileDraftT = z.infer<typeof ProfileDraft>;

const PROFILE_SYSTEM = `You help a faculty member at an engineering college in India fill the descriptive parts of their Faculty Comprehensive Profile. They review everything before saving.

- programmes: for each FDP, training or workshop (by id), write its objectives (one or two sentences) and the technologies or tools it covered (a short comma-separated list), inferred from the title and organiser. If the title is too vague to tell, write a cautious general description rather than inventing specifics.
- connections: for each industry or alumni connection (by id), from the organisation, designation and role: type of industry (Product-based, Service-based, Startup, Research lab, Government, Other), the person's likely area of expertise in a few words, and the closest domain from the list given.
- creative: exactly the number of creative assignment ideas asked for, for student teams, suited to the subjects the faculty member teaches and their research areas. problem: a real-world problem in one sentence; idea: what the students build; why: why it matters, in one sentence.
- Never invent names of people, companies, dates, links, awards or results. Plain text in Indian English, no markdown.`;

function profileUser(i: ProfileInputT): string {
  const lines = [
    i.specialization ? `Specialization: ${i.specialization}` : '',
    i.research_areas.length ? `Research areas: ${i.research_areas.join('; ')}` : '',
    i.courses.length ? `Subjects taught recently: ${i.courses.join('; ')}` : '',
    i.programmes.length ? `Programmes:\n${i.programmes.map(p => `${p.id} (${p.role}): ${p.title}${p.organiser ? ` — ${p.organiser}` : ''}`).join('\n')}` : 'Programmes: none',
    i.connections.length ? `Connections:\n${i.connections.map(c => `${c.id}: ${[c.org, c.designation, c.role].filter(Boolean).join(', ')}`).join('\n')}` : 'Connections: none',
    `Domains to choose from: ${PROFILE_DOMAINS.join(', ')}`,
    `Creative assignment ideas wanted: ${i.creative_count}`,
  ];
  return `${lines.filter(Boolean).join('\n\n')}\n\nDraft the descriptions.`;
}

// ── Running a draft ─────────────────────────────────────────────────────────────────────────────────────────
export class AiInputError extends Error {}
export class AiDraftError extends Error {}

/** The few calls this module makes on the Claude client (the Bedrock Mantle client in production, a stub in tests) */
export interface DraftClient {
  messages: { parse: (params: any) => Promise<any> };
}

const SPECS = {
  exec_plan: { input: ExecPlanInput, output: ExecPlanDraft, system: EXEC_SYSTEM, user: execUser },
  profile: { input: ProfileInput, output: ProfileDraft, system: PROFILE_SYSTEM, user: profileUser },
} as const;

/** Validate the page's context, ask Claude for a draft in the form's exact shape, and return it */
export async function draft(client: DraftClient, model: string, kind: AiKind, rawInput: unknown): Promise<{ draft: ExecPlanDraftT | ProfileDraftT; usage: any }> {
  const spec = SPECS[kind];
  const parsed = spec.input.safeParse(rawInput);
  if (!parsed.success) throw new AiInputError(`The form sent something the AI cannot use: ${parsed.error.issues[0]?.path.join('.') || 'input'} ${parsed.error.issues[0]?.message || ''}`.trim());
  const input: any = parsed.data;
  if (kind === 'exec_plan' && !input.units.length && !input.weeks.length && !input.outcomes.length)
    throw new AiInputError('Add the syllabus (units and topics) or the lesson plan first — the AI drafts the plan from them.');
  const res = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: spec.system,
    messages: [{ role: 'user', content: (spec.user as (x: any) => string)(input) }],
    output_config: { effort: 'medium', format: zodOutputFormat(spec.output as any) },
  });
  if (res.stop_reason === 'refusal') throw new AiDraftError('The AI declined to draft this one. Please fill it in by hand.');
  if (res.stop_reason === 'max_tokens') throw new AiDraftError('The draft was too long to finish. Try again with fewer weeks or shorter topics.');
  if (!res.parsed_output) throw new AiDraftError('The AI reply could not be read. Please try again.');
  return { draft: res.parsed_output, usage: res.usage };
}
