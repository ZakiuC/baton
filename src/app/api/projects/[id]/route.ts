import { NextResponse } from 'next/server';
import {
  archiveProject,
  deleteProject,
  getProjectById,
  updateProject,
  UpdateProjectInput,
} from '@/lib/queries/projects';
import { apiErrorResponse, isTrueQueryValue, readJsonObject } from '@/app/api/_utils';

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

/**
 * 默认是「归档」——可恢复，符合本项目一贯的数据安全取向。
 * 传 `?permanent=true` 才是真删除，且只对已归档项目生效
 * （见 deleteProject 的说明；活动历史会保留一条删除记录）。
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const permanent = isTrueQueryValue(new URL(request.url).searchParams.get('permanent'));

    if (permanent) {
      const result = await deleteProject(id);
      if (!result) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
      return NextResponse.json({ success: true, permanent: true, ...result });
    }
    const project = await archiveProject(id);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json({ success: true, permanent: false, project });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
