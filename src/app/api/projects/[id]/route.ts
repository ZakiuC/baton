import { NextResponse } from 'next/server';
import {
  archiveProject,
  getProjectById,
  updateProject,
  UpdateProjectInput,
} from '@/lib/queries/projects';
import { apiErrorResponse, readJsonObject } from '@/app/api/_utils';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const project = await getProjectById(id);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json(project);
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await readJsonObject(request);
    const project = await updateProject(id, body as unknown as UpdateProjectInput);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json(project);
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const project = await archiveProject(id);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json({ success: true, project });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
