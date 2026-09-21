import type { QueryBus } from '@nestjs/cqrs';
import { GetMeetingQuery } from '../meeting/queries/get-meeting.query.js';

/**
 * Confirms the meeting exists and belongs to the caller; 404s the same way
 * for "not found" and "someone else's meeting" alike (delegates to
 * GetMeetingHandler, meeting/'s single source of truth for that check).
 */
export function assertMeetingOwnership(
  queryBus: QueryBus,
  ownerId: string,
  meetingId: string,
): Promise<unknown> {
  return queryBus.execute(new GetMeetingQuery(ownerId, meetingId));
}
