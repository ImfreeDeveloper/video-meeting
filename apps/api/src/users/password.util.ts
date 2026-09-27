import bcrypt from 'bcryptjs';

/**
 * Cost factor for every password hash this app writes. Lives here rather than
 * next to one handler so registering a user and changing a password can't drift
 * apart into two different strengths.
 */
const PASSWORD_SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
