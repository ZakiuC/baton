'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, Edit3, Archive, RotateCcw } from 'lucide-react';
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
import { useFeedback } from '@/components/shared/Feedback';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

const STAGES = ['todo', 'in_progress', 'blocked', 'done'];

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
      .then(([proj, taskList, actList]) => {
        setError('');
        setProject(proj);
        setTasks(taskList.filter((task) => task.stage !== 'archived'));
        setActivities(actList);
      })
      .catch((loadError: unknown) => setError(getErrorMessage(loadError, '项目加载失败，请重试')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadData();
    const handler = () => loadData();
    window.addEventListener('task-created', handler);
    window.addEventListener('task-updated', handler);
    window.addEventListener('project-updated', handler);
    return () => {
      window.removeEventListener('task-created', handler);
      window.removeEventListener('task-updated', handler);
      window.removeEventListener('project-updated', handler);
    };
  }, [loadData]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.stage === targetStage) return;
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
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="skeleton w-7 h-7 rounded-lg" />
          <div className="space-y-1.5">
            <div className="skeleton h-5 w-40 rounded" />
            <div className="skeleton h-3 w-56 rounded" />
          </div>
        </div>
        <div className="skeleton h-1.5 w-full rounded-full" />
        <div className="skeleton h-9 w-full rounded-lg" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card rounded-xl overflow-hidden p-3 space-y-2">
              <div className="skeleton h-1 w-full rounded" />
              <div className="skeleton h-4 w-20 rounded" />
              {[...Array(2)].map((_, j) => (
                <div key={j} className="card p-2.5 rounded-lg space-y-1.5">
                  <div className="skeleton h-3 w-full rounded" />
                  <div className="skeleton h-3 w-2/3 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 animate-fade-in">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary mb-5 transition-colors">
          <ArrowLeft size={13} />
          返回仪表盘
        </Link>
        <div className="inline-feedback border-danger-subtle text-danger" role="alert">
          {error || '项目不存在'}
        </div>
        {error ? <button type="button" onClick={loadData} className="btn-secondary mt-4">重新加载</button> : null}
      </div>
    );
  }

  const getTasksByStage = (stage: string) => tasks.filter((t) => t.stage === stage);
  const doneCount = getTasksByStage('done').length;
  const progress = calcProgress(doneCount, tasks.length);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-5 animate-fade-in">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-bg-hover transition-[color,background-color] flex-shrink-0"
            aria-label="返回仪表盘"
          >
            <ArrowLeft size={15} />
          </Link>
          <div
            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <h1 className="text-base font-bold text-primary truncate">{project.name}</h1>
          {project.status === 'archived' ? (
            <span className="badge bg-warning-subtle text-warning">已归档</span>
          ) : null}
          {project.description && (
            <span className="text-xs text-muted truncate hidden sm:block">{project.description}</span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted font-mono mr-2">
            {doneCount}/{tasks.length}
          </span>
          {project.status === 'archived' ? (
            <button type="button" onClick={handleRestoreProject} className="btn-primary">
              <RotateCcw size={14} aria-hidden="true" />
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
                className="icon-button hover:text-warning"
                aria-label="归档项目"
              >
                <Archive size={14} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {project.status === 'archived' ? (
        <div className="inline-feedback border-warning-subtle bg-warning-subtle">
          <Archive size={17} className="text-warning flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-primary">这是已归档项目的只读视图</p>
            <p className="text-xs mt-1">任务和活动记录仍完整保留；恢复项目后即可继续编辑。</p>
          </div>
        </div>
      ) : null}

      {error ? <div className="inline-feedback border-danger-subtle text-danger" role="alert">{error}</div> : null}

      {/* 进度条 */}
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: progress === 100 ? 'var(--t-success)' : project.color,
            boxShadow: `0 0 8px ${progress === 100 ? 'rgba(16,185,129,0.4)' : `${project.color}50`}`,
          }}
        />
      </div>

      {/* 快速添加任务 */}
      {project.status !== 'archived' ? <form onSubmit={handleQuickAdd} className="flex gap-2">
        <label htmlFor="project-quick-task" className="sr-only">快速添加任务</label>
        <input
          id="project-quick-task"
          name="project-quick-task"
          type="text"
          autoComplete="off"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="快速添加任务，按回车创建…"
          className="field-control flex-1 px-3 text-sm placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={addingTask || !newTaskTitle.trim()}
          className="btn-primary px-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={13} />
          添加
        </button>
      </form> : null}

      {/* 看板 + 活动流 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 看板四列 */}
        <div className="lg:col-span-3">
          <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-[repeat(4,minmax(240px,1fr))] gap-3 min-w-[1000px]">
            {STAGES.map((stage) => {
              const config = STAGE_CONFIG[stage];
              const stageTasks = getTasksByStage(stage);
              return (
                <div
                  key={stage}
                  className="card rounded-xl overflow-hidden min-h-[180px] flex flex-col"
                  onDragOver={project.status === 'archived' ? undefined : (e) => e.preventDefault()}
                  onDrop={(e) => {
                    if (project.status === 'archived') return;
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData('text/plain');
                    if (taskId) handleTaskDrop(taskId, stage);
                  }}
                >
                  {/* 列顶部色条 */}
                  <div
                    className="h-[3px] flex-shrink-0 opacity-80"
                    style={{ backgroundColor: config.color }}
                  />
                  {/* 列头 */}
                  <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                    <span className="text-xs font-semibold text-primary">{config.label}</span>
                    <span
                      className="ml-auto text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full"
                      style={{ color: config.color, background: `${config.color}18` }}
                    >
                      {stageTasks.length}
                    </span>
                  </div>
                  <div className="border-t border-border mx-2 flex-shrink-0" />
                  {/* 任务列表 */}
                  <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
                    {stageTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable={project.status !== 'archived'}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                      >
                        <TaskCard
                          task={task}
                          compact
                          onClick={project.status === 'archived' ? undefined : () => setSelectedTaskId(task.id)}
                        />
                      </div>
                    ))}
                    {stageTasks.length === 0 && (
                      <div
                        className="h-16 flex items-center justify-center rounded-lg border border-dashed text-[11px] text-muted"
                        style={{ borderColor: 'var(--t-border)' }}
                      >
                        拖拽任务到此处
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
        {/* 活动流 */}
        <div className="lg:col-span-1">
          <ActivityStream activities={activities} />
        </div>
      </div>

      {selectedTaskId && (
        <TaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
      {showEditProject && (
        <ProjectForm
          project={project}
          onClose={() => setShowEditProject(false)}
          onCreated={() => setShowEditProject(false)}
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
      {showArchiveConfirm && (
        <Modal open onClose={() => setShowArchiveConfirm(false)} title="归档项目">
          <div className="space-y-4">
            <div className="inline-feedback border-warning-subtle bg-warning-subtle">
              <Archive size={18} className="text-warning flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-primary">归档“{project.name}”？</p>
                <p className="text-xs mt-1">项目、任务、阻塞原因和活动记录都不会删除，可随时恢复。</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowArchiveConfirm(false)}>取消</button>
              <button type="button" className="btn-primary" onClick={handleArchiveProject}>确认归档</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
