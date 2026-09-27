'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from '@/lib/queries/tasks';
import { STAGE_CONFIG } from '@/lib/utils';
import SortableTaskCard from './SortableTaskCard';

interface KanbanColumnProps {
  stage: string;
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

export default function KanbanColumn({ stage, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const config = STAGE_CONFIG[stage] || { label: stage, color: '#8888A0' };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border transition-[border-color,background-color,box-shadow] duration-150 min-h-[240px] ${
        isOver ? 'drag-over' : 'border-border bg-card'
      }`}
    >
      {/* 列顶部色条 */}
      <div
        className="h-[3px] rounded-t-xl opacity-80"
        style={{ backgroundColor: config.color }}
      />

      {/* 列头 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: config.color }}
        />
        <span className="text-xs font-semibold text-primary tracking-wide">{config.label}</span>
        <span
          className="ml-auto text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full"
          style={{
            color: config.color,
            background: `${config.color}18`,
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* 分割线 */}
      <div className="border-t border-border mx-2" />

      {/* 任务列表 */}
      <div
        className="flex-1 p-2 space-y-1.5 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </SortableContext>

        {/* 空列表占位 */}
        {tasks.length === 0 && (
          <div
            className="h-20 flex items-center justify-center rounded-lg border border-dashed text-[11px] text-muted transition-colors"
            style={{ borderColor: isOver ? config.color : 'var(--t-border)' }}
          >
            拖拽任务到此处
          </div>
        )}
      </div>
    </div>
  );
}
