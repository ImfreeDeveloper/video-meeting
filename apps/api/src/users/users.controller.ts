import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateUserNameCommand } from './commands/update-user-name.command.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { FindUserByIdQuery } from './queries/find-user-by-id.query.js';
import type { UserProfile } from './user-profile.js';

/**
 * Both routes resolve the user from the access token (`request.user.userId`,
 * set by the guard) — there is no user id in the path or body, so a caller
 * can only ever read or rename themselves.
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
}
