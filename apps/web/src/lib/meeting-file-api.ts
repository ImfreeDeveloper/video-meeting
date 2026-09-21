import { ApiError, parseErrorMessageFromText } from '@/lib/api-error';

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
export class MeetingFileApiError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
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

/**
 * Fetches the file as a blob and triggers a browser download via a
 * throwaway object URL, rather than a plain `<a href>` — the access token
 * lives in localStorage, not a cookie, so a direct link can't authenticate
 * the request (see research/research-meeting-upload.md #8).
 */
export async function downloadMeetingFile(
  accessToken: string,
  meetingId: string,
  file: MeetingFile,
): Promise<void> {
  const response = await fetch(`${API_URL}/meeting/${meetingId}/files/${file.id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new MeetingFileApiError('Failed to download file', response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function deleteMeetingFile(
  accessToken: string,
  meetingId: string,
  fileId: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/meeting/${meetingId}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new MeetingFileApiError('Failed to delete file', response.status);
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
        try {
          resolve(JSON.parse(xhr.responseText) as MeetingFile);
        } catch {
          reject(
            new MeetingFileApiError('Upload succeeded but the response was invalid', xhr.status),
          );
        }
      } else {
        reject(
          new MeetingFileApiError(
            parseErrorMessageFromText(xhr.responseText, 'Upload failed'),
            xhr.status,
          ),
        );
      }
    };

    xhr.onerror = () => reject(new MeetingFileApiError('Network error', 0));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
