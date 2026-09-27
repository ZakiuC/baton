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
