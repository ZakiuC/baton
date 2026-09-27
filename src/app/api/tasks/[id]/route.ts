import { NextResponse } from 'next/server';
import {
  archiveTask,
  getTaskById,
  updateTask,
  UpdateTaskInput,
} from '@/lib/queries/tasks';
import { apiErrorResponse, readJsonObject } from '@/app/api/_utils';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = await getTaskById(id);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    return NextResponse.json(task);
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await readJsonObject(request);
    const task = await updateTask(id, body as unknown as UpdateTaskInput);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    return NextResponse.json(task);
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = await archiveTask(id);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    return NextResponse.json({ success: true, task });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
