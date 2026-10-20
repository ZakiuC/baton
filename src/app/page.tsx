'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { addDays, format, isToday, parseISO } from 'date-fns';
import { DashboardStats, ProjectProgress } from '@/lib/queries/dashboard';
import { ActivityLog } from '@/lib/queries/activity';
import { Task } from '@/lib/queries/tasks';
import { daysSince, daysUntil, isOverdue } from '@/lib/utils';
import ProjectChannel from '@/components/dashboard/ProjectChannel';
import Lamp from '@/components/shared/Lamp';
import AlertRail from '@/components/dashboard/AlertRail';
import RunLog from '@/components/dashboard/RunLog';
import TaskDetail from '@/components/forms/TaskDetail';
import ProjectForm from '@/components/forms/ProjectForm';
import EmptyState from '@/components/shared/EmptyState';
import { useFeedback } from '@/components/shared/Feedback';

const STAGE_RANK: Record<string, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3, archived: 4 };
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const ACTIVE_STAGES = new Set(['todo', 'in_progress', 'blocked']);

function sortTasks(list: Task[]) {
  return [...list].sort((a, b) => {
    const stage = (STAGE_RANK[a.stage] ?? 9) - (STAGE_RANK[b.stage] ?? 9);
    if (stage !== 0) return stage;
    const overdue = Number(!isOverdue(a.due_date)) - Number(!isOverdue(b.due_date));
    if (overdue !== 0) return overdue;
    const priority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (priority !== 0) return priority;
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

function dayKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function DashboardSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="正在加载仪表盘">
      <div className="page-toolbar">
        <div>
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-3 w-52" style={{ marginTop: 7 }} />
        </div>
        <div className="skeleton h-7 w-24" />
      </div>
      <div className="console-layout">
        <div className="channels">
          {[0, 1, 2].map((index) => (
            <div key={index} className="channel" style={{ padding: 12 }}>
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-3 w-full" style={{ marginTop: 10 }} />
              <div className="skeleton h-12 w-full" style={{ marginTop: 8 }} />
              <div className="skeleton h-12 w-full" style={{ marginTop: 6 }} />
              <div className="skeleton h-12 w-full" style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
        <div className="panel" style={{ padding: 12 }}>
          <div className="skeleton h-4 w-20" />
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-11 w-full" style={{ marginTop: 8 }} />
          ))}
        </div>
      </div>
      <div className="panel" style={{ marginTop: 12, padding: 12 }}>
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-24 w-full" style={{ marginTop: 10 }} />
      </div>
      <div className="panel" style={{ marginTop: 12, padding: 12 }}>
        <div className="skeleton h-4 w-20" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-6 w-full" style={{ marginTop: 7 }} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<ProjectProgress[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { notify } = useFeedback();

  const loadData = useCallback(async () => {
    try {
      const [dashboardResponse, tasksResponse] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/tasks'),
      ]);
      if (!dashboardResponse.ok || !tasksResponse.ok) throw new Error('dashboard unavailable');
      const dashboard = await dashboardResponse.json();
      const taskList = await tasksResponse.json();
      if (!dashboard?.stats || !Array.isArray(dashboard.projects) || !Array.isArray(dashboard.recentActivity) || !Array.isArray(taskList)) {
        throw new Error('dashboard shape invalid');
      }
      setStats(dashboard.stats as DashboardStats);
      setProjects(dashboard.projects as ProjectProgress[]);
      setActivities(dashboard.recentActivity as ActivityLog[]);
      setTasks(taskList as Task[]);
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
    const events = ['task-created', 'task-updated', 'project-created', 'project-updated'];
    events.forEach((eventName) => window.addEventListener(eventName, handler));
    const ticker = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialLoadTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, handler));
      window.clearInterval(ticker);
    };
  }, [loadData]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = addDays(new Date(), index);
      return { key: dayKey(date), label: WEEKDAYS[date.getDay()], today: isToday(date) };
    }),
    [],
  );

  const tasksByProject = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.stage === 'archived' || task.stage === 'done') continue;
      const current = grouped.get(task.project_id);
      if (current) current.push(task);
      else grouped.set(task.project_id, [task]);
    }
    return grouped;
  }, [tasks]);

  const channels = useMemo(() => {
    return projects.map((project) => {
      const activeTasks = tasksByProject.get(project.id) || [];
      const overdue = activeTasks.filter((task) => isOverdue(task.due_date)).length;
      const staleDays = daysSince(project.lastActivity);
      const stale = staleDays !== null && staleDays >= 7;
      const tone: 'blocked' | 'warn' | 'run' | 'idle' = project.blocked > 0
        ? 'blocked'
        : overdue > 0 || stale
          ? 'warn'
          : project.inProgress > 0
            ? 'run'
            : 'idle';
      const attention = project.blocked * 100 + overdue * 10 + (stale ? 30 : 0) + project.inProgress;
      const load = days.map((day) => activeTasks.filter(
        (task) => task.due_date && dayKey(parseISO(task.due_date)) === day.key,
      ).length);
      const nextDue = [...activeTasks]
        .filter((task) => task.due_date && !isOverdue(task.due_date))
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0] || null;
      return { project, tasks: sortTasks(activeTasks).slice(0, 4), tone, attention, load, staleDays, nextDue };
    }).sort((a, b) => b.attention - a.attention || (b.project.lastActivity || '').localeCompare(a.project.lastActivity || ''));
  }, [days, projects, tasksByProject]);

  const stalledProjects = useMemo(
    () => channels
      .filter((channel) => channel.staleDays !== null && channel.staleDays >= 7)
      .sort((a, b) => (b.staleDays || 0) - (a.staleDays || 0))
      .slice(0, 4)
      .map((channel) => ({ project: channel.project, days: channel.staleDays || 0 })),
    [channels],
  );

  const blockedTasks = useMemo(
    () => tasks
      .filter((task) => task.stage === 'blocked')
      .sort((a, b) => (a.blockers?.[0]?.created_at || a.updated_at).localeCompare(b.blockers?.[0]?.created_at || b.updated_at)),
    [tasks],
  );
  const overdueTasks = useMemo(
    () => tasks
      .filter((task) => ACTIVE_STAGES.has(task.stage) && isOverdue(task.due_date))
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    [tasks],
  );
  const dailyTotals = useMemo(
    () => days.map((_, index) => channels.reduce((sum, channel) => sum + (channel.load[index] || 0), 0)),
    [channels, days],
  );

  const dueTodayTasks = useMemo(
    () => sortTasks(tasks.filter(
      (task) => ACTIVE_STAGES.has(task.stage) && task.due_date && dayKey(parseISO(task.due_date)) === dayKey(new Date()),
    )),
    [tasks],
  );

  const upcomingTasks = useMemo(() => {
    const today = new Date();
    const todayKey = dayKey(today);
    return sortTasks(tasks.filter((task) => {
      if (!ACTIVE_STAGES.has(task.stage) || !task.due_date) return false;
      const key = dayKey(parseISO(task.due_date));
      if (key <= todayKey) return false;
      const days = daysUntil(task.due_date) ?? 99;
      return days >= 1 && days <= 3;
    })).slice(0, 4);
  }, [tasks]);

  if (loading) return <DashboardSkeleton />;

  if (error && !stats) {
    return (
      <div className="page" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
        <div className="panel" style={{ maxWidth: 420, padding: 22, textAlign: 'center' }}>
          <AlertTriangle size={20} style={{ color: 'var(--t-warning)', margin: '0 auto 10px' }} aria-hidden="true" />
          <h1 className="page-title" style={{ fontSize: 16 }}>仪表盘暂不可用</h1>
          <p className="page-sub" style={{ marginTop: 6 }}>{error}</p>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 14 }}
            onClick={() => { setLoading(true); void loadData(); }}
          >
            <RefreshCw size={12} aria-hidden="true" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (stats && stats.activeProjects === 0) {
    return (
      <div className="page">
        <EmptyState
          kicker="系统待命 · 0 个项目"
          title="建立第一条项目线"
          description="先给它一个名字和颜色，再把第一件要做的事放进待办。"
          headingLevel="h1"
          action={(
            <button type="button" className="btn-primary" onClick={() => setShowProjectForm(true)}>
              <Plus size={14} aria-hidden="true" />
              创建第一个项目
            </button>
          )}
        />
        {showProjectForm ? (
          <ProjectForm
            onClose={() => setShowProjectForm(false)}
            onCreated={() => {
              setShowProjectForm(false);
              notify('项目已创建，可以开始添加任务。', 'success');
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-toolbar">
        <div>
          <h1 className="page-title">仪表盘</h1>
          <p className="page-sub">项目运行状态、告警与今日到期</p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setShowProjectForm(true)}>
          <Plus size={12} aria-hidden="true" />
          新建项目
        </button>
      </div>

      {error ? (
        <div className="inline-feedback" role="status" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ color: 'var(--t-warning)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <p style={{ flex: 1, margin: 0 }}>当前显示的是上次载入的数据。{error}</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadData()}>重试</button>
        </div>
      ) : null}

      <div className="console-layout">
        <section aria-label="项目" style={{ minWidth: 0 }}>
          {channels.length === 0 ? (
            <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--t-muted)', fontSize: 12 }}>
              没有可显示的项目
            </div>
          ) : (
            <div className="channels">
              {channels.map(({ project, tasks: channelTasks, tone, staleDays, nextDue }) => (
                <ProjectChannel
                  key={project.id}
                  project={project}
                  tasks={channelTasks}
                  tone={tone}
                  staleDays={staleDays}
                  nextDue={nextDue}
                  onTaskClick={setSelectedTaskId}
                />
              ))}
            </div>
          )}
        </section>

        <AlertRail
          blocked={blockedTasks}
          overdue={overdueTasks}
          dueToday={dueTodayTasks}
          upcoming={upcomingTasks}
          stalled={stalledProjects}
          nowMs={nowMs}
          onTaskClick={setSelectedTaskId}
        />
      </div>

      <section className="panel" aria-labelledby="week-load-title" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <Lamp tone="accent" />
          <h2 id="week-load-title" className="panel-title">一周负荷</h2>
          <span className="panel-index">未完成任务按到期日分布</span>

        </div>
        {dailyTotals.some((count) => count > 0) ? (
        <div className="week-load" role="table" aria-label="一周负荷">
          <div className="week-load-label" role="columnheader">项目</div>
          {days.map((day) => (
            <div key={day.key} className={`week-load-day ${day.today ? 'is-today' : ''}`} role="columnheader">
              {day.label}
              <b>{day.key.slice(8)}</b>
            </div>
          ))}
          {channels.map(({ project, load }) => (
            <Fragment key={project.id}>
              <div className="week-load-label" role="rowheader">
                <span aria-hidden="true" style={{ width: 5, height: 5, background: project.color, flexShrink: 0 }} />
                <span title={project.name}>{project.name}</span>
              </div>
              {load.map((count, index) => (
                <div
                  key={`${project.id}-${days[index].key}`}
                  className={`week-load-cell ${days[index].today ? 'is-today' : ''} ${count > 0 ? 'has-load' : 'is-empty'}`}
                  role="cell"
                  aria-label={`${project.name} ${days[index].key} ${count} 项`}
                >
                  {count === 0 ? '' : count}
                </div>
              ))}
            </Fragment>
          ))}
          <div className="week-load-label week-load-total-label" role="rowheader">合计</div>
          {dailyTotals.map((count, index) => (
            <div
              key={`total-${days[index].key}`}
              className={`week-load-cell week-load-total ${days[index].today ? 'is-today' : ''} ${count > 0 ? 'has-load' : 'is-empty'}`}
              role="cell"
              aria-label={`合计 ${days[index].key} ${count} 项`}
            >
              {count === 0 ? '' : count}
            </div>
          ))}
        </div>
        ) : (
          <p className="micro" style={{ margin: 0, padding: '10px 12px' }}>
            本周没有到期任务；给任务设定截止日期后，这里会按天显示负荷。
          </p>
        )}
      </section>

      <div style={{ marginTop: 12 }}>
        <RunLog activities={activities} />
      </div>

      {showProjectForm ? (
        <ProjectForm
          onClose={() => setShowProjectForm(false)}
          onCreated={() => {
            setShowProjectForm(false);
            notify('项目已创建。', 'success');
          }}
        />
      ) : null}
      {selectedTaskId ? (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      ) : null}
    </div>
  );
}
