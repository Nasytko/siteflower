import type { ReactNode } from 'react';

type Props = {
  markdown: string;
  className?: string;
};

type TocHeading = { id: string; text: string };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Inline: **bold**, [label](url), bare text — React-escaped (no raw HTML). */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      const label = match[2] ?? '';
      const href = match[3] ?? '#';
      nodes.push(
        <a key={key++} href={href} className="sf-legal-link">
          {label}
        </a>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes;
}

function isListItem(line: string): boolean {
  return /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

function listItemText(line: string): string {
  return line.replace(/^([-*]|\d+\.)\s+/, '');
}

export function extractMarkdownToc(markdown: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const seen = new Map<string, number>();

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const match = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!match) continue;
    const text = (match[2] ?? '').replace(/\*\*/g, '').trim();
    if (!text) continue;
    let id = slugify(text) || 'section';
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;
    headings.push({ id, text });
  }

  return headings;
}

/**
 * Lightweight safe markdown renderer for published legal docs.
 * Supports paragraphs, ##/### headings, lists, blockquotes, bold, and links.
 * No HTML passthrough — only React text nodes and controlled elements.
 */
export function SafeMarkdown({ markdown, className }: Props) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  const seen = new Map<string, number>();
  let i = 0;
  let key = 0;

  const headingId = (text: string) => {
    let id = slugify(text) || 'section';
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;
    return id;
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = (trimmed.match(/^#+/)?.[0].length ?? 2);
      const text = trimmed.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').trim();
      const id = headingId(text);
      const Tag = level >= 3 ? 'h3' : 'h2';
      blocks.push(
        <Tag key={key++} id={id} className={level >= 3 ? 'sf-legal-h3' : 'sf-legal-h2'}>
          {renderInline(text)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={key++} className="sf-legal-quote">
          {renderInline(quoteLines.join(' '))}
        </blockquote>,
      );
      continue;
    }

    if (isListItem(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && isListItem((lines[i] ?? '').trim())) {
        items.push(listItemText((lines[i] ?? '').trim()));
        i += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={key++} className="sf-legal-list">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const next = (lines[i] ?? '').trim();
      if (
        !next ||
        /^#{1,3}\s+/.test(next) ||
        next.startsWith('>') ||
        isListItem(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="sf-legal-p">
        {renderInline(para.join(' '))}
      </p>,
    );
  }

  return <div className={className}>{blocks}</div>;
}
