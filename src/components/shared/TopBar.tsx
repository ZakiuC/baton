'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Plus, Settings } from 'lucide-react';
import { Project } from '@/lib/queries/projects';
import { DashboardStats } from '@/lib/queries/dashboard';
import TaskForm from '@/components/forms/TaskForm';

const NAV_ITEMS = [
  { href: '/', index: '01', label: '仪表盘' },
  { href: '/board', index: '02', label: '看板' },
  { href: '/timeline', index: '03', label: '时间线' },
];

interface TopBarProps {
  projects: Project[];
  stats: DashboardStats | null;
}

/**
 * 顶部状态栏：常驻的设备读数 + 页面切换 + 项目切换。
 * 导航文字保持「仪表盘 / 看板 / 时间线 / 设置」原样——它们是既有测试与用户心智的锚点，
 * 机台感由序号（CSS ::before，不进 innerText）、灯色和等宽数字承担。
 */
export default function TopBar({ projects, stats }: TopBarProps) {
  const pathname = usePathname();
  const [clock, setClock] = useState('--:--');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="topbar" aria-label="应用状态栏">
      <Link href="/" className="topbar-brand" aria-label="Baton 执筹 · 返回仪表盘">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={22} height={22} aria-hidden="true" />
        <span>
          <span className="topbar-wordmark">BATON</span>
          <span className="topbar-sub">执筹 · 本机运行</span>
        </span>
      </Link>

      <nav className="topbar-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="topbar-link"
            data-index={item.index}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="project-switcher" ref={menuRef}>
        <button
          type="button"
          className="project-switcher-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span>项目</span>
          <span className="num" style={{ color: 'var(--t-primary)' }}>{projects.length}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div className="project-switcher-menu" role="menu" aria-label="切换项目">
            {projects.length === 0 ? (
              <p className="micro" style={{ padding: '8px 9px' }}>暂无活跃项目</p>
            ) : projects.map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                role="menuitem"
                className="project-switcher-item"
                onClick={() => setMenuOpen(false)}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 6, height: 6, background: project.color, flexShrink: 0 }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {project.name}
                </span>
                <small>{project.status === 'archived' ? '已归档' : '运行中'}</small>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="topbar-status" aria-label="当前状态">
        <span className="readout">
          <span>进行中</span>
          <strong>{stats ? stats.inProgressTasks : '--'}</strong>
        </span>
        <span className={`readout ${stats && stats.blockedTasks > 0 ? 'readout--danger' : ''}`}>
          <span>阻塞</span>
          <strong>{stats ? stats.blockedTasks : '--'}</strong>
        </span>
        <span className={`readout ${stats && stats.todayDueTasks > 0 ? 'readout--accent' : ''}`}>
          <span>今日到期</span>
          <strong>{stats ? stats.todayDueTasks : '--'}</strong>
        </span>
      </div>

      <span className="topbar-clock" aria-label={`当前时间 ${clock}`}>{clock}</span>

      <div className="topbar-actions">
        {projects.length > 0 ? (
          <button type="button" className="btn-primary btn-sm" onClick={() => setShowTaskForm(true)}>
            <Plus size={13} aria-hidden="true" />
            新建任务
          </button>
        ) : null}
        <Link href="/settings" className="topbar-text-link">
          <Settings size={14} aria-hidden="true" />
          设置
        </Link>
      </div>

      {showTaskForm ? (
        <TaskForm
          projects={projects}
          onClose={() => setShowTaskForm(false)}
          onCreated={() => {
            setShowTaskForm(false);
            window.dispatchEvent(new CustomEvent('task-created'));
          }}
        />
      ) : null}
    </header>
  );
}
