import { mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandHandler, type ICommandHandler, QueryBus } from '@nestjs/cqrs';
import type { MeetingFile } from '../../../generated/prisma/client.js';
import { GetMeetingQuery } from '../../../meeting/queries/get-meeting.query.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveStorageRoot } from '../../config/file-upload.config.js';
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

    try {
      // Confirms the meeting exists and belongs to the caller; 404s the
      // same way for "not found" and "someone else's meeting" alike.
      await this.queryBus.execute(new GetMeetingQuery(ownerId, meetingId));
    } catch (error) {
      await unlink(file.path).catch(() => {});
      throw error;
    }

    const meetingDir = join(resolveStorageRoot(), meetingId);
    await mkdir(meetingDir, { recursive: true });
    const storagePath = join(meetingId, file.filename);
    await rename(file.path, join(resolveStorageRoot(), storagePath));

    return this.prisma.meetingFile.create({
      data: {
        meetingId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
        uploadedById: ownerId,
      },
    });
  }
}
