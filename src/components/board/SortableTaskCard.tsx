'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Task } from '@/lib/queries/tasks';
import TaskCard from '@/components/shared/TaskCard';

interface SortableTaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function SortableTaskCard({ task, onClick }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group flex">
      {/* 拖拽手柄 */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-7 mr-0.5 rounded-md text-muted hover:text-primary hover:bg-bg-hover cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0"
        aria-label={`拖动任务“${task.title}”到其他状态`}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <div className="flex-1">
        <TaskCard task={task} onClick={onClick} isDragging={isDragging} />
      </div>
    </div>
  );
}
