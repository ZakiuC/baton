'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, Info, LoaderCircle,
  Monitor, Power, RotateCcw, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/components/shared/ThemeProvider';
import { allThemes, Theme } from '@/lib/themes';
import { APP_NAME_FULL, APP_TAGLINE } from '@/lib/version';
import { useAppVersion } from '@/lib/use-app-version';
import { useFeedback } from '@/components/shared/Feedback';
import { useCanUseDOM, useIsElectron } from '@/lib/use-electron';
import { Project } from '@/lib/queries/projects';
import { Task } from '@/lib/queries/tasks';
import { apiRequest, getErrorMessage } from '@/lib/client-api';
import Modal from '@/components/shared/Modal';

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
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteTaskCount, setDeleteTaskCount] = useState<number | null>(null);
  const isElectron = useIsElectron();
  const canUseDOM = useCanUseDOM();
  const [savingSetting, setSavingSetting] = useState<'autoLaunch' | 'tray' | null>(null);
  const { theme: currentTheme, setTheme } = useTheme();
  const { notify } = useFeedback();
  const archivedProjectIds = useMemo(
    () => new Set(archivedProjects.map((project) => project.id)),
    [archivedProjects],
  );

  // 默认主题单独渲染在列表最上方，分组按 id 排除它，避免重复项。
  const defaultTheme = allThemes[0];
  const machineLight = allThemes.find((theme) => theme.id === 'machine-light') || null;
  const otherThemes = allThemes.filter((theme) => theme.id !== defaultTheme.id && theme.id !== 'machine-light');
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

  const openDeleteDialog = async (project: Project) => {
    setProjectToDelete(project);
    setDeleteConfirmText('');
    setDeleteTaskCount(null);
    try {
      const tasks = await apiRequest<Task[]>(`/api/tasks?project_id=${project.id}&include_archived=true`);
      setDeleteTaskCount(tasks.length);
    } catch {
      setDeleteTaskCount(null);
    }
  };

  const deleteProjectPermanently = async (project: Project) => {
    setDeletingProjectId(project.id);
    try {
      await apiRequest<{ deletedTasks: number }>(
        `/api/projects/${project.id}?permanent=true`,
        { method: 'DELETE' },
      );
      setProjectToDelete(null);
      await loadArchivedItems();
      window.dispatchEvent(new CustomEvent('project-updated'));
      notify(`项目“${project.name}”已永久删除。`, 'success');
    } catch (error: unknown) {
      notify(getErrorMessage(error, '项目删除失败，请重试'), 'error');
    } finally {
      setDeletingProjectId(null);
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
      <div className="settings-page" aria-busy="true" aria-label="正在加载设置">
        <div className="page-toolbar">
          <div className="skeleton h-5 w-20" />
          <div className="skeleton h-6 w-28" />
        </div>
        <div className="panel" style={{ padding: 12 }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-11" style={{ marginTop: index === 0 ? 0 : 6 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page animate-fade-in">
      <div className="page-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" className="icon-button" aria-label="返回仪表盘">
            <ArrowLeft size={15} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="page-title" style={{ fontSize: 17 }}>设置</h1>
            <p className="page-sub">应用偏好、主题与归档</p>
          </div>
        </div>
        <span className="micro-mono">v{displayVersion}</span>
      </div>

      <div className="stack">
        {/* 主题 */}
        <section className="panel" aria-labelledby="theme-heading">
          <button
            type="button"
            onClick={() => setThemeExpanded((value) => !value)}
            className="panel-head"
            style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
            aria-expanded={themeExpanded}
            aria-controls="theme-options"
          >
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="theme-heading" className="panel-title">主题方案</h2>
            <span className="panel-index">{currentTheme.name}</span>
            <span className="theme-swatches" aria-hidden="true" style={{ marginLeft: 'auto' }}>
              {[
                currentTheme.vars['--t-surface'],
                currentTheme.vars['--t-card'],
                currentTheme.vars['--t-accent'],
                currentTheme.vars['--t-primary'],
                currentTheme.vars['--t-danger'],
              ].map((color, index) => (
                <span key={index} style={{ backgroundColor: color }} />
              ))}
            </span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              style={{ transform: themeExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.16s ease', flexShrink: 0 }}
            />
          </button>

          {themeExpanded ? (
            <div id="theme-options" style={{ padding: '4px 8px 8px' }}>
              <div className="section-label" style={{ margin: '4px 4px 2px' }}>本机</div>
              <ThemeRow theme={defaultTheme} active={currentTheme.id === defaultTheme.id} onClick={selectTheme} isDefault />
              {machineLight ? (
                <ThemeRow theme={machineLight} active={currentTheme.id === machineLight.id} onClick={selectTheme} />
              ) : null}

              <div className="section-label" style={{ margin: '12px 4px 2px' }}>其他主题</div>
              {otherThemes.map((theme) => (
                <ThemeRow key={theme.id} theme={theme} active={currentTheme.id === theme.id} onClick={selectTheme} />
              ))}
            </div>
          ) : null}
        </section>

        {/* 桌面行为 */}
        <section className="panel" aria-labelledby="desktop-heading">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="desktop-heading" className="panel-title">桌面行为</h2>
            <span className="panel-index">{isElectron ? '本机生效' : '仅桌面版'}</span>
          </div>
          <SettingToggle
            icon={<Power size={14} />}
            label="开机自启"
            desc={isElectron ? '系统启动时自动运行' : '右键托盘图标管理'}
            enabled={autoLaunch}
            onChange={() => void toggleAutoLaunch()}
            disabled={!isElectron}
            busy={savingSetting === 'autoLaunch'}
          />
          <SettingToggle
            icon={<Monitor size={14} />}
            label="关闭时最小化到托盘"
            desc={isElectron ? '关闭窗口时隐藏到托盘' : '应用默认运行在托盘中'}
            enabled={minimizeToTray}
            onChange={() => void toggleMinimizeToTray()}
            disabled={!isElectron}
            busy={savingSetting === 'tray'}
          />
        </section>

        {!isElectron ? (
          <div className="inline-feedback">
            <Info size={14} style={{ color: 'var(--t-accent)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <p style={{ margin: 0 }}>开机自启与托盘设置仅在桌面版（Electron）中生效。</p>
          </div>
        ) : null}

        {/* 本地数据 */}
        <section className="panel" aria-labelledby="data-heading">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="data-heading" className="panel-title">本地数据</h2>
            <span className="panel-index">不联网 · 不上传</span>
          </div>
          <div className="setting-row">
            <div className="setting-row-main">
              <p className="setting-row-title">数据位置</p>
              <p className="setting-row-desc" style={{ fontFamily: 'var(--font-code)' }}>%APPDATA%\baton\data\tracker.db</p>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-main">
              <p className="setting-row-title">备份提醒</p>
              <p className="setting-row-desc">当前版本不会自动轮转备份；建议定期把 tracker.db 与 .bak 复制到别处。</p>
            </div>
          </div>
        </section>

        {/* 归档管理 */}
        <section className="panel" aria-labelledby="archive-management-title">
          <div className="panel-head">
            <span className="panel-mark" aria-hidden="true" />
            <h2 id="archive-management-title" className="panel-title">归档管理</h2>
            <span className="panel-index">归档只隐藏数据，可随时恢复；已归档项目也可永久删除（不可撤销）</span>
            {!archiveLoading ? (
              <span className="badge badge--outline" style={{ marginLeft: 'auto' }}>
                {archivedProjects.length + archivedTasks.length} 项
              </span>
            ) : null}
          </div>

          <div style={{ padding: '4px 8px 8px' }}>
            {archiveError ? (
              <div className="inline-feedback" role="alert" style={{ color: 'var(--t-danger)', margin: '6px 0' }}>
                <p style={{ flex: 1, margin: 0 }}>{archiveError}</p>
                <button type="button" className="btn-secondary btn-sm" onClick={() => void loadArchivedItems()}>重试</button>
              </div>
            ) : null}

            {archiveLoading ? (
              <div aria-label="正在加载归档数据" style={{ padding: 4 }}>
                <div className="skeleton h-11" />
                <div className="skeleton h-11" style={{ marginTop: 5 }} />
              </div>
            ) : archivedProjects.length === 0 && archivedTasks.length === 0 ? (
              <p style={{ padding: '16px 4px', textAlign: 'center', fontSize: 11, color: 'var(--t-muted)', margin: 0 }}>
                暂无归档项目或任务
              </p>
            ) : (
              <>
                {archivedProjects.length > 0 ? (
                  <div>
                    <h3 className="section-label" style={{ margin: '6px 4px' }}>项目</h3>
                    {archivedProjects.map((project) => (
                      <div key={project.id} className="rounded-lg archive-row" style={{ borderRadius: 3 }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, background: project.color, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                          <p className="micro" style={{ margin: '1px 0 0' }}>可恢复，也可永久删除</p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={restoringId !== null}
                          onClick={() => void restoreProject(project)}
                        >
                          {restoringId === project.id
                            ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                            : <RotateCcw size={12} aria-hidden="true" />}
                          恢复
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ color: 'var(--t-danger)' }}
                          disabled={deletingProjectId !== null || restoringId !== null}
                          onClick={() => void openDeleteDialog(project)}
                          aria-label={`永久删除项目：${project.name}`}
                        >
                          {deletingProjectId === project.id
                            ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                            : <Trash2 size={12} aria-hidden="true" />}
                          永久删除
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {archivedTasks.length > 0 ? (
                  <div>
                    <h3 className="section-label" style={{ margin: '10px 4px 6px' }}>任务</h3>
                    {archivedTasks.map((task) => {
                      const projectArchived = archivedProjectIds.has(task.project_id);
                      return (
                        <div key={task.id} className="rounded-lg archive-row" style={{ borderRadius: 3 }}>
                          <span aria-hidden="true" style={{ width: 5, height: 5, background: task.project_color, flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                            <p className="micro" style={{ margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {projectArchived ? '请先恢复所属项目' : task.project_name}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={restoringId !== null || projectArchived}
                            title={projectArchived ? '请先恢复所属项目' : '恢复到待办'}
                            onClick={() => void restoreTask(task)}
                          >
                            {restoringId === task.id
                              ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                              : <RotateCcw size={12} aria-hidden="true" />}
                            恢复
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        {/* 关于 */}
        <Link
          href="/about"
          className="panel interactive-card"
          style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          aria-label={`关于 ${APP_NAME_FULL}，当前版本 v${displayVersion}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={28} height={28} style={{ borderRadius: 4, flexShrink: 0 }} aria-hidden="true" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{APP_NAME_FULL}</p>
            <p className="micro" style={{ margin: '1px 0 0' }}>v{displayVersion} — {APP_TAGLINE}</p>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--t-muted)', flexShrink: 0 }} aria-hidden="true" />
        </Link>
      </div>

      <Modal
        open={projectToDelete !== null}
        onClose={() => {
          if (deletingProjectId) return;
          setProjectToDelete(null);
        }}
        title="永久删除项目"
      >
        {projectToDelete ? (
          <div className="stack">
            <div className="inline-feedback" style={{ borderColor: 'var(--t-danger)', background: 'var(--t-danger-light)', color: 'var(--t-danger)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>此操作不可撤销，数据无法找回。</p>
            </div>

            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--t-muted)', lineHeight: 1.8 }}>
              <li>项目“{projectToDelete.name}”本身会被删除</li>
              <li>
                该项目下的
                {deleteTaskCount === null ? '全部任务' : ` ${deleteTaskCount} 个任务`}
                会一并删除
              </li>
              <li>这些任务的阻塞记录会一并删除</li>
              <li>活动记录会保留，并留下一条“永久删除了项目”的历史</li>
            </ul>

            <div>
              <label htmlFor="delete-project-confirm" className="field-label">
                请输入项目名称以确认：<span className="num" style={{ color: 'var(--t-danger)' }}>{projectToDelete.name}</span>
              </label>
              <input
                id="delete-project-confirm"
                type="text"
                autoComplete="off"
                className="field-control"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={projectToDelete.name}
                data-initial-focus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" disabled={deletingProjectId !== null} onClick={() => setProjectToDelete(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={deleteConfirmText.trim() !== projectToDelete.name || deletingProjectId !== null}
                onClick={() => void deleteProjectPermanently(projectToDelete)}
              >
                {deletingProjectId ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : null}
                永久删除
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ThemeRow({ theme, active, onClick, isDefault }: {
  theme: Theme;
  active: boolean;
  onClick: (id: string) => void;
  isDefault?: boolean;
}) {
  const vars = theme.vars;
  return (
    <button
      type="button"
      onClick={() => onClick(theme.id)}
      className="theme-row"
      aria-pressed={active}
    >
      <span
        className="theme-preview"
        aria-hidden="true"
        style={{
          background: vars['--t-surface'],
          borderColor: vars['--t-border'],
        }}
      >
        <i style={{ background: vars['--t-card'], borderColor: vars['--t-border-mid'] }} />
        <b style={{ background: vars['--t-accent'] }} />
      </span>
      <span className="theme-name">{theme.name}</span>
      {isDefault ? <span className="badge badge--outline">默认</span> : null}
      {active ? <Check size={12} style={{ color: 'var(--t-accent)', flexShrink: 0 }} aria-hidden="true" /> : null}
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
    <div className="setting-row">
      <span aria-hidden="true" style={{ color: 'var(--t-muted)', flexShrink: 0 }}>{icon}</span>
      <div className="setting-row-main">
        <p id={labelId} className="setting-row-title">{label}</p>
        <p id={descriptionId} className="setting-row-desc">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled || busy}
        role="switch"
        aria-checked={enabled}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="switch"
      >
        {busy ? (
          <LoaderCircle
            size={10}
            className="animate-spin"
            aria-hidden="true"
            style={{ position: 'absolute', top: 3, left: enabled ? 17 : 3, color: 'var(--t-accent)' }}
          />
        ) : null}
      </button>
    </div>
  );
}
