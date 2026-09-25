import Link from 'next/link';

type Props = {
  city: string;
};

const ITEMS = [
  {
    title: 'Доставка курьером',
    text: null as string | null,
    icon: 'truck' as const,
  },
  {
    title: 'Свежая сборка',
    text: 'Собираем в день заказа',
    icon: 'bloom' as const,
  },
  {
    title: 'Самовывоз из студии',
    text: 'Удобно забрать лично',
    icon: 'studio' as const,
  },
  {
    title: 'Открытка в подарок',
    text: 'Напишем тёплые слова',
    icon: 'card' as const,
  },
];

function Icon({ name }: { name: (typeof ITEMS)[number]['icon'] }) {
  const common = {
    className: 'h-7 w-7 text-brand sm:h-8 sm:w-8',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.35,
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
  };
  if (name === 'bloom') {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 20c0-4 2-6 4-8 1.2-1.2 1.2-3.2 0-4.4S13 6.4 12 7.6C11 6.4 9.2 6.4 8 7.6s-1.2 3.2 0 4.4c2 2 4 4 4 8z"
        />
        <path strokeLinecap="round" d="M12 12v8" />
      </svg>
    );
  }
  if (name === 'studio') {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5 12 4l8 6.5V20H4z" />
        <path strokeLinecap="round" d="M9.5 20v-6h5v6" />
      </svg>
    );
  }
  if (name === 'card') {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path strokeLinecap="round" d="M8 10h8M8 14h5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v8H3zM14 10h4l3 3v2h-7" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </svg>
  );
}

/** Soft feature card — Dicentra-like benefits, flower-specific. */
export function TrustBar({ city }: Props) {
  return (
    <section className="sf-container-wide -mt-5 pb-2 sm:-mt-6 md:-mt-8" aria-label="Преимущества">
      <div className="relative z-10 rounded-[var(--radius-xl)] border border-border bg-white px-4 py-6 shadow-[var(--shadow-soft)] sm:px-6 sm:py-7 md:px-8 md:py-9">
        <ul className="grid grid-cols-2 gap-5 sm:gap-7 lg:grid-cols-4 lg:gap-4">
          {ITEMS.map((item) => (
            <li
              key={item.title}
              className="sf-trust-item flex flex-col items-start gap-2.5 text-left sm:items-center sm:gap-3 sm:text-center"
            >
              <Icon name={item.icon} />
              <div>
                <p className="font-[family-name:var(--font-display)] text-base tracking-wide text-foreground sm:text-lg">
                  {item.title}
                </p>
                <p className="sf-small mt-1 text-muted">
                  {item.icon === 'truck' ? `По ${city} — бережно и вовремя` : item.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="sr-only">
          Подробнее — <Link href="/dostavka">доставка</Link>
        </p>
      </div>
    </section>
  );
}
