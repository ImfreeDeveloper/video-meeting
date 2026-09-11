import { NotFoundException } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Meeting } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingQuery } from '../get-meeting.query.js';

@QueryHandler(GetMeetingQuery)
export class GetMeetingHandler implements IQueryHandler<GetMeetingQuery, Meeting> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingQuery): Promise<Meeting> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: query.id, ownerId: query.ownerId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return meeting;
  }
}
