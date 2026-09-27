'use client';

import { useState } from 'react';
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { UrgentItem } from '@/lib/queries/dashboard';
import TaskDetail from '@/components/forms/TaskDetail';

interface UrgentItemsProps {
  items: UrgentItem[];
}

const typeConfig = {
  urgent:  { icon: ShieldAlert, label: '紧急', tone: 'text-danger bg-danger-light' },
  overdue: { icon: Clock,       label: '已过期', tone: 'text-warning bg-warning-subtle' },
  blocked: { icon: AlertTriangle, label: '被阻塞', tone: 'text-danger bg-danger-light' },
};

export default function UrgentItems({ items }: UrgentItemsProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <section className="card p-4" aria-labelledby="urgent-title">
        <h2 id="urgent-title" className="text-xs font-semibold text-primary mb-3">紧急事项</h2>
        <p className="text-[13px] text-muted text-center py-5">当前没有需要立即处理的事项</p>
      </section>
    );
  }

  return (
    <section className="card p-4" aria-labelledby="urgent-title">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 id="urgent-title" className="text-xs font-semibold text-primary">紧急事项</h2>
        <span className="badge text-danger bg-danger-light">{items.length} 项</span>
      </div>

      <div className="space-y-1 max-h-[320px] overflow-y-auto">
        {items.map((item, idx) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          return (
            <button
              key={`${item.task.id}-${idx}`}
              onClick={() => setSelectedTaskId(item.task.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-hover transition-[background-color,color] text-left group"
              aria-label={`打开任务：${item.task.title}，${config.label}`}
            >
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${config.tone}`}
                aria-hidden="true"
              >
                <Icon size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary truncate leading-snug">{item.task.title}</p>
                {item.task.project_name && (
                  <p
                    className="text-[11px] mt-0.5 truncate text-muted"
                  >
                    {item.task.project_name}
                  </p>
                )}
              </div>
              <span
                className={`badge flex-shrink-0 ${config.tone}`}
              >
                {config.label}
              </span>
            </button>
          );
        })}
      </div>

      {selectedTaskId && (
        <TaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </section>
  );
}
