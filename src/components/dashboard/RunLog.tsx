import { ActivityLog } from '@/lib/queries/activity';
import { formatDateTime, getActivityActionLabel, getActivitySubject } from '@/lib/utils';
import Lamp from '@/components/shared/Lamp';

/** 运行日志：单栏 5 行摘要；时间倒序，结果单独成列，标题不再把阶段变化截掉。 */
export default function RunLog({ activities }: { activities: ActivityLog[] }) {
  const sorted = [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  if (sorted.length === 0) {
    return (
      <section className="panel" aria-labelledby="run-log-title">
        <div className="panel-head">
          <Lamp tone="run" />
          <h2 id="run-log-title" className="panel-title">运行日志</h2>
          <span className="panel-index">暂无记录</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="run-log-title">
      <div className="panel-head">
        <Lamp tone="run" />
        <h2 id="run-log-title" className="panel-title">运行日志</h2>
        <span className="panel-index">最近 {sorted.length} / {activities.length} 条</span>
      </div>
      <div className="run-log-rows">
        {sorted.map((activity) => (
          <div key={activity.id} className="run-log-row">
            <span className="run-log-time">{formatDateTime(activity.created_at)}</span>
            <span className="run-log-project">
              <i aria-hidden="true" style={{ background: activity.project_color || 'var(--t-muted)' }} />
              <span>{activity.project_name || '—'}</span>
            </span>
            <span className="run-log-title" title={activity.task_title || undefined}>
              {getActivitySubject(activity.action, activity.detail, activity.task_title, activity.project_name)}
            </span>
            <span className="run-log-action">{getActivityActionLabel(activity.action, activity.detail)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
