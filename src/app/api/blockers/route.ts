import { NextResponse } from 'next/server';
import { addBlocker } from '@/lib/queries/tasks';
import { apiErrorResponse, readJsonObject } from '@/app/api/_utils';

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const blocker = await addBlocker(
      typeof body.task_id === 'string' ? body.task_id : '',
      typeof body.reason === 'string' ? body.reason : '',
    );
    return NextResponse.json(blocker, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
