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
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });

    return new StreamableFile(createReadStream(join(resolveStorageRoot(), file.storagePath)));
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
