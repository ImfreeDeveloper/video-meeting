const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

interface AccessTokenResponse {
  accessToken: string;
}

interface ApiErrorBody {
  message?: string | string[];
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
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? fallbackMessage);
    throw new AuthApiError(message, response.status);
  }

  return response.json() as Promise<AccessTokenResponse>;
}

export function registerUser(email: string, password: string): Promise<AccessTokenResponse> {
  return postCredentials('/auth/register', email, password, 'Registration failed');
}

export function loginUser(email: string, password: string): Promise<AccessTokenResponse> {
  return postCredentials('/auth/login', email, password, 'Login failed');
}
