import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { MeetingFile } from '../generated/prisma/client.js';
import { DeleteMeetingFileCommand } from './commands/delete-meeting-file.command.js';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command.js';
import { meetingFileMulterOptions, resolveStorageRoot } from './config/file-upload.config.js';
import { GetMeetingFileQuery } from './queries/get-meeting-file.query.js';
import { ListMeetingFilesQuery } from './queries/list-meeting-files.query.js';

/**
 * RFC 6266: only `filename*=UTF-8''...` is percent-decoded by clients — the
 * plain `filename=` parameter is a same-request ASCII fallback for clients
 * that don't understand the extended form, not a place to put percent-encoding.
 */
function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

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

@UseGuards(JwtAuthGuard)
@Controller('meeting/:meetingId/files')
export class MeetingFileController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', meetingFileMulterOptions()))
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('meetingId') meetingId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<MeetingFile> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.commandBus.execute(
      new UploadMeetingFileCommand(request.user.userId, meetingId, file),
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  list(
    @Req() request: AuthenticatedRequest,
    @Param('meetingId') meetingId: string,
  ): Promise<MeetingFile[]> {
    return this.queryBus.execute(new ListMeetingFilesQuery(request.user.userId, meetingId));
  }

  @Get(':fileId')
  @HttpCode(HttpStatus.OK)
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(request.user.userId, meetingId, fileId),
    );

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': contentDispositionHeader(file.filename),
    });

    const stream = new StreamableFile(
      createReadStream(join(resolveStorageRoot(), file.storagePath)),
    );

    // The DB row can outlive the file on disk for a moment (e.g. a delete
    // racing this download between the query above and the read below).
    // Without this, a read-stream ENOENT falls through to StreamableFile's
    // default handler, which leaks the absolute file path in the response
    // body and answers 400 instead of 404.
    stream.setErrorHandler((error: Error, response: StreamResponse) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
      response.statusCode = notFound ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      response.send(
        JSON.stringify({
          statusCode: response.statusCode,
          message: notFound ? 'File not found' : 'Internal server error',
        }),
      );
    });

    return stream;
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteMeetingFileCommand(request.user.userId, meetingId, fileId),
    );
  }
}
