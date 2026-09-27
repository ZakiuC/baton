import { NextResponse } from 'next/server';
import { updateTaskStage } from '@/lib/queries/tasks';
import { apiErrorResponse, readJsonObject } from '@/app/api/_utils';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await readJsonObject(request);
    const task = await updateTaskStage(
      id,
      typeof body.stage === 'string' ? body.stage : '',
      typeof body.blocker_reason === 'string' ? body.blocker_reason : undefined,
    );
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    return NextResponse.json(task);
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
