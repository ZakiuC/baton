import { differenceInCalendarDays, format, formatDistanceToNow, isToday, isTomorrow, isYesterday, isPast, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 项目预设颜色：机台方向的一组信号色（新项目使用；旧项目保留库里的原色）
export const PROJECT_COLORS = [
  '#E4572E', '#D9A514', '#2FA36B', '#3B82C4',
  '#7C6BD6', '#C25B8A', '#6E7B86', '#B8BEC4',
];

// 优先级配置
export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: '紧急', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  high: { label: '高', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  medium: { label: '中', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
  low: { label: '低', color: '#8888A0', bg: 'rgba(136,136,160,0.15)' },
};

// 阶段配置：颜色一律走主题令牌，避免在浅色/深色皮肤里出现固定色。
export const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  todo: { label: '待办', color: 'var(--t-muted)' },
  in_progress: { label: '进行中', color: 'var(--t-accent)' },
  blocked: { label: '阻塞', color: 'var(--t-danger)' },
  done: { label: '已完成', color: 'var(--t-success)' },
  archived: { label: '已归档', color: 'var(--t-muted)' },
};

/** 阶段到状态灯的映射（机台方向：灯是唯一允许发光的元素）。 */
export const STAGE_TONE: Record<string, 'idle' | 'accent' | 'danger' | 'done'> = {
  todo: 'idle',
  in_progress: 'accent',
  blocked: 'danger',
  done: 'done',
  archived: 'idle',
};

/**
 * 长期任务：没有截止日期、且尚未完成或归档的任务。
 * 它们不会出现在时间线（按截止日期铺排）里，因此需要单独呈现。
 */
export function isLongTermTask(task: { due_date: string | null; stage: string }): boolean {
  const hasDueDate = Boolean(task.due_date && task.due_date.trim());
  return !hasDueDate && task.stage !== 'done' && task.stage !== 'archived';
}

// 动作标签
export const ACTION_LABELS: Record<string, string> = {
  'stage_changed': '状态变更',
  'task_created': '创建了任务',
  'blocker_added': '添加了阻塞原因',
  'blocker_resolved': '解决了阻塞原因',
  'project_deleted': '永久删除了项目',
};

/** 距某个时间点过了几个日历日；空值返回 null。 */
export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.max(0, differenceInCalendarDays(new Date(), parseISO(dateStr)));
}

/** 距离某个截止日还有几个日历日；空值返回 null，过期返回负数。 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return differenceInCalendarDays(parseISO(dateStr), new Date());
}

/** 活动流里「发生了什么」的短结果，用于日志的固定结果列。 */
export function getActivityActionLabel(action: string, detail: string): string {
  const d = parseActivityDetail(detail);
  if (action === 'stage_changed' && d.from && d.to) {
    return `${STAGE_CONFIG[d.from]?.label || d.from} → ${STAGE_CONFIG[d.to]?.label || d.to}`;
  }
  const labels: Record<string, string> = {
    task_created: '创建任务',
    blocker_added: '记录阻塞',
    blocker_resolved: '解决阻塞',
    project_deleted: '删除项目',
  };
  return labels[action] || ACTION_LABELS[action] || action;
}

/** 活动条目对应的任务名；没有任务时退回项目名。 */
export function getActivitySubject(action: string, detail: string, taskTitle?: string | null, projectName?: string | null): string {
  const d = parseActivityDetail(detail);
  if (taskTitle) return taskTitle;
  if (typeof d.title === 'string' && d.title) return d.title;
  if (projectName) return projectName;
  return ACTION_LABELS[action] || action;
}

// 日期格式化
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  if (isToday(date)) return '今天';
  if (isTomorrow(date)) return '明天';
  if (isYesterday(date)) return '昨天';
  return format(date, 'M月d日', { locale: zhCN });
}

export function formatRelativeTime(dateStr: string): string {
  const date = parseISO(dateStr);
  return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return isPast(parseISO(dateStr)) && !isToday(parseISO(dateStr));
}

export function formatDateTime(dateStr: string): string {
  return format(parseISO(dateStr), 'M月d日 HH:mm', { locale: zhCN });
}

// 计算进度百分比
export function calcProgress(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

// 解析活动详情 JSON
interface ActivityDetail {
  from?: string;
  to?: string;
  title?: string;
  reason?: string;
  [key: string]: unknown;
}

export function parseActivityDetail(detail: string): ActivityDetail {
  try {
    const parsed: unknown = JSON.parse(detail);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ActivityDetail;
    }
    return {};
  } catch {
    return {};
  }
}

// 生成活动描述文字
export function getActivityDescription(action: string, detail: string, taskTitle?: string): string {
  const d = parseActivityDetail(detail);
  switch (action) {
    case 'stage_changed':
      if (!d.from || !d.to) return '状态变更';
      const fromLabel = STAGE_CONFIG[d.from]?.label || d.from;
      const toLabel = STAGE_CONFIG[d.to]?.label || d.to;
      let desc = `${fromLabel} → ${toLabel}`;
      if (taskTitle) desc = `"${taskTitle}" ${desc}`;
      return desc;
    case 'task_created':
      return taskTitle || d.title ? `创建了任务"${taskTitle || d.title}"` : '创建了任务';
    case 'blocker_added':
      return d.reason ? `添加阻塞原因: ${d.reason}` : '添加了阻塞原因';
    default:
      return ACTION_LABELS[action] || action;
  }
}
