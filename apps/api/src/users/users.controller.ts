import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ChangePasswordCommand } from './commands/change-password.command.js';
import { UpdateUserNameCommand } from './commands/update-user-name.command.js';
import { UploadAvatarCommand } from './commands/upload-avatar.command.js';
import { avatarMulterOptions } from './config/avatar-upload.config.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { FindUserByIdQuery } from './queries/find-user-by-id.query.js';
import type { UserProfile } from './user-profile.js';

/**
 * Every route resolves the user from the access token (`request.user.userId`,
 * set by the guard) — there is no user id in the path or body, so a caller
 * can only ever read, rename or re-avatar themselves.
 */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  me(@Req() request: AuthenticatedRequest): Promise<UserProfile> {
    return this.queryBus.execute(new FindUserByIdQuery(request.user.userId));
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  update(@Req() request: AuthenticatedRequest, @Body() dto: UpdateUserDto): Promise<UserProfile> {
    return this.commandBus.execute(new UpdateUserNameCommand(request.user.userId, dto.name));
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new ChangePasswordCommand(request.user.userId, dto.oldPassword, dto.newPassword),
    );
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', avatarMulterOptions()))
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserProfile> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.commandBus.execute(new UploadAvatarCommand(request.user.userId, file));
  }
}
