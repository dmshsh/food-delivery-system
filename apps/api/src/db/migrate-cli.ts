/**
 * Applying migrations without starting the server.
 *
 *   npm run db:migrate
 *
 * Useful in a deployment where the schema is brought up to date as a separate
 * step before the new version starts serving, and useful locally for seeing
 * what would run without waiting for Nest to boot.
 */
import { Pool } from 'pg';
import { join } from 'node:path';
import { runMigrations } from './migrate';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://food:food@localhost:5433/food_delivery',
  });
  try {
    const result = await runMigrations(pool, join(__dirname, '..', '..', 'sql', 'migrations'), (m) =>
      console.log(`  ${m}`),
    );
    console.log(
      result.applied.length
        ? `Applied ${result.applied.length} migration(s); ${result.alreadyApplied} were already in place.`
        : `Nothing to apply; ${result.alreadyApplied} migration(s) already in place.`,
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
