import { NotFoundException } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { type UserProfile, toUserProfile } from '../../user-profile.js';
import { FindUserByIdQuery } from '../find-user-by-id.query.js';

@QueryHandler(FindUserByIdQuery)
export class FindUserByIdHandler implements IQueryHandler<FindUserByIdQuery, UserProfile> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: FindUserByIdQuery): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: query.id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserProfile(user);
  }
}
