const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export class MeetingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MeetingApiError';
  }
}

export async function fetchMeetings(accessToken: string): Promise<Meeting[]> {
  const response = await fetch(`${API_URL}/meeting`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new MeetingApiError('Failed to load meetings', response.status);
  }

  return response.json() as Promise<Meeting[]>;
}
