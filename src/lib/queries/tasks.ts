import { dbAll, dbGet, dbTransaction, DatabaseTransaction } from '@/lib/db';
import { nanoid } from 'nanoid';
import {
  NotFoundError,
  optionalText,
  parseDueDate,
  parseTaskPriority,
  parseTaskStage,
  requireText,
  TaskPriority,
  TaskStage,
  timestamp,
  ValidationError,
} from './validation';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  stage: TaskStage;
  priority: TaskPriority;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_color?: string;
  blockers?: Blocker[];
}

export interface CreateTaskInput {
  project_id: string;
  title: string;
  description?: string;
  stage?: TaskStage;
  priority?: TaskPriority;
  due_date?: string | null;
  blocker_reason?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  stage?: TaskStage;
  priority?: TaskPriority;
  due_date?: string | null;
  sort_order?: number;
  blocker_reason?: string;
}

export interface Blocker {
  id: string;
  task_id: string;
  reason: string;
  resolved: number;
  created_at: string;
  resolved_at: string | null;
}

interface ProjectState {
  id: string;
  status: string;
}

interface CountRow {
  count: number;
}

interface MaxOrderRow {
  max_order: number | null;
}

function maxSortOrder(transaction: DatabaseTransaction, projectId: string, stage: TaskStage): number {
  const row = transaction.get<MaxOrderRow>(
    'SELECT MAX(sort_order) AS max_order FROM tasks WHERE stage = ? AND project_id = ?',
    [stage, projectId],
  );
  return (row?.max_order ?? -1) + 1;
}

function getTaskInTransaction(transaction: DatabaseTransaction, id: string): Task | undefined {
  return transaction.get<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
}

function assertProjectAvailable(transaction: DatabaseTransaction, projectId: string): ProjectState {
  const project = transaction.get<ProjectState>('SELECT id, status FROM projects WHERE id = ?', [projectId]);
  if (!project) throw new NotFoundError('所属项目不存在');
  if (project.status === 'archived') throw new ValidationError('已归档项目不能新增或恢复任务');
  return project;
}

function addActivity(
  transaction: DatabaseTransaction,
  taskId: string,
  projectId: string,
  action: string,
  detail: Record<string, unknown>,
  createdAt: string,
): void {
  transaction.run(
    'INSERT INTO activity_log (id, task_id, project_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [nanoid(), taskId, projectId, action, JSON.stringify(detail), createdAt],
  );
}

async function attachBlockers(task: Task): Promise<Task> {
  task.blockers = await getTaskBlockers(task.id);
  return task;
}

export async function getAllTasks(projectId?: string, includeArchived = false): Promise<Task[]> {
  let sql = `
    SELECT t.*, p.name AS project_name, p.color AS project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE 1 = 1
  `;
  const params: string[] = [];

  if (!includeArchived) sql += " AND p.status != 'archived' AND t.stage != 'archived'";
  if (projectId) {
    sql += ' AND t.project_id = ?';
    params.push(projectId);
  }
  sql += ' ORDER BY t.sort_order ASC, t.created_at DESC';

  const tasks = await dbAll<Task>(sql, params);
  return Promise.all(tasks.map(attachBlockers));
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const task = await dbGet<Task>(`
    SELECT t.*, p.name AS project_name, p.color AS project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `, [id]);
  if (task) await attachBlockers(task);
  return task;
}

export async function getTaskBlockers(taskId: string): Promise<Blocker[]> {
  return dbAll<Blocker>(
    'SELECT * FROM blockers WHERE task_id = ? AND resolved = 0 ORDER BY created_at DESC',
    [taskId],
  );
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const id = nanoid();
  const now = timestamp();
  const projectId = requireText(input.project_id, '所属项目');
  const title = requireText(input.title, '任务标题');
  const description = optionalText(input.description, '任务描述') ?? '';
  const stage = input.stage === undefined ? 'todo' : parseTaskStage(input.stage);
  const priority = input.priority === undefined ? 'medium' : parseTaskPriority(input.priority);
  const dueDate = input.due_date === undefined ? null : parseDueDate(input.due_date);
  const blockerReason = optionalText(input.blocker_reason, '阻塞原因');

  if (stage === 'archived') throw new ValidationError('新任务不能直接创建为已归档状态');
  if (stage === 'blocked' && !blockerReason) throw new ValidationError('阻塞任务必须填写阻塞原因');

  await dbTransaction((transaction) => {
    assertProjectAvailable(transaction, projectId);
    const sortOrder = maxSortOrder(transaction, projectId, stage);

    transaction.run(
      `INSERT INTO tasks
        (id, project_id, title, description, stage, priority, due_date, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, title, description, stage, priority, dueDate, sortOrder, now, now],
    );

    if (stage === 'blocked') {
      transaction.run(
        'INSERT INTO blockers (id, task_id, reason, resolved, created_at) VALUES (?, ?, ?, 0, ?)',
        [nanoid(), id, blockerReason!, now],
      );
    }

    addActivity(transaction, id, projectId, 'task_created', { title, stage }, now);
  });

  return (await getTaskById(id))!;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
  const nextTitle = input.title === undefined ? undefined : requireText(input.title, '任务标题');
  const nextDescription = input.description === undefined
    ? undefined
    : optionalText(input.description, '任务描述') ?? '';
  const nextPriority = input.priority === undefined ? undefined : parseTaskPriority(input.priority);
  const nextDueDate = input.due_date === undefined ? undefined : parseDueDate(input.due_date);
  const nextStage = input.stage === undefined ? undefined : parseTaskStage(input.stage);
  const blockerReason = optionalText(input.blocker_reason, '阻塞原因');

  if (input.sort_order !== undefined && (!Number.isSafeInteger(input.sort_order) || input.sort_order < 0)) {
    throw new ValidationError('任务排序必须是非负整数');
  }
  if (blockerReason && nextStage === undefined) {
    throw new ValidationError('填写阻塞原因时必须同时指定任务阶段');
  }

  let found = true;
  await dbTransaction((transaction) => {
    const task = getTaskInTransaction(transaction, id);
    if (!task) {
      found = false;
      return;
    }
    assertProjectAvailable(transaction, task.project_id);
    if (task.stage === 'archived') {
      if (nextStage === undefined || nextStage === 'archived') {
        throw new ValidationError('请先恢复任务，再修改任务内容');
      }
      if (
        nextTitle !== undefined
        || nextDescription !== undefined
        || nextPriority !== undefined
        || input.due_date !== undefined
        || input.sort_order !== undefined
        || blockerReason
      ) {
        throw new ValidationError('恢复任务时不能同时修改其他内容');
      }
    }

    const sets: string[] = [];
    const values: (string | number | Uint8Array | null)[] = [];
    const now = timestamp();

    if (nextTitle !== undefined) { sets.push('title = ?'); values.push(nextTitle); }
    if (nextDescription !== undefined) { sets.push('description = ?'); values.push(nextDescription); }
    if (nextPriority !== undefined) { sets.push('priority = ?'); values.push(nextPriority); }
    if (input.due_date !== undefined) { sets.push('due_date = ?'); values.push(nextDueDate ?? null); }
    if (input.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(input.sort_order); }

    if (nextStage !== undefined) {
      const activeBlockers = transaction.get<CountRow>(
        'SELECT COUNT(*) AS count FROM blockers WHERE task_id = ? AND resolved = 0',
        [id],
      )?.count ?? 0;

      if (nextStage === 'blocked' && activeBlockers === 0 && !blockerReason) {
        throw new ValidationError('阻塞任务必须填写阻塞原因');
      }

      if (nextStage === 'blocked' && blockerReason) {
        transaction.run(
          'INSERT INTO blockers (id, task_id, reason, resolved, created_at) VALUES (?, ?, ?, 0, ?)',
          [nanoid(), id, blockerReason, now],
        );
        addActivity(transaction, id, task.project_id, 'blocker_added', { reason: blockerReason }, now);
      }

      if (task.stage !== nextStage) {
        sets.push('stage = ?', 'sort_order = ?');
        values.push(nextStage, maxSortOrder(transaction, task.project_id, nextStage));

        if (nextStage === 'archived' || (task.stage === 'blocked' && nextStage !== 'blocked')) {
          transaction.run(
            'UPDATE blockers SET resolved = 1, resolved_at = ? WHERE task_id = ? AND resolved = 0',
            [now, id],
          );
        }

        const detail: Record<string, unknown> = { from: task.stage, to: nextStage };
        if (blockerReason) detail.blocker_reason = blockerReason;
        addActivity(transaction, id, task.project_id, 'stage_changed', detail, now);
      }
    }

    if (sets.length > 0 || blockerReason) {
      sets.push('updated_at = ?');
      values.push(now, id);
      transaction.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values);
    }
  });

  return found ? getTaskById(id) : undefined;
}

export async function updateTaskStage(
  id: string,
  requestedStage: string,
  blockerReasonOrLegacyProjectId?: string,
  legacyBlockerReason?: string,
): Promise<Task | undefined> {
  // 四参数旧调用的 project_id 仅为兼容占位，业务归属始终从任务记录读取。
  const blockerReason = legacyBlockerReason ?? blockerReasonOrLegacyProjectId;
  return updateTask(id, {
    stage: parseTaskStage(requestedStage),
    blocker_reason: optionalText(blockerReason, '阻塞原因'),
  });
}

export async function archiveTask(id: string): Promise<Task | undefined> {
  return updateTaskStage(id, 'archived');
}

export async function addBlocker(
  taskId: string,
  rawReason: string,
  legacyProjectId?: string,
): Promise<Blocker> {
  // 兼容旧调用签名，但绝不信任客户端传入的项目归属。
  void legacyProjectId;
  const reason = requireText(rawReason, '阻塞原因');
  const now = timestamp();

  return dbTransaction((transaction) => {
    const task = getTaskInTransaction(transaction, taskId);
    if (!task) throw new NotFoundError('任务不存在');
    assertProjectAvailable(transaction, task.project_id);
    if (task.stage === 'archived') throw new ValidationError('已归档任务不能添加阻塞原因');

    if (task.stage !== 'blocked') {
      const sortOrder = maxSortOrder(transaction, task.project_id, 'blocked');
      transaction.run(
        'UPDATE tasks SET stage = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        ['blocked', sortOrder, now, taskId],
      );
      addActivity(
        transaction,
        taskId,
        task.project_id,
        'stage_changed',
        { from: task.stage, to: 'blocked', blocker_reason: reason },
        now,
      );
    }

    const blockerId = nanoid();
    transaction.run(
      'INSERT INTO blockers (id, task_id, reason, resolved, created_at) VALUES (?, ?, ?, 0, ?)',
      [blockerId, taskId, reason, now],
    );
    addActivity(transaction, taskId, task.project_id, 'blocker_added', { reason }, now);
    return transaction.get<Blocker>('SELECT * FROM blockers WHERE id = ?', [blockerId])!;
  });
}

export async function resolveBlocker(id: string): Promise<Task> {
  let taskId = '';

  await dbTransaction((transaction) => {
    const blocker = transaction.get<Blocker>('SELECT * FROM blockers WHERE id = ?', [id]);
    if (!blocker) throw new NotFoundError('阻塞记录不存在');
    taskId = blocker.task_id;
    if (blocker.resolved === 1) return;

    const task = getTaskInTransaction(transaction, blocker.task_id);
    if (!task) throw new NotFoundError('阻塞记录对应的任务不存在');
    assertProjectAvailable(transaction, task.project_id);
    const now = timestamp();

    transaction.run(
      'UPDATE blockers SET resolved = 1, resolved_at = ? WHERE id = ?',
      [now, id],
    );
    addActivity(transaction, task.id, task.project_id, 'blocker_resolved', { reason: blocker.reason }, now);

    const remaining = transaction.get<CountRow>(
      'SELECT COUNT(*) AS count FROM blockers WHERE task_id = ? AND resolved = 0',
      [task.id],
    )?.count ?? 0;

    if (task.stage === 'blocked' && remaining === 0) {
      const nextStage: TaskStage = 'in_progress';
      const sortOrder = maxSortOrder(transaction, task.project_id, nextStage);
      transaction.run(
        'UPDATE tasks SET stage = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        [nextStage, sortOrder, now, task.id],
      );
      addActivity(
        transaction,
        task.id,
        task.project_id,
        'stage_changed',
        { from: 'blocked', to: nextStage, reason: 'last_blocker_resolved' },
        now,
      );
    }
  });

  return (await getTaskById(taskId))!;
}
