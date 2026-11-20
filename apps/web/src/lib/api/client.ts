import { ar } from '@purchasing-plus/shared/i18n/ar';

interface ErrorBody {
  error: string;
  message: string;
  fix?: string;
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fix?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function api<T>(
  path: string,
  { body, ...options }: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      ...options,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      ar.common.networkError,
      ar.common.networkFix,
    );
  }
  if (!response.ok) {
    const payload: Partial<ErrorBody> | null = await response
      .json()
      .catch(() => null);
    throw new ApiError(
      response.status,
      payload?.error ?? 'HTTP_ERROR',
      payload?.message ?? ar.common.fallbackError,
      payload?.fix,
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
