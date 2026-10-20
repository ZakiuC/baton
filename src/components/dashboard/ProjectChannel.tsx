import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ProjectProgress } from '@/lib/queries/dashboard';
import { Task } from '@/lib/queries/tasks';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import TaskCard from '@/components/shared/TaskCard';
import Lamp from '@/components/shared/Lamp';

interface ProjectChannelProps {
  project: ProjectProgress;
  tasks: Task[];
  nextDue: Task | null;
  staleDays: number | null;
  tone: 'run' | 'warn' | 'blocked' | 'idle';
  onTaskClick: (taskId: string) => void;
}

const TONE_LAMP = { run: 'run', warn: 'warn', blocked: 'blocked', idle: 'idle' } as const;

/** 一台「机台」：项目头（状态灯 + 色标）、最近动作 / 下一项、进度表、4 个任务槽、底部读数。 */
export default function ProjectChannel({ project, tasks, nextDue, staleDays, tone, onTaskClick }: ProjectChannelProps) {
  const doneRatio = project.total > 0 ? Math.round((project.done / project.total) * 100) : 0;
  const stale = staleDays !== null && staleDays >= 7;

  return (
    <article className="channel" aria-label={`${project.name} 项目`}>
      <header className="channel-head">
        <Lamp tone={TONE_LAMP[tone]} />
        <span
          className="channel-title"
          title={project.name}
          style={{ borderBottom: `2px solid ${project.color}`, paddingBottom: 1 }}
        >
          {project.name}
        </span>
        <Link
          href={`/project/${project.id}`}
          className="channel-open"
          aria-label={`打开项目 ${project.name}`}
        >
          进入
          <ChevronRight size={11} aria-hidden="true" />
        </Link>
      </header>

      <div className="channel-meta">
        <span className={`channel-meta-item ${stale ? 'is-warn' : ''}`}>
          最近动作 {stale ? `${staleDays} 天前` : project.lastActivity ? formatRelativeTime(project.lastActivity) : '—'}
        </span>
        <span className="channel-meta-sep" aria-hidden="true" />
        <span className="channel-meta-item">
          下一项 <b>{nextDue?.due_date ? formatDate(nextDue.due_date) : '—'}</b>
        </span>
      </div>

      <div className="channel-meter">
        <div
          className="progress-bar"
          role="progressbar"
          aria-label={`${project.name} 项目进度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={doneRatio}
        >
          <div
            className="progress-bar-fill"
            style={{ width: `${doneRatio}%`, backgroundColor: doneRatio === 100 ? 'var(--t-success)' : 'var(--t-accent)' }}
          />
        </div>
        <span className="num">{doneRatio}%</span>
      </div>

      <div className="channel-task-list">
        {tasks.length === 0 ? (
          <p className="channel-empty">项目空闲 — 没有未完成任务</p>
        ) : tasks.map((task) => (
          <TaskCard key={task.id} task={task} compact onClick={() => onTaskClick(task.id)} />
        ))}
      </div>

      <footer className="channel-foot">
        <div className="channel-counts">
          <span><span className="num" style={{ color: 'var(--t-success)' }}>{project.inProgress}</span> 进行中</span>
          <span><span className="num" style={{ color: project.blocked > 0 ? 'var(--t-danger)' : 'inherit' }}>{project.blocked}</span> 阻塞</span>
          <span><span className="num" style={{ color: 'var(--t-muted)' }}>{project.todo}</span> 待办</span>
        </div>
      </footer>
    </article>
  );
}
