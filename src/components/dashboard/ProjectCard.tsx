'use client';

import Link from 'next/link';
import { ProjectProgress } from '@/lib/queries/dashboard';
import { calcProgress, formatRelativeTime, getActivityDescription } from '@/lib/utils';

interface ProjectCardProps {
  project: ProjectProgress;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const progress = calcProgress(project.done, project.total);
  const isComplete = progress === 100;

  return (
    <Link
      href={`/project/${project.id}`}
      className="card interactive-card p-4 project-border block hover:-translate-y-px"
      style={{ borderLeftColor: project.color }}
      aria-label={`打开项目 ${project.name}，已完成 ${project.done} / ${project.total}`}
    >
      {/* 项目名 + 进度数字 */}
      <div className="flex items-start justify-between mb-2.5 gap-2">
        <h3 className="text-sm font-semibold text-primary truncate leading-tight">{project.name}</h3>
        <span
          className="text-[10px] font-mono font-medium flex-shrink-0 px-1.5 py-0.5 rounded"
          style={{
            color: isComplete ? 'var(--t-success)' : 'var(--t-primary)',
            background: isComplete ? 'var(--t-success-subtle)' : `${project.color}18`,
          }}
        >
          {project.done}/{project.total}
        </span>
      </div>

      {/* 进度条 */}
      <div
        className="progress-bar mb-3"
        role="progressbar"
        aria-label={`${project.name} 项目进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className="progress-bar-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: isComplete ? 'var(--t-success)' : project.color,
          }}
        />
      </div>

      {/* 阶段统计 */}
      <div className="flex items-center gap-3 mb-2">
        {project.todo > 0 && (
          <span className="text-[11px] text-muted flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted inline-block" aria-hidden="true" />
            待办 {project.todo}
          </span>
        )}
        {project.inProgress > 0 && (
          <span className="text-[11px] text-primary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: project.color }} aria-hidden="true" />
            进行中 {project.inProgress}
          </span>
        )}
        {project.blocked > 0 && (
          <span className="text-[11px] text-danger flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-danger inline-block" aria-hidden="true" />
            阻塞 {project.blocked}
          </span>
        )}
      </div>

      {/* 最近活动 */}
      {project.lastActivity && (
        <p className="text-[11px] text-muted truncate border-t border-border pt-2 mt-1">
          {project.lastActivityAction
            ? getActivityDescription(project.lastActivityAction, project.lastActivityDetail || '', '')
            : '暂无活动'}
          <span className="mx-1 opacity-40">·</span>
          {formatRelativeTime(project.lastActivity)}
        </p>
      )}
    </Link>
  );
}
