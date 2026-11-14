/**
 * Shared connection helper for the Faculty Selection migrate / rollback scripts.
 * Uses the same environment variables as init-db.ts (DB_HOST, DB_PORT, DB_NAME, DB_USER,
 * DB_PASSWORD or DB_SECRET_ARN, DB_SSL).
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function dbPassword(): Promise<string> {
  if (process.env.DB_PASSWORD) return process.env.DB_PASSWORD;
  if (process.env.DB_SECRET_ARN) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const resp = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
    if (resp.SecretString) return JSON.parse(resp.SecretString).password;
  }
  return 'postgres';
}

/** Run each statement in order inside one transaction; all or nothing. */
export async function runStatements(label: string, statements: string[]): Promise<void> {
  const host = process.env.DB_HOST || 'localhost';
  const pool = new Pool({
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: await dbPassword(),
    database: process.env.DB_NAME || 'advitiyans',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    max: 1,
  });
  const client = await pool.connect();
  console.log(`[${label}] connected to ${host}/${process.env.DB_NAME || 'advitiyans'}`);
  try {
    await client.query('BEGIN');
    for (const s of statements) {
      await client.query(s);
      console.log(`[${label}] ok: ${s.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
    }
    await client.query('COMMIT');
    console.log(`[${label}] done (${statements.length} statements)`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
