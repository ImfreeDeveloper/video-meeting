export interface ApiErrorBody {
  message?: string | string[];
}

function messageFromBody(body: ApiErrorBody | null, fallback: string): string {
  if (!body) return fallback;
  return Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? fallback);
}

/**
 * Parses an already-decoded JSON error body (from a `fetch` Response).
 */
export function parseErrorMessage(body: ApiErrorBody | null, fallback: string): string {
  return messageFromBody(body, fallback);
}

/**
 * Parses raw response text (from an XMLHttpRequest, which has no
 * `Response.json()`), tolerating a non-JSON or empty body.
 */
export function parseErrorMessageFromText(responseText: string, fallback: string): string {
  try {
    return messageFromBody(JSON.parse(responseText) as ApiErrorBody, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Base for every @claudelar/api error. Callers that talk to more than one
 * API module in the same flow (e.g. a page loading a meeting and its files
 * together) should catch this instead of enumerating every concrete
 * subclass — missing one silently falls through to a generic error state.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
