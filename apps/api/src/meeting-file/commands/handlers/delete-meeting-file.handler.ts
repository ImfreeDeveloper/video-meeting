import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { type ICommandHandler, CommandHandler, QueryBus } from '@nestjs/cqrs';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveStorageRoot } from '../../config/file-upload.config.js';
import { assertMeetingOwnership } from '../../ownership.util.js';
import { unlinkIfExists } from '../../storage.util.js';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command.js';

const RECORD_NOT_FOUND = 'P2025';

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: DeleteMeetingFileCommand): Promise<void> {
    await assertMeetingOwnership(this.queryBus, command.ownerId, command.meetingId);

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
    await unlinkIfExists(join(resolveStorageRoot(), file.storagePath));

    try {
      await this.prisma.meetingFile.delete({ where: { id: file.id } });
    } catch (error) {
      // A concurrent DELETE for the same file already won the race between
      // our findFirst above and this delete — the end state (no row) is
      // what we wanted anyway, so treat it as success rather than a 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === RECORD_NOT_FOUND
      ) {
        return;
      }
      throw error;
    }
  }
}
