import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DbService } from '../db/db.service';

const STARTED_AT = Date.now();

/**
 * Is the server alive, and can it still reach its database?
 *
 * Two separate questions, so there are two answers. A process that is running
 * but cannot reach PostgreSQL is not healthy, and saying "ok" in that state
 * would keep a broken instance in the rotation behind any load balancer.
 *
 * Public on purpose: the thing that checks it is a monitor or a container
 * runtime, neither of which has a password. Nothing here reveals anything about
 * the data — no counts, no names, no versions of anything but this project.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  /** Cheap: answers as long as the process can answer at all. */
  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000) };
  }

  /** Honest: answers only when the database answers too. */
  @Get()
  async ready() {
    const started = Date.now();
    try {
      await this.db.pool.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'unreachable',
        message: 'The database is not answering.',
      });
    }
    return {
      status: 'ok',
      database: 'ok',
      databaseLatencyMs: Date.now() - started,
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      startedAt: new Date(STARTED_AT).toISOString(),
    };
  }
}
