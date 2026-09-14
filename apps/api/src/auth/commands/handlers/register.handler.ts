import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { CreateUserCommand } from '../../../users/commands/create-user.command.js';
import type { CreatedUser } from '../../../users/commands/handlers/create-user.handler.js';
import { signAccessToken } from '../../access-token.util.js';
import { RegisterCommand } from '../register.command.js';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, { accessToken: string }> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly jwtService: JwtService,
  ) {}

  async execute(command: RegisterCommand): Promise<{ accessToken: string }> {
    const user = await this.commandBus.execute<CreateUserCommand, CreatedUser>(
      new CreateUserCommand(command.email, command.password),
    );

    return signAccessToken(this.jwtService, user);
  }
}
