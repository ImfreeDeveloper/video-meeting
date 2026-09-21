import { type IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { MeetingFile } from '../../../generated/prisma/client.js';
import { GetMeetingQuery } from '../../../meeting/queries/get-meeting.query.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
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
    // Confirms the meeting exists and belongs to the caller; 404s the same
    // way for "not found" and "someone else's meeting" alike.
    await this.queryBus.execute(new GetMeetingQuery(query.ownerId, query.meetingId));

    return this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
