'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InstagramPostDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
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
      setError(errorMessage(err));
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
        <p className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm text-muted">
          Укажите Instagram URL в{' '}
          <a href="/admin/storefront/settings" className="font-semibold text-brand hover:underline">
            настройках магазина
          </a>
          , чтобы на главной показывался @handle и ссылка на профиль.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Профиль:{' '}
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand hover:underline"
          >
            {profileUrl}
          </a>
        </p>
      )}

      {canUpdate ? (
        <form
          onSubmit={onCreate}
          className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 md:grid-cols-2"
        >
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium">URL фото</span>
            <input
              name="imageUrl"
              required
              placeholder="https://… или /api/v1/media/…"
              className="admin-input"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Ссылка на пост</span>
            <input name="postUrl" placeholder="https://instagram.com/p/…" className="admin-input" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Подпись</span>
            <input name="caption" maxLength={500} className="admin-input" />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              Добавить пост
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {posts.length === 0 ? (
        <p className="text-sm text-muted">Пока нет постов — добавьте 2–6 сильных кадров.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <li
              key={post.id}
              className={`overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface ${
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
                <p className="truncate text-sm font-medium">
                  {post.caption || post.postUrl || 'Без подписи'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || !canUpdate}
                    onClick={() => void toggleEnabled(post)}
                  >
                    {post.enabled ? 'Скрыть' : 'Показать'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || !canUpdate || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || !canUpdate || index === posts.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || !canUpdate}
                    onClick={() => void remove(post)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
