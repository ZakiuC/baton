'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragEndEvent,
  KeyboardSensor,
  Announcements,
  ScreenReaderInstructions,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Task } from '@/lib/queries/tasks';
import { Project } from '@/lib/queries/projects';
import KanbanColumn from '@/components/board/KanbanColumn';
import TaskDetail from '@/components/forms/TaskDetail';
import BlockerForm from '@/components/forms/BlockerForm';
import { useFeedback } from '@/components/shared/Feedback';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

const STAGES = ['todo', 'in_progress', 'blocked', 'done'];
const STAGE_LABELS: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  blocked: '阻塞',
  done: '已完成',
};
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable: '按空格键拾取任务，使用方向键移动，再按空格键放置；按 Escape 键取消。',
};

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [blockerTask, setBlockerTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useFeedback();
  const announcements = useMemo<Announcements>(() => {
    const taskTitle = (id: string | number) => tasks.find((task) => task.id === id)?.title || '当前任务';
    const targetLabel = (id: string | number) => {
      const stage = STAGES.includes(String(id))
        ? String(id)
        : tasks.find((task) => task.id === id)?.stage;
      return stage ? STAGE_LABELS[stage] : undefined;
    };
    return {
      onDragStart: ({ active }) => `已拾取任务“${taskTitle(active.id)}”。`,
      onDragOver: ({ active, over }) => over
        ? `任务“${taskTitle(active.id)}”当前位于${targetLabel(over.id) || '看板'}区域。`
        : `任务“${taskTitle(active.id)}”当前不在可放置区域。`,
      onDragEnd: ({ active, over }) => over
        ? `已将任务“${taskTitle(active.id)}”放到${targetLabel(over.id) || '看板'}区域。`
        : `任务“${taskTitle(active.id)}”未移动。`,
      onDragCancel: ({ active }) => `已取消移动任务“${taskTitle(active.id)}”。`,
    };
  }, [tasks]);

  // 整张卡片都是拖拽区，因此必须把「点击打开」和「长按拖动」分开：
  // 按住 250ms 才进入拖拽，短按交给 onClick 打开详情。
  // tolerance 给手指/鼠标一点抖动余量，避免轻微移动就取消长按。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadData = useCallback(() => {
    Promise.all([
      apiRequest<Task[]>('/api/tasks'),
      apiRequest<Project[]>('/api/projects'),
    ])
      .then(([tasksData, projectsData]) => {
        setError(null);
        setTasks(tasksData);
        setProjects(projectsData);
      })
      .catch((loadError: unknown) => setError(getErrorMessage(loadError, '看板加载失败，请重试')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    const handler = () => loadData();
    window.addEventListener('task-created', handler);
    window.addEventListener('task-updated', handler);
    return () => {
      window.removeEventListener('task-created', handler);
      window.removeEventListener('task-updated', handler);
    };
  }, [loadData]);

  const activeProjects = projects.filter((p) => p.status === 'active');

  const toggleProject = (id: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredTasks = selectedProjects.size > 0
    ? tasks.filter((t) => selectedProjects.has(t.project_id))
    : tasks;

  const getTasksByStage = (stage: string) => filteredTasks.filter((t) => t.stage === stage);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    let targetStage: string;
    if (STAGES.includes(over.id as string)) {
      targetStage = over.id as string;
    } else {
      targetStage = tasks.find((t) => t.id === over.id)?.stage || task.stage;
    }
    if (targetStage === task.stage) return;
    if (targetStage === 'blocked') { setBlockerTask(task); return; }
    const newStage = targetStage as Task['stage'];
    const previousTasks = tasks;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, stage: newStage } : t));
    try {
      await apiRequest<Task>(`/api/tasks/${taskId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: targetStage }),
      });
      notify(`任务已移至“${targetStage === 'in_progress' ? '进行中' : targetStage === 'done' ? '已完成' : '待办'}”`, 'success');
      window.dispatchEvent(new CustomEvent('task-updated'));
    } catch (moveError: unknown) {
      setTasks(previousTasks);
      notify(getErrorMessage(moveError, '状态更新失败，已恢复原状态'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col animate-fade-in">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="space-y-1.5">
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton h-3 w-32 rounded" />
          </div>
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-7 w-20 rounded-full" />)}
          </div>
        </div>
        <div className="flex-1 p-4 grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card rounded-xl overflow-hidden">
              <div className="skeleton h-1 w-full" />
              <div className="p-3 space-y-2">
                <div className="skeleton h-4 w-20 rounded" />
                <div className="skeleton h-1 w-full rounded" />
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="card p-2.5 space-y-2 rounded-lg">
                    <div className="skeleton h-3 w-full rounded" />
                    <div className="skeleton h-3 w-2/3 rounded" />
                    <div className="flex gap-1.5">
                      <div className="skeleton h-3 w-10 rounded" />
                      <div className="skeleton h-3 w-14 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 顶部：标题 + 筛选器 */}
      <div
        className="px-6 py-3.5 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid var(--t-border)' }}
      >
        <div>
          <h1 className="text-base font-bold text-primary">看板</h1>
          <p className="text-xs text-muted mt-0.5">拖拽任务卡片改变状态</p>
        </div>

        {/* 项目筛选 */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end" aria-label="项目筛选">
          <button
            type="button"
            onClick={() => setSelectedProjects(new Set())}
            aria-pressed={selectedProjects.size === 0}
            className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
              selectedProjects.size === 0
                ? 'border-accent bg-accent-subtle text-accent'
                : 'border-border text-muted hover:text-primary hover:border-border-hover'
            }`}
          >
            全部项目
          </button>
          {activeProjects.map((p) => {
            const selected = selectedProjects.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleProject(p.id)}
                aria-pressed={selected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  color: selected ? p.color : 'var(--t-muted)',
                  background: selected ? `${p.color}18` : 'transparent',
                  border: `1px solid ${selected ? p.color : 'var(--t-border)'}`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 看板主体 */}
      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="empty-state min-h-[320px]">
            <p className="text-sm text-danger" role="alert">{error}</p>
            <button type="button" onClick={loadData} className="btn-secondary mt-4">重新加载</button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            accessibility={{ announcements, screenReaderInstructions }}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-[repeat(4,minmax(260px,1fr))] gap-3 h-full min-h-[400px] min-w-[1080px]">
              {STAGES.map((stage) => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  tasks={getTasksByStage(stage)}
                  onTaskClick={(id) => setSelectedTaskId(id)}
                />
              ))}
            </div>
            {/*
              刻意不使用 DragOverlay：它会把卡片复制到一个独立的定位层里，
              坐标依赖 dnd-kit 自己那套滚动补偿，而这个看板是横向可滚动的，
              于是卡片位置会偏离鼠标（用户报的偏移 bug）。
              去掉之后由 useSortable 的 transform 直接移动卡片本体，
              坐标基准与鼠标一致，也就不存在偏移。
            */}
          </DndContext>
        )}
      </div>

      {selectedTaskId && (
        <TaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
      {blockerTask && (
        <BlockerForm
          taskId={blockerTask.id}
          taskTitle={blockerTask.title}
          onClose={() => setBlockerTask(null)}
          onCreated={() => {
            setBlockerTask(null);
            notify('已记录阻塞原因', 'success');
          }}
        />
      )}
    </div>
  );
}
