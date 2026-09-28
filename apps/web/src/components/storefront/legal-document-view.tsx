import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LegalDocumentPublicDto } from '@bouquet-one/contracts';
import { extractMarkdownToc, SafeMarkdown } from './safe-markdown';

type Props = {
  document: LegalDocumentPublicDto;
  /** Extra content after the markdown body (e.g. cookies note on privacy). */
  appendix?: ReactNode;
};

function formatEffectiveDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-BY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function LegalDocumentView({ document, appendix }: Props) {
  const toc = extractMarkdownToc(document.bodyMarkdown);
  const effective = formatEffectiveDate(document.effectiveAt ?? document.publishedAt);

  return (
    <article className="sf-legal-doc">
      <header className="sf-legal-doc__header">
        <h1 className="sf-display">{document.title}</h1>
        <p className="sf-legal-doc__meta">
          {effective ? <span>Действует с {effective}</span> : null}
          {effective ? <span aria-hidden="true"> · </span> : null}
          <span>Версия {document.version}</span>
        </p>
      </header>

      {toc.length >= 3 ? (
        <nav className="sf-legal-toc" aria-label="Содержание">
          <p className="sf-label">Содержание</p>
          <ol>
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <SafeMarkdown markdown={document.bodyMarkdown} className="sf-legal-prose" />

      {appendix ? <div className="sf-legal-appendix">{appendix}</div> : null}
    </article>
  );
}

export function LegalDocumentMissing({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="sf-legal-missing">
      <h1 className="sf-display">{title}</h1>
      <p className="sf-body mt-6 text-muted">
        {description ?? 'Документ готовится. Актуальные реквизиты и контакты — на странице контактов.'}
      </p>
      <p className="mt-8">
        <Link href="/kontakty" className="text-sm font-medium text-brand hover:underline">
          Контакты и реквизиты
        </Link>
      </p>
    </div>
  );
}
