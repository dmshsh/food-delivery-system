import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool, PoolClient, types } from 'pg';
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

  async onModuleInit() {
    const schema = readFileSync(join(__dirname, '..', '..', 'sql', 'schema.sql'), 'utf8');
    await this.pool.query(schema);
    const seeded = await seedDemoData(this.pool);
    this.log.log(seeded ? 'Schema ready, demo data created' : 'Schema ready');
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
