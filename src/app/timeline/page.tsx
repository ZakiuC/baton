'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, format, parseISO, isToday,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Task } from '@/lib/queries/tasks';
import { Project } from '@/lib/queries/projects';
import { PRIORITY_CONFIG, STAGE_CONFIG, STAGE_TONE, isLongTermTask } from '@/lib/utils';
import TaskDetail from '@/components/forms/TaskDetail';
import Lamp from '@/components/shared/Lamp';

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
      <div className="timeline-page" aria-busy="true" aria-label="正在加载时间线">
        <div className="timeline-toolbar">
          <div className="skeleton h-5 w-20" />
          <div className="skeleton h-7 w-64" />
        </div>
        <div className="panel" style={{ padding: 12 }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-12" style={{ marginTop: index === 0 ? 0 : 6 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-page animate-fade-in">
      <div className="timeline-toolbar">
        <div>
          <h1 className="page-title" style={{ fontSize: 16 }}>时间线</h1>
          <p className="page-sub">按周查看有截止日期的任务，长期任务单独成列</p>
        </div>

        <div className="week-nav">
          <button
            type="button"
            onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="btn-secondary btn-sm"
          >
            <CalendarDays size={12} aria-hidden="true" />
            今天
          </button>
          <button
            type="button"
            onClick={() => setCurrentWeekStart((date) => subWeeks(date, 1))}
            className="icon-button"
            aria-label="上一周"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <span className="week-range">
            {format(currentWeekStart, 'M月d日', { locale: zhCN })} – {format(weekEnd, 'M月d日', { locale: zhCN })}
          </span>
          <button
            type="button"
            onClick={() => setCurrentWeekStart((date) => addWeeks(date, 1))}
            className="icon-button"
            aria-label="下一周"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && tasks.length === 0 && projects.length === 0 ? (
        <div className="panel" style={{ padding: 24, textAlign: 'center', maxWidth: 440, margin: '40px auto' }}>
          <AlertTriangle size={18} style={{ color: 'var(--t-warning)', margin: '0 auto 8px' }} aria-hidden="true" />
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>时间线暂不可用</p>
          <p style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 4 }}>{error}</p>
          <button type="button" className="btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => { setLoading(true); void loadData(); }}>
            <RefreshCw size={12} aria-hidden="true" />
            重新加载
          </button>
        </div>
      ) : (
        <div className="timeline-wrap">
          <div className="timeline-grid">
            <div className="timeline-head">
              <div className="timeline-head-cell timeline-head-cell--label">项目 / 周次</div>
              {days.map((day) => {
                const today = isToday(day);
                return (
                  <div key={day.toISOString()} className={`timeline-head-cell ${today ? 'timeline-head-cell--today' : ''}`}>
                    <div className="timeline-weekday">{format(day, 'EEE', { locale: zhCN })}</div>
                    <div className="timeline-date">{format(day, 'd')}</div>
                  </div>
                );
              })}
            </div>

            {activeProjects.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'var(--t-muted)' }}>
                暂无可显示的项目
              </div>
            ) : (
              activeProjects.map((project) => (
                <div key={project.id} className="timeline-row">
                  <div className="timeline-project">
                    <span
                      aria-hidden="true"
                      style={{ width: 6, height: 6, background: project.color, flexShrink: 0 }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.name}>
                      {project.name}
                    </span>
                  </div>

                  {days.map((day) => {
                    const dayTasks = tasksByProjectAndDay.get(`${project.id}:${format(day, 'yyyy-MM-dd')}`) || [];
                    const today = isToday(day);
                    return (
                      <div key={day.toISOString()} className={`timeline-cell ${today ? 'timeline-cell--today' : ''}`}>
                        {dayTasks.slice(0, 3).map((task) => (
                          <button
                            type="button"
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className="timeline-chip"
                            title={`${task.title} · ${STAGE_CONFIG[task.stage]?.label}`}
                          >
                            {task.title}
                          </button>
                        ))}
                        {dayTasks.length > 3 ? (
                          <span className="timeline-cell-overflow">+{dayTasks.length - 3}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <section className="panel" aria-labelledby="long-term-title" style={{ overflow: 'hidden' }}>
        <div className="panel-head">
          <span className="panel-mark" aria-hidden="true" />
          <h2 id="long-term-title" className="panel-title">长期任务</h2>
          <span className="panel-index">没有截止日期、仍未完成</span>
          <span className="badge badge--outline" style={{ marginLeft: 'auto' }}>{longTermCount} 项</span>
        </div>

        {longTermCount === 0 ? (
          <p style={{ padding: '18px 12px', textAlign: 'center', fontSize: 11, color: 'var(--t-muted)', margin: 0 }}>
            当前没有长期任务——所有未完成的任务都已设定截止日期。
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {activeProjects.flatMap((project) => {
              const projectTasks = longTermByProject.get(project.id) || [];
              return projectTasks.map((task) => {
                const priority = PRIORITY_CONFIG[task.priority];
                return (
                  <li key={task.id} className="long-term-item">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      aria-label={`打开任务：${task.title}`}
                    >
                      <Lamp tone={STAGE_TONE[task.stage] || 'idle'} />
                      <span
                        aria-hidden="true"
                        style={{ width: 5, height: 5, background: project.color, flexShrink: 0 }}
                      />
                      <span className="long-term-title">{task.title}</span>
                      <span className={`prio-tick prio-tick--${task.priority}`} style={{ flexShrink: 0 }}>{priority?.label || task.priority}</span>
                      <span className="micro" style={{ flexShrink: 0 }}>{STAGE_CONFIG[task.stage]?.label}</span>
                      <span className="micro-mono" style={{ flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                    </button>
                  </li>
                );
              });
            })}
          </ul>
        )}
      </section>

      {selectedTaskId ? (
        <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      ) : null}
    </div>
  );
}
