import { UnauthorizedException } from '@nestjs/common';
import { type IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { User } from '../../../generated/prisma/client.js';
import { FindUserByEmailQuery } from '../../../users/queries/find-user-by-email.query.js';
import { signAccessToken } from '../../access-token.util.js';
import { LoginQuery } from '../login.query.js';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery, { accessToken: string }> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly jwtService: JwtService,
  ) {}

  async execute(query: LoginQuery): Promise<{ accessToken: string }> {
    const user = await this.queryBus.execute<FindUserByEmailQuery, User | null>(
      new FindUserByEmailQuery(query.email),
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(query.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return signAccessToken(this.jwtService, user);
  }
}
