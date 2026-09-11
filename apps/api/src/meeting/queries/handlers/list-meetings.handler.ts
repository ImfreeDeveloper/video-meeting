import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Meeting } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ListMeetingsQuery } from '../list-meetings.query.js';

@QueryHandler(ListMeetingsQuery)
export class ListMeetingsHandler implements IQueryHandler<ListMeetingsQuery, Meeting[]> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: ListMeetingsQuery): Promise<Meeting[]> {
    return this.prisma.meeting.findMany({ where: { ownerId: query.ownerId } });
  }
}
