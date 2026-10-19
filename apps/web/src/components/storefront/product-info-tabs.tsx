'use client';

import { useState, type ReactNode } from 'react';

export type ProductInfoSection = {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

/** Desktop: tabs. Mobile: accordions over the same panels. */
export function ProductInfoTabs({ sections }: { sections: ProductInfoSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
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
    <section className="sf-pdp-card sf-pdp-tabs" aria-label="О букете">
      <div className="sf-pdp-tabs__list" role="tablist">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            id={`pdp-tab-${section.id}`}
            aria-selected={active === section.id}
            aria-controls={`pdp-panel-${section.id}`}
            className="sf-pdp-tabs__tab"
            onClick={() => setActive(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {sections.map((section) => {
        const isOpen = open.has(section.id);
        return (
          <div key={section.id} className="sf-pdp-tabs__item">
            <button
              type="button"
              className="sf-pdp-tabs__accordion"
              aria-expanded={isOpen}
              aria-controls={`pdp-panel-${section.id}`}
              onClick={() => toggle(section.id)}
            >
              <span className="sf-pdp-tabs__accordion-icon">{section.icon}</span>
              <span className="sf-pdp-tabs__accordion-label">{section.label}</span>
              <span className="sf-pdp-tabs__chevron" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            </button>
            <div
              id={`pdp-panel-${section.id}`}
              role="tabpanel"
              aria-labelledby={`pdp-tab-${section.id}`}
              className="sf-pdp-tabs__panel"
              data-active={active === section.id ? 'true' : 'false'}
              data-open={isOpen ? 'true' : 'false'}
            >
              {section.content}
            </div>
          </div>
        );
      })}
    </section>
  );
}
