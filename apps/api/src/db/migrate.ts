import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';

/**
 * Applying database changes in order, once each.
 *
 * Up to now the whole schema lived in one file that was re-run on every start,
 * written so that running it twice changed nothing. That works until a change
 * cannot be expressed that way — moving a primary key, backfilling a column,
 * splitting a table. Those have to run exactly once, in a known order, and the
 * database has to remember which ones already ran.
 *
 * So: numbered files in sql/migrations, a table that records what has been
 * applied, and each file applied inside its own transaction. A file that fails
 * leaves nothing behind and stops the start-up, rather than leaving the schema
 * half-changed.
 *
 * Two rules that matter more than they look:
 *
 *   - A file that has been applied is never edited. Its checksum is stored, and
 *     a changed file is an error, not a silent re-run: the database in front of
 *     you would no longer match the file that claims to describe it.
 *   - `001_baseline.sql` is the old schema file, and it is still written to be
 *     safe to re-run. That is what lets an existing database adopt this system
 *     without being rebuilt: the baseline is applied, finds everything already
 *     there, changes nothing, and is recorded as done.
 */

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: number;
}

const TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_ms INTEGER NOT NULL DEFAULT 0
  )`;

export function checksumOf(sql: string): string {
  // Line endings differ between machines and must not make a file look changed.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/** Every migration on disk, in the order their names sort. */
export function readMigrations(directory: string): Migration[] {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort(); // 001_, 002_, … so plain string order is the right order
  return files.map((name) => {
    const sql = readFileSync(join(directory, name), 'utf8');
    return { name, sql, checksum: checksumOf(sql) };
  });
}

/**
 * Which migrations still have to run, and whether any applied one has changed
 * underneath us. Pure, so the decision can be tested without a database.
 */
export function planMigrations(
  onDisk: Migration[],
  applied: Map<string, string>,
): { pending: Migration[]; changed: string[]; missing: string[] } {
  const pending: Migration[] = [];
  const changed: string[] = [];
  for (const migration of onDisk) {
    const recorded = applied.get(migration.name);
    if (recorded === undefined) pending.push(migration);
    else if (recorded !== migration.checksum) changed.push(migration.name);
  }
  // Recorded in the database but no longer on disk: someone deleted a migration
  // that has already run, which makes the history unreadable.
  const names = new Set(onDisk.map((m) => m.name));
  const missing = [...applied.keys()].filter((name) => !names.has(name));
  return { pending, changed, missing };
}

/** Applies everything pending. Returns what it did, so the caller can log it. */
export async function runMigrations(
  pool: Pool,
  directory: string,
  log: (message: string) => void = () => undefined,
): Promise<MigrationResult> {
  await pool.query(TABLE);

  const onDisk = readMigrations(directory);
  const recorded = await pool.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const applied = new Map(recorded.rows.map((r) => [r.name, r.checksum]));
  const { pending, changed, missing } = planMigrations(onDisk, applied);

  if (changed.length) {
    throw new Error(
      `These migrations have already been applied but their files have changed: ${changed.join(', ')}. ` +
        'An applied migration must never be edited — add a new one instead.',
    );
  }
  if (missing.length) {
    log(`WARNING: applied migrations are missing from disk: ${missing.join(', ')}`);
  }

  for (const migration of pending) {
    const started = Date.now();
    const client = await pool.connect();
    try {
      // One transaction per file: a migration that fails halfway leaves nothing.
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(name, checksum, duration_ms) VALUES ($1,$2,$3)', [
        migration.name,
        migration.checksum,
        Date.now() - started,
      ]);
      await client.query('COMMIT');
      log(`applied ${migration.name} (${Date.now() - started} ms)`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${migration.name} failed and was rolled back: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  return { applied: pending.map((m) => m.name), alreadyApplied: applied.size };
}
