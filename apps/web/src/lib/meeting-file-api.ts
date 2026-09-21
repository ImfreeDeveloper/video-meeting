const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface MeetingFile {
  id: string;
  meetingId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/**
 * `status` is the HTTP status code, or `0` for a network error (the request
 * never reached the server) — the UI maps both format (415) and size (413)
 * rejections, plus the network case, to distinct messages.
 */
export class MeetingFileApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MeetingFileApiError';
  }
}

export async function listMeetingFiles(
  accessToken: string,
  meetingId: string,
): Promise<MeetingFile[]> {
  const response = await fetch(`${API_URL}/meeting/${meetingId}/files`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new MeetingFileApiError('Failed to load files', response.status);
  }

  return response.json() as Promise<MeetingFile[]>;
}

interface ApiErrorBody {
  message?: string | string[];
}

function parseErrorMessage(responseText: string, fallback: string): string {
  try {
    const body = JSON.parse(responseText) as ApiErrorBody;
    return Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? fallback);
  } catch {
    return fallback;
  }
}

/**
 * Uses XMLHttpRequest, not fetch, because `fetch` has no cross-browser way
 * to report upload (request body) progress — only `xhr.upload.onprogress`
 * does. Never set a Content-Type header manually: FormData + XHR set
 * `multipart/form-data; boundary=...` themselves, and overriding it breaks
 * parsing server-side.
 */
export function uploadMeetingFile(
  accessToken: string,
  meetingId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MeetingFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/meeting/${meetingId}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as MeetingFile);
      } else {
        reject(
          new MeetingFileApiError(parseErrorMessage(xhr.responseText, 'Upload failed'), xhr.status),
        );
      }
    };

    xhr.onerror = () => reject(new MeetingFileApiError('Network error', 0));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
