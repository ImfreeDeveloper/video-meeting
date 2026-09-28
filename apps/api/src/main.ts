import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createValidationPipe } from './validation-pipe.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
