'use client';

import './globals.css';

import { useCallback, useEffect, useState } from 'react';
import { Project } from '@/lib/queries/projects';
import { DashboardStats } from '@/lib/queries/dashboard';
import FeedbackProvider from '@/components/shared/Feedback';
import ThemeProvider, { THEME_BOOTSTRAP_SCRIPT } from '@/components/shared/ThemeProvider';
import TopBar from '@/components/shared/TopBar';
import { APP_NAME_FULL } from '@/lib/version';

/**
 * 应用外壳：顶部常驻状态栏 + 单一主滚动区。
 * 原来固定左侧栏里的项目列表、设置入口和折叠按钮都并入状态栏；
 * 「设置」仍是可见文字链接，导航文字也保持原样（既有 UI 冒烟与用户心智的锚点）。
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const loadShellData = useCallback(async () => {
    try {
      const [projectsResponse, dashboardResponse] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/dashboard'),
      ]);
      if (projectsResponse.ok) {
        const data = await projectsResponse.json();
        if (Array.isArray(data)) {
          setProjects(data.filter((project: Project) => project.status === 'active'));
        }
      }
      if (dashboardResponse.ok) {
        const data = await dashboardResponse.json();
        if (data && data.stats) setStats(data.stats as DashboardStats);
      }
    } catch {
      // 顶部读数只是辅助信息，失败时保持空读数，不阻塞页面。
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadShellData(), 0);
    const handler = () => void loadShellData();
    const events = ['project-created', 'project-updated', 'task-created', 'task-updated'];
    events.forEach((eventName) => window.addEventListener(eventName, handler));
    return () => {
      window.clearTimeout(initialLoadTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, handler));
    };
  }, [loadShellData]);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <title>{APP_NAME_FULL}</title>
        <meta name="description" content="本地多项目并行管理工作台" />
        <meta name="theme-color" content="#0E1115" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <ThemeProvider>
          <FeedbackProvider>
            <a href="#main-content" className="skip-link">跳到主要内容</a>
            <div id="app-shell" className="app-shell">
              <TopBar projects={projects} stats={stats} />
              <main id="main-content" tabIndex={-1} className="app-main">
                {children}
              </main>
            </div>
          </FeedbackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
