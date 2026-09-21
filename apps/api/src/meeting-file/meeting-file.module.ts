import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler.js';
import { MeetingFileController } from './meeting-file.controller.js';

const CommandHandlers = [UploadMeetingFileHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingFileController],
  providers: [...CommandHandlers],
})
export class MeetingFileModule {}
