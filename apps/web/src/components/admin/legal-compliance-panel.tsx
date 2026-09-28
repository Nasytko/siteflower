import Link from 'next/link';
import type { ComplianceItemDto, ComplianceStatusDto } from '@bouquet-one/contracts';

type Props = {
  compliance: ComplianceStatusDto;
  documents?: Array<{ kind: string; title: string; href: string }>;
};

function StatusMark({ status }: { status: ComplianceItemDto['status'] }) {
  if (status === 'ok') {
    return (
      <span className="text-[var(--admin-brand)]" aria-label="Готово" title="Готово">
        ✓
      </span>
    );
  }
  if (status === 'warn' || status === 'draft') {
    return (
      <span className="text-amber-700" aria-label="Внимание" title="Внимание">
        ⚠
      </span>
    );
  }
  return (
    <span className="text-amber-800" aria-label="Требует заполнения" title="Требует заполнения">
      ⚠
    </span>
  );
}

export function LegalCompliancePanel({ compliance, documents }: Props) {
  const ready = compliance.readyForProduction;

  return (
    <section className="admin-section">
      <div className="admin-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="admin-card__label">Готовность сайта</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--admin-ink)]">
              {ready ? 'Можно запускать' : 'Ещё не готово к запуску'}
            </h2>
            <p className="mt-1 text-sm text-[var(--admin-muted)]">
              {ready
                ? 'Обязательные юридические поля и документы заполнены.'
                : `Осталось заполнить или опубликовать: ${compliance.missingRequiredCount}`}
            </p>
          </div>
          <p
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              ready
                ? 'bg-[var(--admin-brand-soft)] text-[var(--admin-brand)]'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            {ready ? '✓ Готово' : '⚠ Требует заполнения'}
          </p>
        </div>

        <ul className="divide-y divide-[var(--admin-border)] border-t border-[var(--admin-border)]">
          {compliance.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <StatusMark status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {item.adminHref ? (
                    <Link
                      href={item.adminHref}
                      className="font-medium text-[var(--admin-ink)] underline-offset-2 hover:underline"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-[var(--admin-ink)]">{item.label}</span>
                  )}
                  {item.status === 'missing' || item.status === 'draft' ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Требует заполнения перед запуском
                    </span>
                  ) : null}
                </div>
                {item.detail ? (
                  <p className="mt-0.5 text-sm text-[var(--admin-muted)]">{item.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {compliance.legalReviewFlags.length > 0 ? (
          <div className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-3">
            <p className="text-sm font-semibold text-[var(--admin-ink)]">
              Напоминания для юридической проверки
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--admin-muted)]">
              {compliance.legalReviewFlags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {documents && documents.length > 0 ? (
          <div>
            <p className="admin-section__eyebrow mb-2">Документы</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {documents.map((doc) => (
                <li key={doc.kind}>
                  <Link href={doc.href} className="admin-quick-link">
                    <span className="font-medium">{doc.title}</span>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
