import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UserRegisteredEvent } from '../user-registered.event.js';

@EventsHandler(UserRegisteredEvent)
export class UserRegisteredHandler implements IEventHandler<UserRegisteredEvent> {
  private readonly logger = new Logger(UserRegisteredHandler.name);

  handle(event: UserRegisteredEvent): void {
    this.logger.log(`User registered: ${event.email} (${event.userId})`);
  }
}
