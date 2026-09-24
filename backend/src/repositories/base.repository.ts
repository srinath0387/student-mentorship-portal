/**
 * repositories/base.repository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2.8 — Shared query helpers used by all domain repositories.
 *
 * Provides:
 *   - buildWhereClause()   — builds parameterized WHERE clauses from filters
 *   - paginate()           — applies LIMIT/OFFSET from request query params
 *   - toSnakeCase()        — converts camelCase keys to snake_case for DB inserts
 *   - buildUpdateSet()     — builds SET clause for partial UPDATE queries
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../db';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Execute a parameterized query against the DB pool.
 * Thin wrapper that re-uses the existing db module.
 */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await db.query(sql, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

/**
 * Build a WHERE clause from a filter map.
 * Only includes keys with non-undefined, non-null values.
 *
 * @param filters     Record of column → value pairs
 * @param startIndex  Starting $N parameter index (default 1)
 * @returns { clause: 'WHERE col1=$1 AND col2=$2', values: [...] }
 *
 * @example
 *   buildWhereClause({ department: 'CSE', year: '3rd Year' })
 *   // → { clause: 'WHERE department=$1 AND year=$2', values: ['CSE', '3rd Year'] }
 */
export function buildWhereClause(
  filters: QueryParams,
  startIndex = 1
): { clause: string; values: any[] } {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = startIndex;

  for (const [col, val] of Object.entries(filters)) {
    if (val === undefined || val === null) continue;
    conditions.push(`${col} = $${idx++}`);
    values.push(val);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

/**
 * Build a SET clause for UPDATE queries from a partial update map.
 * Skips undefined and null values (only updates provided fields).
 *
 * @param updates     Record of column → new value
 * @param startIndex  Starting $N parameter index (default 1)
 * @returns { setClause: 'col1=$1, col2=$2', values: [...] }
 *
 * @example
 *   buildUpdateSet({ name: 'Alice', department: 'CSE' })
 *   // → { setClause: 'name=$1, department=$2', values: ['Alice', 'CSE'] }
 */
export function buildUpdateSet(
  updates: QueryParams,
  startIndex = 1
): { setClause: string; values: any[] } {
  const parts: string[] = [];
  const values: any[] = [];
  let idx = startIndex;

  for (const [col, val] of Object.entries(updates)) {
    if (val === undefined) continue;
    parts.push(`${col} = $${idx++}`);
    values.push(val ?? null);
  }

  return { setClause: parts.join(', '), values };
}

/**
 * Parse pagination parameters from request query string.
 * Defaults: page=1, limit=50, maxLimit=500
 */
export function parsePagination(
  query: Record<string, any>,
  defaultLimit = 50,
  maxLimit = 500
): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(query.limit as string) || defaultLimit)
  );
  return { limit, offset: (page - 1) * limit, page };
}

/**
 * Safely coerce a value to uppercase string or null.
 * Useful for normalizing roll numbers and IDs.
 */
export function toUpperOrNull(val: any): string | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  return String(val).trim().toUpperCase();
}
