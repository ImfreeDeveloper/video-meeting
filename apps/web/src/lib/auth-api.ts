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

interface RegisterResponse {
  accessToken: string;
}

interface ApiErrorBody {
  message?: string | string[];
}

export async function registerUser(email: string, password: string): Promise<RegisterResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? 'Registration failed');
    throw new AuthApiError(message, response.status);
  }

  return response.json() as Promise<RegisterResponse>;
}
