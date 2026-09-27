'use client';

import { AlertTriangle, Calendar } from 'lucide-react';
import { Task } from '@/lib/queries/tasks';
import { PRIORITY_CONFIG, formatDate, isOverdue } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  compact?: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

export default function TaskCard({ task, onClick, compact, isDragging, style }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const overdue = isOverdue(task.due_date);
  const isBlocked = task.stage === 'blocked';
  const priorityClass = {
    urgent: 'text-danger bg-danger-light',
    high: 'text-warning bg-warning-subtle',
    medium: 'text-accent bg-accent-subtler',
    low: 'text-muted bg-muted-subtle',
  }[task.priority] || 'text-accent bg-accent-subtler';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || isDragging}
      style={style}
      className={`
        card interactive-card w-full p-3 text-left group
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${isBlocked ? 'task-blocked' : ''}
      `}
      aria-label={onClick ? `打开任务：${task.title}` : `任务：${task.title}`}
    >
      {/* 项目标识色横条（非阻塞状态）*/}
      {!isBlocked && (
        <div
          className="h-[2px] rounded-full mb-2.5 opacity-70"
          style={{ backgroundColor: task.project_color || '#6366F1' }}
          aria-hidden="true"
        />
      )}

      {/* 标题 */}
      <p className={`text-sm text-primary leading-snug ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>
        {task.title}
      </p>

      {/* 底部信息行 */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {/* 优先级 */}
        <span className={`badge ${priorityClass}`}>
          {priority.label}
        </span>

        {/* 日期 */}
        {task.due_date && (
          <span
            className={`badge flex items-center gap-1 ${
              overdue ? 'text-danger bg-danger-light' : 'text-muted bg-bg-hover'
            }`}
          >
            <Calendar size={10} aria-hidden="true" />
            {formatDate(task.due_date)}
          </span>
        )}

        {/* 阻塞标记 */}
        {isBlocked && task.blockers && task.blockers.length > 0 && (
          <span
            className="badge flex items-center gap-1 text-danger bg-danger-light"
            title={task.blockers[0].reason}
          >
            <AlertTriangle size={10} aria-hidden="true" />
            {task.blockers[0].reason.length > 14
              ? task.blockers[0].reason.slice(0, 14) + '…'
              : task.blockers[0].reason}
          </span>
        )}

        {/* 项目标签（跨项目视图：compact=false时；单项目视图：compact=true隐藏） */}
        {!compact && task.project_name && (
          <span
            className="badge max-w-[46%] ml-auto text-primary"
            style={{
              background: task.project_color ? `${task.project_color}18` : 'var(--t-bg-hover)',
              borderLeft: `2px solid ${task.project_color || 'var(--t-muted)'}`,
            }}
          >
            <span className="truncate">{task.project_name}</span>
          </span>
        )}
      </div>
    </button>
  );
}
