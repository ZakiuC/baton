'use client';

import { Task } from '@/lib/queries/tasks';
import TaskRowContent from './TaskRowContent';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  compact?: boolean;
  muted?: boolean;
  style?: React.CSSProperties;
}

/**
 * 任务行（不是卡片盒）：整行是一个按钮。
 * 项目页与仪表盘通道共用；跨项目时显示项目名，单项目 compact 时省略。
 * 归档项目里不传 onClick，按钮禁用并改用「任务：…」的可访问名称。
 */
export default function TaskCard({ task, onClick, compact, muted, style }: TaskCardProps) {
  const blocked = task.stage === 'blocked';
  const ariaLabel = onClick ? `打开任务：${task.title}` : `任务：${task.title}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={style}
      className={`card interactive-card task-row ${blocked ? 'task-row--blocked' : ''} ${muted ? 'task-row--muted' : ''}`}
      aria-label={ariaLabel}
    >
      <TaskRowContent task={task} compact={compact} />
    </button>
  );
}
