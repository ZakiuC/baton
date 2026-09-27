'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, PlayCircle, AlertTriangle, CalendarCheck, Plus, RefreshCw } from 'lucide-react';
import StatCard from '@/components/shared/StatCard';
import ProjectCard from '@/components/dashboard/ProjectCard';
import UrgentItems from '@/components/dashboard/UrgentItems';
import ActivityStream from '@/components/dashboard/ActivityStream';
import EmptyState from '@/components/shared/EmptyState';
import ProjectForm from '@/components/forms/ProjectForm';
import { DashboardStats, ProjectProgress, UrgentItem } from '@/lib/queries/dashboard';
import { ActivityLog } from '@/lib/queries/activity';
import { useFeedback } from '@/components/shared/Feedback';

function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="skeleton h-4 w-8 rounded" />
      </div>
      <div className="skeleton h-1.5 w-full rounded-full" />
      <div className="flex gap-3">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<ProjectProgress[]>([]);
  const [urgentItems, setUrgentItems] = useState<UrgentItem[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const { notify } = useFeedback();

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('仪表盘加载失败');
      const data = await response.json();
      if (
        !data.stats
        || !Array.isArray(data.projects)
        || !Array.isArray(data.urgentItems)
        || !Array.isArray(data.recentActivity)
      ) {
        throw new Error('仪表盘数据格式错误');
      }
      setStats(data.stats);
      setProjects(data.projects);
      setUrgentItems(data.urgentItems);
      setActivities(data.recentActivity);
      setError(null);
    } catch {
      setError('暂时无法载入仪表盘，请检查服务后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadData(), 0);
    const handler = () => void loadData();
    window.addEventListener('task-created', handler);
    window.addEventListener('task-updated', handler);
    window.addEventListener('project-created', handler);
    window.addEventListener('project-updated', handler);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener('task-created', handler);
      window.removeEventListener('task-updated', handler);
      window.removeEventListener('project-created', handler);
      window.removeEventListener('project-updated', handler);
    };
  }, [loadData]);

  if (loading) {
    return (
      <div className="p-5 space-y-5 animate-fade-in" aria-busy="true" aria-label="正在加载仪表盘">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="skeleton h-5 w-24 rounded" />
            <div className="skeleton h-3 w-36 rounded" />
          </div>
          <div className="skeleton h-8 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <div className="skeleton w-9 h-9 rounded-lg" />
              <div className="space-y-1.5">
                <div className="skeleton h-6 w-8 rounded" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="card p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="skeleton h-3 w-full rounded" />
                  <div className="skeleton h-2.5 w-16 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-full grid place-items-center p-6 animate-fade-in">
        <div className="card max-w-md p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-danger-bg text-danger" aria-hidden="true">
            <AlertTriangle size={18} />
          </div>
          <h1 className="text-base font-semibold text-primary">仪表盘暂不可用</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{error}</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => { setLoading(true); void loadData(); }}>
            <RefreshCw size={13} aria-hidden="true" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (stats && stats.activeProjects === 0) {
    return (
      <div className="p-8 animate-fade-in">
        <EmptyState
          title="欢迎使用 ProjectTracker"
          description="开始管理你的多项目工作流。首先创建一个项目，然后添加任务。"
          headingLevel="h1"
          action={
            <button
              onClick={() => setShowProjectForm(true)}
              className="btn-primary"
            >
              <Plus size={14} aria-hidden="true" />
              创建第一个项目
            </button>
          }
        />
        {showProjectForm && (
          <ProjectForm
            onClose={() => setShowProjectForm(false)}
            onCreated={() => {
              setShowProjectForm(false);
              notify('项目已创建，可以开始添加任务。', 'success');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-5 max-w-[1440px] mx-auto space-y-5 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary tracking-tight">仪表盘</h1>
          <p className="text-xs text-muted mt-0.5">项目进展、风险与近期动态</p>
        </div>
        <button
          onClick={() => setShowProjectForm(true)}
          className="btn-primary"
        >
          <Plus size={13} aria-hidden="true" />
          新建项目
        </button>
      </div>

      {error ? (
        <div className="inline-feedback" role="status">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs">当前显示的是上次载入的数据。{error}</p>
          <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => void loadData()}>
            重试
          </button>
        </div>
      ) : null}

      {/* 统计栏 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="活跃项目"  value={stats.activeProjects}  icon={<Layers size={16} aria-hidden="true" />} />
          <StatCard label="进行中"    value={stats.inProgressTasks} icon={<PlayCircle size={16} aria-hidden="true" />} />
          <StatCard
            label="被阻塞"
            value={stats.blockedTasks}
            highlight={stats.blockedTasks > 0}
            icon={<AlertTriangle size={16} aria-hidden="true" />}
          />
          <StatCard label="今日到期"  value={stats.todayDueTasks}   icon={<CalendarCheck size={16} aria-hidden="true" />} />
        </div>
      )}

      {/* 主体两栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 左侧 */}
        <div className="lg:col-span-2 space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-primary mb-3">项目进度</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          </div>
          <UrgentItems items={urgentItems} />
        </div>
        {/* 右侧 */}
        <div className="lg:col-span-1">
          <ActivityStream activities={activities} />
        </div>
      </div>

      {showProjectForm && (
        <ProjectForm
          onClose={() => setShowProjectForm(false)}
          onCreated={() => {
            setShowProjectForm(false);
            notify('项目已创建。', 'success');
          }}
        />
      )}
    </div>
  );
}
