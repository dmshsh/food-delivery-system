/**
 * The settings the server reads from its environment, checked once at start-up.
 *
 * A server that starts with a missing or obviously wrong setting fails later,
 * under load, in a way that looks like a bug in the code. Checking here means a
 * misconfigured deployment refuses to start and says exactly what is wrong.
 */

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  isProduction: boolean;
  /** Where the browser loads the site from, for the links in reset emails. */
  siteUrl: string;
}

export const DEV_JWT_SECRET = 'dev-only-secret-change-me';

export class ConfigError extends Error {}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be a whole number between 1 and 65535 (got "${env.PORT}").`);
  }

  const databaseUrl = env.DATABASE_URL ?? 'postgres://food:food@localhost:5433/food_delivery';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must start with postgres:// or postgresql://.');
  }

  const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
  // The development default is published in this repository, so in production it
  // is not a secret at all: anyone could sign a token for any account.
  if (isProduction && jwtSecret === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET must be set in production: the development default is public.');
  }
  if (isProduction && jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters in production.');
  }

  const siteUrl = env.SITE_URL ?? 'http://localhost:3000';

  if (problems.length) {
    throw new ConfigError(`The server cannot start:\n  - ${problems.join('\n  - ')}`);
  }
  return { port, databaseUrl, jwtSecret, isProduction, siteUrl };
}
