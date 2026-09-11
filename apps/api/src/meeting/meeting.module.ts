import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler.js';
import { MeetingController } from './meeting.controller.js';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler.js';
import { ListMeetingsHandler } from './queries/handlers/list-meetings.handler.js';

const CommandHandlers = [CreateMeetingHandler];
const QueryHandlers = [ListMeetingsHandler, GetMeetingHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class MeetingModule {}
