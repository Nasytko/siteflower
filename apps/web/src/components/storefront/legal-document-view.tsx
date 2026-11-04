import type { ReactNode } from 'react';
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

export function LegalPageShell({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="sf-legal-page">
      <div className="sf-container sf-legal-page__inner">{children}</div>
    </main>
  );
}

export function LegalDocumentView({ document, appendix }: Props) {
  const toc = extractMarkdownToc(document.bodyMarkdown);
  const effective = formatEffectiveDate(document.effectiveAt ?? document.publishedAt);

  return (
    <article className="sf-legal-doc">
      <header className="sf-legal-doc__header">
        <p className="sf-legal-doc__eyebrow">Документ сайта</p>
        <h1 className="sf-legal-doc__title">{document.title}</h1>
        <p className="sf-legal-doc__meta">
          {effective ? <span>Действует с {effective}</span> : null}
          {effective ? <span aria-hidden="true"> · </span> : null}
          <span>Редакция {document.version}</span>
        </p>
      </header>

      {toc.length >= 3 ? (
        <nav className="sf-legal-toc" aria-label="Содержание">
          <p className="sf-legal-toc__label">Содержание</p>
          <ol>
            {toc.map((item, index) => (
              <li key={item.id}>
                <span className="sf-legal-toc__num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
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

export function LegalRelatedNav({
  links,
}: {
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <nav className="sf-legal-related" aria-label="Связанные документы">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </nav>
  );
}
