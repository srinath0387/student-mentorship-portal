/**
 * AI first drafts: ask the API for a ticket (login, ownership and daily-limit check), then send the form's context to
 * the AI-drafting function, which answers with a draft in the form's exact shape. The page fills only empty cells.
 */
import { api } from './api';

export type AiKind = 'exec_plan' | 'profile';

export async function requestAiDraft<T = any>(kind: AiKind, ref: string | undefined, input: unknown): Promise<{ draft: T; remaining: number }> {
  const t: { ticket: string; url: string; remaining: number } = await api.getAiTicket(kind, ref);
  const res = await fetch(t.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.ticket}` },
    body: JSON.stringify({ kind, input }),
  }).catch(() => null);
  if (!res) throw new Error('Could not reach the AI service. Check the internet connection and try again.');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `The AI could not draft this (error ${res.status}).`);
  return { draft: body.draft as T, remaining: t.remaining };
}

/** True when the cell has nothing in it yet */
export const isBlank = (v: unknown) => !String(v ?? '').trim();
