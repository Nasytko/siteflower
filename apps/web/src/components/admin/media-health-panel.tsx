'use client';

import { useState } from 'react';
import { adminGet, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

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
};

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function MediaHealthPanel({ initial, canProbe }: Props) {
  const [status, setStatus] = useState(initial);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setPending(true);
    setError(null);
    try {
      const next = await adminGet<HealthStatus>(adminEndpoints.mediaHealth);
      setStatus(next);
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

  const issueCount =
    status.missingMasters.length +
    status.missingDerivatives.length +
    status.productsMultiplePrimary.length +
    status.productsMissingPrimary.length +
    (probe && !probe.ok ? 1 : 0);
  const needsAttention = issueCount > 0;

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
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="admin-card">
            <dt className="admin-card__label">Товары без главного фото</dt>
            <dd className="admin-metric text-2xl">{status.productsMissingPrimary.length}</dd>
          </div>
          <div className="admin-card">
            <dt className="admin-card__label">Ошибки главного фото</dt>
            <dd className="admin-metric text-2xl">{status.productsMultiplePrimary.length}</dd>
          </div>
        </dl>
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
