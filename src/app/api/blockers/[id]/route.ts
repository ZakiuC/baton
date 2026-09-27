import { NextResponse } from 'next/server';
import { resolveBlocker } from '@/lib/queries/tasks';
import { apiErrorResponse } from '@/app/api/_utils';

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await resolveBlocker(id);
    return NextResponse.json({ success: true, task });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
