
/**
 * VIOLET Local PostgreSQL Database Configuration
 *
 * Loads database connection settings from environment variables
 * without logging or exposing secrets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  maxConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  ssl?: boolean | object;
}

/**
 * Loads .env configuration when variables have not already
 * been provided by the runtime.
 */
function ensureEnvLoaded(): void {
  if (process.env.VIOLET_DB_HOST && process.env.VIOLET_DB_USER) {
    return;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../../../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const eqIdx = trimmed.indexOf('=');

        if (eqIdx === -1) {
          continue;
        }

        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();

        // Remove matching surrounding quotes.
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (key && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore unreadable .env files.
    }
  }
}

/**
 * Returns the PostgreSQL configuration.
 */
export function getDatabaseConfig(): DatabaseConfig {
  ensureEnvLoaded();

  const host = process.env.VIOLET_DB_HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.VIOLET_DB_PORT || '5432', 10);
  const database = process.env.VIOLET_DB_NAME || 'violet_db';
  const user = process.env.VIOLET_DB_USER || 'violet_app';
  const password = process.env.VIOLET_DB_PASSWORD || undefined;

  return {
    host,
    port,
    database,
    user,
    password,
    maxConnections: Number.parseInt(
      process.env.VIOLET_DB_POOL_MAX || '20',
      10
    ),
    idleTimeoutMillis: Number.parseInt(
      process.env.VIOLET_DB_IDLE_TIMEOUT || '30000',
      10
    ),
    connectionTimeoutMillis: Number.parseInt(
      process.env.VIOLET_DB_CONNECT_TIMEOUT || '5000',
      10
    ),
    ssl: process.env.VIOLET_DB_SSL === 'true',
  };
}
