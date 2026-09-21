import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { DeleteMeetingFileHandler } from './commands/handlers/delete-meeting-file.handler.js';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler.js';
import { MeetingFileController } from './meeting-file.controller.js';
import { GetMeetingFileHandler } from './queries/handlers/get-meeting-file.handler.js';
import { ListMeetingFilesHandler } from './queries/handlers/list-meeting-files.handler.js';

const CommandHandlers = [UploadMeetingFileHandler, DeleteMeetingFileHandler];
const QueryHandlers = [ListMeetingFilesHandler, GetMeetingFileHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingFileController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class MeetingFileModule {}
