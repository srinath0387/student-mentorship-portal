/**
 * tests/smoke/ai.test.ts — AI first drafts: tickets, the draft rules (with a stand-in Claude client, so no model is
 * called), the AI function's replies, and the API's ticket route (owner check, daily limit).
 */
import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../__mocks__/db');
process.env.SESSION_SIGNING_SECRET = 'ai-test-secret';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/handlers/api').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signSessionToken } = require('../../src/lib/sessionToken');
import { signAiTicket, verifyAiTicket, AI_TICKET_SECONDS } from '../../src/lib/aiTicket';
import { draft, AiInputError, AiDraftError, ExecPlanDraftT } from '../../src/lib/aiDrafts';
import { handler, setClient } from '../../src/handlers/ai';

type Route = [RegExp | string, any[] | ((sql: string, params: any[]) => any[])];
function routeDb(routes: Route[]) {
  const calls: { sql: string; params: any[] }[] = [];
  db.query.mockReset();
  const all: Route[] = [...routes, ['FROM super_admin_credentials', [{ '?column?': 1 }]]];
  db.query.mockImplementation(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    for (const [m, rows] of all) {
      if (typeof m === 'string' ? sql.includes(m) : m.test(sql)) { const r = typeof rows === 'function' ? rows(sql, params) : rows; return { rows: r, rowCount: r.length }; }
    }
    return { rows: [], rowCount: 0 };
  });
  return calls;
}
const FAC = () => `Bearer ${signSessionToken({ role: 'faculty', email: 'ramesh@rgmcet.edu.in' })}`;
const STUDENT = () => `Bearer ${signSessionToken({ role: 'student', email: '23091a0501@rgmcet.edu.in', reg: '23091A0501' })}`;
const AID = '11111111-2222-3333-4444-555555555555';
const allot = { id: AID, faculty_email: 'ramesh@rgmcet.edu.in', subject_name: 'Operating Systems', semester_label: '2-2', section: 'A', department: 'CSE' };

const EXEC_INPUT = {
  subject: 'Operating Systems', semester: '2-2', department: 'CSE',
  outcomes: [{ code: 'CO1', text: 'Analyse CPU scheduling algorithms' }],
  units: [{ unit: 'Unit 1', heading: 'Processes', topics: 'Process states, scheduling', cos: 'CO1', hours: '10' }],
  weeks: [{ week: '1', topic: 'Unit 1: Process states', co: 'CO1' }],
  teaching_weeks: '12', hours_per_week: '4',
};
const DRAFT: ExecPlanDraftT = {
  vision: 'v', competencies: '1. Analyse\n2. Solve\n3. Apply', industry_problem: 'Cloud CPU utilisation', faculty_tool: 'htop', tool_a: 'htop', tool_b: 'top', tool_c: 'pidstat',
  assessment: 'quizzes', support: 'lab in-charge', units: [{ unit: 'Unit 1', tool: 'htop', evidence: 'screenshot' }],
  weeks: [{ week: '1', method: 'Lecture + demo', activity: 'demo', tool: 'htop', deliverable: 'worksheet' }],
  experts: [{ role: 'SRE', specialization: 'Linux performance', topic: 'Scheduling in production', mode: 'Online', outcomes: 'o' }],
  teams: [{ week: '1', tool: 'htop', feature: 'sort by CPU', objective: 'read load' }],
};
const stub = (reply: any) => { const calls: any[] = []; return { calls, client: { messages: { parse: async (p: any) => { calls.push(p); if (reply instanceof Error) throw reply; return reply; } } } }; };

describe('AI tickets', () => {
  it('verify only when untampered and fresh, and never pass as a session token', () => {
    const t = signAiTicket({ email: 'ramesh@rgmcet.edu.in', role: 'faculty', kind: 'exec_plan', ref: AID })!;
    expect(verifyAiTicket(t)).toMatchObject({ email: 'ramesh@rgmcet.edu.in', kind: 'exec_plan', ref: AID });
    expect(verifyAiTicket(t.slice(0, -2) + 'xx')).toBeNull();
    expect(verifyAiTicket(t, Date.now() + (AI_TICKET_SECONDS + 5) * 1000)).toBeNull();
    // a session token is not a ticket, and a ticket is not a session token
    expect(verifyAiTicket(signSessionToken({ role: 'admin', email: 'a@x' }))).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(require('../../src/lib/sessionToken').verifySessionToken(t)).toBeNull();
  });
});

describe('AI draft rules', () => {
  it('sends the syllabus and weeks with the form shape, effort and model; returns the parsed draft', async () => {
    const s = stub({ stop_reason: 'end_turn', parsed_output: DRAFT, usage: { output_tokens: 10 } });
    const out = await draft(s.client, 'anthropic.claude-opus-5-5', 'exec_plan', EXEC_INPUT);
    expect(out.draft).toEqual(DRAFT);
    const p = s.calls[0];
    expect(p.model).toBe('anthropic.claude-opus-5-5');
    expect(p.output_config.effort).toBe('medium');
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p.messages[0].content).toContain('Week 1: Unit 1: Process states [CO1]');
    expect(p.messages[0].content).toContain('CO1: Analyse CPU scheduling algorithms');
    expect(p.system).toMatch(/Never invent a person's name/);
  });

  it('refuses empty or oversized input before calling the model, and explains refusals and cut-off replies', async () => {
    const s = stub({ stop_reason: 'end_turn', parsed_output: DRAFT });
    await expect(draft(s.client, 'm', 'exec_plan', { subject: 'OS', semester: '2-2', department: 'CSE' })).rejects.toBeInstanceOf(AiInputError);
    await expect(draft(s.client, 'm', 'exec_plan', { ...EXEC_INPUT, objectives: 'x'.repeat(5000) })).rejects.toBeInstanceOf(AiInputError);
    expect(s.calls).toHaveLength(0);
    await expect(draft(stub({ stop_reason: 'refusal' }).client, 'm', 'exec_plan', EXEC_INPUT)).rejects.toThrow(/declined/);
    await expect(draft(stub({ stop_reason: 'max_tokens' }).client, 'm', 'exec_plan', EXEC_INPUT)).rejects.toBeInstanceOf(AiDraftError);
    await expect(draft(stub({ stop_reason: 'end_turn', parsed_output: null }).client, 'm', 'exec_plan', EXEC_INPUT)).rejects.toBeInstanceOf(AiDraftError);
  });

  it('profile drafts ask for the number of creative ideas wanted and never send people', async () => {
    const s = stub({ stop_reason: 'end_turn', parsed_output: { programmes: [], connections: [], creative: [] } });
    await draft(s.client, 'm', 'profile', {
      courses: ['Machine Learning'], programmes: [{ id: 'fdp.attended.0', title: 'ATAL FDP on Generative AI', role: 'attended' }],
      connections: [{ id: 'alumni.0', org: 'Infosys, Pune', designation: 'Senior Engineer' }], creative_count: 2,
    });
    const u = s.calls[0].messages[0].content;
    expect(u).toContain('fdp.attended.0 (attended): ATAL FDP on Generative AI');
    expect(u).toContain('alumni.0: Infosys, Pune, Senior Engineer');
    expect(u).toContain('Creative assignment ideas wanted: 2');
  });
});

describe('AI function', () => {
  const call = (body: any, ticket?: string) => handler({ requestContext: { http: { method: 'POST' } }, headers: ticket ? { authorization: `Bearer ${ticket}` } : {}, body: JSON.stringify(body) });
  const T = () => signAiTicket({ email: 'ramesh@rgmcet.edu.in', role: 'faculty', kind: 'exec_plan', ref: AID })!;
  afterEach(() => setClient(null));

  it('needs a valid ticket for the same form', async () => {
    expect((await call({ kind: 'exec_plan', input: EXEC_INPUT })).statusCode).toBe(401);
    expect((await call({ kind: 'profile', input: {} }, T())).statusCode).toBe(400);
  });

  it('returns the draft, and plain messages when Bedrock access is off or the input is unusable', async () => {
    setClient(stub({ stop_reason: 'end_turn', parsed_output: DRAFT, usage: {} }).client);
    const ok = await call({ kind: 'exec_plan', input: EXEC_INPUT }, T());
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).draft.tool_b).toBe('top');

    const denied = Object.create(Anthropic.PermissionDeniedError.prototype);
    setClient(stub(Object.assign(denied, { message: 'no access' })).client);
    const off = await call({ kind: 'exec_plan', input: EXEC_INPUT }, T());
    expect(off.statusCode).toBe(503);
    expect(JSON.parse(off.body).error).toMatch(/enabled in Amazon Bedrock/);

    const bad = await call({ kind: 'exec_plan', input: { subject: 'OS' } }, T());
    expect(bad.statusCode).toBe(400);
  });
});

describe('AI ticket route', () => {
  afterEach(() => { delete process.env.AI_URL; });

  it('is off until the AI function is deployed', async () => {
    routeDb([]);
    expect((await request(app).post('/ai/ticket').set('Authorization', FAC()).send({ kind: 'profile' })).status).toBe(503);
    expect((await request(app).get('/ai/status').set('Authorization', FAC())).body).toMatchObject({ enabled: false });
  });

  it('gives the subject faculty a ticket, records it, and stops at the daily limit; never students', async () => {
    process.env.AI_URL = 'https://ai.example/';
    const calls = routeDb([['FROM subject_allotments WHERE id', [allot]], ['FROM ai_usage', [{ n: 3 }]]]);
    const res = await request(app).post('/ai/ticket').set('Authorization', FAC()).send({ kind: 'exec_plan', ref: AID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ url: 'https://ai.example/', remaining: 16 });
    expect(verifyAiTicket(res.body.ticket)).toMatchObject({ kind: 'exec_plan', ref: AID, email: 'ramesh@rgmcet.edu.in' });
    expect(calls.some(c => c.sql.includes('INSERT INTO ai_usage'))).toBe(true);

    routeDb([['FROM subject_allotments WHERE id', [{ ...allot, faculty_email: 'someone@rgmcet.edu.in' }]], ['FROM ai_usage', [{ n: 0 }]]]);
    expect((await request(app).post('/ai/ticket').set('Authorization', FAC()).send({ kind: 'exec_plan', ref: AID })).status).toBe(403);

    routeDb([['FROM ai_usage', [{ n: 20 }]]]);
    const limit = await request(app).post('/ai/ticket').set('Authorization', FAC()).send({ kind: 'profile' });
    expect(limit.status).toBe(429);

    expect((await request(app).post('/ai/ticket').set('Authorization', STUDENT()).send({ kind: 'profile' })).status).toBe(403);
  });
});
