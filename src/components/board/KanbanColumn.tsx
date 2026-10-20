'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from '@/lib/queries/tasks';
import { STAGE_CONFIG } from '@/lib/utils';
import SortableTaskRow from './SortableTaskRow';
import Lamp from '@/components/shared/Lamp';

interface KanbanColumnProps {
  stage: string;
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

const STAGE_TONE = {
  todo: 'idle',
  in_progress: 'accent',
  blocked: 'danger',
  done: 'done',
} as const;

export default function KanbanColumn({ stage, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [expanded, setExpanded] = useState(false);
  const config = STAGE_CONFIG[stage] || { label: stage };
  const isDone = stage === 'done';
  const hiddenCount = isDone && !expanded ? Math.max(0, tasks.length - 3) : 0;
  const visibleTasks = hiddenCount > 0 ? tasks.slice(0, 3) : tasks;
  const tone = stage === 'blocked' && tasks.length === 0
    ? 'idle'
    : STAGE_TONE[stage as keyof typeof STAGE_TONE] || 'idle';

  return (
    <section
      ref={setNodeRef}
      className={`lane lane--${stage} ${tasks.length === 0 ? 'lane--empty' : ''} ${isOver ? 'drag-over' : ''}`}
      aria-label={config.label}
    >
      <header className="lane-head">
        <Lamp tone={tone} />
        <h2>{config.label}</h2>
        <span className="lane-count">{tasks.length}</span>
      </header>

      <div className="lane-list">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map((task) => (
            <SortableTaskRow
              key={task.id}
              task={task}
              muted={isDone}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
          {hiddenCount > 0 ? (
            <button type="button" className="lane-more" onClick={() => setExpanded(true)} aria-expanded={false}>
              展开其余 {hiddenCount} 项
            </button>
          ) : null}
          {isDone && expanded && tasks.length > 3 ? (
            <button type="button" className="lane-more" onClick={() => setExpanded(false)} aria-expanded={true}>
              收起已完成
            </button>
          ) : null}
        </SortableContext>

        {tasks.length === 0 ? (
          <div className="lane-empty">拖拽任务到此处</div>
        ) : null}
      </div>
    </section>
  );
}
