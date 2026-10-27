'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { adminGet, adminUpload, errorMessage, mediaErrorUserText } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { prepareAdminMediaFile } from '@/lib/admin-media-prepare';
import { toSameOriginMediaUrl } from '@/lib/media';

type LibraryItem = {
  id: string;
  url: string;
  byteSize: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
};

type Props = {
  label: string;
  value: string | null;
  disabled?: boolean;
  onChange: (url: string | null) => void;
};

export function ImagePicker({ label, value, disabled, onChange }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const preview = value ? toSameOriginMediaUrl(value) ?? value : null;

  async function loadLibrary() {
    setError(null);
    try {
      const res = await adminGet<{ items: LibraryItem[] }>(
        withQuery(adminEndpoints.mediaLibrary, { pageSize: 24 }),
      );
      setLibrary(res.items ?? []);
      setLibraryOpen(true);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить медиатеку'));
    }
  }

  async function onFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || disabled) return;
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const prepared = await prepareAdminMediaFile(file);
      if (!prepared.ok) {
        setError(prepared.error ?? 'Не удалось подготовить файл');
        return;
      }
      if (prepared.summary) setSummary(prepared.summary);
      const form = new FormData();
      form.append('file', prepared.file, prepared.name);
      const uploaded = await adminUpload<{ url: string }>(adminEndpoints.mediaUpload, form);
      onChange(uploaded.url);
    } catch (err) {
      setError(mediaErrorUserText(err, 'Не удалось загрузить изображение'));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!libraryOpen) return;
    void loadLibrary();
  }, [libraryOpen]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)]">
          {preview ? (
            <Image
              src={preview}
              alt=""
              fill
              className="object-cover"
              sizes="112px"
              unoptimized={preview.startsWith('http')}
            />
          ) : (
            <span className="flex h-full items-center justify-center px-2 text-center text-xs text-[var(--admin-muted)]">
              Нет фото
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <label className="admin-btn-ghost cursor-pointer text-xs">
              {pending ? 'Загрузка…' : 'Загрузить файл'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                disabled={disabled || pending}
                onChange={(e) => {
                  void onFile(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              className="admin-btn-ghost text-xs"
              disabled={disabled || pending}
              onClick={() => setLibraryOpen((v) => !v)}
            >
              {libraryOpen ? 'Скрыть медиатеку' : 'Выбрать из загруженных'}
            </button>
            {value ? (
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                disabled={disabled || pending}
                onClick={() => onChange(null)}
              >
                Убрать изображение
              </button>
            ) : null}
          </div>
          <label className="admin-field">
            <span className="text-xs">Или URL / путь</span>
            <input
              className="admin-input"
              value={value ?? ''}
              disabled={disabled || pending}
              placeholder="/categories/… или https://…"
              onChange={(e) => onChange(e.target.value.trim() || null)}
            />
          </label>
          {summary ? <p className="text-xs text-[var(--admin-muted)]">{summary}</p> : null}
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <p className="text-xs text-[var(--admin-muted)]">
            Удаление блока не удаляет файл с сервера — изображение можно выбрать снова.
          </p>
        </div>
      </div>
      {libraryOpen ? (
        <ul className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-[var(--admin-border)] p-2 sm:grid-cols-6">
          {library.length === 0 ? (
            <li className="col-span-full text-xs text-[var(--admin-muted)]">Пока нет загрузок</li>
          ) : (
            library.map((item) => {
              const url = toSameOriginMediaUrl(item.url) ?? item.url;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="relative block h-16 w-full overflow-hidden rounded border border-[var(--admin-border)]"
                    disabled={disabled}
                    onClick={() => {
                      onChange(item.url);
                      setLibraryOpen(false);
                    }}
                    title={item.createdAt}
                  >
                    <Image src={url} alt="" fill className="object-cover" sizes="80px" unoptimized />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
