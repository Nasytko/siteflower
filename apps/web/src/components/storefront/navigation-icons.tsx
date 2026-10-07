import type { NavigationIconKey } from '@bouquet-one/contracts';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

type IconProps = { className?: string; title?: string };

function Svg({
  className,
  title,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function NavIconBouquet(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M12 21v-7" />
      <path {...stroke} d="M8 21h8" />
      <path {...stroke} d="M12 14c-2.5-1-4-3.2-4-5.5C8 6 9.8 4.5 12 4.5S16 6 16 8.5c0 2.3-1.5 4.5-4 5.5Z" />
      <path {...stroke} d="M9.5 7.5c-1.8.2-3.2 1.6-3.5 3.2" />
      <path {...stroke} d="M14.5 7.5c1.8.2 3.2 1.6 3.5 3.2" />
    </Svg>
  );
}

export function NavIconFlower(props: IconProps) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="12" r="2.2" />
      <path {...stroke} d="M12 4.5v3.2M12 16.3v3.2M4.5 12h3.2M16.3 12h3.2" />
      <path {...stroke} d="m7 7 2.2 2.2M14.8 14.8 17 17M17 7l-2.2 2.2M9.2 14.8 7 17" />
    </Svg>
  );
}

export function NavIconLeaf(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M5 19c8-1 12-6 14-14-8 2-13 6-14 14Z" />
      <path {...stroke} d="M8.5 15.5c2-2.2 4.8-3.8 8-4.5" />
    </Svg>
  );
}

export function NavIconHeart(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        {...stroke}
        d="M12 19s-6.5-4.1-8.2-7.2C2.3 9.5 3.4 6.8 6.2 6.2c1.7-.4 3.3.3 3.8 1.5.5-1.2 2.1-1.9 3.8-1.5 2.8.6 3.9 3.3 2.4 5.6C18.5 14.9 12 19 12 19Z"
      />
    </Svg>
  );
}

export function NavIconGift(props: IconProps) {
  return (
    <Svg {...props}>
      <rect {...stroke} x="4.5" y="10" width="15" height="10" rx="1.2" />
      <path {...stroke} d="M4.5 13.5h15M12 10v10" />
      <path {...stroke} d="M12 10c-1.8-2.8-4.8-3-5.5-1.6-.7 1.4 1.3 2.6 5.5 1.6Z" />
      <path {...stroke} d="M12 10c1.8-2.8 4.8-3 5.5-1.6.7 1.4-1.3 2.6-5.5 1.6Z" />
    </Svg>
  );
}

export function NavIconSale(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="m6 18 12-12" />
      <circle {...stroke} cx="8" cy="8" r="1.6" />
      <circle {...stroke} cx="16" cy="16" r="1.6" />
    </Svg>
  );
}

export function NavIconSize(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M5 19V9M5 19h8" />
      <path {...stroke} d="M11 15V5M11 15h8" />
    </Svg>
  );
}

export function NavIconColor(props: IconProps) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="12" r="7.5" />
      <path {...stroke} d="M12 4.5v15M4.5 12h15" />
    </Svg>
  );
}

export function NavIconArrow(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

const ICONS: Record<NavigationIconKey, (props: IconProps) => React.JSX.Element> = {
  bouquet: NavIconBouquet,
  flower: NavIconFlower,
  leaf: NavIconLeaf,
  heart: NavIconHeart,
  gift: NavIconGift,
  sale: NavIconSale,
  size: NavIconSize,
  color: NavIconColor,
  arrow: NavIconArrow,
};

export function NavigationGlyph({
  iconKey,
  className,
}: {
  iconKey?: string | null;
  className?: string;
}) {
  if (!iconKey || !(iconKey in ICONS)) return null;
  const Icon = ICONS[iconKey as NavigationIconKey];
  return <Icon className={className ?? 'h-4 w-4 shrink-0 text-brand'} />;
}
