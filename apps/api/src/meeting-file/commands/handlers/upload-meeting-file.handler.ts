import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandHandler, type ICommandHandler, QueryBus } from '@nestjs/cqrs';
import type { MeetingFile } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveStorageRoot } from '../../config/file-upload.config.js';
import { assertMeetingOwnership } from '../../ownership.util.js';
import { unlinkIfExists } from '../../storage.util.js';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command.js';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<
  UploadMeetingFileCommand,
  MeetingFile
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: UploadMeetingFileCommand): Promise<MeetingFile> {
    const { ownerId, meetingId, file } = command;
    // Tracks wherever the file currently sits on disk, so the catch block
    // below always cleans up the right path regardless of which step failed.
    let currentPath = file.path;

    try {
      await assertMeetingOwnership(this.queryBus, ownerId, meetingId);

      const storagePath = join(meetingId, file.filename);
      const finalPath = join(resolveStorageRoot(), storagePath);

      await mkdir(join(resolveStorageRoot(), meetingId), { recursive: true });
      await rename(file.path, finalPath);
      currentPath = finalPath;

      return await this.prisma.meetingFile.create({
        data: {
          meetingId,
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storagePath,
          uploadedById: ownerId,
        },
      });
    } catch (error) {
      await unlinkIfExists(currentPath);
      throw error;
    }
  }
}
