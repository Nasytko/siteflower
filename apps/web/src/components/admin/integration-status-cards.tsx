import type { IntegrationMode, IntegrationStatusDto } from '@bouquet-one/contracts';

type Props = {
  status: IntegrationStatusDto;
};

function modeLabel(mode: IntegrationMode): string {
  switch (mode) {
    case 'DISABLED':
      return 'Отключена';
    case 'SIMULATOR':
      return 'Симулятор';
    case 'ERP':
      return 'ERP';
    default: {
      const _e: never = mode;
      return _e;
    }
  }
}

function workerLabel(state: IntegrationStatusDto['worker']['state']): string {
  switch (state) {
    case 'RUNNING':
      return 'Работает';
    case 'STALE':
      return 'Нет ответа';
    case 'DISABLED':
      return 'Остановлен';
    case 'UNKNOWN':
      return 'Неизвестно';
    default: {
      const _e: never = state;
      return _e;
    }
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-BY');
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${Math.floor(seconds / 3600)} ч`;
}

function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
}) {
  const valueClass =
    tone === 'ok'
      ? 'text-[var(--admin-brand)]'
      : tone === 'warn'
        ? 'text-amber-800'
        : tone === 'danger'
          ? 'text-red-700'
          : 'text-[var(--admin-ink)]';

  return (
    <div className="admin-card">
      <p className="admin-card__label">{label}</p>
      <p className={`admin-metric text-[1.35rem] ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-sm text-[var(--admin-muted)]">{hint}</p> : null}
    </div>
  );
}

export function IntegrationStatusCards({ status }: Props) {
  const deliveryLabel = status.enabled ? 'Активна' : 'На паузе';
  const deliveryTone = status.enabled ? 'ok' : 'warn';
  const queueHint = [
    `ожидают: ${status.queue.pending}`,
    `в работе: ${status.queue.processing}`,
    `повтор: ${status.queue.retry}`,
  ].join(' · ');

  return (
    <div className="space-y-4">
      {status.alerts.length > 0 ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <p className="text-sm font-semibold text-amber-950">Внимание</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
            {status.alerts.map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Статус"
          value={deliveryLabel}
          hint={`Воркер: ${workerLabel(status.worker.state)}`}
          tone={deliveryTone}
        />
        <MetricCard
          label="Режим"
          value={modeLabel(status.mode)}
          hint={
            status.configurationReady
              ? 'Конфигурация готова'
              : 'Конфигурация неполная'
          }
          tone={status.configurationReady ? 'default' : 'warn'}
        />
        <MetricCard
          label="Последний успех"
          value={formatWhen(status.lastSuccessAt)}
          hint={
            status.lastFailureAt
              ? `Ошибка: ${formatWhen(status.lastFailureAt)}`
              : 'Ошибок не было'
          }
        />
        <MetricCard
          label="Очередь"
          value={String(
            status.queue.pending + status.queue.processing + status.queue.retry,
          )}
          hint={`${queueHint} · старше ${formatAge(status.queue.oldestPendingAgeSeconds)}`}
        />
        <MetricCard
          label="Ошибки"
          value={String(status.queue.failed)}
          hint={`Доставлено за 24 ч: ${status.queue.deliveredLast24h}`}
          tone={status.queue.failed > 0 ? 'danger' : 'ok'}
        />
      </div>
    </div>
  );
}
