import { ValidationPipe } from '@nestjs/common';

/**
 * The single global `ValidationPipe` config, shared by `main.ts` and the e2e
 * specs — a spec can never validate against looser rules than the app really
 * boots with (e.g. a dropped `transform` would silently stop trimming DTO
 * input).
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true });
}
