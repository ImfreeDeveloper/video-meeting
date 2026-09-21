import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { type ICommandHandler, CommandHandler, QueryBus } from '@nestjs/cqrs';
import { GetMeetingQuery } from '../../../meeting/queries/get-meeting.query.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveStorageRoot } from '../../config/file-upload.config.js';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command.js';

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: DeleteMeetingFileCommand): Promise<void> {
    await this.queryBus.execute(new GetMeetingQuery(command.ownerId, command.meetingId));

    const file = await this.prisma.meetingFile.findFirst({
      where: { id: command.fileId, meetingId: command.meetingId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Disk first, DB second: if unlink fails for a reason other than the
    // file already being gone, abort before deleting the row — a
    // temporarily-unreachable file with a valid DB record beats an
    // orphaned record pointing at nothing.
    await unlink(join(resolveStorageRoot(), file.storagePath)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      },
    );

    await this.prisma.meetingFile.delete({ where: { id: file.id } });
  }
}
