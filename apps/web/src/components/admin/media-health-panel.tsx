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

  const storageOk =
    probe?.ok ??
    (status.missingMasters.length === 0 && status.productsMultiplePrimary.length === 0);

  return (
    <section className="admin-section">
      <h2 className="admin-section__title">Хранилище фотографий</h2>
      <p className="admin-section__lead">
        Статус: {storageOk ? 'Работает' : 'Требует внимания'} · Тип:{' '}
        {status.driver === 's3' ? 'S3' : 'Local'}
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
        <p className="admin-help">Нажмите «Проверить хранилище», чтобы выполнить write/read/delete.</p>
      )}

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Товаров без главного фото</dt>
          <dd>{status.productsMissingPrimary.length}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Потерянных master-файлов</dt>
          <dd>{status.missingMasters.length}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Потерянных derivatives</dt>
          <dd>{status.missingDerivatives.length}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Orphan готовы к cleanup (&gt;7 дн.)</dt>
          <dd>{status.orphanCandidates}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Orphan в grace (≤7 дн.)</dt>
          <dd>{status.orphanWithinGrace}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Несколько primary (ошибка)</dt>
          <dd>{status.productsMultiplePrimary.length}</dd>
        </div>
      </dl>

      <div className="admin-row-actions mt-4">
        {canProbe ? (
          <button type="button" className="admin-btn" disabled={pending} onClick={() => void runProbe()}>
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
      <p className="admin-help mt-3">
        Последняя сводка: {new Date(status.checkedAt).toLocaleString('ru-BY')}. Секреты хранилища
        никогда не показываются.
      </p>
    </section>
  );
}
