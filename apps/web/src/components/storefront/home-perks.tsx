import type { HomepagePerkDto } from '@bouquet-one/contracts';

type Props = {
  items: HomepagePerkDto[];
};

const ICONS = ['flower', 'truck', 'care', 'pay'] as const;

/**
 * Compact benefits strip under discovery tiles — icon + short line.
 */
export function HomePerks({ items }: Props) {
  const visible = items
    .filter((item) => item.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  if (visible.length === 0) return null;

  return (
    <section className="sf-perks" aria-label="Преимущества">
      <div className="sf-container-wide">
        <ul className="sf-perks__list">
          {visible.map((item, index) => (
            <li key={item.id} className="sf-perks__item">
              <span className="sf-perks__icon" aria-hidden>
                <PerkIcon name={ICONS[index % ICONS.length]!} />
              </span>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PerkIcon({ name }: { name: (typeof ICONS)[number] }) {
  const common = {
    viewBox: '0 0 24 24',
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
  } as const;

  switch (name) {
    case 'flower':
      return (
        <svg {...common} aria-hidden>
          <path
            d="M12 13.5c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4Z"
            strokeLinejoin="round"
          />
          <path d="M12 13.5V20M9 17h6" strokeLinecap="round" />
          <path d="M7.5 7.2c-1.4-.3-2.5-1.5-2.5-3M16.5 7.2c1.4-.3 2.5-1.5 2.5-3" strokeLinecap="round" />
        </svg>
      );
    case 'truck':
      return (
        <svg {...common} aria-hidden>
          <path d="M3 7.5h11v9H3zM14 10.5h4.2L21 14v2.5h-7" strokeLinejoin="round" />
          <circle cx="7" cy="17.5" r="1.5" />
          <circle cx="17" cy="17.5" r="1.5" />
        </svg>
      );
    case 'care':
      return (
        <svg {...common} aria-hidden>
          <path
            d="M12 18.5s-5.5-3.4-5.5-7.2a3.3 3.3 0 0 1 5.5-2.4 3.3 3.3 0 0 1 5.5 2.4c0 3.8-5.5 7.2-5.5 7.2Z"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'pay':
      return (
        <svg {...common} aria-hidden>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="M3.5 10h17M8 14h4" strokeLinecap="round" />
        </svg>
      );
  }
}
