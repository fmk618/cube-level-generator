import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectTimeoutMs: number;
};

// 内置默认连接（内部试用 / EXE 直连）。正式分发前请改强密码并收紧 IP。
const BUILTIN_DEFAULT: DbConfig = {
  host: '43.138.250.66',
  port: 3306,
  user: 'cube_level_generator',
  password: '123456',
  database: 'cube_level_generator',
  connectTimeoutMs: 10000,
};

function readOptionalLocalConfig(): Partial<DbConfig> | null {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.join(dir, 'db.config.json'),
      path.join(process.cwd(), 'electron/db/db.config.json'),
      path.join(process.cwd(), 'db.config.json'),
    ];
    for (const filePath of candidates) {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<DbConfig>;
      return raw;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveDbConfig(): DbConfig {
  const local = readOptionalLocalConfig() ?? {};
  return {
    host: process.env.DB_HOST || local.host || BUILTIN_DEFAULT.host,
    port: Number(process.env.DB_PORT || local.port || BUILTIN_DEFAULT.port),
    user: process.env.DB_USER || local.user || BUILTIN_DEFAULT.user,
    password: process.env.DB_PASSWORD || local.password || BUILTIN_DEFAULT.password,
    database: process.env.DB_NAME || local.database || BUILTIN_DEFAULT.database,
    connectTimeoutMs: Number(
      process.env.DB_CONNECT_TIMEOUT_MS || local.connectTimeoutMs || BUILTIN_DEFAULT.connectTimeoutMs,
    ),
  };
}
