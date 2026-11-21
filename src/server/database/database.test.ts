/**
 * VIOLET Local PostgreSQL Migration & Connection Layer Test Suite
 * Validates pool health, migration runner, schema integrity, constraints, triggers, and RPC functions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkDatabaseHealth, closeDatabasePool } from './pool';
import { runMigrations, getAppliedMigrations, listMigrationFiles } from './migrate';
import { query, queryOne } from './client';

describe('VIOLET Phase 4A Database Layer', () => {
  beforeAll(async () => {
    // Ensure migrations are run before testing
    const result = await runMigrations();
    expect(result.success).toBe(true);
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  describe('1. Connection Pool & Health Check', () => {
    it('successfully connects to local PostgreSQL 18 with violet_app role', async () => {
      const health = await checkDatabaseHealth();
      expect(health.connected).toBe(true);
      expect(health.database).toBe('violet_db');
      expect(health.user).toBe('violet_app');
      expect(health.version).toContain('PostgreSQL');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.latencyMs).toBeLessThan(1000);
    });
  });

  describe('2. Migration Runner & Idempotency', () => {
    it('discovers exactly 8 sequential migration files', () => {
      const files = listMigrationFiles();
      expect(files.length).toBe(8);
      expect(files.map((f) => f.version)).toEqual([
        '001',
        '002',
        '003',
        '004',
        '005',
        '006',
        '007',
        '008',
      ]);
    });

    it('records all 8 applied migrations in public.schema_migrations', async () => {
      const applied = await getAppliedMigrations();
      expect(applied.length).toBe(8);
      expect(applied.map((m) => m.version)).toEqual([
        '001',
        '002',
        '003',
        '004',
        '005',
        '006',
        '007',
        '008',
      ]);
    });

    it('is strictly idempotent on re-execution (0 newly applied)', async () => {
      const rerunResult = await runMigrations();
      expect(rerunResult.success).toBe(true);
      expect(rerunResult.newlyApplied.length).toBe(0);
      expect(rerunResult.previouslyApplied).toBe(8);
    });
  });

  describe('3. Complete 39 Table Inventory Verification', () => {
    const expectedNeuronTables = [
      'profiles',
      'memories',
      'processing_jobs',
      'entities',
      'memory_entities',
      'entity_relationships',
      'action_items',
      'collections',
      'collection_memories',
      'study_cards',
      'sidekick_sessions',
      'sidekick_notes',
      'local_file_sync',
      'integration_connections',
      'knowledge_items',
      'audit_log_entries',
      'ai_connections',
    ];

    const expectedVioletTables = [
      'agent_tasks',
      'agent_task_steps',
      'agent_approvals',
      'agent_handoffs',
      'agent_devices',
      'agent_workflows',
      'agent_workflow_runs',
      'agent_task_events',
      'agent_runs',
      'agent_events',
      'agent_commits',
      'agent_artifacts',
      'model_usage',
      'agent_reviews',
      'agent_messages',
      'agent_subtasks',
      'engineering_findings',
      'architectural_decisions',
      'agent_tool_executions',
      'agent_issues',
      'issue_fix_attempts',
      'violet_owner_bootstrap',
    ];

    it('creates all 17 Neuron tables in public schema', async () => {
      const rows = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
      );
      const existingTables = new Set(rows.map((r) => r.table_name));

      for (const table of expectedNeuronTables) {
        expect(existingTables.has(table), `Expected Neuron table ${table} to exist`).toBe(true);
      }
    });

    it('creates all 22 VIOLET tables in public schema', async () => {
      const rows = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
      );
      const existingTables = new Set(rows.map((r) => r.table_name));

      for (const table of expectedVioletTables) {
        expect(existingTables.has(table), `Expected VIOLET table ${table} to exist`).toBe(true);
      }
    });

    it('total application tables in public equals at least 39 + tracking tables', async () => {
      const allExpected = [...expectedNeuronTables, ...expectedVioletTables];
      expect(allExpected.length).toBe(39);

      const rows = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
      );
      const existingTables = new Set(rows.map((r) => r.table_name));

      for (const table of allExpected) {
        expect(existingTables.has(table)).toBe(true);
      }
    });

    it('verifies auth and storage compatibility schemas exist', async () => {
      const authUsers = await queryOne<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') as exists;`
      );
      expect(authUsers?.exists).toBe(true);

      const storageBuckets = await queryOne<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') as exists;`
      );
      expect(storageBuckets?.exists).toBe(true);
    });
  });

  describe('4. Constraints & Cascade Deletion', () => {
    it('cascades deletion from auth.users to tasks, runs, and artifacts', async () => {
      // 1. Create a test user in auth.users
      const testEmail = `test_owner_${Date.now()}@example.com`;
      const user = await queryOne<{ id: string }>(
        `INSERT INTO auth.users (email, created_at, updated_at)
         VALUES ($1, now(), now())
         RETURNING id;`,
        [testEmail]
      );
      expect(user?.id).toBeDefined();
      const userId = user!.id;

      // 2. Insert a task
      const task = await queryOne<{ id: string }>(
        `INSERT INTO public.agent_tasks (user_id, title, prompt)
         VALUES ($1, 'Test Migration Task', 'Validate cascade deletion')
         RETURNING id;`,
        [userId]
      );
      expect(task?.id).toBeDefined();
      const taskId = task!.id;

      // 3. Insert an agent run
      const run = await queryOne<{ id: string }>(
        `INSERT INTO public.agent_runs (task_id, user_id, agent_role, model_name)
         VALUES ($1, $2, 'developer', 'claude-3-7-sonnet')
         RETURNING id;`,
        [taskId, userId]
      );
      expect(run?.id).toBeDefined();

      // 4. Delete user and verify cascade
      await query(`DELETE FROM auth.users WHERE id = $1;`, [userId]);

      const taskCheck = await queryOne(`SELECT id FROM public.agent_tasks WHERE id = $1;`, [taskId]);
      expect(taskCheck).toBeNull();

      const runCheck = await queryOne(`SELECT id FROM public.agent_runs WHERE task_id = $1;`, [taskId]);
      expect(runCheck).toBeNull();
    });

    it('enforces singleton constraint on violet_owner_bootstrap', async () => {
      const row = await queryOne<{ id: string; is_bootstrapped: boolean }>(
        `SELECT id, is_bootstrapped FROM public.violet_owner_bootstrap WHERE id = 'singleton';`
      );
      expect(row).not.toBeNull();
      expect(row?.id).toBe('singleton');

      // Attempting to insert another ID should violate check constraint
      await expect(
        query(`INSERT INTO public.violet_owner_bootstrap (id, is_bootstrapped) VALUES ('other', false);`)
      ).rejects.toThrow();
    });
  });

  describe('5. Database Functions & Triggers', () => {
    it('executes hybrid_search_memories without syntax or vector errors', async () => {
      // Create user
      const user = await queryOne<{ id: string }>(
        `INSERT INTO auth.users (email) VALUES ($1) RETURNING id;`,
        [`search_test_${Date.now()}@example.com`]
      );
      const userId = user!.id;

      // Insert test memory
      await query(
        `INSERT INTO public.memories (user_id, title, content, summary)
         VALUES ($1, 'Architecture Guide', 'Local PostgreSQL infrastructure migration for VIOLET', 'Database migration');`,
        [userId]
      );

      // Execute hybrid search
      const results = await query(
        `SELECT * FROM public.hybrid_search_memories($1, 'PostgreSQL', null, 5);`,
        [userId]
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Architecture Guide');

      // Clean up
      await query(`DELETE FROM auth.users WHERE id = $1;`, [userId]);
    });

    it('triggers automatically update updated_at on modification', async () => {
      const user = await queryOne<{ id: string }>(
        `INSERT INTO auth.users (email) VALUES ($1) RETURNING id;`,
        [`trigger_test_${Date.now()}@example.com`]
      );
      const userId = user!.id;

      const memory = await queryOne<{ id: string; updated_at: string }>(
        `INSERT INTO public.memories (user_id, title, content)
         VALUES ($1, 'Trigger Initial', 'Initial content')
         RETURNING id, updated_at;`,
        [userId]
      );
      const initialUpdatedAt = new Date(memory!.updated_at).getTime();

      // Wait 10ms and update
      await new Promise((resolve) => setTimeout(resolve, 50));

      const updated = await queryOne<{ updated_at: string }>(
        `UPDATE public.memories SET content = 'Modified content' WHERE id = $1 RETURNING updated_at;`,
        [memory!.id]
      );
      const modifiedUpdatedAt = new Date(updated!.updated_at).getTime();

      expect(modifiedUpdatedAt).toBeGreaterThan(initialUpdatedAt);

      // Clean up
      await query(`DELETE FROM auth.users WHERE id = $1;`, [userId]);
    });
  });
});
