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
  /**
   * 可拖拽时传入 dnd-kit 的 attributes + listeners。
   * 传入后卡片渲染为 div[role=button]，因为拖拽要求这些属性与 onClick
   * 落在同一个节点上，而那个节点不能是 button——否则拖动时游标/键盘行为
   * 会被按钮语义干扰，也无法承载 dnd-kit 的 aria 属性。
   */
  dragHandleProps?: Record<string, unknown>;
}

export default function TaskCard({
  task,
  onClick,
  compact,
  isDragging,
  style,
  dragHandleProps,
}: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const overdue = isOverdue(task.due_date);
  const isBlocked = task.stage === 'blocked';
  const priorityClass = {
    urgent: 'text-danger bg-danger-light',
    high: 'text-warning bg-warning-subtle',
    medium: 'text-accent bg-accent-subtler',
    low: 'text-muted bg-muted-subtle',
  }[task.priority] || 'text-accent bg-accent-subtler';

  const interactive = Boolean(onClick) && !isDragging;
  // 拖动时只降低透明度，不做缩放：dnd-kit 的 DragOverlay 会在拖拽开始时
  // 量取被拖卡片的尺寸，若此时卡片正被 scale-95 缩小，覆盖层就会按缩小后
  // 的尺寸渲染（实测 218 vs 229），松手/移动时看起来就是「偏离鼠标」。
  const className = `
    card interactive-card w-full p-3 text-left group
    ${isDragging ? 'opacity-40' : ''}
    ${isBlocked ? 'task-blocked' : ''}
    ${dragHandleProps && interactive ? 'cursor-grab active:cursor-grabbing' : ''}
  `;
  const ariaLabel = onClick ? `打开任务：${task.title}` : `任务：${task.title}`;

  const content = (
    <>
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
    </>
  );

  if (dragHandleProps) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-disabled={!interactive}
        onClick={interactive ? onClick : undefined}
        onKeyDown={(event) => {
          // dnd-kit 用空格/回车拾取拖拽，这里只处理可访问的「打开」操作
          if (!interactive) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            onClick?.();
          }
        }}
        style={style}
        className={className}
        {...dragHandleProps}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || isDragging}
      style={style}
      className={className}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
