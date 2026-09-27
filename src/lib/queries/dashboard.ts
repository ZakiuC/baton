import { dbAll, dbGet } from '@/lib/db';
import { Task } from './tasks';
import { localDate } from './validation';

export interface DashboardStats {
  activeProjects: number;
  inProgressTasks: number;
  blockedTasks: number;
  todayDueTasks: number;
}

export interface ProjectProgress {
  id: string;
  name: string;
  color: string;
  total: number;
  done: number;
  todo: number;
  inProgress: number;
  blocked: number;
  lastActivity: string | null;
  lastActivityAction: string | null;
  lastActivityDetail: string | null;
}

export interface UrgentItem {
  type: 'urgent' | 'overdue' | 'blocked';
  task: Task;
}

interface ProjectRow {
  id: string;
  name: string;
  color: string;
}

interface ProjectTaskStats {
  total: number;
  done: number;
  todo: number;
  in_progress: number;
  blocked: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = localDate();

  const [activeProj, inProg, blocked, todayDue] = await Promise.all([
    dbGet<{ count: number }>('SELECT COUNT(*) as count FROM projects WHERE status = ?', ['active']),
    dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.stage = 'in_progress' AND p.status != 'archived'`),
    dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.stage = 'blocked' AND p.status != 'archived'`),
    dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.due_date = ? AND t.stage NOT IN ('done', 'archived') AND p.status != 'archived'`, [today]),
  ]);

  return {
    activeProjects: activeProj?.count || 0,
    inProgressTasks: inProg?.count || 0,
    blockedTasks: blocked?.count || 0,
    todayDueTasks: todayDue?.count || 0,
  };
}

export async function getProjectProgress(): Promise<ProjectProgress[]> {
  const projects = await dbAll<ProjectRow>(
    'SELECT id, name, color FROM projects WHERE status = ? ORDER BY created_at DESC',
    ['active'],
  );

  return Promise.all(projects.map(async (project) => {
    const stats = await dbGet<ProjectTaskStats>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN stage = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN stage = 'todo' THEN 1 ELSE 0 END) as todo,
        SUM(CASE WHEN stage = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN stage = 'blocked' THEN 1 ELSE 0 END) as blocked
      FROM tasks WHERE project_id = ? AND stage != 'archived'
    `, [project.id]);

    const lastActivity = await dbGet<{ action: string; detail: string; created_at: string }>(`
      SELECT action, detail, created_at FROM activity_log
      WHERE project_id = ? OR task_id IN (SELECT id FROM tasks WHERE project_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `, [project.id, project.id]);

    return {
      id: project.id,
      name: project.name,
      color: project.color,
      total: stats?.total || 0,
      done: stats?.done || 0,
      todo: stats?.todo || 0,
      inProgress: stats?.in_progress || 0,
      blocked: stats?.blocked || 0,
      lastActivity: lastActivity?.created_at || null,
      lastActivityAction: lastActivity?.action || null,
      lastActivityDetail: lastActivity?.detail || null,
    };
  }));
}

export async function getUrgentItems(): Promise<UrgentItem[]> {
  const today = localDate();
  const items: UrgentItem[] = [];

  // 紧急优先级任务
  const urgentTasks = await dbAll<Task>(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.priority = 'urgent' AND t.stage NOT IN ('done', 'archived') AND p.status != 'archived'
    ORDER BY t.created_at DESC
  `);
  urgentTasks.forEach(t => items.push({ type: 'urgent' as const, task: t }));

  // 已过期的任务
  const overdueTasks = await dbAll<Task>(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.due_date < ? AND t.stage NOT IN ('done', 'archived') AND p.status != 'archived' AND t.priority != 'urgent'
    ORDER BY t.due_date ASC
  `, [today]);
  overdueTasks.forEach(t => items.push({ type: 'overdue' as const, task: t }));

  // 被阻塞的任务
  const blockedTasks = await dbAll<Task>(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.stage = 'blocked' AND p.status != 'archived' AND t.priority != 'urgent'
    ORDER BY t.updated_at DESC
  `);
  blockedTasks.forEach(t => items.push({ type: 'blocked' as const, task: t }));

  return items;
}
