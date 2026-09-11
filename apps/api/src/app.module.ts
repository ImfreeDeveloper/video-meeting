import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MeetingModule } from './meeting/meeting.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, AuthModule, MeetingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
