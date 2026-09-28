'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LEGAL_DOCUMENT_KIND_LABELS,
  LEGAL_DOCUMENT_PUBLIC_PATHS,
  type LegalDocumentAdminDto,
  type LegalDocumentKind,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { errorMessage } from '@/lib/admin-client';
import { legalDocumentKindPath } from '@/lib/admin-endpoints';
import { legalClientApi } from '@/lib/admin-legal-client';

type Props = {
  initial: LegalDocumentAdminDto;
  kind: LegalDocumentKind;
  canEdit: boolean;
  canPublish: boolean;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-BY');
  } catch {
    return iso;
  }
}

export function LegalDocumentEditor({ initial, kind, canEdit, canPublish }: Props) {
  const router = useRouter();
  const kindPath = legalDocumentKindPath(kind);
  const publicPath = LEGAL_DOCUMENT_PUBLIC_PATHS[kind];
  const label = LEGAL_DOCUMENT_KIND_LABELS[kind];

  const seedTitle = initial.draft?.title ?? initial.published?.title ?? initial.title;
  const seedBody = initial.draft?.bodyMarkdown ?? initial.published?.bodyMarkdown ?? '';

  const [doc, setDoc] = useState(initial);
  const [title, setTitle] = useState(seedTitle);
  const [bodyMarkdown, setBodyMarkdown] = useState(seedBody);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'draft' | 'publish' | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function onSaveDraft(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setPending('draft');
    setError(null);
    setSavedAt(null);
    try {
      const updated = await legalClientApi.putDraft(kindPath, {
        title: title.trim(),
        bodyMarkdown: bodyMarkdown.trim(),
      });
      setDoc(updated);
      setTitle(updated.draft?.title ?? title.trim());
      setBodyMarkdown(updated.draft?.bodyMarkdown ?? bodyMarkdown.trim());
      setSavedAt(new Date().toLocaleString('ru-BY'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить черновик'));
    } finally {
      setPending(null);
    }
  }

  async function onPublish() {
    if (!canPublish) return;
    setPending('publish');
    setError(null);
    try {
      if (canEdit && (title.trim() !== (doc.draft?.title ?? '') || bodyMarkdown.trim() !== (doc.draft?.bodyMarkdown ?? ''))) {
        const saved = await legalClientApi.putDraft(kindPath, {
          title: title.trim(),
          bodyMarkdown: bodyMarkdown.trim(),
        });
        setDoc(saved);
      }
      const updated = await legalClientApi.publish(kindPath);
      setDoc(updated);
      setTitle(updated.draft?.title ?? updated.published?.title ?? updated.title);
      setBodyMarkdown(updated.draft?.bodyMarkdown ?? updated.published?.bodyMarkdown ?? '');
      setSavedAt(new Date().toLocaleString('ru-BY'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось опубликовать'));
    } finally {
      setPending(null);
    }
  }

  const published = doc.published;
  const draft = doc.draft;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="admin-section__eyebrow">
          <Link href="/admin/legal" className="hover:underline">
            Юридическая информация
          </Link>
          {' / '}
          Документ
        </p>
        <h1 className="admin-page-title">{label}</h1>
        <p className="admin-page-lead">
          Черновик в Markdown. После публикации текст появится на публичной странице.
        </p>
        <p className="text-sm">
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--admin-brand)] underline-offset-2 hover:underline"
          >
            Открыть публичную страницу ({publicPath})
          </a>
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="admin-card space-y-2">
          <p className="admin-card__label">Опубликовано</p>
          {published ? (
            <>
              <p className="font-medium text-[var(--admin-ink)]">
                v{published.version} · {published.title}
              </p>
              <p className="text-sm text-[var(--admin-muted)]">
                Опубликовано: {formatWhen(published.publishedAt)}
                {published.effectiveAt ? ` · действует с ${formatWhen(published.effectiveAt)}` : ''}
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--admin-bg)] p-3 text-xs text-[var(--admin-muted)]">
                {published.bodyMarkdown.slice(0, 1200)}
                {published.bodyMarkdown.length > 1200 ? '…' : ''}
              </pre>
            </>
          ) : (
            <p className="text-sm text-amber-900">Ещё не опубликовано</p>
          )}
        </section>

        <section className="admin-card space-y-2">
          <p className="admin-card__label">Черновик</p>
          {draft ? (
            <>
              <p className="font-medium text-[var(--admin-ink)]">
                v{draft.version} · {draft.title}
              </p>
              <p className="text-sm text-[var(--admin-muted)]">
                Обновлён: {formatWhen(draft.updatedAt)}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--admin-muted)]">
              Черновика нет — сохраните текст ниже, чтобы создать новый.
            </p>
          )}
        </section>
      </div>

      <form onSubmit={onSaveDraft} className="admin-section">
        <section className="admin-subsection space-y-4">
          <h2 className="admin-subsection__title">Редактор черновика</h2>
          <label className="admin-field">
            <span>Заголовок</span>
            <input
              className="admin-input"
              disabled={!canEdit}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="admin-field">
            <span>Текст (Markdown)</span>
            <textarea
              className="admin-input min-h-[24rem] font-mono text-sm"
              disabled={!canEdit}
              value={bodyMarkdown}
              onChange={(e) => setBodyMarkdown(e.target.value)}
              required
            />
          </label>
        </section>

        <div className="admin-savebar">
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending !== null}
              className="!rounded-lg !bg-[var(--admin-brand)]"
            >
              {pending === 'draft' ? 'Сохранение…' : 'Сохранить черновик'}
            </Button>
          ) : (
            <p className="admin-help">Только просмотр: нет права LEGAL_EDIT.</p>
          )}
          {canPublish ? (
            <Button
              type="button"
              disabled={pending !== null || (!draft && !bodyMarkdown.trim())}
              onClick={() => void onPublish()}
              className="!rounded-lg"
            >
              {pending === 'publish' ? 'Публикация…' : 'Опубликовать'}
            </Button>
          ) : canEdit ? (
            <p className="admin-help">Публикация недоступна без права LEGAL_PUBLISH.</p>
          ) : null}
          {savedAt ? (
            <span className="text-sm text-[var(--admin-muted)]">Сохранено: {savedAt}</span>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="admin-error">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
