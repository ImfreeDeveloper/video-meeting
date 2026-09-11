import { UnauthorizedException } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { signAccessToken } from '../../access-token.util.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LoginQuery } from '../login.query.js';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery, { accessToken: string }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async execute(query: LoginQuery): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: query.email } });
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
