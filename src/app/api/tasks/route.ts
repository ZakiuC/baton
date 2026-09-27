import { NextRequest, NextResponse } from 'next/server';
import { createTask, CreateTaskInput, getAllTasks } from '@/lib/queries/tasks';
import { apiErrorResponse, isTrueQueryValue, readJsonObject } from '@/app/api/_utils';

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined;
    const includeArchived = isTrueQueryValue(request.nextUrl.searchParams.get('include_archived'));
    return NextResponse.json(await getAllTasks(projectId, includeArchived));
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const task = await createTask(body as unknown as CreateTaskInput);
    return NextResponse.json(task, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
