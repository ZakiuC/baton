import { NextRequest, NextResponse } from 'next/server';
import { createProject, CreateProjectInput, getAllProjects } from '@/lib/queries/projects';
import { apiErrorResponse, isTrueQueryValue, readJsonObject } from '@/app/api/_utils';

export async function GET(request: NextRequest) {
  try {
    const includeArchived = isTrueQueryValue(request.nextUrl.searchParams.get('include_archived'));
    return NextResponse.json(await getAllProjects(includeArchived));
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const project = await createProject(body as unknown as CreateProjectInput);
    return NextResponse.json(project, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
