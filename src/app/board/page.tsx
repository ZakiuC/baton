'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Task } from '@/lib/queries/tasks';
import { Project } from '@/lib/queries/projects';
import KanbanColumn from '@/components/board/KanbanColumn';
import TaskDetail from '@/components/forms/TaskDetail';
import BlockerForm from '@/components/forms/BlockerForm';
import { useFeedback } from '@/components/shared/Feedback';
import Lamp from '@/components/shared/Lamp';
import { formatDate } from '@/lib/utils';
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
  const boardScrollRef = useRef<HTMLDivElement>(null);

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

  // 整张行都是拖拽区，因此必须把「点击打开」和「拖动」分开：
  // 按下后移动超过 6px 即进入拖拽；原地短按交给 onClick 打开详情。
  // 注意不要用 delay 激活：真实用户按下后通常立刻移动，长按 250ms
  // 会把自然拖动判成「没有拖动」，这是曾经出现过的回归。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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

  const activeProjects = projects.filter((project) => project.status === 'active');

  const toggleProject = (id: string) => {
    setSelectedProjects((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredTasks = selectedProjects.size > 0
    ? tasks.filter((task) => selectedProjects.has(task.project_id))
    : tasks;

  const getTasksByStage = (stage: string) => filteredTasks.filter((task) => task.stage === stage);
  const stageCounts = STAGES.map((stage) => filteredTasks.filter((task) => task.stage === stage).length);
  const projectSummary = activeProjects.map((project) => {
    const projectTasks = filteredTasks.filter((task) => task.project_id === project.id);
    return {
      project,
      total: projectTasks.length,
      blocked: projectTasks.filter((task) => task.stage === 'blocked').length,
    };
  });
  const summaryBlocked = filteredTasks.filter((task) => task.stage === 'blocked').slice(0, 4);
  const summaryUpcoming = filteredTasks
    .filter((task) => task.due_date && task.stage !== 'done')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .slice(0, 4);

  const jumpToStage = (index: number) => {
    const scroller = boardScrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: (scroller.scrollWidth / 4) * index, behavior: 'smooth' });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    let targetStage: string;
    if (STAGES.includes(over.id as string)) {
      targetStage = over.id as string;
    } else {
      targetStage = tasks.find((item) => item.id === over.id)?.stage || task.stage;
    }
    if (targetStage === task.stage) return;
    if (targetStage === 'blocked') {
      setBlockerTask(task);
      return;
    }
    const newStage = targetStage as Task['stage'];
    const previousTasks = tasks;
    setTasks((previous) => previous.map((item) => (item.id === taskId ? { ...item, stage: newStage } : item)));
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
      <div className="board-page" aria-busy="true" aria-label="正在加载看板">
        <div className="board-toolbar">
          <div className="skeleton h-5 w-16" />
          <div className="skeleton h-6 w-64" />
        </div>
        <div className="board-scroll">
          <div className="board-grid">
            {STAGES.map((stage) => (
              <div key={stage} className="lane" style={{ padding: 10 }}>
                <div className="skeleton h-4 w-20" />
                {[0, 1, 2].map((index) => (
                  <div key={index} className="skeleton h-16 w-full" style={{ marginTop: 8 }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="board-page animate-fade-in">
      <div className="board-toolbar">
        <div>
          <h1 className="page-title" style={{ fontSize: 16 }}>看板</h1>
          <p className="page-sub">拖动任务改变阶段；原地短按打开详情</p>
        </div>

        <div className="filter-chips" aria-label="项目筛选">
          <button
            type="button"
            onClick={() => setSelectedProjects(new Set())}
            aria-pressed={selectedProjects.size === 0}
            className="filter-chip"
          >
            全部项目
          </button>
          {activeProjects.map((project) => {
            const selected = selectedProjects.has(project.id);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => toggleProject(project.id)}
                aria-pressed={selected}
                className="filter-chip"
              >
                <span aria-hidden="true" style={{ width: 5, height: 5, background: project.color, flexShrink: 0 }} />
                {project.name}
              </button>
            );
          })}
        </div>

        <span className="board-scroll-hint">横向滚动查看全部阶段</span>
      </div>

      <div className="phase-strip" aria-label="阶段总览">
        {STAGES.map((stage, index) => (
          <button
            key={stage}
            type="button"
            onClick={() => jumpToStage(index)}
            aria-label={`跳到${STAGE_LABELS[stage]}阶段，共 ${stageCounts[index]} 项`}
          >
            <Lamp tone={stage === 'blocked' && stageCounts[index] === 0 ? 'idle' : stage === 'blocked' ? 'danger' : stage === 'in_progress' ? 'accent' : stage === 'done' ? 'done' : 'idle'} />
            <span>{STAGE_LABELS[stage]}</span>
            <span className="lane-count">{stageCounts[index]}</span>
          </button>
        ))}
      </div>

      <div className="board-body">
      <div className="board-scroll" ref={boardScrollRef}>
        {error ? (
          <div className="panel" style={{ padding: 24, textAlign: 'center', maxWidth: 420, margin: '40px auto' }}>
            <AlertTriangle size={18} style={{ color: 'var(--t-warning)', margin: '0 auto 8px' }} aria-hidden="true" />
            <p style={{ color: 'var(--t-danger)', fontSize: 12, margin: 0 }} role="alert">{error}</p>
            <button type="button" onClick={loadData} className="btn-secondary btn-sm" style={{ marginTop: 12 }}>
              <RefreshCw size={12} aria-hidden="true" />
              重新加载
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            accessibility={{ announcements, screenReaderInstructions }}
            onDragEnd={handleDragEnd}
          >
            <div className="board-grid">
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
              刻意不使用 DragOverlay：它会把卡片复制到独立定位层，坐标依赖 dnd-kit 的滚动补偿，
              而这个看板横向可滚动，曾导致卡片偏离鼠标。
            */}
          </DndContext>
        )}
      </div>

      <aside className="board-summary" aria-label="板面读数">
        <div className="panel-head">
          <span className="panel-mark" aria-hidden="true" />
          <h2 className="panel-title">板面读数</h2>
          <span className="panel-index">{filteredTasks.length} 项</span>
        </div>
        <div className="board-summary-body">
          <div className="summary-label">项目分布</div>
          {projectSummary.map(({ project, total, blocked }) => (
            <div key={project.id} className="summary-row">
              <i aria-hidden="true" style={{ background: project.color }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
              <span className="lane-count" style={{ color: blocked > 0 ? 'var(--t-danger)' : undefined }}>
                {blocked > 0 ? `${blocked} 阻塞 · ` : ''}{total} 项
              </span>
            </div>
          ))}

          <div className="summary-label" style={{ marginTop: 16 }}>即将到期</div>
          {summaryUpcoming.length === 0 ? (
            <p className="micro" style={{ margin: '2px 2px 8px' }}>暂无带截止日期的任务</p>
          ) : summaryUpcoming.map((task) => (
            <div key={task.id} className="summary-row">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{task.title}</span>
              <span className="lane-count">{task.due_date ? formatDate(task.due_date) : ''}</span>
            </div>
          ))}

          <div className="summary-label" style={{ marginTop: 16 }}>阻塞</div>
          {summaryBlocked.length === 0 ? (
            <p className="micro" style={{ margin: '2px 2px 8px' }}>当前没有阻塞任务</p>
          ) : summaryBlocked.map((task) => (
            <div key={task.id} className="summary-row" style={{ color: 'var(--t-danger)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{task.title}</span>
              <span className="lane-count" style={{ color: 'var(--t-danger)' }}>{task.project_name}</span>
            </div>
          ))}
        </div>
      </aside>
      </div>

      {selectedTaskId ? (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      ) : null}
      {blockerTask ? (
        <BlockerForm
          taskId={blockerTask.id}
          taskTitle={blockerTask.title}
          onClose={() => setBlockerTask(null)}
          onCreated={() => {
            setBlockerTask(null);
            notify('已记录阻塞原因', 'success');
          }}
        />
      ) : null}
    </div>
  );
}
