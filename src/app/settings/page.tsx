'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Archive, ArrowLeft, Monitor, Power, Palette, Check, Sun, Moon, ChevronDown, ChevronRight, Info, LoaderCircle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/components/shared/ThemeProvider';
import { allThemes, Theme } from '@/lib/themes';
import { APP_TAGLINE } from '@/lib/version';
import { useAppVersion } from '@/lib/use-app-version';
import { useFeedback } from '@/components/shared/Feedback';
import { useCanUseDOM, useIsElectron } from '@/lib/use-electron';
import { Project } from '@/lib/queries/projects';
import { Task } from '@/lib/queries/tasks';
import { apiRequest, getErrorMessage } from '@/lib/client-api';

export default function SettingsPage() {
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const isElectron = useIsElectron();
  const canUseDOM = useCanUseDOM();
  const [savingSetting, setSavingSetting] = useState<'autoLaunch' | 'tray' | null>(null);
  const { theme: currentTheme, setTheme } = useTheme();
  const { notify } = useFeedback();
  const archivedProjectIds = useMemo(
    () => new Set(archivedProjects.map((project) => project.id)),
    [archivedProjects],
  );

  // 默认主题单独渲染在列表最上方，分组里必须按 id 排除它。
  // 只按 mode 过滤是不够的：默认主题的 mode 会随设计变化（曾为 dark，现为 light），
  // 一旦它和某个分组的 mode 相同，就会在设置页里重复出现两次。
  const groupedThemes = allThemes.filter(t => t.id !== allThemes[0].id);
  const darkThemes = groupedThemes.filter(t => t.mode === 'dark');
  const lightThemes = groupedThemes.filter(t => t.mode === 'light');
  const loading = !canUseDOM || (isElectron && settingsLoading);
  const displayVersion = useAppVersion();

  useEffect(() => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!isElectron || !api) return;

    api.getSettings()
      .then((settings) => {
        setAutoLaunch(settings.autoLaunch);
        setMinimizeToTray(settings.minimizeToTray);
      })
      .catch(() => notify('无法读取桌面设置，请稍后重试。', 'error'))
      .finally(() => setSettingsLoading(false));
  }, [isElectron, notify]);

  const loadArchivedItems = useCallback(async () => {
    try {
      const [projects, tasks] = await Promise.all([
        apiRequest<Project[]>('/api/projects?include_archived=true'),
        apiRequest<Task[]>('/api/tasks?include_archived=true'),
      ]);
      setArchivedProjects(projects.filter((project) => project.status === 'archived'));
      setArchivedTasks(tasks.filter((task) => task.stage === 'archived'));
      setArchiveError('');
    } catch (error: unknown) {
      setArchiveError(getErrorMessage(error, '归档数据加载失败，请重试'));
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadArchivedItems(), 0);
    return () => window.clearTimeout(timer);
  }, [loadArchivedItems]);

  const toggleAutoLaunch = async () => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!isElectron || !api || savingSetting) return;
    const previous = autoLaunch;
    const next = !previous;
    setAutoLaunch(next);
    setSavingSetting('autoLaunch');
    try {
      await api.setAutoLaunch(next);
      notify(next ? '已开启开机自启。' : '已关闭开机自启。', 'success');
    } catch {
      setAutoLaunch(previous);
      notify('开机自启设置保存失败，已恢复原状态。', 'error');
    } finally {
      setSavingSetting(null);
    }
  };
  const toggleMinimizeToTray = async () => {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (!isElectron || !api || savingSetting) return;
    const previous = minimizeToTray;
    const next = !previous;
    setMinimizeToTray(next);
    setSavingSetting('tray');
    try {
      await api.setSettings({ minimizeToTray: next });
      notify(next ? '关闭窗口时将最小化到托盘。' : '关闭窗口时将直接退出。', 'success');
    } catch {
      setMinimizeToTray(previous);
      notify('托盘设置保存失败，已恢复原状态。', 'error');
    } finally {
      setSavingSetting(null);
    }
  };

  const selectTheme = (id: string) => {
    const selected = allThemes.find((theme) => theme.id === id);
    setTheme(id);
    if (selected) notify(`已应用“${selected.name}”主题。`, 'success');
  };

  const restoreProject = async (project: Project) => {
    setRestoringId(project.id);
    try {
      await apiRequest<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      await loadArchivedItems();
      window.dispatchEvent(new CustomEvent('project-updated'));
      notify(`项目“${project.name}”已恢复。`, 'success');
    } catch (error: unknown) {
      notify(getErrorMessage(error, '项目恢复失败，请重试'), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const restoreTask = async (task: Task) => {
    setRestoringId(task.id);
    try {
      await apiRequest<Task>(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'todo' }),
      });
      await loadArchivedItems();
      window.dispatchEvent(new CustomEvent('task-updated'));
      notify(`任务“${task.title}”已恢复到待办。`, 'success');
    } catch (error: unknown) {
      notify(getErrorMessage(error, '任务恢复失败，请重试'), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-5 animate-fade-in max-w-[680px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="skeleton w-7 h-7 rounded-lg" />
          <div className="space-y-1.5">
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton h-3 w-28 rounded" />
          </div>
        </div>
        <div className="card p-4 space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-[720px] mx-auto space-y-5 animate-fade-in">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="icon-button"
          aria-label="返回仪表盘"
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-primary">设置</h1>
          <p className="text-xs text-muted mt-0.5">应用偏好与主题</p>
        </div>
      </div>

      {/* 主题选择 */}
      <div className="card overflow-hidden">
        {/* 头部 — 始终可见，点击展开/折叠 */}
        <button
          onClick={() => setThemeExpanded((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg-hover transition-colors text-left"
          aria-expanded={themeExpanded}
          aria-controls="theme-options"
        >
          <div className="w-7 h-7 rounded-lg bg-accent-subtler flex items-center justify-center flex-shrink-0">
            <Palette size={14} className="text-accent" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">主题方案</p>
            <p className="text-xs text-muted mt-0.5 truncate">{currentTheme.name}</p>
          </div>
          {/* 当前主题色块预览 */}
          <div className="flex gap-0.5 rounded overflow-hidden border border-border flex-shrink-0" aria-hidden="true">
            {[
              currentTheme.vars['--t-surface'],
              currentTheme.vars['--t-card'],
              currentTheme.vars['--t-accent'],
              currentTheme.vars['--t-primary'],
              currentTheme.vars['--t-danger'],
            ].map((c, i) => (
              <span key={i} className="w-4 h-4 block" style={{ backgroundColor: c }} />
            ))}
          </div>
          <ChevronDown
            size={15}
            className="text-muted flex-shrink-0 transition-transform duration-200"
            style={{ transform: themeExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden="true"
          />
        </button>

        {/* 展开区域 */}
        {themeExpanded && (
          <div id="theme-options" className="border-t border-border px-3 pb-3 pt-2">
            {/* 默认 */}
            <ThemeRow t={allThemes[0]} active={currentTheme.id === allThemes[0].id} onClick={selectTheme} />

            {/* 暗色系 */}
            <div className="flex items-center gap-1.5 mt-3 mb-1.5 px-1">
              <Moon size={11} className="text-muted" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-muted">暗色主题</span>
            </div>
            <div className="space-y-0.5">
              {darkThemes.map(t => (
                <ThemeRow key={t.id} t={t} active={currentTheme.id === t.id} onClick={selectTheme} />
              ))}
            </div>

            {/* 亮色系 */}
            <div className="flex items-center gap-1.5 mt-3 mb-1.5 px-1">
              <Sun size={11} className="text-muted" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-muted">亮色主题</span>
            </div>
            <div className="space-y-0.5">
              {lightThemes.map(t => (
                <ThemeRow key={t.id} t={t} active={currentTheme.id === t.id} onClick={selectTheme} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Electron 设置 */}
      <div className="space-y-1.5">
        <SettingToggle
          icon={<Power size={14} className="text-accent" aria-hidden="true" />}
          label="开机自启"
          desc={isElectron ? '系统启动时自动运行' : '右键托盘图标管理'}
          enabled={autoLaunch}
          onChange={toggleAutoLaunch}
          disabled={!isElectron}
          busy={savingSetting === 'autoLaunch'}
        />
        <SettingToggle
          icon={<Monitor size={14} className="text-accent" aria-hidden="true" />}
          label="关闭时最小化到托盘"
          desc={isElectron ? '关闭窗口时隐藏到托盘' : '应用默认运行在托盘中'}
          enabled={minimizeToTray}
          onChange={toggleMinimizeToTray}
          disabled={!isElectron}
          busy={savingSetting === 'tray'}
        />
      </div>

      {!isElectron && (
        <div className="card flex items-start gap-3 p-4 border-border">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-accent" aria-hidden="true" />
          <p className="text-xs text-muted leading-relaxed">
            开机自启与托盘设置仅在桌面版（Electron）中生效
          </p>
        </div>
      )}

      <section className="card overflow-hidden" aria-labelledby="archive-management-title">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-warning-subtle flex items-center justify-center flex-shrink-0">
            <Archive size={14} className="text-warning" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="archive-management-title" className="text-sm font-semibold text-primary">归档管理</h2>
            <p className="text-xs text-muted mt-0.5">归档只隐藏数据，不会删除；可在这里恢复。</p>
          </div>
          {!archiveLoading ? (
            <span className="badge bg-muted-subtle text-muted">
              {archivedProjects.length + archivedTasks.length} 项
            </span>
          ) : null}
        </div>

        <div className="p-3 space-y-3">
          {archiveError ? (
            <div className="inline-feedback border-danger-subtle text-danger" role="alert">
              <p className="flex-1 text-xs">{archiveError}</p>
              <button type="button" className="btn-secondary" onClick={() => void loadArchivedItems()}>重试</button>
            </div>
          ) : null}

          {archiveLoading ? (
            <div className="space-y-2" aria-label="正在加载归档数据">
              <div className="skeleton h-11 rounded-lg" />
              <div className="skeleton h-11 rounded-lg" />
            </div>
          ) : archivedProjects.length === 0 && archivedTasks.length === 0 ? (
            <p className="py-5 text-center text-xs text-muted">暂无归档项目或任务</p>
          ) : (
            <>
              {archivedProjects.length > 0 ? (
                <div>
                  <h3 className="px-1 pb-1.5 text-[11px] font-semibold text-muted">项目</h3>
                  <div className="space-y-1">
                    {archivedProjects.map((project) => (
                      <div key={project.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtler px-3 py-2.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: project.color }} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-primary">{project.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted">项目内数据均保持原样</p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={restoringId !== null}
                          onClick={() => void restoreProject(project)}
                        >
                          {restoringId === project.id
                            ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                            : <RotateCcw size={13} aria-hidden="true" />}
                          恢复
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {archivedTasks.length > 0 ? (
                <div>
                  <h3 className="px-1 pb-1.5 text-[11px] font-semibold text-muted">任务</h3>
                  <div className="space-y-1">
                    {archivedTasks.map((task) => {
                      const projectArchived = archivedProjectIds.has(task.project_id);
                      return (
                        <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtler px-3 py-2.5">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: task.project_color }} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-primary">{task.title}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted">
                              {projectArchived ? '请先恢复所属项目' : task.project_name}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={restoringId !== null || projectArchived}
                            title={projectArchived ? '请先恢复所属项目' : '恢复到待办'}
                            onClick={() => void restoreTask(task)}
                          >
                            {restoringId === task.id
                              ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                              : <RotateCcw size={13} aria-hidden="true" />}
                            恢复
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* 版本信息 → 关于页 */}
      <Link
        href="/about"
        className="card interactive-card p-4 flex items-center gap-3"
        aria-label={`关于 ProjectTracker，当前版本 v${displayVersion}`}
      >
        {/* 与应用图标保持一致，而不是用图标库里的近似字形 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.svg"
          alt=""
          width={32}
          height={32}
          className="w-8 h-8 rounded-lg flex-shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">ProjectTracker</p>
          <p className="text-xs text-muted mt-0.5">
            v{displayVersion} — {APP_TAGLINE}
          </p>
        </div>
        <ChevronRight size={15} className="text-muted flex-shrink-0" aria-hidden="true" />
      </Link>
    </div>
  );
}

/* ── 子组件 ── */

function ThemeRow({ t, active, onClick }: { t: Theme; active: boolean; onClick: (id: string) => void }) {
  const v = t.vars;
  return (
    <button
      onClick={() => onClick(t.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-[color,background-color,box-shadow] duration-150 ${
        active
          ? 'bg-accent-subtle ring-1 ring-inset ring-accent'
          : 'hover:bg-bg-hover'
      }`}
      aria-pressed={active}
    >
      {/* 色块预览（5个色） */}
      <div className="flex gap-0.5 flex-shrink-0 rounded-md overflow-hidden border border-border" aria-hidden="true">
        {[v['--t-surface'], v['--t-card'], v['--t-accent'], v['--t-primary'], v['--t-danger']].map((c, i) => (
          <span key={i} className="w-5 h-5 block" style={{ backgroundColor: c }} />
        ))}
      </div>
      <span className={`text-xs flex-1 text-left font-medium ${active ? 'text-accent' : 'text-primary'}`}>
        {t.name}
      </span>
      {active
        ? <Check size={13} className="text-accent flex-shrink-0" aria-hidden="true" />
        : <span className="text-[11px] text-muted flex-shrink-0">{t.mode === 'dark' ? '暗' : '亮'}</span>
      }
    </button>
  );
}

function SettingToggle({ icon, label, desc, enabled, onChange, disabled, busy }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  enabled: boolean;
  onChange: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div className={`card p-4 flex items-center justify-between ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-accent-subtler flex items-center justify-center flex-shrink-0" aria-hidden="true">
          {icon}
        </div>
        <div>
          <p id={labelId} className="text-sm font-medium text-primary">{label}</p>
          <p id={descriptionId} className="text-xs text-muted mt-0.5">{desc}</p>
        </div>
      </div>
      <button
        onClick={onChange}
        disabled={disabled || busy}
        role="switch"
        aria-checked={enabled}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${enabled ? 'bg-accent' : 'bg-bg-light'}`}
        style={{ boxShadow: enabled ? '0 0 0 1px var(--t-accent)' : '0 0 0 1px var(--t-border-mid)' }}
      >
        {busy ? (
          <LoaderCircle size={12} className="absolute left-3 animate-spin text-accent-foreground" aria-hidden="true" />
        ) : (
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
              enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}
