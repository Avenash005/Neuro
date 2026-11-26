/**
 * VIOLET Local PostgreSQL Connection Pool
 * Manages database connection lifecycle, pooling, and health status.
 */

import { Pool } from 'pg';
import { getDatabaseConfig } from './config';

let poolInstance: Pool | null = null;

export interface DatabaseHealth {
  connected: boolean;
  database: string;
  user: string;
  version: string;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

export function getPool(): Pool {
  if (!poolInstance) {
    const config = getDatabaseConfig();
    poolInstance = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.maxConnections,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      ssl: config.ssl,
    });

    poolInstance.on('error', (err) => {
      // Avoid printing passwords or credential data
      console.error('[VIOLET Database Pool] Unexpected client error:', err.message);
    });
  }

  return poolInstance;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const pool = getPool();
  const start = performance.now();

  try {
    const res = await pool.query(
      'SELECT current_database() as database, current_user as "user", version() as version, now() as timestamp;'
    );
    const latencyMs = Math.round(performance.now() - start);
    const row = res.rows[0];

    return {
      connected: true,
      database: row.database,
      user: row.user,
      version: row.version,
      latencyMs,
      timestamp: new Date(row.timestamp).toISOString(),
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      database: getDatabaseConfig().database,
      user: getDatabaseConfig().user,
      version: 'unknown',
      latencyMs,
      timestamp: new Date().toISOString(),
      error: errorMsg,
    };
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function resetDatabasePool(): Promise<void> {
  await closeDatabasePool();
}
