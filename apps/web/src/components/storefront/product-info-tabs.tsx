'use client';

import { useState, type ReactNode } from 'react';

export type ProductInfoSection = {
  id: string;
  label: string;
  /** Kept for callers; accordion header is label + plus only. */
  icon?: ReactNode;
  content: ReactNode;
};

/** Expandable info rows (состав / доставка / оплата) — same on mobile and desktop. */
export function ProductInfoTabs({ sections }: { sections: ProductInfoSection[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  if (sections.length === 0) return null;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="sf-pdp-card sf-pdp-acc" aria-label="О букете">
      {sections.map((section) => {
        const isOpen = open.has(section.id);
        const panelId = `pdp-acc-panel-${section.id}`;
        const buttonId = `pdp-acc-btn-${section.id}`;
        return (
          <div key={section.id} className="sf-pdp-acc__item">
            <button
              type="button"
              id={buttonId}
              className="sf-pdp-acc__trigger"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(section.id)}
            >
              <span className="sf-pdp-acc__label">{section.label}</span>
              <span className="sf-pdp-acc__mark" aria-hidden data-open={isOpen ? 'true' : 'false'}>
                {isOpen ? '−' : '+'}
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="sf-pdp-acc__panel"
              data-open={isOpen ? 'true' : 'false'}
              hidden={!isOpen}
            >
              <div className="sf-pdp-acc__panel-inner">{section.content}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
