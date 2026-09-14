import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { RegisterHandler } from './commands/handlers/register.handler.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LoginHandler } from './queries/handlers/login.handler.js';

const CommandHandlers = [RegisterHandler];
const QueryHandlers = [LoginHandler];

@Module({
  imports: [
    CqrsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '1h') as JwtSignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController],
  providers: [...CommandHandlers, ...QueryHandlers, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
