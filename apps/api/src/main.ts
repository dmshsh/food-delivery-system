import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Food Delivery API: http://localhost:${port}/api (synthetic demo, simulated payments)`);
}

bootstrap();
