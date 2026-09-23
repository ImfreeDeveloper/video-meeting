import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { CreateUserHandler } from './commands/handlers/create-user.handler.js';
import { UpdateUserNameHandler } from './commands/handlers/update-user-name.handler.js';
import { UploadAvatarHandler } from './commands/handlers/upload-avatar.handler.js';
import { UserRegisteredHandler } from './events/handlers/user-registered.handler.js';
import { FindUserByEmailHandler } from './queries/handlers/find-user-by-email.handler.js';
import { FindUserByIdHandler } from './queries/handlers/find-user-by-id.handler.js';
import { UserAvatarController } from './user-avatar.controller.js';
import { UsersController } from './users.controller.js';

const CommandHandlers = [CreateUserHandler, UpdateUserNameHandler, UploadAvatarHandler];
const QueryHandlers = [FindUserByEmailHandler, FindUserByIdHandler];
const EventHandlers = [UserRegisteredHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [UsersController, UserAvatarController],
  providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers],
})
export class UsersModule {}
