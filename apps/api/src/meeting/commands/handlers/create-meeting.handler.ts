import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Meeting } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreateMeetingCommand } from '../create-meeting.command.js';

@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<CreateMeetingCommand, Meeting> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: CreateMeetingCommand): Promise<Meeting> {
    return this.prisma.meeting.create({
      data: {
        title: command.title,
        startTime: new Date(command.startTime),
        endTime: new Date(command.endTime),
        ownerId: command.ownerId,
      },
    });
  }
}
