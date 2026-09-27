import { NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/queries/validation';

export function apiErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : '未知错误';
  if (error instanceof ValidationError || error instanceof SyntaxError) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  console.error('API 请求失败:', error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function isTrueQueryValue(value: string | null): boolean {
  return value === 'true' || value === '1';
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('请求体必须是 JSON 对象');
  }
  return body as Record<string, unknown>;
}
