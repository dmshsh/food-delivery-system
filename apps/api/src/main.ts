import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ConfigError, readConfig } from './config';

/**
 * Headers every answer carries.
 *
 * Small, and all about what a browser is allowed to do with the page:
 *   - nosniff          a file served as text is never guessed to be a script
 *   - DENY framing     the site cannot be put in a frame on someone else's page,
 *                      where an invisible layer over it would collect clicks
 *   - no-referrer…     the address of our page is not sent to other sites
 *   - no HSTS here     that belongs to whatever terminates TLS in front of this
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.removeHeader('X-Powered-By'); // no need to advertise what is running here
  next();
}

async function bootstrap() {
  const log = new Logger('Bootstrap');

  let config;
  try {
    config = readConfig();
  } catch (error) {
    // A misconfigured server must not start and then misbehave later: it says
    // what is wrong and stops.
    log.error(error instanceof ConfigError ? error.message : String(error));
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(securityHeaders);

  // Behind the Next.js proxy (and behind any load balancer), the address of the
  // caller arrives in X-Forwarded-For. Without this, every request looks like it
  // came from the proxy, and the address limiter would be measuring the proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // Finish the requests already in flight before the process goes away, instead
  // of cutting them off mid-transaction.
  app.enableShutdownHooks();

  await app.listen(config.port);
  log.log(`Food Delivery API: http://localhost:${config.port}/api (synthetic demo, simulated payments)`);
  log.log(`Environment: ${config.isProduction ? 'production' : 'development'} · health: /api/health`);
  if (!config.isProduction) {
    log.warn('Development mode: the default JWT secret is in use and reset links are returned in the answer.');
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.log(`${signal} received, shutting down.`);
      void app.close().then(() => process.exit(0));
    });
  }
}

bootstrap();
