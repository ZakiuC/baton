import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  headingLevel?: 'h1' | 'h2' | 'h3';
}

export default function EmptyState({ title, description, action, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel;

  return (
    <div className="empty-state">
      <div className="w-14 h-14 rounded-xl bg-accent-subtler flex items-center justify-center mb-4 ring-1 ring-accent-subtle" aria-hidden="true">
        <Inbox size={24} className="text-accent" />
      </div>
      <Heading className="text-lg font-semibold text-primary mb-1.5 text-balance">{title}</Heading>
      <p className="text-[13px] text-muted max-w-sm text-center leading-relaxed mb-5 text-pretty">{description}</p>
      {action}
    </div>
  );
}
