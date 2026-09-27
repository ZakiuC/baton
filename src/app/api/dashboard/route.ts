import { NextResponse } from 'next/server';
import { getDashboardStats, getProjectProgress, getUrgentItems } from '@/lib/queries/dashboard';
import { getRecentActivity } from '@/lib/queries/activity';
import { apiErrorResponse } from '@/app/api/_utils';

export async function GET() {
  try {
    const [stats, projects, urgentItems, recentActivity] = await Promise.all([
      getDashboardStats(),
      getProjectProgress(),
      getUrgentItems(),
      getRecentActivity(20),
    ]);

    return NextResponse.json({ stats, projects, urgentItems, recentActivity });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
