'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
  seoStatusEmoji,
  seoStatusLabel,
  type SeoEntityHealth,
  type SeoEntityType,
  type SeoHealthReportDto,
  type SeoHealthStatus,
} from '@bouquet-one/contracts';
import { adminGet, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';

type Props = {
  initial: SeoHealthReportDto;
};

const STATUS_FILTERS: Array<{ id: 'all' | SeoHealthStatus; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'attention', label: 'Требуют внимания' },
  { id: 'improve', label: 'Можно улучшить' },
  { id: 'good', label: 'Хорошо' },
];

const TYPE_FILTERS: Array<{ id: 'all' | SeoEntityType; label: string }> = [
  { id: 'all', label: 'Все типы' },
  { id: 'product', label: 'Товары' },
  { id: 'flower', label: 'Цветы' },
  { id: 'occasion', label: 'Поводы' },
  { id: 'recipient', label: 'Получатели' },
  { id: 'color', label: 'Цвета' },
  { id: 'page', label: 'Страницы' },
];

function entityTypeLabel(type: SeoEntityType): string {
  switch (type) {
    case 'product':
      return 'Товар';
    case 'flower':
      return 'Цветы';
    case 'occasion':
      return 'Повод';
    case 'recipient':
      return 'Получатель';
    case 'color':
      return 'Цвет';
    case 'page':
      return 'Страница';
  }
}

export function SeoHealthPanel({ initial }: Props) {
  const [report, setReport] = useState(initial);
  const [status, setStatus] = useState<'all' | SeoHealthStatus>('all');
  const [type, setType] = useState<'all' | SeoEntityType>('all');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const summaryCards = useMemo(
    () => [
      {
        status: 'good' as const,
        count: report.summary.good,
        label: 'Хорошо',
      },
      {
        status: 'improve' as const,
        count: report.summary.improve,
        label: 'Можно улучшить',
      },
      {
        status: 'attention' as const,
        count: report.summary.attention,
        label: 'Требует внимания',
      },
    ],
    [report.summary],
  );

  function load(next: {
    status?: 'all' | SeoHealthStatus;
    type?: 'all' | SeoEntityType;
    page?: number;
  }) {
    const nextStatus = next.status ?? status;
    const nextType = next.type ?? type;
    const page = next.page ?? 1;
    startTransition(() => {
      void (async () => {
        setError(null);
        try {
          const data = await adminGet<SeoHealthReportDto>(
            withQuery(adminEndpoints.seoHealth, {
              status: nextStatus === 'all' ? undefined : nextStatus,
              type: nextType === 'all' ? undefined : nextType,
              page,
              pageSize: report.pageSize,
            }),
          );
          setReport(data);
          setStatus(nextStatus);
          setType(nextType);
        } catch (err) {
          setError(errorMessage(err, 'Не удалось загрузить SEO-проверку'));
        }
      })();
    });
  }

  const totalPages = Math.max(1, Math.ceil(report.total / report.pageSize));
  const attention = report.summary.attention;
  const improve = report.summary.improve;
  const verdictOk = attention === 0 && improve === 0;

  return (
    <div className="space-y-8">
      <div
        className={`admin-verdict ${
          verdictOk ? 'admin-verdict--ok' : 'admin-verdict--warn'
        }`}
      >
        <p className="admin-verdict__title">
          {verdictOk
            ? '✓ Всё хорошо'
            : attention > 0
              ? '✕ Требует исправления'
              : '⚠ Рекомендуется улучшить'}
        </p>
        <p className="admin-verdict__lead">
          {verdictOk
            ? 'Название, описание и фото страниц в порядке для поиска.'
            : attention > 0
              ? `${attention} страниц нужно исправить. Часто не хватает названия, описания или фото.`
              : `${improve} страниц можно улучшить — это не срочно, но поможет в поиске.`}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <button
            key={card.status}
            type="button"
            className="admin-card admin-card--link text-left"
            onClick={() => load({ status: card.status, page: 1 })}
          >
            <p className="admin-card__label">
              {seoStatusEmoji(card.status)} {card.label}
            </p>
            <p className="admin-metric">{card.count}</p>
            <p className="text-sm text-[var(--admin-muted)]">страниц</p>
          </button>
        ))}
      </section>

      <section className="admin-section space-y-4">
        <div>
          <h2 className="admin-section__title">Страницы магазина</h2>
          <p className="admin-section__lead">
            Смотрите название, описание, фото и индексируемость. Технические детали — ниже.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-filter-chip ${status === item.id ? 'admin-filter-chip--active' : ''}`}
              disabled={pending}
              onClick={() => load({ status: item.id, page: 1 })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-filter-chip ${type === item.id ? 'admin-filter-chip--active' : ''}`}
              disabled={pending}
              onClick={() => load({ type: item.id, page: 1 })}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <p className="admin-field-error">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr>
                <th>Страница</th>
                <th>Тип</th>
                <th>SEO</th>
                <th>Проблема</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {report.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-empty py-6">
                    Нет страниц по выбранным фильтрам.
                  </td>
                </tr>
              ) : (
                report.items.map((item) => <SeoRow key={`${item.entityType}-${item.entityId}`} item={item} />)
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="admin-btn-ghost px-3 py-1.5"
              disabled={pending || report.page <= 1}
              onClick={() => load({ page: report.page - 1 })}
            >
              Назад
            </button>
            <span className="text-sm text-[var(--admin-muted)]">
              Стр. {report.page} из {totalPages} · {report.total} всего
            </span>
            <button
              type="button"
              className="admin-btn-ghost px-3 py-1.5"
              disabled={pending || report.page >= totalPages}
              onClick={() => load({ page: report.page + 1 })}
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </section>

      <details className="admin-section">
        <summary className="cursor-pointer text-base font-semibold text-[var(--admin-ink)]">
          Техническая диагностика (sitemap, canonical)
        </summary>
        <div className="mt-4 space-y-3">
          <p className="admin-section__lead">
            Сколько страниц попадает в sitemap и нет ли пропусков.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="admin-card">
              <dt className="admin-card__label">URL в sitemap</dt>
              <dd className="admin-metric text-2xl">{report.sitemap.totalUrls}</dd>
            </div>
            <div className="admin-card">
              <dt className="admin-card__label">Открыты для поиска</dt>
              <dd className="admin-metric text-2xl">{report.sitemap.indexableEntityCount}</dd>
            </div>
            <div className="admin-card">
              <dt className="admin-card__label">Опубликованы / видимы</dt>
              <dd className="admin-metric text-2xl">{report.sitemap.publishedEntityCount}</dd>
            </div>
            <div className="admin-card">
              <dt className="admin-card__label">Пропуски в sitemap</dt>
              <dd className="admin-metric text-2xl">{report.sitemap.missingFromSitemap}</dd>
            </div>
          </dl>
          {report.sitemap.missingSamples.length > 0 ? (
            <ul className="admin-warnings">
              {report.sitemap.missingSamples.map((sample) => (
                <li key={sample.path}>
                  {sample.name} ({sample.path}) — нет в карте сайта
                  {sample.href ? (
                    <>
                      {' · '}
                      <Link href={sample.href} className="underline underline-offset-2">
                        Открыть
                      </Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-help">
              Пропусков не найдено: опубликованные открытые страницы есть в sitemap.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function SeoRow({ item }: { item: SeoEntityHealth }) {
  return (
    <tr>
      <td>
        <div className="font-medium">{item.name}</div>
        {item.path ? <div className="text-[var(--admin-muted)]">{item.path}</div> : null}
        <div className="mt-1 text-xs text-[var(--admin-muted)]">{item.indexabilityLabel}</div>
      </td>
      <td>{entityTypeLabel(item.entityType)}</td>
      <td>
        {seoStatusEmoji(item.status)} {seoStatusLabel(item.status)}
      </td>
      <td className="max-w-xs text-[var(--admin-muted)]">{item.primaryIssue ?? '—'}</td>
      <td>
        {item.href ? (
          <Link href={item.href} className="underline underline-offset-2">
            Открыть
          </Link>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}
