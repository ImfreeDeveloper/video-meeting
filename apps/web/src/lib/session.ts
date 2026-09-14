const ACCESS_TOKEN_KEY = 'accessToken';

export interface SessionUser {
  email: string;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

/**
 * Reads the email out of the JWT payload for display only — the token isn't
 * verified here, every real request re-verifies it server-side.
 */
export function decodeSessionUser(token: string): SessionUser | null {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as { email?: unknown };
    return typeof payload.email === 'string' ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
