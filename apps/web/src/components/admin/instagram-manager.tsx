'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InstagramPostDto } from '@bouquet-one/contracts';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { toSameOriginMediaUrl } from '@/lib/media';

type Props = {
  initial: InstagramPostDto[];
  profileUrl: string | null;
  canUpdate: boolean;
};

export function InstagramManager({ initial, profileUrl, canUpdate }: Props) {
  const router = useRouter();
  const [posts, setPosts] = useState(() =>
    [...initial].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const list = await adminGet<InstagramPostDto[]>(adminEndpoints.instagramPosts);
    setPosts([...list].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось обновить Instagram'));
    } finally {
      setPending(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const imageUrl = String(data.get('imageUrl') ?? '').trim();
    if (!imageUrl) return;
    await run(async () => {
      await adminPost(adminEndpoints.instagramPosts, {
        imageUrl,
        postUrl: String(data.get('postUrl') ?? '').trim() || null,
        caption: String(data.get('caption') ?? '').trim() || null,
        enabled: true,
      });
      form.reset();
      await reload();
    });
  }

  async function toggleEnabled(post: InstagramPostDto) {
    if (!canUpdate) return;
    await run(async () => {
      await adminPatch(adminEndpoints.instagramPost(post.id), { enabled: !post.enabled });
      await reload();
    });
  }

  async function remove(post: InstagramPostDto) {
    if (!canUpdate) return;
    if (!window.confirm('Удалить этот пост из витрины?')) return;
    await run(async () => {
      await adminDelete(adminEndpoints.instagramPost(post.id));
      await reload();
    });
  }

  async function move(index: number, direction: -1 | 1) {
    if (!canUpdate) return;
    const target = index + direction;
    if (target < 0 || target >= posts.length) return;
    const next = [...posts];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    setPosts(next);
    await run(async () => {
      await adminPut(adminEndpoints.instagramPostsOrder, {
        orderedIds: next.map((item) => item.id),
      });
      await reload();
    });
  }

  return (
    <div className="space-y-6">
      {!profileUrl ? (
        <p className="admin-notice">
          Укажите Instagram URL в{' '}
          <Link href="/admin/storefront/settings" className="admin-link">
            настройках магазина
          </Link>
          , чтобы на главной показывался профиль.
        </p>
      ) : (
        <p className="text-sm text-[var(--admin-muted)]">
          Профиль:{' '}
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-link font-semibold"
          >
            {profileUrl}
          </a>
        </p>
      )}

      {canUpdate ? (
        <form onSubmit={onCreate} className="admin-card grid gap-3 md:grid-cols-2">
          <label className="admin-field md:col-span-2">
            <span>URL фото</span>
            <input
              name="imageUrl"
              required
              placeholder="Ссылка на изображение"
              className="admin-input"
            />
          </label>
          <label className="admin-field">
            <span>Ссылка на пост</span>
            <input name="postUrl" placeholder="https://instagram.com/p/…" className="admin-input" />
          </label>
          <label className="admin-field">
            <span>Подпись</span>
            <input name="caption" maxLength={500} className="admin-input" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={pending} className="admin-btn">
              Добавить пост
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <div className="admin-empty admin-empty--action">
          <p>Постов пока нет.</p>
          <p className="text-sm text-[var(--admin-muted)]">
            Добавьте 2–6 сильных кадров для блока Instagram на главной.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <li
              key={post.id}
              className={`admin-media-card overflow-hidden p-0 ${
                post.enabled ? '' : 'opacity-60'
              }`}
            >
              <div className="relative aspect-[4/5] bg-[var(--color-surface-muted)]">
                {/* External Instagram CDN — plain img is intentional */}
                <img
                  src={toSameOriginMediaUrl(post.imageUrl) ?? post.imageUrl}
                  alt={post.caption ?? ''}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {post.caption || post.postUrl || 'Без подписи'}
                  </p>
                  <span
                    className={`admin-chip ${post.enabled ? '' : 'admin-chip--muted'}`}
                  >
                    {post.enabled ? 'На витрине' : 'Скрыт'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending || !canUpdate}
                    onClick={() => void toggleEnabled(post)}
                  >
                    {post.enabled ? 'Скрыть' : 'Показать'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending || !canUpdate || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending || !canUpdate || index === posts.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending || !canUpdate}
                    onClick={() => void remove(post)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
