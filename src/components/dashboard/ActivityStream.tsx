import { ActivityLog } from '@/lib/queries/activity';
import { formatRelativeTime, getActivityActionLabel, getActivitySubject } from '@/lib/utils';

interface ActivityStreamProps {
  activities: ActivityLog[];
}

/** 项目活动流：时间倒序，结果与时间各自成列，不再把时间粘在句尾。 */
export default function ActivityStream({ activities }: ActivityStreamProps) {
  const sorted = [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (sorted.length === 0) {
    return <p style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--t-muted)', margin: 0 }}>暂无活动记录</p>;
  }

  return (
    <div className="activity-stream">
      <p className="micro" style={{ margin: '0 0 8px' }}>最近 {sorted.length} 条 · 时间倒序</p>
      <ol className="log-list" aria-label="最近活动列表">
        {sorted.map((activity) => (
          <li key={activity.id} className="log-item">
            <span className="log-rail">
              <span className="log-dot" style={{ '--project-color': activity.project_color || 'var(--t-muted)' } as React.CSSProperties} />
            </span>
            <span className="log-body">
              <span className="log-text">
                {getActivitySubject(activity.action, activity.detail, activity.task_title, activity.project_name)}
              </span>
              <span className="log-meta">
                <span className="log-action">{getActivityActionLabel(activity.action, activity.detail)}</span>
                <span className="log-time">{formatRelativeTime(activity.created_at)}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
