import type { User } from '../generated/prisma/client.js';

/**
 * The public shape of a user — everything `/users/me` is allowed to return.
 * Built by picking fields off the row rather than deleting `passwordHash`
 * from it, so a new secret column can never leak by being forgotten here.
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}
