import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <div className="mb-4 rounded-full bg-white/80 p-4 text-slate-500 shadow-lg">
        {icon}
      </div>
      <h3 className="mb-2">{title}</h3>
      <p className="max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
