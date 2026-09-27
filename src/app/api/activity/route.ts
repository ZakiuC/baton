import { NextRequest, NextResponse } from 'next/server';
import { getRecentActivity } from '@/lib/queries/activity';
import { apiErrorResponse } from '@/app/api/_utils';

export async function GET(request: NextRequest) {
  try {
    const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined;
    const activities = await getRecentActivity(limit, projectId);
    return NextResponse.json(activities);
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
