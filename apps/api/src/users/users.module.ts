import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateUserHandler } from './commands/handlers/create-user.handler.js';
import { UserRegisteredHandler } from './events/handlers/user-registered.handler.js';
import { FindUserByEmailHandler } from './queries/handlers/find-user-by-email.handler.js';

const CommandHandlers = [CreateUserHandler];
const QueryHandlers = [FindUserByEmailHandler];
const EventHandlers = [UserRegisteredHandler];

@Module({
  imports: [CqrsModule],
  providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers],
})
export class UsersModule {}
