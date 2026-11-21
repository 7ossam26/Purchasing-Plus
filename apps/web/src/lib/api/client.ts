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
export async function apiResponse(
  path: string,
  { body, ...options }: Omit<RequestInit, 'body'> & { body?: unknown } = {},
  accept = 'application/json',
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Accept', accept);
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart)
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      ...options,
      headers,
      credentials: 'include',
      body: multipart ? body : JSON.stringify(body),
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
  return response;
}

export async function api<T>(
  path: string,
  options?: Omit<RequestInit, 'body'> & { body?: unknown },
): Promise<T> {
  const response = await apiResponse(path, options);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export async function download(path: string, accept: string) {
  return (await apiResponse(path, undefined, accept)).blob();
}

export function saveDownload(file: Blob, filename: string) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
