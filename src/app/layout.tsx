'use client';

import './globals.css';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Columns3,
  CalendarRange,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  RefreshCw,
} from 'lucide-react';
import { Project } from '@/lib/queries/projects';
import FloatingButton from '@/components/shared/FloatingButton';
import FeedbackProvider from '@/components/shared/Feedback';
import ThemeProvider, { THEME_BOOTSTRAP_SCRIPT } from '@/components/shared/ThemeProvider';

const NAV_ITEMS = [
  { href: '/',         icon: LayoutDashboard, label: '仪表盘' },
  { href: '/board',    icon: Columns3,        label: '看板'   },
  { href: '/timeline', icon: CalendarRange,   label: '时间线' },
];

const SIDEBAR_STORAGE_KEY = 'project-tracker-sidebar-collapsed';
const SIDEBAR_CHANGED_EVENT = 'project-tracker-sidebar-changed';

function subscribeToSidebar(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(SIDEBAR_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('resize', onStoreChange);
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(SIDEBAR_CHANGED_EVENT, onStoreChange);
  };
}

function getSidebarSnapshot() {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return stored === null ? window.innerWidth <= 1050 : stored === 'true';
}

function getServerSidebarSnapshot() {
  return false;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribeToSidebar,
    getSidebarSnapshot,
    getServerSidebarSnapshot,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState(false);
  const pathname = usePathname();

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('项目列表加载失败');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('项目数据格式错误');
      setProjects(data.filter((project: Project) => project.status === 'active'));
      setProjectsError(false);
    } catch {
      setProjectsError(true);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadProjects(), 0);
    const handler = () => void loadProjects();
    window.addEventListener('project-created', handler);
    window.addEventListener('project-updated', handler);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener('project-created', handler);
      window.removeEventListener('project-updated', handler);
    };
  }, [loadProjects]);

  const toggleSidebar = () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!collapsed));
    window.dispatchEvent(new Event(SIDEBAR_CHANGED_EVENT));
  };

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <title>ProjectTracker</title>
        <meta name="description" content="本地多项目并行管理工作台" />
        <meta name="theme-color" content="#FAFAFB" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <ThemeProvider>
          <FeedbackProvider>
          <a href="#main-content" className="skip-link">跳到主要内容</a>
          <div id="app-shell" className="app-shell flex h-screen overflow-hidden" style={{ background: 'var(--t-surface)' }}>
            {/* ── 侧边栏 ── */}
            <aside
              className="flex flex-col flex-shrink-0 overflow-hidden transition-[width] duration-200"
              aria-label="应用侧栏"
              style={{
                width: collapsed ? '56px' : '216px',
                background: 'var(--t-sidebar)',
                borderRight: '1px solid var(--t-border)',
              }}
            >
              {/* 标志区 */}
              <div
                className="flex items-center gap-2.5 px-3.5 py-4 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--t-border)' }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--t-accent)', color: 'var(--t-accent-foreground)' }}
                  aria-hidden="true"
                >
                  <FolderKanban size={14} />
                </div>
                {!collapsed && (
                  <span className="text-sm font-bold text-primary tracking-tight truncate">
                    ProjectTracker
                  </span>
                )}
              </div>

              {/* 滚动区 */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
                {/* 导航区 */}
                {!collapsed && (
                  <p className="px-3.5 mb-1.5 text-[11px] font-semibold text-muted opacity-70">
                    导航
                  </p>
                )}
                <nav className="px-2 space-y-0.5" aria-label="主导航">
                  {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
                    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-[color,background-color] duration-150 group ${
                          isActive
                            ? 'bg-accent-subtle text-accent'
                            : 'text-muted hover:text-primary hover:bg-bg-hover'
                        }`}
                        title={collapsed ? label : undefined}
                        aria-label={collapsed ? label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon
                          size={15}
                          className="flex-shrink-0"
                          color={isActive ? 'var(--t-accent)' : 'currentColor'}
                          aria-hidden="true"
                        />
                        {!collapsed && <span>{label}</span>}
                        {!collapsed && isActive && (
                          <span className="ml-auto w-1 h-1 rounded-full bg-accent" aria-hidden="true" />
                        )}
                      </Link>
                    );
                  })}
                </nav>

                {/* 项目列表 */}
                <div className="mt-4">
                  {!collapsed && (
                    <p className="px-3.5 mb-1.5 text-[11px] font-semibold text-muted opacity-70">
                      项目
                    </p>
                  )}
                  <div className="px-2 space-y-0.5">
                    {projects.map((p) => {
                      const isActive = pathname === `/project/${p.id}`;
                      return (
                        <Link
                          key={p.id}
                          href={`/project/${p.id}`}
                          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-[color,background-color] duration-150 group ${
                            isActive
                              ? 'bg-bg-hover text-primary'
                              : 'text-muted hover:text-primary hover:bg-bg-hover'
                          }`}
                          title={collapsed ? p.name : undefined}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span
                            className="w-2 h-2 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: p.color }}
                            aria-hidden="true"
                          />
                          {!collapsed && (
                            <span className="truncate flex-1">{p.name}</span>
                          )}
                        </Link>
                      );
                    })}
                    {projects.length === 0 && !collapsed && (
                      projectsError ? (
                        <div className="mx-1 mt-1 rounded-md border border-danger/20 bg-danger-bg px-2.5 py-2 text-[11px] text-danger" role="status">
                          <p>项目列表暂不可用</p>
                          <button
                            type="button"
                            onClick={() => void loadProjects()}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                          >
                            <RefreshCw size={11} aria-hidden="true" />
                            重试
                          </button>
                        </div>
                      ) : (
                        <p className="px-2.5 py-2 text-[11px] text-muted opacity-70">
                          暂无活跃项目
                        </p>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* 底部操作区 */}
              <div
                className="flex-shrink-0 px-2 py-2 space-y-0.5"
                style={{ borderTop: '1px solid var(--t-border)' }}
              >
                <Link
                  href="/settings"
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-[color,background-color] duration-150 ${
                    pathname === '/settings'
                      ? 'bg-accent-subtle text-accent'
                      : 'text-muted hover:text-primary hover:bg-bg-hover'
                  }`}
                  title={collapsed ? '设置' : undefined}
                  aria-label={collapsed ? '设置' : undefined}
                  aria-current={pathname === '/settings' ? 'page' : undefined}
                >
                  <Settings size={15} className="flex-shrink-0" aria-hidden="true" />
                  {!collapsed && <span>设置</span>}
                </Link>

                <button
                  onClick={toggleSidebar}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted hover:text-primary hover:bg-bg-hover transition-[color,background-color] duration-150"
                  title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
                  aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
                  aria-expanded={!collapsed}
                >
                  {collapsed ? <ChevronsRight size={15} aria-hidden="true" /> : <ChevronsLeft size={15} aria-hidden="true" />}
                  {!collapsed && <span className="text-[11px]">折叠</span>}
                </button>
              </div>
            </aside>

            {/* ── 主内容区 ── */}
            <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto min-w-0">
              {children}
            </main>

            {/* 右下角浮动按钮 */}
            <FloatingButton projects={projects} />
          </div>
          </FeedbackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
