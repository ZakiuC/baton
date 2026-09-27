'use client';

import { useState } from 'react';
import Modal from '@/components/shared/Modal';
import { Task } from '@/lib/queries/tasks';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

interface BlockerFormProps {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

export default function BlockerForm({ taskId, taskTitle, onClose, onCreated }: BlockerFormProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestClose = () => {
    if (reason !== '' && !window.confirm('阻塞原因尚未保存，确定关闭吗？')) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setLoading(true);
    setError('');
    try {
      const task = await apiRequest<Task>(`/api/tasks/${taskId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'blocked', blocker_reason: reason.trim() }),
      });
      onCreated(task);
      window.dispatchEvent(new CustomEvent('task-updated'));
    } catch (err: unknown) {
      setError(getErrorMessage(err, '标记阻塞失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={requestClose} title="阻塞原因">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted leading-relaxed">
          任务 &quot;{taskTitle}&quot; 为什么被阻塞？
        </p>
        <label htmlFor="blocker-reason" className="sr-only">阻塞原因</label>
        <textarea
          id="blocker-reason"
          name="blocker-reason"
          autoComplete="off"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="描述阻塞原因，如：等待后端接口、需要设计确认…"
          rows={3}
          className="field-control px-3 py-2.5 text-sm placeholder:text-muted resize-none"
          required
          data-initial-focus
        />
        {error ? (
          <p className="inline-feedback border-danger-subtle text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading || !reason.trim()}
            className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '保存中…' : '标记为阻塞'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
