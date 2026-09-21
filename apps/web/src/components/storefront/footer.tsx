import Link from 'next/link';
import type { StorefrontSettingsPublicDto } from '@bouquet-one/contracts';

type Props = {
  settings: StorefrontSettingsPublicDto;
};

export function StorefrontFooter({ settings }: Props) {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="sf-container-wide grid gap-12 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-[0.14em]">
            {settings.brandName}
          </p>
          <p className="sf-display-script mt-3 text-xl text-foreground/80">
            цветы с характером
          </p>
          <p className="sf-small mt-4 max-w-sm text-muted">
            {settings.aboutSummary ??
              `Цветочный магазин в ${settings.city}. Свежие букеты, аккуратная доставка и внимание к деталям.`}
          </p>
        </div>
        <div>
          <p className="sf-label">Навигация</p>
          <ul className="mt-4 space-y-2.5 text-sm tracking-wide">
            <li>
              <Link href="/bukety" className="hover:text-brand">
                Каталог
              </Link>
            </li>
            <li>
              <Link href="/dostavka" className="hover:text-brand">
                Доставка
              </Link>
            </li>
            <li>
              <Link href="/o-nas" className="hover:text-brand">
                О нас
              </Link>
            </li>
            <li>
              <Link href="/favorites" className="hover:text-brand">
                Избранное
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:text-brand">
                Корзина
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="sf-label">Контакты</p>
          <ul className="mt-4 space-y-2.5 text-sm text-foreground">
            {settings.phone ? (
              <li>
                <a
                  href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                  className="font-[family-name:var(--font-display)] text-lg tracking-wide hover:text-brand"
                >
                  {settings.phone}
                </a>
              </li>
            ) : null}
            {settings.email ? (
              <li>
                <a href={`mailto:${settings.email}`} className="hover:text-brand">
                  {settings.email}
                </a>
              </li>
            ) : null}
            {settings.address ? <li className="text-muted">{settings.address}</li> : null}
            {settings.workingHours ? <li className="text-muted">{settings.workingHours}</li> : null}
            {settings.instagramUrl ? (
              <li>
                <a href={settings.instagramUrl} rel="noopener noreferrer" target="_blank" className="hover:text-brand">
                  Instagram
                </a>
              </li>
            ) : null}
            {settings.telegramUrl ? (
              <li>
                <a href={settings.telegramUrl} rel="noopener noreferrer" target="_blank" className="hover:text-brand">
                  Telegram
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="sf-container-wide py-5 text-center text-xs tracking-[0.12em] uppercase text-muted">
          © {new Date().getFullYear()} {settings.brandName} · {settings.city}
        </p>
      </div>
    </footer>
  );
}
