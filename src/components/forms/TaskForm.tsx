'use client';

import { useState } from 'react';
import Modal from '@/components/shared/Modal';
import { Project } from '@/lib/queries/projects';
import { Task } from '@/lib/queries/tasks';
import { PRIORITY_CONFIG } from '@/lib/utils';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

interface TaskFormProps {
  projects: Project[];
  defaultProjectId?: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

export default function TaskForm({ projects, defaultProjectId, onClose, onCreated }: TaskFormProps) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const initialProjectId = defaultProjectId || projects[0]?.id || '';
  const dirty = projectId !== initialProjectId
    || title !== ''
    || priority !== 'medium'
    || dueDate !== '';

  const requestClose = () => {
    if (dirty && !window.confirm('当前任务尚未创建，确定关闭吗？')) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const task = await apiRequest<Task>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, title: title.trim(), priority, due_date: dueDate || null }),
      });
      onCreated(task);
      window.dispatchEvent(new CustomEvent('task-created'));
    } catch (err: unknown) {
      setError(getErrorMessage(err, '创建任务失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={requestClose} title="快速创建任务">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 所属项目 */}
        <div>
          <label htmlFor="task-project" className="block text-xs font-medium text-muted mb-1.5">
            所属项目
          </label>
          <select
            id="task-project"
            name="task-project"
            autoComplete="off"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="field-control px-3 text-sm"
            required
          >
            <option value="">选择项目…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* 任务标题 */}
        <div>
          <label htmlFor="task-title" className="block text-xs font-medium text-muted mb-1.5">
            任务标题
          </label>
          <input
            id="task-title"
            name="task-title"
            type="text"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入任务标题…"
            className="field-control px-3 text-sm placeholder:text-muted"
            required
            data-initial-focus
          />
        </div>

        {/* 优先级 + 截止日期 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-priority" className="block text-xs font-medium text-muted mb-1.5">
              优先级
            </label>
            <select
              id="task-priority"
              name="task-priority"
              autoComplete="off"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="field-control px-3 text-sm"
            >
              {Object.entries(PRIORITY_CONFIG).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-due-date" className="block text-xs font-medium text-muted mb-1.5">
              截止日期
            </label>
            <input
              id="task-due-date"
              name="task-due-date"
              type="date"
              autoComplete="off"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="field-control px-3 text-sm"
            />
          </div>
        </div>

        {error ? (
          <p className="inline-feedback border-danger-subtle text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={requestClose}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim() || !projectId}
            className="btn-primary px-5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '创建中…' : '创建任务'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
