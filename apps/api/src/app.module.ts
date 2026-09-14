import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { MeetingModule } from './meeting/meeting.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, MeetingModule],
})
export class AppModule {}
