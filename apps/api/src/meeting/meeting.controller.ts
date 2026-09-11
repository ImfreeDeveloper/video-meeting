import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { Meeting } from '../generated/prisma/client.js';
import { CreateMeetingCommand } from './commands/create-meeting.command.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { GetMeetingQuery } from './queries/get-meeting.query.js';
import { ListMeetingsQuery } from './queries/list-meetings.query.js';

@UseGuards(JwtAuthGuard)
@Controller('meeting')
export class MeetingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateMeetingDto): Promise<Meeting> {
    return this.commandBus.execute(
      new CreateMeetingCommand(request.user.userId, dto.title, dto.startTime, dto.endTime),
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  list(@Req() request: AuthenticatedRequest): Promise<Meeting[]> {
    return this.queryBus.execute(new ListMeetingsQuery(request.user.userId));
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<Meeting> {
    return this.queryBus.execute(new GetMeetingQuery(request.user.userId, id));
  }
}
