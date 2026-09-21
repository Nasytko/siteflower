import Link from 'next/link';

export type BreadcrumbItem = {
  name: string;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className = '' }: Props) {
  return (
    <nav aria-label="Хлебные крошки" className={`sf-small text-muted ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-brand">
                  {item.name}
                </Link>
              ) : (
                <span className={isLast ? 'text-foreground' : undefined} aria-current={isLast ? 'page' : undefined}>
                  {item.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
