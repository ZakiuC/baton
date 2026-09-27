import { dbAll } from '@/lib/db';

export interface ActivityLog {
  id: string;
  task_id: string | null;
  project_id: string | null;
  action: string;
  detail: string;
  created_at: string;
  task_title?: string;
  project_name?: string;
  project_color?: string;
}

export async function getRecentActivity(limit: number = 20, projectId?: string): Promise<ActivityLog[]> {
  let sql = `
    SELECT a.*,
      t.title as task_title,
      p.name as project_name,
      p.color as project_color
    FROM activity_log a
    LEFT JOIN tasks t ON a.task_id = t.id
    LEFT JOIN projects p ON (a.project_id = p.id OR t.project_id = p.id)
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (projectId) {
    sql += ' AND (a.project_id = ? OR t.project_id = ?)';
    params.push(projectId, projectId);
  }
  sql += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(limit);
  return dbAll<ActivityLog>(sql, params);
}
