import { ConflictException } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { signAccessToken } from '../../access-token.util.js';
import { UserRegisteredEvent } from '../../events/user-registered.event.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { RegisterCommand } from '../register.command.js';

const PASSWORD_SALT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, { accessToken: string }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RegisterCommand): Promise<{ accessToken: string }> {
    const passwordHash = await bcrypt.hash(command.password, PASSWORD_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { email: command.email, passwordHash },
      });

      this.eventBus.publish(new UserRegisteredEvent(user.id, user.email));

      return signAccessToken(this.jwtService, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }
}
