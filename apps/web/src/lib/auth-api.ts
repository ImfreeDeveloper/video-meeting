import { ApiError, parseErrorMessage, type ApiErrorBody } from '@/lib/api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class AuthApiError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'AuthApiError';
  }
}

interface AccessTokenResponse {
  accessToken: string;
}

async function postCredentials(
  path: string,
  email: string,
  password: string,
  fallbackMessage: string,
): Promise<AccessTokenResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new AuthApiError(parseErrorMessage(body, fallbackMessage), response.status);
  }

  return response.json() as Promise<AccessTokenResponse>;
}

export function registerUser(email: string, password: string): Promise<AccessTokenResponse> {
  return postCredentials('/auth/register', email, password, 'Registration failed');
}

export function loginUser(email: string, password: string): Promise<AccessTokenResponse> {
  return postCredentials('/auth/login', email, password, 'Login failed');
}
