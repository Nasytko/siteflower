'use client';

import { useState, type ReactNode } from 'react';

export type ProductInfoSection = {
  id: string;
  label: string;
  /** Kept for callers; accordion header is label + plus only. */
  icon?: ReactNode;
  content: ReactNode;
};

/** Exclusive accordion: one section open (composition open by default). */
export function ProductInfoTabs({ sections }: { sections: ProductInfoSection[] }) {
  const [openId, setOpenId] = useState<string | null>(() => sections[0]?.id ?? null);

  if (sections.length === 0) return null;

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <section className="sf-pdp-card sf-pdp-acc" aria-label="О букете">
      {sections.map((section) => {
        const isOpen = openId === section.id;
        const panelId = `pdp-acc-panel-${section.id}`;
        const buttonId = `pdp-acc-btn-${section.id}`;
        return (
          <div
            key={section.id}
            className="sf-pdp-acc__item"
            data-open={isOpen ? 'true' : 'false'}
          >
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
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
                  <path
                    d="M4 6.2 8 10.2 12 6.2"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
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
