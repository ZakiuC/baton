'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Task } from '@/lib/queries/tasks';
import TaskRowContent from '@/components/shared/TaskRowContent';

/**
 * 可拖拽任务行：dnd-kit 的 ref / listeners / attributes 与卡片本体是同一个节点，
 * 这样拖动时被测量的尺寸和坐标就是行本身，不会偏（沿用上一版踩坑结论）。
 * 长按 250ms 进入拖拽、短按打开详情的行为由看板页的 sensors 保证。
 */
export default function SortableTaskRow({ task, onClick, muted }: { task: Task; onClick: () => void; muted?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    '--project-color': task.project_color || 'var(--t-border-mid)',
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      aria-label={`打开任务：${task.title}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onClick();
        }
      }}
      className={`card interactive-card task-row touch-none ${task.stage === 'blocked' ? 'task-row--blocked' : ''} ${muted ? 'task-row--muted' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="task-row-grip" aria-hidden="true">
        <GripVertical size={12} />
      </span>
      <TaskRowContent task={task} />
    </div>
  );
}
