'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Project } from '@/lib/queries/projects';
import TaskForm from '@/components/forms/TaskForm';

interface FloatingButtonProps {
  projects: Project[];
}

export default function FloatingButton({ projects }: FloatingButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const pathname = usePathname();
  const routeProjectId = pathname.match(/^\/project\/([^/]+)$/)?.[1];
  const defaultProjectId = projects.some((project) => project.id === routeProjectId)
    ? routeProjectId
    : undefined;

  if (projects.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="fab"
        onClick={() => setShowForm(true)}
        title="快速创建任务"
        aria-label={defaultProjectId ? '为当前项目快速创建任务' : '快速创建任务'}
      >
        <Plus size={22} aria-hidden="true" />
      </button>
      {showForm && (
        <TaskForm
          projects={projects}
          defaultProjectId={defaultProjectId}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
          }}
        />
      )}
    </>
  );
}
