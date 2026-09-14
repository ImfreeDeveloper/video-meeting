import { ConflictException } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import bcrypt from 'bcryptjs';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UserRegisteredEvent } from '../../events/user-registered.event.js';
import { CreateUserCommand } from '../create-user.command.js';

const PASSWORD_SALT_ROUNDS = 10;

export interface CreatedUser {
  id: string;
  email: string;
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, CreatedUser> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<CreatedUser> {
    const passwordHash = await bcrypt.hash(command.password, PASSWORD_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { email: command.email, passwordHash },
      });

      this.eventBus.publish(new UserRegisteredEvent(user.id, user.email));

      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }
}
