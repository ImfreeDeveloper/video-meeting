import { NotFoundException } from '@nestjs/common';
import { type IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { MeetingFile } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { assertMeetingOwnership } from '../../ownership.util.js';
import { GetMeetingFileQuery } from '../get-meeting-file.query.js';

@QueryHandler(GetMeetingFileQuery)
export class GetMeetingFileHandler implements IQueryHandler<GetMeetingFileQuery, MeetingFile> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetMeetingFileQuery): Promise<MeetingFile> {
    await assertMeetingOwnership(this.queryBus, query.ownerId, query.meetingId);

    const file = await this.prisma.meetingFile.findFirst({
      where: { id: query.fileId, meetingId: query.meetingId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }
}
