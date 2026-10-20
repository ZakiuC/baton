import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  kicker?: string;
  action?: React.ReactNode;
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/** 空状态：一块带角标的面板，而不是插图 + 一句“暂无数据”。 */
export default function EmptyState({ title, description, kicker, action, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel;

  return (
    <div className="empty-state">
      <div
        aria-hidden="true"
        style={{
          width: 46,
          height: 46,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid var(--t-border-mid)',
          background: 'var(--t-accent-ghost)',
          color: 'var(--t-accent)',
          marginBottom: 14,
          position: 'relative',
        }}
      >
        <Inbox size={20} />
      </div>
      {kicker ? <p className="micro-mono" style={{ marginBottom: 7 }}>{kicker}</p> : null}
      <Heading style={{ margin: 0, fontSize: 16, fontWeight: 600 }} className="text-balance">{title}</Heading>
      <p style={{ margin: '6px 0 16px', maxWidth: 360, fontSize: 12, lineHeight: 1.65, color: 'var(--t-muted)' }} className="text-pretty">
        {description}
      </p>
      {action}
    </div>
  );
}
