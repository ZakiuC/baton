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

/**
 * 整张卡片都是拖拽激活区，点击打开详情、长按拖动（见 board/page.tsx 的
 * PointerSensor 长按约束）。
 *
 * 两个关键点，都是踩过的坑：
 *  1. setNodeRef 与 listeners 必须挂在同一个节点上。此前 ref 在外层容器、
 *     listeners 却在内侧那个 28px 宽的手柄按钮上，dnd-kit 于是把「手柄」
 *     当作被拖拽元素来测量与定位：只有手柄能发起拖动，且拖动时定位基准
 *     与卡片不一致。
 *  2. 手柄不能再占据布局宽度。只要卡片比拖拽单元窄，dnd-kit 生成的覆盖层
 *     就会按更宽的尺寸渲染，抓取点在视觉上就偏离鼠标。因此手柄改为绝对定位
 *     在卡片内部，只作视觉提示，不参与布局。
 */
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
    <div ref={setNodeRef} style={style} className="relative group touch-none">
      <TaskCard
        task={task}
        onClick={onClick}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      {/* 手柄只是视觉提示：绝对定位，不占布局宽度，拖拽能力在整个卡片上 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-2 flex items-center justify-center text-muted cursor-grab opacity-0 group-hover:opacity-70 transition-opacity"
      >
        <GripVertical size={13} />
      </span>
    </div>
  );
}
