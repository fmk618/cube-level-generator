import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import { resolveDbConfig } from './config.ts';

let pool: Pool | null = null;
let resetting: Promise<void> | null = null;

function createPool(): Pool {
  const config = resolveDbConfig();
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    // 丢弃空闲过久的连接，降低被服务端 wait_timeout 关掉后仍被取出的概率
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: config.connectTimeoutMs,
  });
}

export function getPool(): Pool {
  if (pool) return pool;
  pool = createPool();
  return pool;
}

/** 连接已被关闭 / 协议断开等，应重建连接池后重试 */
export function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; errno?: number };
  const message = String(err.message ?? '');
  if (message.includes("Can't add new command when connection is in closed state")) {
    return true;
  }
  if (message.includes('Connection lost')) return true;
  if (message.includes('server has gone away')) return true;
  const codes = new Set([
    'PROTOCOL_CONNECTION_LOST',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    'PROTOCOL_ENQUEUE_AFTER_QUIT',
    'POOL_CLOSED',
  ]);
  return Boolean(err.code && codes.has(err.code));
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  try {
    await current.end();
  } catch {
    // 关闭过程中连接可能已死，忽略
  }
}

/** 丢弃当前连接池，下次 getPool 会新建（串行化，避免并发 reset） */
export async function resetPool(): Promise<void> {
  if (resetting) {
    await resetting;
    return;
  }
  resetting = (async () => {
    await closePool();
  })();
  try {
    await resetting;
  } finally {
    resetting = null;
  }
}
