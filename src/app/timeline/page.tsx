'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, CalendarDays, Infinity as InfinityIcon, RefreshCw } from 'lucide-react';
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, format, parseISO, isToday,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Task } from '@/lib/queries/tasks';
import { Project } from '@/lib/queries/projects';
import { PRIORITY_CONFIG, STAGE_CONFIG, isLongTermTask } from '@/lib/utils';
import TaskDetail from '@/components/forms/TaskDetail';

export default function TimelinePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const weekEnd = useMemo(
    () => endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
    [currentWeekStart],
  );
  const days = useMemo(
    () => eachDayOfInterval({ start: currentWeekStart, end: weekEnd }),
    [currentWeekStart, weekEnd],
  );

  const loadData = useCallback(async () => {
    try {
      const [tasksResponse, projectsResponse] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/projects'),
      ]);
      if (!tasksResponse.ok || !projectsResponse.ok) throw new Error('时间线加载失败');
      const [tasksData, projectsData] = await Promise.all([
        tasksResponse.json(),
        projectsResponse.json(),
      ]);
      if (!Array.isArray(tasksData) || !Array.isArray(projectsData)) {
        throw new Error('时间线数据格式错误');
      }
      setTasks(tasksData);
      setProjects(projectsData);
      setError(null);
    } catch {
      setError('暂时无法载入时间线，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadData(), 0);
    const handler = () => void loadData();
    window.addEventListener('task-created', handler);
    window.addEventListener('task-updated', handler);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener('task-created', handler);
      window.removeEventListener('task-updated', handler);
    };
  }, [loadData]);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active'),
    [projects],
  );
  const tasksByProjectAndDay = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.due_date || task.stage === 'done') continue;
      const key = `${task.project_id}:${format(parseISO(task.due_date), 'yyyy-MM-dd')}`;
      const current = grouped.get(key);
      if (current) current.push(task);
      else grouped.set(key, [task]);
    }
    return grouped;
  }, [tasks]);

  /** 长期任务：无截止日期且未完成/未归档，按项目分组。 */
  const longTermByProject = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!isLongTermTask(task)) continue;
      const current = grouped.get(task.project_id);
      if (current) current.push(task);
      else grouped.set(task.project_id, [task]);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => {
        const order = ['urgent', 'high', 'medium', 'low'];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      });
    }
    return grouped;
  }, [tasks]);
  const longTermCount = useMemo(
    () => Array.from(longTermByProject.values()).reduce((sum, list) => sum + list.length, 0),
    [longTermByProject],
  );

  if (loading) {
    return (
      <div className="h-full flex flex-col animate-fade-in" aria-busy="true" aria-label="正在加载时间线">
        <div className="px-6 py-3.5 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="space-y-1.5">
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton h-3 w-40 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="skeleton h-7 w-12 rounded-lg" />
            <div className="skeleton h-7 w-40 rounded-lg" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="grid gap-0" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
              <div className="skeleton h-10 rounded mx-1" />
              {[...Array(7)].map((_, j) => <div key={j} className="skeleton h-10 rounded mx-0.5" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 头部 */}
      <div
        className="px-5 py-3.5 flex items-center justify-between gap-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--t-border)' }}
      >
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-primary">时间线</h1>
          <p className="text-xs text-muted mt-0.5">按周查看有截止日期的任务</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="btn-secondary"
          >
            <CalendarDays size={12} aria-hidden="true" />
            今天
          </button>
          <div className="flex items-center gap-0.5 rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setCurrentWeekStart((d) => subWeeks(d, 1))}
              className="icon-button rounded-none border-r border-border"
              aria-label="上一周"
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <span className="text-xs text-primary min-w-[148px] text-center font-medium px-1 select-none">
              {format(currentWeekStart, 'M月d日', { locale: zhCN })} –{' '}
              {format(weekEnd, 'M月d日', { locale: zhCN })}
            </span>
            <button
              type="button"
              onClick={() => setCurrentWeekStart((d) => addWeeks(d, 1))}
              className="icon-button rounded-none border-l border-border"
              aria-label="下一周"
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* 时间线主体 */}
      <div className="flex-1 overflow-auto">
        {error && tasks.length === 0 && projects.length === 0 ? (
          <div className="grid min-h-full place-items-center p-6">
            <div className="inline-feedback max-w-md" role="alert">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-danger" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">时间线暂不可用</p>
                <p className="mt-0.5 text-xs text-muted">{error}</p>
                <button type="button" className="btn-secondary mt-3" onClick={() => { setLoading(true); void loadData(); }}>
                  <RefreshCw size={12} aria-hidden="true" />
                  重新加载
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="min-w-[820px]">
          {/* 日期表头（粘性） */}
          <div
            className="grid sticky top-0 z-10"
            style={{
              gridTemplateColumns: '168px repeat(7, 1fr)',
              background: 'var(--t-sidebar)',
              borderBottom: '1px solid var(--t-border)',
            }}
          >
            <div className="sticky left-0 z-20 px-4 py-2.5 text-[11px] font-semibold text-muted border-r border-border bg-sidebar">
              项目
            </div>
            {days.map((day) => {
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className="px-2 py-2.5 text-center border-r border-border last:border-r-0"
                  style={{ background: today ? 'var(--t-accent-ghost)' : undefined }}
                >
                  <div className={`text-[11px] font-medium ${today ? 'text-accent' : 'text-muted'}`}>
                    {format(day, 'EEE', { locale: zhCN })}
                  </div>
                  <div
                    className={`text-sm font-bold mt-0.5 font-mono ${today ? 'text-accent' : 'text-primary'}`}
                  >
                    {today ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-white text-xs">
                        {format(day, 'd')}
                      </span>
                    ) : (
                      format(day, 'd')
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 项目行 */}
          {activeProjects.length === 0 ? (
            <div className="text-center text-sm text-muted py-16">暂无可显示的项目</div>
          ) : (
            activeProjects.map((project) => (
              <div
                key={project.id}
                className="grid"
                style={{
                  gridTemplateColumns: '168px repeat(7, 1fr)',
                  borderBottom: '1px solid var(--t-border)',
                }}
              >
                {/* 项目名 */}
                <div
                  className="sticky left-0 z-[5] px-4 py-3 flex items-center gap-2 bg-surface"
                  style={{ borderRight: '1px solid var(--t-border)' }}
                >
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: project.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-primary truncate font-medium" title={project.name}>{project.name}</span>
                </div>

                {/* 每天 */}
                {days.map((day) => {
                  const dayTasks = tasksByProjectAndDay.get(`${project.id}:${format(day, 'yyyy-MM-dd')}`) || [];
                  const today = isToday(day);
                  return (
                    <div
                      key={day.toISOString()}
                      className="px-1 py-1.5 min-h-[48px]"
                      style={{
                        borderRight: '1px solid var(--t-border)',
                        background: today ? 'var(--t-accent-dim)' : undefined,
                      }}
                    >
                      {dayTasks.map((task) => {
                        const stageConfig = STAGE_CONFIG[task.stage];
                        return (
                          <button
                            type="button"
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className="w-full text-left px-2 py-1.5 mb-1 rounded-md text-[11px] text-primary truncate transition-[background-color,border-color] hover:bg-bg-hover block font-medium"
                            style={{
                              backgroundColor: 'var(--t-bg-subtler)',
                              borderLeft: `2px solid ${project.color}`,
                            }}
                            title={`${task.title} · ${stageConfig?.label}`}
                          >
                            {task.title}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        )}

        {/* 长期任务：没有截止日期，因此不会出现在上面的周视图里，单独列出避免遗漏 */}
        <section
          className="mt-5 card overflow-hidden"
          aria-labelledby="long-term-title"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="w-7 h-7 rounded-lg bg-accent-subtler flex items-center justify-center flex-shrink-0">
              <InfinityIcon size={14} className="text-accent" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="long-term-title" className="text-sm font-semibold text-primary">长期任务</h2>
              <p className="text-xs text-muted mt-0.5">
                没有截止日期、仍未完成的任务。它们不会出现在按日期铺排的周视图里。
              </p>
            </div>
            <span className="badge text-muted bg-muted-subtle">{longTermCount} 项</span>
          </div>

          <div className="p-4">
            {longTermCount === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                当前没有长期任务——所有未完成的任务都已设定截止日期。
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeProjects.map((project) => {
                  const projectTasks = longTermByProject.get(project.id) || [];
                  if (projectTasks.length === 0) return null;
                  return (
                    <div key={project.id} className="rounded-lg border border-border bg-bg-subtler p-3 self-start">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-2 h-2 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                          aria-hidden="true"
                        />
                        <h3 className="text-xs font-semibold text-primary truncate">{project.name}</h3>
                        <span className="ml-auto text-[10px] font-mono text-muted flex-shrink-0">
                          {projectTasks.length}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {projectTasks.map((task) => {
                          const stageConfig = STAGE_CONFIG[task.stage];
                          const priorityConfig = PRIORITY_CONFIG[task.priority];
                          return (
                            <li key={task.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedTaskId(task.id)}
                                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-[background-color] hover:bg-bg-hover"
                                aria-label={`打开任务：${task.title}`}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: stageConfig?.color }}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1 truncate text-xs text-primary">
                                  {task.title}
                                </span>
                                <span className={`badge flex-shrink-0 ${task.priority === 'urgent' ? 'text-danger bg-danger-light' : 'text-muted bg-muted-subtle'}`}>
                                  {priorityConfig?.label || task.priority}
                                </span>
                                <span className="text-[10px] text-muted flex-shrink-0 hidden sm:inline">
                                  {stageConfig?.label}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedTaskId && (
        <TaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
