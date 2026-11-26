import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { Pool, PoolClient, types } from 'pg';
import { runMigrations } from './migrate';
import { seedDemoData } from './seed';

// COUNT() and SUM() return bigint, which node-postgres gives as strings by default.
// Our numbers are small (tiyn amounts, counts), so parse them as numbers.
types.setTypeParser(20, (value) => Number(value));

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Database');
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://food:food@localhost:5433/food_delivery',
  });

  /** Where the numbered migration files live, from the compiled output. */
  static readonly migrationsDir = join(__dirname, '..', '..', 'sql', 'migrations');

  async onModuleInit() {
    // The server will not serve a request against a schema it has not finished
    // bringing up to date: a failure here stops the start-up.
    const result = await runMigrations(this.pool, DbService.migrationsDir, (message) => this.log.log(message));
    const seeded = await seedDemoData(this.pool);
    const seedNote = seeded ? ', demo data created' : '';
    this.log.log(
      result.applied.length
        ? `Schema ready: ${result.applied.length} migration(s) applied${seedNote}`
        : `Schema ready: nothing to apply${seedNote}`,
    );
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /** Runs `fn` in one transaction: everything is saved together or nothing is. */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
