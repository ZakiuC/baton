'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, Edit3, Archive, RotateCcw, History } from 'lucide-react';
import Link from 'next/link';
import { Project } from '@/lib/queries/projects';
import { Task } from '@/lib/queries/tasks';
import { ActivityLog } from '@/lib/queries/activity';
import { calcProgress, STAGE_CONFIG } from '@/lib/utils';
import TaskCard from '@/components/shared/TaskCard';
import TaskDetail from '@/components/forms/TaskDetail';
import ProjectForm from '@/components/forms/ProjectForm';
import ActivityStream from '@/components/dashboard/ActivityStream';
import BlockerForm from '@/components/forms/BlockerForm';
import Modal from '@/components/shared/Modal';
import Drawer from '@/components/shared/Drawer';
import Lamp from '@/components/shared/Lamp';
import { useFeedback } from '@/components/shared/Feedback';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

const STAGES = ['todo', 'in_progress', 'blocked', 'done'];
const STAGE_TONE = {
  todo: 'idle',
  in_progress: 'accent',
  blocked: 'danger',
  done: 'done',
} as const;

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [blockerTask, setBlockerTask] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const { notify } = useFeedback();

  const loadData = useCallback(() => {
    if (!id) return;
    Promise.all([
      apiRequest<Project>(`/api/projects/${id}`),
      apiRequest<Task[]>(`/api/tasks?project_id=${id}&include_archived=true`),
      apiRequest<ActivityLog[]>(`/api/activity?project_id=${id}&limit=30`),
    ])
      .then(([projectData, taskList, activityList]) => {
        setError('');
        setProject(projectData);
        setTasks(taskList.filter((task) => task.stage !== 'archived'));
        setActivities(activityList);
      })
      .catch((loadError: unknown) => setError(getErrorMessage(loadError, '项目加载失败，请重试')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadData();
    const handler = () => loadData();
    const events = ['task-created', 'task-updated', 'project-updated'];
    events.forEach((eventName) => window.addEventListener(eventName, handler));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handler));
    };
  }, [loadData]);

  const handleQuickAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    setError('');
    try {
      await apiRequest<Task>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id, title: newTaskTitle.trim() }),
      });
      setNewTaskTitle('');
      window.dispatchEvent(new CustomEvent('task-created'));
      notify('任务已加入待办', 'success');
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, '创建任务失败，请重试'));
    } finally {
      setAddingTask(false);
    }
  };

  const handleTaskDrop = async (taskId: string, targetStage: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.stage === targetStage) return;
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
      notify(`任务状态已更新为“${STAGE_CONFIG[targetStage]?.label || targetStage}”`, 'success');
      window.dispatchEvent(new CustomEvent('task-updated'));
    } catch (moveError: unknown) {
      setTasks(previousTasks);
      notify(getErrorMessage(moveError, '状态更新失败，已恢复原状态'), 'error');
    }
  };

  const handleArchiveProject = async () => {
    if (!project) return;
    setError('');
    try {
      const archivedProject = await apiRequest<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      setProject(archivedProject);
      setShowArchiveConfirm(false);
      window.dispatchEvent(new CustomEvent('project-updated'));
      notify('项目已归档，所有任务与活动均已保留', 'success');
    } catch (archiveError: unknown) {
      setError(getErrorMessage(archiveError, '归档项目失败，请重试'));
    }
  };

  const handleRestoreProject = async () => {
    if (!project) return;
    setError('');
    try {
      const restored = await apiRequest<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      setProject(restored);
      window.dispatchEvent(new CustomEvent('project-updated'));
      notify('项目已恢复', 'success');
    } catch (restoreError: unknown) {
      setError(getErrorMessage(restoreError, '恢复项目失败，请重试'));
    }
  };

  if (loading) {
    return (
      <div className="page" aria-busy="true" aria-label="正在加载项目">
        <div className="page-toolbar">
          <div className="skeleton h-6 w-44" />
          <div className="skeleton h-7 w-24" />
        </div>
        <div className="skeleton h-1.5 w-full" />
        <div className="skeleton h-9 w-full" style={{ marginTop: 12 }} />
        <div className="project-lanes" style={{ marginTop: 12 }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="lane" style={{ padding: 10 }}>
              <div className="skeleton h-4 w-16" />
              <div className="skeleton h-16 w-full" style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page">
        <Link href="/" className="topbar-text-link" style={{ marginBottom: 14 }}>
          <ArrowLeft size={13} aria-hidden="true" />
          返回仪表盘
        </Link>
        <div className="inline-feedback" role="alert" style={{ color: 'var(--t-danger)' }}>
          {error || '项目不存在'}
        </div>
        {error ? (
          <button type="button" onClick={loadData} className="btn-secondary btn-sm" style={{ marginTop: 10 }}>
            重新加载
          </button>
        ) : null}
      </div>
    );
  }

  const getTasksByStage = (stage: string) => tasks.filter((task) => task.stage === stage);
  const doneCount = getTasksByStage('done').length;
  const progress = calcProgress(doneCount, tasks.length);
  const archived = project.status === 'archived';

  return (
    <div className="page animate-fade-in">
      <div className="page-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Link
            href="/"
            className="icon-button"
            aria-label="返回仪表盘"
          >
            <ArrowLeft size={15} aria-hidden="true" />
          </Link>
          <span aria-hidden="true" style={{ width: 8, height: 8, background: project.color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p className="page-kicker">项目 · {archived ? '已归档' : '运行中'}</p>
            <h1 className="page-title" title={project.name} style={{ fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </h1>
            {project.description ? <p className="page-sub">{project.description}</p> : null}
          </div>
          {archived ? <span className="badge badge--outline" style={{ marginLeft: 4 }}>已归档</span> : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span className="status-line" style={{ marginRight: 6 }}>
            <span>完成 <span className="num">{doneCount}/{tasks.length}</span></span>
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowActivity(true)}>
            <History size={12} aria-hidden="true" />
            活动 {activities.length}
          </button>
          {archived ? (
            <button type="button" onClick={handleRestoreProject} className="btn-primary btn-sm">
              <RotateCcw size={13} aria-hidden="true" />
              恢复项目
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowEditProject(true)}
                className="icon-button"
                aria-label="编辑项目"
              >
                <Edit3 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setShowArchiveConfirm(true)}
                className="icon-button"
                aria-label="归档项目"
              >
                <Archive size={14} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {archived ? (
        <div className="inline-feedback" style={{ borderColor: 'var(--t-warning-subtle)', background: 'var(--t-warning-subtle)', marginBottom: 12 }}>
          <Archive size={16} style={{ color: 'var(--t-warning)', flexShrink: 0 }} aria-hidden="true" />
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>这是已归档项目的只读视图</p>
            <p style={{ fontSize: 11, marginTop: 2 }}>任务和活动记录仍完整保留；恢复项目后即可继续编辑。</p>
          </div>
        </div>
      ) : null}

      {error ? <div className="inline-feedback" role="alert" style={{ color: 'var(--t-danger)', marginBottom: 12 }}>{error}</div> : null}

      <div className="progress-bar" style={{ height: 4, marginBottom: 10 }} role="progressbar" aria-label={`${project.name} 项目进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div
          className="progress-bar-fill"
          style={{ width: `${progress}%`, backgroundColor: progress === 100 ? 'var(--t-success)' : 'var(--t-accent)' }}
        />
      </div>

      {!archived ? (
        <form onSubmit={handleQuickAdd} className="quick-add" style={{ marginBottom: 12 }}>
          <label htmlFor="project-quick-task" className="sr-only">快速添加任务</label>
          <input
            id="project-quick-task"
            name="project-quick-task"
            type="text"
            autoComplete="off"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="快速添加任务，按回车创建…"
            className="field-control"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={addingTask || !newTaskTitle.trim()}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ flexShrink: 0 }}
          >
            <Plus size={13} aria-hidden="true" />
            添加
          </button>
        </form>
      ) : null}

      <div className="project-lanes-wrap" style={{ padding: 0 }}>
          <div className="project-lanes">
            {STAGES.map((stage) => {
              const config = STAGE_CONFIG[stage];
              const stageTasks = getTasksByStage(stage);
              const visibleTasks = stage === 'done' && !showAllDone ? stageTasks.slice(0, 3) : stageTasks;
              const hiddenDone = stage === 'done' && !showAllDone ? Math.max(0, stageTasks.length - 3) : 0;
              return (
                <section
                  key={stage}
                  className={`lane lane--${stage} ${archived ? 'lane--archived' : ''} ${stageTasks.length === 0 ? 'lane--empty' : ''}`}
                  aria-label={config.label}
                  onDragOver={archived ? undefined : (event) => event.preventDefault()}
                  onDrop={archived ? undefined : (event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData('text/plain');
                    if (taskId) handleTaskDrop(taskId, stage);
                  }}
                >
                  <header className="lane-head">
                    <Lamp tone={stage === 'blocked' && stageTasks.length === 0 ? 'idle' : STAGE_TONE[stage as keyof typeof STAGE_TONE] || 'idle'} />
                    <h2>{config.label}</h2>
                    <span className="lane-count">{stageTasks.length}</span>
                  </header>
                  <div className="lane-list">
                    {visibleTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable={!archived}
                        onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
                      >
                        <TaskCard
                          task={task}
                          compact
                          muted={stage === 'done'}
                          onClick={archived ? undefined : () => setSelectedTaskId(task.id)}
                        />
                      </div>
                    ))}
                    {hiddenDone > 0 ? (
                      <button type="button" className="lane-more" onClick={() => setShowAllDone(true)} aria-expanded={false}>
                        展开其余 {hiddenDone} 项
                      </button>
                    ) : null}
                    {stage === 'done' && showAllDone && stageTasks.length > 3 ? (
                      <button type="button" className="lane-more" onClick={() => setShowAllDone(false)} aria-expanded={true}>
                        收起已完成
                      </button>
                    ) : null}
                    {stageTasks.length === 0 && !archived ? (
                      <div className="lane-empty">拖拽任务到此处</div>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
      </div>

      {selectedTaskId ? (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      ) : null}
      {showActivity ? (
        <Drawer open onClose={() => setShowActivity(false)} title="最近活动">
          <ActivityStream activities={activities} />
        </Drawer>
      ) : null}
      {showEditProject ? (
        <ProjectForm
          project={project}
          onClose={() => setShowEditProject(false)}
          onCreated={() => setShowEditProject(false)}
        />
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
      {showArchiveConfirm ? (
        <Modal open onClose={() => setShowArchiveConfirm(false)} title="归档项目">
          <div className="stack">
            <div className="inline-feedback" style={{ borderColor: 'var(--t-warning-subtle)', background: 'var(--t-warning-subtle)' }}>
              <Archive size={17} style={{ color: 'var(--t-warning)', flexShrink: 0 }} aria-hidden="true" />
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>归档“{project.name}”？</p>
                <p style={{ fontSize: 11, marginTop: 2 }}>项目、任务、阻塞原因和活动记录都不会删除，可随时恢复。</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowArchiveConfirm(false)}>取消</button>
              <button type="button" className="btn-primary" onClick={handleArchiveProject}>确认归档</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
