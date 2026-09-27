'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, LoaderCircle, Save } from 'lucide-react';
import Drawer from '@/components/shared/Drawer';
import { useFeedback } from '@/components/shared/Feedback';
import { Blocker, Task } from '@/lib/queries/tasks';
import { apiRequest, getErrorMessage } from '@/lib/client-api';
import { PRIORITY_CONFIG, STAGE_CONFIG, formatRelativeTime } from '@/lib/utils';

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
}

interface TaskMutationResponse {
  success: boolean;
  task: Task;
}

function formMatchesTask(
  task: Task,
  values: { title: string; description: string; priority: string; stage: string; dueDate: string },
) {
  return task.title === values.title
    && task.description === values.description
    && task.priority === values.priority
    && task.stage === values.stage
    && (task.due_date || '') === values.dueDate;
}

export default function TaskDetail(props: TaskDetailProps) {
  return <TaskDetailContent key={props.taskId} {...props} />;
}

function TaskDetailContent({ taskId, onClose }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [stage, setStage] = useState('todo');
  const [dueDate, setDueDate] = useState('');
  const [blockerReason, setBlockerReason] = useState('');
  const { notify } = useFeedback();

  const applyTask = useCallback((nextTask: Task) => {
    setTask(nextTask);
    setTitle(nextTask.title);
    setDescription(nextTask.description || '');
    setPriority(nextTask.priority);
    setStage(nextTask.stage);
    setDueDate(nextTask.due_date || '');
    setBlockerReason('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<Task>(`/api/tasks/${taskId}`)
      .then((nextTask) => {
        if (!cancelled) applyTask(nextTask);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError, '任务详情加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [applyTask, taskId]);

  const dirty = useMemo(() => task ? !formMatchesTask(task, {
    title,
    description,
    priority,
    stage,
    dueDate,
  }) : false, [description, dueDate, priority, stage, task, title]);

  const requestClose = () => {
    if (dirty && !window.confirm('当前修改尚未保存，确定关闭吗？')) return;
    onClose();
  };

  const handleSave = async () => {
    if (!task || !title.trim()) return;
    if (stage === 'blocked' && task.stage !== 'blocked' && !blockerReason.trim()) {
      setError('标记为阻塞时必须填写阻塞原因');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const savedTask = await apiRequest<Task>(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          stage,
          due_date: dueDate || null,
          blocker_reason: blockerReason.trim() || undefined,
        }),
      });
      applyTask(savedTask);
      window.dispatchEvent(new CustomEvent('task-updated'));
      notify('任务已保存', 'success');
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, '保存失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  /** 一键把任务设为长期任务（清空截止日期）。 */
  const handleClearDueDate = async () => {
    if (!task || saving) return;
    setSaving(true);
    setError('');
    try {
      const savedTask = await apiRequest<Task>(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: null }),
      });
      applyTask(savedTask);
      window.dispatchEvent(new CustomEvent('task-updated'));
      notify('已设为长期任务（无截止日期）', 'success');
    } catch (clearError: unknown) {
      setError(getErrorMessage(clearError, '清空截止日期失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!task) return;
    setArchiving(true);
    setError('');
    try {
      const archivedTask = await apiRequest<Task>(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'archived' }),
      });
      applyTask(archivedTask);
      window.dispatchEvent(new CustomEvent('task-updated'));
      notify('任务已归档，可在设置中恢复', 'success');
      onClose();
    } catch (archiveError: unknown) {
      setError(getErrorMessage(archiveError, '归档失败，请重试'));
      setConfirmArchive(false);
    } finally {
      setArchiving(false);
    }
  };

  const handleResolveBlocker = async (blockerId: string) => {
    setResolvingId(blockerId);
    setError('');
    try {
      const result = await apiRequest<TaskMutationResponse>(`/api/blockers/${blockerId}`, { method: 'PUT' });
      applyTask(result.task);
      window.dispatchEvent(new CustomEvent('task-updated'));
      notify(
        result.task.stage === 'in_progress' ? '阻塞已解决，任务已回到进行中' : '阻塞原因已解决',
        'success',
      );
    } catch (resolveError: unknown) {
      setError(getErrorMessage(resolveError, '解决阻塞失败，请重试'));
    } finally {
      setResolvingId(null);
    }
  };

  if (loading) {
    return (
      <Drawer open onClose={onClose} title="任务详情">
        <div className="space-y-3" aria-label="正在加载任务详情">
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-20 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <div className="skeleton h-9" />
            <div className="skeleton h-9" />
          </div>
        </div>
      </Drawer>
    );
  }

  if (!task) {
    return (
      <Drawer open onClose={onClose} title="任务详情">
        <div className="inline-feedback border-danger-subtle text-danger" role="alert">
          {error || '任务不存在'}
        </div>
      </Drawer>
    );
  }

  const stageConfig = STAGE_CONFIG[stage];
  const needsBlockerReason = stage === 'blocked' && task.stage !== 'blocked';

  return (
    <Drawer open onClose={requestClose} title="任务详情">
      <div className="space-y-5">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--t-bg-hover)', border: '1px solid var(--t-border)' }}
        >
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: task.project_color }} />
          <span className="text-primary font-medium">{task.project_name}</span>
          <span className="ml-auto text-xs text-muted">{STAGE_CONFIG[task.stage]?.label}</span>
        </div>

        <div>
          <label htmlFor="detail-title" className="block text-xs font-medium text-muted mb-1.5">标题</label>
          <input
            id="detail-title"
            name="detail-title"
            type="text"
            autoComplete="off"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="field-control px-3 text-sm"
          />
        </div>

        <div>
          <label htmlFor="detail-description" className="block text-xs font-medium text-muted mb-1.5">描述</label>
          <textarea
            id="detail-description"
            name="detail-description"
            autoComplete="off"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="补充目标、验收标准或上下文…"
            rows={4}
            className="field-control px-3 py-2.5 text-sm placeholder:text-muted resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="detail-stage" className="block text-xs font-medium text-muted mb-1.5">阶段</label>
            <select
              id="detail-stage"
              name="detail-stage"
              autoComplete="off"
              value={stage}
              onChange={(event) => {
                setStage(event.target.value);
                setError('');
              }}
              className="field-control px-3 text-sm"
              style={{ color: stageConfig?.color }}
            >
              {Object.entries(STAGE_CONFIG).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="detail-priority" className="block text-xs font-medium text-muted mb-1.5">优先级</label>
            <select
              id="detail-priority"
              name="detail-priority"
              autoComplete="off"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="field-control px-3 text-sm"
            >
              {Object.entries(PRIORITY_CONFIG).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
        </div>

        {needsBlockerReason ? (
          <div className="rounded-lg border border-danger-subtle bg-danger-bg p-3">
            <label htmlFor="detail-blocker" className="block text-xs font-semibold text-danger mb-1.5">
              阻塞原因
            </label>
            <textarea
              id="detail-blocker"
              name="detail-blocker"
              autoComplete="off"
              value={blockerReason}
              onChange={(event) => setBlockerReason(event.target.value)}
              placeholder="说明卡点和需要谁来推进…"
              rows={3}
              className="field-control px-3 py-2.5 text-sm placeholder:text-muted resize-none"
              required
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="detail-due-date" className="block text-xs font-medium text-muted mb-1.5">截止日期</label>
          <input
            id="detail-due-date"
            name="detail-due-date"
            type="date"
            autoComplete="off"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="field-control px-3 text-sm"
          />
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <p className="text-[11px] text-muted">
              {dueDate ? '到时会出现在时间线的对应日期' : '当前是长期任务，不设截止日期'}
            </p>
            {dueDate ? (
              <button
                type="button"
                onClick={handleClearDueDate}
                disabled={saving}
                className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40"
              >
                设为长期任务
              </button>
            ) : null}
          </div>
        </div>

        <div className="text-xs text-muted space-y-1 pt-1 border-t border-border">
          <div>创建于 {formatRelativeTime(task.created_at)}</div>
          <div>更新于 {formatRelativeTime(task.updated_at)}</div>
        </div>

        {task.blockers && task.blockers.length > 0 ? (
          <section className="pt-1 border-t border-border" aria-labelledby="active-blockers-title">
            <h4 id="active-blockers-title" className="text-xs font-semibold text-danger mb-2">当前阻塞</h4>
            <div className="space-y-2">
              {task.blockers.map((blocker: Blocker) => (
                <div key={blocker.id} className="flex items-start gap-3 p-3 rounded-lg bg-danger-bg border border-danger-subtle">
                  <p className="text-sm text-primary flex-1 leading-relaxed">{blocker.reason}</p>
                  <button
                    type="button"
                    onClick={() => handleResolveBlocker(blocker.id)}
                    disabled={resolvingId !== null}
                    className="btn-secondary flex-shrink-0"
                    aria-label={`解决阻塞：${blocker.reason}`}
                  >
                    {resolvingId === blocker.id
                      ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                      : <CheckCircle2 size={14} aria-hidden="true" />}
                    解决
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="inline-feedback border-danger-subtle text-danger" role="alert">
            {error}
          </div>
        ) : null}

        {confirmArchive ? (
          <div className="rounded-lg border border-warning-subtle bg-warning-subtle p-3" role="alert">
            <p className="text-sm text-primary font-medium">归档后不会删除数据，并可随时恢复。</p>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn-secondary" onClick={() => setConfirmArchive(false)}>取消</button>
              <button type="button" className="btn-danger" disabled={archiving} onClick={handleArchive}>
                {archiving ? '归档中…' : '确认归档'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="btn-secondary"
            disabled={archiving}
          >
            <Archive size={14} aria-hidden="true" />
            归档任务
          </button>
          <div className="flex items-center gap-2">
            {dirty ? <span className="text-xs text-warning">有未保存修改</span> : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim() || !dirty}
              className="btn-primary px-5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
              {saving ? '保存中…' : '保存修改'}
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
