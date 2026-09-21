import { type IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { MeetingFile } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { assertMeetingOwnership } from '../../ownership.util.js';
import { ListMeetingFilesQuery } from '../list-meeting-files.query.js';

@QueryHandler(ListMeetingFilesQuery)
export class ListMeetingFilesHandler implements IQueryHandler<
  ListMeetingFilesQuery,
  MeetingFile[]
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListMeetingFilesQuery): Promise<MeetingFile[]> {
    await assertMeetingOwnership(this.queryBus, query.ownerId, query.meetingId);

    return this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
