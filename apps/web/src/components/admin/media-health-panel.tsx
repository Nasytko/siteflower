'use client';

import { useEffect, useState, useTransition } from 'react';
import type {
  MediaAssetAdminListDto,
  MediaAssetAdminListItemDto,
  MediaAssetListStatus,
  MediaAssetPurgeResultDto,
} from '@bouquet-one/contracts';
import { adminGet, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';

type HealthStatus = {
  checkedAt: string;
  driver: 'local' | 's3';
  assetCount: number;
  referencedAssets: number;
  orphanCandidates: number;
  orphanWithinGrace: number;
  missingMasters: unknown[];
  missingDerivatives: unknown[];
  productsMissingPrimary: unknown[];
  productsMultiplePrimary: unknown[];
};

type ProbeResult = {
  ok: boolean;
  driver: 'local' | 's3';
  writeOk: boolean;
  readOk: boolean;
  deleteOk: boolean;
  latencyMs: number;
  checkedAt: string;
  error: string | null;
};

type Props = {
  initial: HealthStatus;
  canProbe: boolean;
  canWrite: boolean;
};

const TABS: Array<{ id: MediaAssetListStatus; label: string }> = [
  { id: 'referenced', label: 'Используются' },
  { id: 'grace', label: 'Ждут удаления' },
  { id: 'purgeable', label: 'Можно удалить' },
];

const PAGE_SIZE = 20;

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatRefs(item: MediaAssetAdminListItemDto): string {
  if (item.refs.length === 0) return '—';
  return item.refs
    .map((ref) => {
      if (ref.kind === 'product') {
        return `товар «${ref.productName}» (${ref.productSlug})`;
      }
      return `меню «${ref.label}»`;
    })
    .join('; ');
}

export function MediaHealthPanel({ initial, canProbe, canWrite }: Props) {
  const [status, setStatus] = useState(initial);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [tab, setTab] = useState<MediaAssetListStatus>('referenced');
  const [list, setList] = useState<MediaAssetAdminListDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [listPending, startListTransition] = useTransition();
  const [purgingId, setPurgingId] = useState<string | null>(null);

  function loadList(next: { status?: MediaAssetListStatus; page?: number }) {
    const nextStatus = next.status ?? tab;
    const page = next.page ?? 1;
    startListTransition(() => {
      void (async () => {
        setListError(null);
        try {
          const data = await adminGet<MediaAssetAdminListDto>(
            withQuery(adminEndpoints.mediaAssets, {
              status: nextStatus,
              page,
              pageSize: PAGE_SIZE,
            }),
          );
          setList(data);
          setTab(nextStatus);
        } catch (err) {
          setListError(errorMessage(err, 'Не удалось загрузить список медиа'));
        }
      })();
    });
  }

  useEffect(() => {
    loadList({ status: 'referenced', page: 1 });
  }, []);

  async function refresh() {
    setPending(true);
    setError(null);
    try {
      const next = await adminGet<HealthStatus>(adminEndpoints.mediaHealth);
      setStatus(next);
      loadList({ page: list?.page ?? 1 });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось обновить диагностику'));
    } finally {
      setPending(false);
    }
  }

  async function runProbe() {
    if (!canProbe) return;
    setPending(true);
    setError(null);
    try {
      const result = await adminPost<ProbeResult>(adminEndpoints.mediaHealthProbe, {});
      setProbe(result);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось проверить хранилище'));
    } finally {
      setPending(false);
    }
  }

  async function purgeAsset(item: MediaAssetAdminListItemDto) {
    if (!canWrite) return;
    if (
      !window.confirm(
        `Удалить файл ${item.storageKey} из хранилища? Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    setPurgingId(item.id);
    setListError(null);
    try {
      await adminPost<MediaAssetPurgeResultDto>(adminEndpoints.mediaAssetPurge(item.id), {});
      const next = await adminGet<HealthStatus>(adminEndpoints.mediaHealth);
      setStatus(next);
      loadList({ status: 'purgeable', page: 1 });
    } catch (err) {
      setListError(errorMessage(err, 'Не удалось удалить файл'));
    } finally {
      setPurgingId(null);
    }
  }

  const issueCount =
    status.missingMasters.length +
    status.missingDerivatives.length +
    status.productsMultiplePrimary.length +
    status.productsMissingPrimary.length +
    (probe && !probe.ok ? 1 : 0);
  const needsAttention = issueCount > 0;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className={`admin-verdict ${needsAttention ? 'admin-verdict--warn' : 'admin-verdict--ok'}`}>
        <p className="admin-verdict__title">
          {needsAttention ? '⚠ Требует внимания' : '✓ Всё хорошо'}
        </p>
        <p className="admin-verdict__lead">
          {needsAttention
            ? 'Есть проблемы с фотографиями или хранилищем. Подробности ниже.'
            : 'Хранилище фотографий и привязки к товарам в порядке.'}
        </p>
      </div>

      <section className="admin-section space-y-3">
        <h2 className="admin-section__title">Что важно для магазина</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="admin-card">
            <dt className="admin-card__label">Товары без главного фото</dt>
            <dd className="admin-metric text-2xl">{status.productsMissingPrimary.length}</dd>
          </div>
          <div className="admin-card">
            <dt className="admin-card__label">Ошибки главного фото</dt>
            <dd className="admin-metric text-2xl">{status.productsMultiplePrimary.length}</dd>
          </div>
          <div className="admin-card">
            <dt className="admin-card__label">Используются</dt>
            <dd className="admin-metric text-2xl">{status.referencedAssets}</dd>
          </div>
          <div className="admin-card">
            <dt className="admin-card__label">Можно удалить</dt>
            <dd className="admin-metric text-2xl">{status.orphanCandidates}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-section space-y-4">
        <div>
          <h2 className="admin-section__title">Файлы медиа</h2>
          <p className="admin-section__lead">
            Просмотр привязок и кандидатов на очистку. Удаление доступно только после периода
            ожидания.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-filter-chip ${tab === item.id ? 'admin-filter-chip--active' : ''}`}
              disabled={listPending}
              onClick={() => loadList({ status: item.id, page: 1 })}
            >
              {item.label}
              {item.id === 'grace' ? ` (${status.orphanWithinGrace})` : null}
              {item.id === 'purgeable' ? ` (${status.orphanCandidates})` : null}
              {item.id === 'referenced' ? ` (${status.referencedAssets})` : null}
            </button>
          ))}
        </div>

        {listError ? <p className="admin-field-error">{listError}</p> : null}

        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr>
                <th>Превью</th>
                <th>Размер</th>
                <th>Привязки</th>
                <th>Отвязан</th>
                {tab === 'purgeable' ? <th>Действие</th> : null}
              </tr>
            </thead>
            <tbody>
              {!list || list.items.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'purgeable' ? 5 : 4} className="admin-empty py-6">
                    {listPending ? 'Загрузка…' : 'Нет файлов в этой категории.'}
                  </td>
                </tr>
              ) : (
                list.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <img
                          src={item.url}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded object-cover bg-[var(--admin-surface-muted,rgba(0,0,0,0.04))]"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--admin-ink)]">
                            {item.storageKey.split('/').pop() ?? item.storageKey}
                          </p>
                          <p className="truncate text-xs text-[var(--admin-muted)]">
                            {item.mimeType}
                            {item.width && item.height
                              ? ` · ${item.width}×${item.height}`
                              : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>{formatBytes(item.byteSize)}</td>
                    <td className="max-w-[18rem]">
                      <span className="line-clamp-2 text-[var(--admin-muted)]">
                        {formatRefs(item)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[var(--admin-muted)]">
                      {item.orphanedAt
                        ? new Date(item.orphanedAt).toLocaleString('ru-BY')
                        : '—'}
                    </td>
                    {tab === 'purgeable' ? (
                      <td>
                        {canWrite ? (
                          <button
                            type="button"
                            className="admin-btn-ghost text-xs"
                            disabled={purgingId === item.id || listPending}
                            onClick={() => void purgeAsset(item)}
                          >
                            {purgingId === item.id ? 'Удаление…' : 'Удалить'}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--admin-muted)]">Нет прав</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {list && totalPages > 1 ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={listPending || list.page <= 1}
              onClick={() => loadList({ page: list.page - 1 })}
            >
              Назад
            </button>
            <span className="text-sm text-[var(--admin-muted)]">
              Стр. {list.page} из {totalPages} · всего {list.total}
            </span>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={listPending || list.page >= totalPages}
              onClick={() => loadList({ page: list.page + 1 })}
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </section>

      <details className="admin-section">
        <summary className="cursor-pointer text-base font-semibold text-[var(--admin-ink)]">
          Техническая диагностика
        </summary>
        <div className="mt-4 space-y-4">
          <p className="admin-help">
            Тип хранилища: {status.driver === 's3' ? 'S3' : 'Local'} · активов: {status.assetCount} ·
            с привязкой: {status.referencedAssets}
          </p>

          {probe ? (
            <ul className="admin-help space-y-1">
              <li>Запись {mark(probe.writeOk)}</li>
              <li>Чтение {mark(probe.readOk)}</li>
              <li>Удаление {mark(probe.deleteOk)}</li>
              <li>
                Последняя проверка: {new Date(probe.checkedAt).toLocaleString('ru-BY')} (
                {probe.latencyMs} мс)
              </li>
              {probe.error ? <li>Ошибка: {probe.error}</li> : null}
            </ul>
          ) : (
            <p className="admin-help">
              Нажмите «Проверить хранилище», чтобы выполнить запись/чтение/удаление тестового файла.
            </p>
          )}

          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-[var(--admin-muted)]">Потерянных master-файлов</dt>
              <dd>{status.missingMasters.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--admin-muted)]">Потерянных derivatives</dt>
              <dd>{status.missingDerivatives.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--admin-muted)]">Orphan готовы к cleanup (&gt;7 дн.)</dt>
              <dd>{status.orphanCandidates}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--admin-muted)]">Orphan в grace (≤7 дн.)</dt>
              <dd>{status.orphanWithinGrace}</dd>
            </div>
          </dl>

          <div className="admin-row-actions">
            {canProbe ? (
              <button
                type="button"
                className="admin-btn"
                disabled={pending}
                onClick={() => void runProbe()}
              >
                Проверить хранилище
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => void refresh()}
            >
              Обновить сводку
            </button>
          </div>
          {error ? <p className="admin-error mt-2">{error}</p> : null}
          <p className="admin-help">
            Последняя сводка: {new Date(status.checkedAt).toLocaleString('ru-BY')}. Секреты
            хранилища никогда не показываются.
          </p>
        </div>
      </details>
    </div>
  );
}
