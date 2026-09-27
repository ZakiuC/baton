export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * 客户端请求统一入口：HTTP 失败必须抛出，避免界面把 4xx/5xx 当作成功。
 */
export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String(payload.error)
      : typeof payload === 'string' && payload.trim()
        ? payload
        : `请求失败（${response.status}）`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
