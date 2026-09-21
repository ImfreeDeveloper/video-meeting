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

    const storagePath = join(meetingId, file.filename);
    const finalPath = join(resolveStorageRoot(), storagePath);

    try {
      await mkdir(join(resolveStorageRoot(), meetingId), { recursive: true });
      await rename(file.path, finalPath);
    } catch (error) {
      await unlink(file.path).catch(() => {});
      throw error;
    }

    try {
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
      // The file already moved into its final <meetingId>/ location above —
      // without this, a failed insert (e.g. a transient DB error) leaves it
      // orphaned on disk with no MeetingFile row pointing at it.
      await unlink(finalPath).catch(() => {});
      throw error;
    }
  }
}
