'use client';

import { useState } from 'react';
import Modal from '@/components/shared/Modal';
import { PROJECT_COLORS } from '@/lib/utils';
import { Project } from '@/lib/queries/projects';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

interface ProjectFormProps {
  onClose: () => void;
  onCreated: (project: Project) => void;
  project?: Project;
}

export default function ProjectForm({ onClose, onCreated, project }: ProjectFormProps) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [color, setColor] = useState(project?.color || PROJECT_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!project;
  const dirty = name !== (project?.name || '')
    || description !== (project?.description || '')
    || color !== (project?.color || PROJECT_COLORS[0]);

  const requestClose = () => {
    if (dirty && !window.confirm('当前项目修改尚未保存，确定关闭吗？')) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const url = isEdit ? `/api/projects/${project.id}` : '/api/projects';
      const method = isEdit ? 'PUT' : 'POST';
      const savedProject = await apiRequest<Project>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), color }),
      });
      onCreated(savedProject);
      window.dispatchEvent(new CustomEvent(isEdit ? 'project-updated' : 'project-created'));
    } catch (err: unknown) {
      setError(getErrorMessage(err, '保存项目失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={requestClose} title={isEdit ? '编辑项目' : '新建项目'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 颜色预览条 */}
        <div
          className="h-1.5 rounded-full transition-[background-color] duration-300"
          style={{ backgroundColor: color }}
        />

        {/* 项目名称 */}
        <div>
          <label htmlFor="project-name" className="block text-xs font-medium text-muted mb-1.5">
            项目名称
          </label>
          <input
            id="project-name"
            name="project-name"
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入项目名称…"
            className="field-control px-3 text-sm placeholder:text-muted"
            required
            data-initial-focus
          />
        </div>

        {/* 项目描述 */}
        <div>
          <label htmlFor="project-description" className="block text-xs font-medium text-muted mb-1.5">
            描述 <span className="normal-case font-normal opacity-60">（可选）</span>
          </label>
          <textarea
            id="project-description"
            name="project-description"
            autoComplete="off"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述这个项目…"
            rows={2}
            className="field-control px-3 py-2.5 text-sm placeholder:text-muted resize-none"
          />
        </div>

        {/* 标识色 */}
        <div>
          <span className="block text-xs font-medium text-muted mb-2">
            标识色
          </span>
          <div className="flex gap-2 flex-wrap" role="group" aria-label="项目标识色">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={`选择颜色 ${c}`}
                className="w-7 h-7 rounded-full transition-[transform,box-shadow] duration-150 flex items-center justify-center"
                style={{
                  backgroundColor: c,
                  boxShadow: color === c
                    ? `0 0 0 2px var(--t-card), 0 0 0 4px ${c}`
                    : '0 1px 3px rgba(0,0,0,0.3)',
                  transform: color === c ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            ))}
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
            disabled={loading || !name.trim()}
            className="btn-primary px-5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '保存中…' : isEdit ? '保存' : '创建项目'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
