'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  IntegrationStatusDto,
  IntegrationTestConnectionResult,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { errorMessage } from '@/lib/admin-client';
import { integrationClientApi } from '@/lib/admin-integration-client';

type Props = {
  status: IntegrationStatusDto;
  canOperate: boolean;
  canConfigure: boolean;
};

type ConnectionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'result'; result: IntegrationTestConnectionResult }
  | { kind: 'error'; message: string };

export function IntegrationActions({ status, canOperate, canConfigure }: Props) {
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'idle' });
  const [pausePending, setPausePending] = useState(false);
  const [testEventPending, setTestEventPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(status.enabled);

  const isSimulator = status.mode === 'SIMULATOR';

  async function onTestConnection() {
    if (!canOperate || connection.kind === 'pending') return;
    setConnection({ kind: 'pending' });
    setActionError(null);
    setActionOk(null);
    try {
      const result = await integrationClientApi.testConnection();
      setConnection({ kind: 'result', result });
    } catch (err) {
      setConnection({ kind: 'error', message: errorMessage(err, 'Проверка не удалась') });
    }
  }

  async function onTogglePause() {
    if (!canConfigure || pausePending) return;
    setPausePending(true);
    setActionError(null);
    setActionOk(null);
    const next = !enabled;
    try {
      const result = await integrationClientApi.setEnabled(next);
      setEnabled(result.enabled);
      setActionOk(result.enabled ? 'Доставка возобновлена' : 'Доставка поставлена на паузу');
      router.refresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось изменить паузу'));
    } finally {
      setPausePending(false);
    }
  }

  async function onTestEvent() {
    if (!canOperate || !isSimulator || testEventPending) return;
    setTestEventPending(true);
    setActionError(null);
    setActionOk(null);
    try {
      const result = await integrationClientApi.testEvent();
      setActionOk(`Тестовое событие создано (${result.eventId.slice(0, 8)}…)`);
      router.refresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось создать тестовое событие'));
    } finally {
      setTestEventPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="admin-card space-y-4">
        <div>
          <p className="admin-card__label">Соединение</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--admin-ink)]">Проверка endpoint</h2>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Секреты и ключи не отображаются. Проверяется только доступность и авторизация.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canOperate ? (
            <Button
              type="button"
              disabled={connection.kind === 'pending'}
              onClick={() => void onTestConnection()}
              className="!rounded-lg !bg-[var(--admin-brand)]"
            >
              {connection.kind === 'pending' ? 'Проверяем…' : 'Проверить соединение'}
            </Button>
          ) : (
            <p className="text-sm text-[var(--admin-muted)]">
              Нужно право INTEGRATION_OPERATE для проверки соединения.
            </p>
          )}

          {connection.kind === 'result' ? (
            <p
              className={`text-sm font-medium ${
                connection.result.ok ? 'text-[var(--admin-brand)]' : 'text-red-700'
              }`}
            >
              {connection.result.ok
                ? `Успешно${
                    connection.result.latencyMs != null
                      ? ` · ${connection.result.latencyMs} мс`
                      : ''
                  }`
                : `Ошибка${
                    connection.result.latencyMs != null
                      ? ` · ${connection.result.latencyMs} мс`
                      : ''
                  }: ${connection.result.message}`}
            </p>
          ) : null}
          {connection.kind === 'error' ? (
            <p className="text-sm text-red-700">{connection.message}</p>
          ) : null}
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[var(--admin-muted)]">Endpoint</dt>
            <dd className="font-medium">{status.endpointConfigured ? 'задан' : 'не задан'}</dd>
          </div>
          <div>
            <dt className="text-[var(--admin-muted)]">Key ID</dt>
            <dd className="font-medium">{status.keyIdConfigured ? 'задан' : 'не задан'}</dd>
          </div>
          <div>
            <dt className="text-[var(--admin-muted)]">Secret</dt>
            <dd className="font-medium">{status.secretConfigured ? 'задан' : 'не задан'}</dd>
          </div>
        </dl>
      </section>

      {(canConfigure || (canOperate && isSimulator)) && (
        <section className="admin-card space-y-4">
          <div>
            <p className="admin-card__label">Управление</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--admin-ink)]">Доставка и тесты</h2>
          </div>

          <div className="flex flex-wrap gap-3">
            {canConfigure ? (
              <Button
                type="button"
                variant="outline"
                disabled={pausePending}
                onClick={() => void onTogglePause()}
              >
                {pausePending
                  ? '…'
                  : enabled
                    ? 'Поставить на паузу'
                    : 'Возобновить доставку'}
              </Button>
            ) : null}

            {canOperate && isSimulator ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testEventPending}
                  onClick={() => void onTestEvent()}
                >
                  {testEventPending ? '…' : 'Отправить тестовое событие'}
                </Button>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Только симулятор
                </span>
              </div>
            ) : null}
          </div>

          {isSimulator ? (
            <p className="text-sm text-amber-900">
              Режим SIMULATOR: события уходят в локальный симулятор, не во внешнюю ERP.
            </p>
          ) : null}

          {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}
          {actionOk ? <p className="text-sm text-[var(--admin-brand)]">{actionOk}</p> : null}
        </section>
      )}
    </div>
  );
}
