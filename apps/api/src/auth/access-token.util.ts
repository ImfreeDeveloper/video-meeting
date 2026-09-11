import type { JwtService } from '@nestjs/jwt';
import type { User } from '../generated/prisma/client.js';

export function signAccessToken(
  jwtService: JwtService,
  user: Pick<User, 'id' | 'email'>,
): { accessToken: string } {
  return { accessToken: jwtService.sign({ sub: user.id, email: user.email }) };
}
