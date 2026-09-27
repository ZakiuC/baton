export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export const TASK_STAGES = ['todo', 'in_progress', 'blocked', 'done', 'archived'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

/** 前端会把项目颜色直接写进内联样式，因此只接受纯色十六进制值。 */
const PROJECT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type TaskStage = typeof TASK_STAGES[number];
export type TaskPriority = typeof TASK_PRIORITIES[number];

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName}不能为空`);
  }
  return value.trim();
}

export function optionalText(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${fieldName}必须是字符串`);
  return value.trim();
}

export function parseProjectColor(value: unknown): string {
  const color = requireText(value, '项目颜色');
  if (!PROJECT_COLOR_PATTERN.test(color)) {
    throw new ValidationError('项目颜色必须是 #RRGGBB 格式的十六进制颜色');
  }
  return color;
}

export function parseProjectStatus(value: unknown): ProjectStatus {
  if (!PROJECT_STATUSES.includes(value as ProjectStatus)) {
    throw new ValidationError(`项目状态必须是 ${PROJECT_STATUSES.join('、')} 之一`);
  }
  return value as ProjectStatus;
}

export function parseTaskStage(value: unknown): TaskStage {
  if (!TASK_STAGES.includes(value as TaskStage)) {
    throw new ValidationError(`任务阶段必须是 ${TASK_STAGES.join('、')} 之一`);
  }
  return value as TaskStage;
}

export function parseTaskPriority(value: unknown): TaskPriority {
  if (!TASK_PRIORITIES.includes(value as TaskPriority)) {
    throw new ValidationError(`任务优先级必须是 ${TASK_PRIORITIES.join('、')} 之一`);
  }
  return value as TaskPriority;
}

/** 截止日期是「日历日期」，不带时区，必须原样保存才能按字符串正确比较。 */
export function parseDueDate(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('截止日期必须是 YYYY-MM-DD 格式');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new ValidationError('截止日期不是有效日期');
  }
  return value;
}

/**
 * 所有 created_at / updated_at 统一使用 UTC ISO 8601（带 Z）。
 * 历史上这里写的是 +08:00 偏移格式，导致同一个库中混着两种时间戳，
 * 任何跨行的时间字符串比较都不可靠；date-fns 的 parseISO 可以直接解析
 * 毫秒精度的 Z 格式。
 */
export function timestamp(date = new Date()): string {
  return date.toISOString();
}

/** 本机日历日期（YYYY-MM-DD），用于与 due_date 这类日期字段比较。 */
export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
