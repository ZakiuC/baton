interface StatCardProps {
  label: string;
  value: number;
  highlight?: boolean;
  icon?: React.ReactNode;
}

export default function StatCard({ label, value, highlight, icon }: StatCardProps) {
  return (
    <div
      className={`card p-3.5 flex items-center gap-3 ${
        highlight ? 'border-danger/40 bg-danger-bg' : ''
      }`}
      aria-label={`${label}：${value}`}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            highlight ? 'bg-danger-subtler text-danger' : 'bg-accent-subtler text-accent'
          }`}
        >
          {icon}
        </div>
      )}
      <div>
        <div
          className={`text-[22px] font-semibold font-mono tabular-nums leading-none ${
            highlight ? 'text-danger' : 'text-primary'
          }`}
        >
          {value}
        </div>
        <div className="text-[11px] text-muted mt-1.5">{label}</div>
      </div>
    </div>
  );
}
