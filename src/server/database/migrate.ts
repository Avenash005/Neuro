/**
 * VIOLET Local PostgreSQL Migration Runner
 * Executes versioned SQL migrations in strict order and tracks state in public.schema_migrations.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './pool';
import { withTransaction } from './client';

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  filepath: string;
}

export interface MigrationRecord {
  version: string;
  name: string;
  applied_at: string;
}

export interface MigrationRunResult {
  success: boolean;
  totalAvailable: number;
  previouslyApplied: number;
  newlyApplied: string[];
  durationMs: number;
  error?: string;
}

function getMigrationsDir(): string {
  // Supports both ESM and direct paths
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, 'migrations');
  } catch {
    return path.resolve(process.cwd(), 'src/server/database/migrations');
  }
}

export function listMigrationFiles(): MigrationFile[] {
  const dir = getMigrationsDir();
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const parts = filename.replace(/\.sql$/, '').split('_');
    const version = parts[0];
    const name = parts.slice(1).join('_');
    return {
      version,
      name,
      filename,
      filepath: path.join(dir, filename),
    };
  });
}

export async function ensureMigrationTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function getAppliedMigrations(): Promise<MigrationRecord[]> {
  await ensureMigrationTable();
  const pool = getPool();
  const res = await pool.query<MigrationRecord>(
    'SELECT version, name, applied_at FROM public.schema_migrations ORDER BY version ASC;'
  );
  return res.rows;
}

export async function runMigrations(): Promise<MigrationRunResult> {
  const start = performance.now();
  await ensureMigrationTable();

  const allFiles = listMigrationFiles();
  const applied = await getAppliedMigrations();
  const appliedSet = new Set(applied.map((m) => m.version));

  const pending = allFiles.filter((f) => !appliedSet.has(f.version));
  const newlyApplied: string[] = [];

  try {
    for (const migration of pending) {
      const sql = fs.readFileSync(migration.filepath, 'utf-8');

      await withTransaction(async (client) => {
        // Execute the migration SQL
        await client.query(sql);

        // Record the migration in schema_migrations
        await client.query(
          `INSERT INTO public.schema_migrations (version, name, applied_at)
           VALUES ($1, $2, now())
           ON CONFLICT (version) DO NOTHING;`,
          [migration.version, migration.name]
        );
      });

      newlyApplied.push(migration.filename);
    }

    const durationMs = Math.round(performance.now() - start);
    return {
      success: true,
      totalAvailable: allFiles.length,
      previouslyApplied: applied.length,
      newlyApplied,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      totalAvailable: allFiles.length,
      previouslyApplied: applied.length,
      newlyApplied,
      durationMs,
      error: errorMsg,
    };
  }
}
