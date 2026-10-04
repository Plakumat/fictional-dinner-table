import type { ServerClock } from '../core/clock/serverClock';

export const API_URL: string = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Http {
  get(path: string, signal?: AbortSignal): Promise<Response>;
  post(path: string, body: unknown, signal?: AbortSignal): Promise<Response>;
}

/**
 * Every request to the mock goes through here, so every response feeds the
 * server clock from its `X-Sofra-Now` header. The header is read as soon as
 * the response starts, which makes it a better sample than `server_now` in the
 * stream's meta event: that one can sit behind a slow stream for seconds.
 */
export function createHttp(clock: ServerClock, fetchImpl: FetchLike = (input, init) => fetch(input, init), baseUrl: string = API_URL): Http {
  const request = async (path: string, init: RequestInit): Promise<Response> => {
    const response = await fetchImpl(baseUrl + path, init);
    clock.sync(response.headers.get('X-Sofra-Now'));
    return response;
  };
  return {
    get: (path, signal) => request(path, { method: 'GET', signal: signal ?? null }),
    post: (path, body, signal) =>
      request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ?? null,
      }),
  };
}

/** The `{ error: { code, message } }` body of a failed plain request. */
export async function readApiError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    if (typeof error?.code === 'string' && typeof error.message === 'string') {
      return { code: error.code, message: error.message };
    }
  } catch {
    // Not JSON: fall through to the generic error.
  }
  return { code: `http_${response.status}`, message: `The server answered ${response.status}.` };
}
