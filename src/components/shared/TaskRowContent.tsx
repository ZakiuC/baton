import { Calendar } from 'lucide-react';
import { Task } from '@/lib/queries/tasks';
import { PRIORITY_CONFIG, STAGE_CONFIG, formatDate, isOverdue } from '@/lib/utils';

const STAGE_TONE = {
  todo: 'idle',
  in_progress: 'accent',
  blocked: 'danger',
  done: 'done',
  archived: 'idle',
} as const;

/**
 * 任务行的唯一内部结构：LED 灯 + 两行标题 + 一条元数据。
 * 看板用可拖拽的 div 包它，项目页用 button 包它，视觉完全一致。
 */
export default function TaskRowContent({ task, compact }: { task: Task; compact?: boolean }) {
  const overdue = isOverdue(task.due_date);
  const blocked = task.stage === 'blocked';
  const reason = task.blockers?.[0]?.reason;
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const stageLabel = STAGE_CONFIG[task.stage]?.label || task.stage;

  return (
    <>
      <span className={`lamp lamp--${STAGE_TONE[task.stage] || 'idle'}`} aria-hidden="true" />
      <span className="task-row-main">
        <span className="task-row-title">{task.title}</span>
        <span className="task-row-meta">
          {!compact && task.project_name ? (
            <span className="task-row-project">
              <i
                aria-hidden="true"
                style={{ width: 5, height: 5, background: task.project_color || 'var(--t-muted)', flexShrink: 0 }}
              />
              <span>{task.project_name}</span>
            </span>
          ) : null}
          <span className={`prio-tick prio-tick--${task.priority}`}>{priority.label}</span>
          {task.due_date ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: overdue ? 'var(--t-danger)' : 'inherit' }}>
              <Calendar size={9} aria-hidden="true" />
              {formatDate(task.due_date)}
            </span>
          ) : null}
          {blocked && reason ? (
            <span
              title={reason}
              style={{ color: 'var(--t-danger)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {reason.length > 16 ? `${reason.slice(0, 16)}…` : reason}
            </span>
          ) : null}
          {task.stage === 'blocked' && !reason ? (
            <span style={{ color: 'var(--t-danger)' }}>{stageLabel}</span>
          ) : null}
        </span>
      </span>
    </>
  );
}
