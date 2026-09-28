import { dbAll, dbGet, dbRun, dbTransaction } from '@/lib/db';
import { nanoid } from 'nanoid';
import {
  optionalText,
  parseProjectColor,
  parseProjectStatus,
  ProjectStatus,
  requireText,
  timestamp,
  ValidationError,
} from './validation';

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
}

export async function getAllProjects(includeArchived = false): Promise<Project[]> {
  if (includeArchived) return dbAll<Project>('SELECT * FROM projects ORDER BY created_at DESC');
  return dbAll<Project>('SELECT * FROM projects WHERE status != ? ORDER BY created_at DESC', ['archived']);
}

export async function getArchivedProjects(): Promise<Project[]> {
  return dbAll<Project>('SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC', ['archived']);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  return dbGet<Project>('SELECT * FROM projects WHERE id = ?', [id]);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const id = nanoid();
  const now = timestamp();
  const name = requireText(input.name, '项目名称');
  const color = parseProjectColor(input.color);
  const description = optionalText(input.description, '项目描述') ?? '';

  await dbRun(
    'INSERT INTO projects (id, name, description, color, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, description, color, 'active', now, now],
  );
  return (await getProjectById(id))!;
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
  const nextName = input.name === undefined ? undefined : requireText(input.name, '项目名称');
  const nextDescription = input.description === undefined
    ? undefined
    : optionalText(input.description, '项目描述') ?? '';
  const nextColor = input.color === undefined ? undefined : parseProjectColor(input.color);
  const nextStatus = input.status === undefined ? undefined : parseProjectStatus(input.status);
  let result: Project | undefined;

  await dbTransaction((transaction) => {
    const project = transaction.get<Project>('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project) return;

    if (project.status === 'archived') {
      if (nextStatus === undefined || nextStatus === 'archived') {
        throw new ValidationError('请先恢复项目，再修改项目内容');
      }
      if (nextName !== undefined || nextDescription !== undefined || nextColor !== undefined) {
        throw new ValidationError('恢复项目时不能同时修改其他内容');
      }
    }

    const sets: string[] = [];
    const values: (string | number | Uint8Array | null)[] = [];
    if (nextName !== undefined) { sets.push('name = ?'); values.push(nextName); }
    if (nextDescription !== undefined) { sets.push('description = ?'); values.push(nextDescription); }
    if (nextColor !== undefined) { sets.push('color = ?'); values.push(nextColor); }
    if (nextStatus !== undefined) { sets.push('status = ?'); values.push(nextStatus); }

    if (sets.length === 0) {
      result = project;
      return;
    }

    sets.push('updated_at = ?');
    values.push(timestamp(), id);
    transaction.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, values);
    result = transaction.get<Project>('SELECT * FROM projects WHERE id = ?', [id]);
  });

  return result;
}

export async function archiveProject(id: string): Promise<Project | undefined> {
  return updateProject(id, { status: 'archived' });
}

export interface DeletedProjectSummary {
  deletedTasks: number;
  deletedBlockers: number;
  /** 被解除关联的活动记录数（schema 是 ON DELETE SET NULL，记录保留、关联置空）。 */
  detachedActivities: number;
}

/**
 * 永久删除项目。
 *
 * 只允许删除「已归档」的项目：归档是常规操作，删除是不可逆的，
 * 因此把归档当作一道确认关卡，必须先归档才能永久删除。
 *
 * **不依赖 ON DELETE CASCADE**：schema 里虽然写了级联，但 sql.js 的
 * `PRAGMA foreign_keys` 默认关闭，实测即便在初始化时把它设为 ON，
 * 删除项目后任务行依然残留（变成指向不存在项目的孤儿行），
 * activity_log 的 ON DELETE SET NULL 也没有生效。
 * 因此这里显式按子表 → 父表的顺序手工级联，保证结果与 schema 声明的语义一致，
 * 并且不依赖连接级开关。所有语句都在同一事务里，失败会整体回滚。
 */
export async function deleteProject(id: string): Promise<DeletedProjectSummary | undefined> {
  const project = await getProjectById(id);
  if (!project) return undefined;
  if (project.status !== 'archived') {
    throw new ValidationError('只能永久删除已归档的项目，请先归档');
  }

  return dbTransaction((transaction) => {
    const taskIds = transaction
      .all<{ id: string }>('SELECT id FROM tasks WHERE project_id = ?', [id])
      .map((row) => row.id);

    const deletedBlockers = taskIds.length > 0
      ? transaction.all<{ id: string }>(
        `SELECT id FROM blockers WHERE task_id IN (${taskIds.map(() => '?').join(', ')})`,
        taskIds,
      ).length
      : 0;

    // 先写活动记录再删除：删除后 project_id 会被置空，只剩项目名可读。
    transaction.run(
      'INSERT INTO activity_log (id, task_id, project_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        nanoid(),
        null,
        id,
        'project_deleted',
        JSON.stringify({ name: project.name, tasks: taskIds.length }),
        timestamp(),
      ],
    );

    // 手工级联：阻塞 → 任务 → 项目
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(', ');
      transaction.run(`DELETE FROM blockers WHERE task_id IN (${placeholders})`, taskIds);
      transaction.run(`DELETE FROM tasks WHERE id IN (${placeholders})`, taskIds);
    }
    transaction.run('DELETE FROM projects WHERE id = ?', [id]);

    // 解除活动记录里指向该项目的关联（对齐 schema 声明的 SET NULL 语义）。
    // 先数清楚有多少条会被解除，再执行更新。
    const detachedActivities = transaction.get<{ count: number }>(
      taskIds.length > 0
        ? `SELECT COUNT(*) AS count FROM activity_log
           WHERE project_id = ? OR task_id IN (${taskIds.map(() => '?').join(', ')})`
        : 'SELECT COUNT(*) AS count FROM activity_log WHERE project_id = ?',
      taskIds.length > 0 ? [id, ...taskIds] : [id],
    )?.count ?? 0;

    transaction.run('UPDATE activity_log SET project_id = NULL WHERE project_id = ?', [id]);
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(', ');
      transaction.run(`UPDATE activity_log SET task_id = NULL WHERE task_id IN (${placeholders})`, taskIds);
    }

    return { deletedTasks: taskIds.length, deletedBlockers, detachedActivities };
  });
}
