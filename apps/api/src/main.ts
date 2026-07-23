import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { installBigIntSerializer } from './shared/json';

async function bootstrap(): Promise<void> {
  installBigIntSerializer();
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API siap di http://localhost:${env.PORT}/api`);
}

void bootstrap();
