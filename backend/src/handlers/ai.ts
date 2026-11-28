/**
 * AI drafting function — outside the VPC (the API lives in isolated subnets with no internet), reached through its
 * Function URL. Takes an AI ticket issued by the API (POST /ai/ticket) and the form's context, asks Claude in Amazon
 * Bedrock for a first draft, and returns it in the form's exact shape. No database, no stored data.
 *
 * Model: AI_MODEL (default anthropic.claude-opus-5-5); refusals fall back to AI_FALLBACK_MODEL (default
 * anthropic.claude-opus-4-8, open to every Bedrock account). Region: BEDROCK_REGION, else the function's region.
 */
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import Anthropic, { betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk';
import { verifyAiTicket } from '../lib/aiTicket';
import { AiDraftError, AiInputError, DraftClient, draft } from '../lib/aiDrafts';

const MODEL = process.env.AI_MODEL || 'anthropic.claude-opus-5-5';
const FALLBACK = process.env.AI_FALLBACK_MODEL || 'anthropic.claude-opus-4-8';
const MAX_BODY = 200_000;

let client: DraftClient | null = null;
/** Created once per warm container; tests replace it */
export function setClient(c: DraftClient | null) { client = c; }
function getClient(): DraftClient {
  if (!client) {
    client = new AnthropicBedrockMantle({
      awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION,
      // a Bedrock request the model declines is retried on the fallback model
      middleware: [betaRefusalFallbackMiddleware([{ model: FALLBACK }])],
    }) as unknown as DraftClient;
  }
  return client;
}

const reply = (statusCode: number, body: any) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const handler = async (event: any) => {
  const method = event?.requestContext?.http?.method || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };   // CORS is answered by the Function URL configuration
  if (method !== 'POST') return reply(405, { error: 'Use POST' });

  const raw = event?.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event?.body || '';
  if (raw.length > MAX_BODY) return reply(413, { error: 'Too much text was sent. Shorten the syllabus topics and try again.' });
  let body: any;
  try { body = JSON.parse(raw || '{}'); } catch { return reply(400, { error: 'The request was not valid JSON.' }); }

  const auth = String(event?.headers?.authorization || event?.headers?.Authorization || '');
  const ticket = verifyAiTicket(auth.replace(/^Bearer\s+/i, '') || String(body?.ticket || ''));
  if (!ticket) return reply(401, { error: 'Your AI request has expired. Press the button again.' });
  if (body?.kind !== ticket.kind) return reply(400, { error: 'This ticket is for a different form.' });

  const started = Date.now();
  try {
    const out = await draft(getClient(), MODEL, ticket.kind, body?.input);
    console.log(JSON.stringify({ ai: ticket.kind, email: ticket.email, ms: Date.now() - started, usage: out.usage }));
    return reply(200, { draft: out.draft, model: MODEL });
  } catch (err: any) {
    if (err instanceof AiInputError) return reply(400, { error: err.message });
    if (err instanceof AiDraftError) return reply(502, { error: err.message });
    console.error('[ai] draft failed', ticket.kind, err?.status, err?.message);
    if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.AuthenticationError)
      return reply(503, { error: 'AI drafting is not switched on yet: the Claude model needs to be enabled in Amazon Bedrock for this AWS account. Please tell the portal admin.' });
    if (err instanceof Anthropic.RateLimitError) return reply(429, { error: 'Many people are drafting right now. Please try again in a minute.' });
    if (err instanceof Anthropic.APIConnectionError) return reply(503, { error: 'Could not reach the AI service. Please try again.' });
    return reply(502, { error: 'The AI could not draft this right now. Please try again, or fill it in by hand.' });
  }
};
