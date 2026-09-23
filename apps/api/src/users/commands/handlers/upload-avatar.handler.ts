import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { unlinkIfExists } from '../../../storage.util.js';
import { avatarFilenameFromUrl, buildAvatarUrl } from '../../avatar-url.js';
import { userAvatarDir } from '../../config/avatar-upload.config.js';
import { type UserProfile, toUserProfile } from '../../user-profile.js';
import { UploadAvatarCommand } from '../upload-avatar.command.js';

const RECORD_NOT_FOUND = 'P2025';

@CommandHandler(UploadAvatarCommand)
export class UploadAvatarHandler implements ICommandHandler<UploadAvatarCommand, UserProfile> {
  private readonly logger = new Logger(UploadAvatarHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UploadAvatarCommand): Promise<UserProfile> {
    const { userId, file } = command;
    const dir = userAvatarDir(userId);
    // Tracks wherever the uploaded file currently sits, so the catch block
    // cleans up the right path regardless of which step failed.
    let currentPath = file.path;
    let user;
    let previousFilename: string | null;

    try {
      const finalPath = join(dir, file.filename);

      await mkdir(dir, { recursive: true });
      await rename(file.path, finalPath);
      currentPath = finalPath;

      // The URL being replaced, read before the update overwrites it — it's
      // the only pointer to the previous file on disk.
      const previous = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      });
      if (!previous) {
        throw new NotFoundException('User not found');
      }

      user = await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: buildAvatarUrl(userId, file.filename) },
      });
      previousFilename = avatarFilenameFromUrl(previous.avatarUrl);
    } catch (error) {
      // Best-effort: a cleanup failure must not replace the error that
      // actually caused the upload to fail (a 404 turning into a 500).
      await unlinkIfExists(currentPath).catch((cleanupError: Error) => {
        this.logger.warn(`Failed to clean up ${currentPath}: ${cleanupError.message}`);
      });
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === RECORD_NOT_FOUND
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }

    // Past the commit, and deliberately outside the try: the new URL is
    // already the source of truth, so failing to delete the file it replaced
    // must neither fail the request nor trip the catch block above into
    // unlinking the file the DB now points at. A leftover stale file is
    // harmless; a dangling avatarUrl is not.
    if (previousFilename && previousFilename !== file.filename) {
      await unlinkIfExists(join(dir, previousFilename)).catch((error: Error) => {
        this.logger.warn(`Failed to delete replaced avatar ${previousFilename}: ${error.message}`);
      });
    }

    return toUserProfile(user);
  }
}
