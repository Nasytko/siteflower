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
    <div className="sf-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <h2 className="sf-h2 text-foreground">{title}</h2>
      {description ? <p className="sf-body max-w-md text-muted">{description}</p> : null}
      {children}
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="sf-cta mt-2">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
