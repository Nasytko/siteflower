'use client';

import { useFavorites } from './favorites-provider';

type Props = {
  productId: string;
  slug: string;
  className?: string;
};

export function FavoriteButton({ productId, slug, className = '' }: Props) {
  const { has, toggle, ready } = useFavorites();
  const active = has(productId);

  return (
    <button
      type="button"
      aria-pressed={ready ? active : false}
      aria-label={active ? 'Убрать из избранного' : 'Добавить в избранное'}
      data-favorite={active ? '1' : '0'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/85 backdrop-blur-[2px] transition-colors ${
        active ? 'text-accent' : 'text-muted hover:text-accent'
      } ${className}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle({ productId, slug });
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[1.15rem] w-[1.15rem]"
        aria-hidden="true"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M12 20s-7-4.35-7-9.2A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7 3.7C19 15.65 12 20 12 20Z" />
      </svg>
    </button>
  );
}
