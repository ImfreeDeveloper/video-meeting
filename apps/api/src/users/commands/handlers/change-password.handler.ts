import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from '../../password.util.js';
import { ChangePasswordCommand } from '../change-password.command.js';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: command.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldPasswordMatches = await verifyPassword(command.oldPassword, user.passwordHash);
    if (!oldPasswordMatches) {
      // Not a 401: the caller's token is perfectly valid, so answering 401 here
      // would look to a client like an expired session and send it to /login.
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await hashPassword(command.newPassword);

    try {
      await this.prisma.user.update({
        where: { id: command.userId },
        data: { passwordHash },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }
}
