import { Pool, type PoolClient } from 'pg';

// One pool per server process. Kept on globalThis so hot reloads in development
// do not open a new pool on every file save.
const g = globalThis as unknown as { __leedPool?: Pool };

/** False when DATABASE_URL is not set: the app then runs on in-memory demo data. */
export const hasDb = Boolean(process.env.DATABASE_URL);

function pool(): Pool {
  if (!g.__leedPool) {
    g.__leedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return g.__leedPool;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
