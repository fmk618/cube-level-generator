import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import { resolveDbConfig } from './config.ts';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const config = resolveDbConfig();
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
    connectTimeout: config.connectTimeoutMs,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
