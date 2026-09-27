import { ActivityLog } from '@/lib/queries/activity';
import { getActivityDescription, formatRelativeTime } from '@/lib/utils';

interface ActivityStreamProps {
  activities: ActivityLog[];
}

export default function ActivityStream({ activities }: ActivityStreamProps) {
  if (activities.length === 0) {
    return (
      <section className="card p-4" aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-xs font-semibold text-primary mb-3">最近活动</h2>
        <p className="text-[13px] text-muted text-center py-6">暂无活动记录</p>
      </section>
    );
  }

  return (
    <section className="card p-4" aria-labelledby="activity-title">
      <h2 id="activity-title" className="text-xs font-semibold text-primary mb-3 px-1">最近活动</h2>
      <div className="relative">
        {/* 时间线竖线 */}
        <div
          className="absolute left-[15px] top-2 bottom-2 w-px"
          style={{ background: 'var(--t-border)' }}
        />

        <ol className="space-y-0" aria-label="最近活动列表">
          {activities.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 py-2 pl-1"
            >
              {/* 时间线节点 */}
              <div className="relative flex-shrink-0 mt-1.5 z-10">
                <span
                  className="block w-[10px] h-[10px] rounded-full border-2 border-card"
                  style={{ backgroundColor: a.project_color || 'var(--t-border-mid)' }}
                  aria-hidden="true"
                />
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs text-primary leading-relaxed break-words">
                  {a.project_name && (
                    <span
                      className="font-medium mr-1 text-primary"
                    >
                      {a.project_name}
                    </span>
                  )}
                  {getActivityDescription(a.action, a.detail, a.task_title || undefined)}
                </p>
                <p className="text-[10px] text-muted mt-0.5">
                  {formatRelativeTime(a.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
