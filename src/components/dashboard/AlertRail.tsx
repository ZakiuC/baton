import Link from 'next/link';
import { ProjectProgress } from '@/lib/queries/dashboard';
import { Task } from '@/lib/queries/tasks';
import { PRIORITY_CONFIG, formatDate } from '@/lib/utils';
import Lamp from '@/components/shared/Lamp';

export interface StalledProject {
  project: ProjectProgress;
  days: number;
}

interface AlertRailProps {
  blocked: Task[];
  overdue: Task[];
  dueToday: Task[];
  upcoming: Task[];
  stalled: StalledProject[];
  nowMs: number;
  onTaskClick: (taskId: string) => void;
}

function elapsedSince(since: string | undefined, nowMs: number) {
  if (!since) return '';
  const minutes = Math.max(0, Math.floor((nowMs - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

function overdueDays(due: string | null, nowMs: number) {
  if (!due) return 0;
  return Math.max(1, Math.ceil((nowMs - new Date(due).getTime()) / 86_400_000));
}

function AlertGroup({ label, tone, count, children }: {
  label: string;
  tone: 'danger' | 'warn' | 'accent';
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="alert-group">
      <div className="alert-group-head">
        <Lamp tone={tone} />
        <span>{label}</span>
        <span className="lane-count">{count}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * 告警台：阻塞、逾期、停滞、临近到期按风险排序；没有告警时收成一条窄带，
 * 不再用一张与机台卡等大的空卡占首屏。
 */
export default function AlertRail({ blocked, overdue, dueToday, upcoming, stalled, nowMs, onTaskClick }: AlertRailProps) {
  const riskCount = blocked.length + overdue.length + stalled.length;
  const attentionCount = riskCount + dueToday.length + upcoming.length;
  const hasAny = attentionCount > 0;

  return (
    <aside className="alert-rail panel" aria-label="告警台">
      <div className="panel-head">
        <Lamp tone={riskCount > 0 ? 'danger' : 'run'} />
        <h2 className="panel-title">告警台</h2>
        <span className="panel-index">{riskCount > 0 ? `${riskCount} 项风险` : hasAny ? '需留意' : '全部正常'}</span>
      </div>

      {blocked.length > 0 ? (
        <AlertGroup label="阻塞" tone="danger" count={blocked.length}>
          {blocked.slice(0, 6).map((task) => {
            const reason = task.blockers?.[0]?.reason;
            const since = task.blockers?.[0]?.created_at || task.updated_at;
            return (
              <button key={task.id} type="button" className="alert-item" onClick={() => onTaskClick(task.id)} aria-label={`打开任务：${task.title}`}>
                <Lamp tone="blocked" />
                <span className="task-row-main">
                  <span className="alert-item-title">{task.title}</span>
                  {reason ? <span className="alert-item-title" style={{ marginTop: 2, color: 'var(--t-danger)', fontSize: 11 }}>{reason}</span> : null}
                  <span className="alert-item-meta">
                    <span>{task.project_name}</span>
                    {since ? <span className="num">已阻塞 {elapsedSince(since, nowMs)}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </AlertGroup>
      ) : null}

      {overdue.length > 0 ? (
        <AlertGroup label="逾期" tone="warn" count={overdue.length}>
          {overdue.slice(0, 5).map((task) => (
            <button key={task.id} type="button" className="alert-item" onClick={() => onTaskClick(task.id)} aria-label={`打开任务：${task.title}`}>
              <Lamp tone="warn" />
              <span className="task-row-main">
                <span className="alert-item-title">{task.title}</span>
                <span className="alert-item-meta">
                  <span>{task.project_name}</span>
                  <span className="num" style={{ color: 'var(--t-warning)' }}>逾期 {overdueDays(task.due_date, nowMs)} 天</span>
                  {task.due_date ? <span>截止 {formatDate(task.due_date)}</span> : null}
                </span>
              </span>
            </button>
          ))}
        </AlertGroup>
      ) : null}

      {stalled.length > 0 ? (
        <AlertGroup label="停滞" tone="warn" count={stalled.length}>
          {stalled.slice(0, 4).map(({ project, days }) => (
            <Link key={project.id} href={`/project/${project.id}`} className="alert-item" aria-label={`打开停滞项目 ${project.name}`}>
              <Lamp tone="warn" />
              <span className="task-row-main">
                <span className="alert-item-title">{project.name}</span>
                <span className="alert-item-meta">
                  <span className="num" style={{ color: 'var(--t-warning)' }}>{days} 天无动作</span>
                  <span>{project.inProgress} 进行中 · {project.todo} 待办</span>
                </span>
              </span>
            </Link>
          ))}
        </AlertGroup>
      ) : null}

      {dueToday.length > 0 ? (
        <AlertGroup label="今日到期" tone="accent" count={dueToday.length}>
          {dueToday.slice(0, 4).map((task) => (
            <button key={task.id} type="button" className="alert-item" onClick={() => onTaskClick(task.id)} aria-label={`打开任务：${task.title}`}>
              <Lamp tone="accent" />
              <span className="task-row-main">
                <span className="alert-item-title">{task.title}</span>
                <span className="alert-item-meta">
                  <span>{task.project_name}</span>
                  <span>{PRIORITY_CONFIG[task.priority]?.label || task.priority}</span>
                  <span>今天</span>
                </span>
              </span>
            </button>
          ))}
        </AlertGroup>
      ) : null}

      {upcoming.length > 0 ? (
        <AlertGroup label="临近到期" tone="accent" count={upcoming.length}>
          {upcoming.slice(0, 4).map((task) => (
            <button key={task.id} type="button" className="alert-item" onClick={() => onTaskClick(task.id)} aria-label={`打开任务：${task.title}`}>
              <Lamp tone="accent" />
              <span className="task-row-main">
                <span className="alert-item-title">{task.title}</span>
                <span className="alert-item-meta">
                  <span>{task.project_name}</span>
                  <span style={{ color: 'var(--t-accent)' }}>{task.due_date ? formatDate(task.due_date) : ''}</span>
                </span>
              </span>
            </button>
          ))}
        </AlertGroup>
      ) : null}

      {!hasAny ? (
        <div className="alert-empty">
          <Lamp tone="run" />
          <p>没有阻塞、逾期或停滞项目</p>
        </div>
      ) : null}

      <div className="alert-legend" aria-label="状态灯图例">
        <span><Lamp tone="run" />运行</span>
        <span><Lamp tone="idle" />空闲</span>
        <span><Lamp tone="warn" />静默 / 逾期</span>
        <span><Lamp tone="blocked" />阻塞</span>
      </div>
    </aside>
  );
}
