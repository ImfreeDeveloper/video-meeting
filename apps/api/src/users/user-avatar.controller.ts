import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { isSafeUserIdSegment, isStoredAvatarFilename } from './avatar-url.js';
import { avatarMimeType, userAvatarDir } from './config/avatar-upload.config.js';

/**
 * Matches @nestjs/common's StreamableHandlerResponse shape (not itself
 * publicly exported from the package root) — just enough of Express's
 * Response for StreamableFile.setErrorHandler's second argument.
 */
interface StreamResponse {
  readonly headersSent: boolean;
  statusCode: number;
  send(body: string): void;
  end(): void;
}

/**
 * Deliberately **not** behind `JwtAuthGuard`: an avatar is loaded by the
 * browser through `<img src>`, which can't attach an Authorization header.
 * That makes the route's only real defence the shape check on both path
 * params — a request can only ever name a file this app itself wrote into
 * `<userId>/`, so a path like `../../.env` never reaches the filesystem, and
 * there is nothing secret in an avatar to leak by serving it publicly.
 */
@Controller('users/:userId/avatar')
export class UserAvatarController {
  @Get(':filename')
  @HttpCode(HttpStatus.OK)
  serve(
    @Param('userId') userId: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const mimeType =
      isSafeUserIdSegment(userId) && isStoredAvatarFilename(filename)
        ? avatarMimeType(filename)
        : undefined;
    if (!mimeType) {
      throw new NotFoundException('Avatar not found');
    }

    res.set({ 'Content-Type': mimeType });

    const stream = new StreamableFile(createReadStream(join(userAvatarDir(userId), filename)));

    // A user id or filename that doesn't exist on disk is an ENOENT here,
    // not before — without this it would fall through to StreamableFile's
    // default handler, which answers 400 and leaks the absolute path.
    stream.setErrorHandler((error: Error, response: StreamResponse) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
      response.statusCode = notFound ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      // The image Content-Type set above was for bytes that never got sent —
      // this body is JSON, and a client that trusted the stale header would
      // try to decode an error message as a picture. Set through the captured
      // Express response: StreamableHandlerResponse exposes no header API.
      res.set({ 'Content-Type': 'application/json' });
      response.send(
        JSON.stringify({
          statusCode: response.statusCode,
          message: notFound ? 'Avatar not found' : 'Internal server error',
        }),
      );
    });

    return stream;
  }
}
