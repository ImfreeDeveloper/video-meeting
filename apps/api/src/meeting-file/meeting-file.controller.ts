import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus } from '@nestjs/cqrs';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { MeetingFile } from '../generated/prisma/client.js';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command.js';
import { meetingFileMulterOptions } from './config/file-upload.config.js';

@UseGuards(JwtAuthGuard)
@Controller('meeting/:meetingId/files')
export class MeetingFileController {
  constructor(private readonly commandBus: CommandBus) {}

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
}
