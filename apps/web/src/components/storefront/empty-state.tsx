import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export function EmptyState({
  title,
  description,
  actionHref = '/bukety',
  actionLabel = 'Смотреть каталог',
  children,
}: Props) {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <h2 className="sf-h2 text-foreground">{title}</h2>
      {description ? <p className="sf-body max-w-md text-muted">{description}</p> : null}
      {children}
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-2 inline-flex items-center rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition hover:opacity-90"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
