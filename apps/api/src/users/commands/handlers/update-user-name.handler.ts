import { NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { type UserProfile, toUserProfile } from '../../user-profile.js';
import { UpdateUserNameCommand } from '../update-user-name.command.js';

@CommandHandler(UpdateUserNameCommand)
export class UpdateUserNameHandler implements ICommandHandler<UpdateUserNameCommand, UserProfile> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateUserNameCommand): Promise<UserProfile> {
    try {
      const user = await this.prisma.user.update({
        where: { id: command.userId },
        data: { name: command.name },
      });

      return toUserProfile(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }
}
