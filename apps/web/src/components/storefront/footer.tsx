import Link from 'next/link';
import type { LegalSellerPublicDto, StorefrontSettingsPublicDto } from '@bouquet-one/contracts';
import { BrandLogo } from './brand-logo';

type Props = {
  settings: StorefrontSettingsPublicDto;
  seller?: LegalSellerPublicDto | null;
};

const CATALOG_LINKS = [
  { href: '/bukety', label: 'Букеты' },
  { href: '/cvety', label: 'Цветы' },
  { href: '/katalog/kompozicii', label: 'Композиции' },
  { href: '/katalog/podarki', label: 'Подарки' },
  { href: '/povod', label: 'Поводы' },
  { href: '/akcii', label: 'Акции' },
] as const;

const BUYER_LINKS = [
  { href: '/dostavka', label: 'Доставка и оплата' },
  { href: '/oferta', label: 'Условия заказа' },
  { href: '/vozvrat', label: 'Возврат' },
] as const;

const COMPANY_LINKS = [
  { href: '/o-nas', label: 'О нас' },
  { href: '/kontakty', label: 'Контакты' },
  { href: '/privacy', label: 'Политика конфиденциальности' },
] as const;

export function StorefrontFooter({ settings, seller = null }: Props) {
  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : null;
  const year = new Date().getFullYear();
  const legalName = seller?.legalName?.trim() || null;
  const unp = seller?.unp?.trim() || null;
  const socials = [
    settings.instagramUrl
      ? { id: 'instagram', href: settings.instagramUrl, label: 'Instagram' }
      : null,
    settings.telegramUrl ? { id: 'telegram', href: settings.telegramUrl, label: 'Telegram' } : null,
  ].filter((item): item is { id: 'instagram' | 'telegram'; href: string; label: string } =>
    Boolean(item),
  );

  return (
    <footer className="sf-footer mt-auto">
      <div className="sf-footer__main">
        <div className="sf-footer__grid sf-container-wide">
          <div className="sf-footer__about">
            <div className="sf-footer__brand">
              <BrandLogo alt={settings.brandName} />
            </div>
            <p className="sf-footer__text">
              {settings.aboutSummary ??
                `Цветочный магазин в ${settings.city}. Свежие букеты, аккуратная сборка и понятная доставка.`}
            </p>
            {socials.length > 0 ? (
              <ul className="sf-footer__socials">
                {socials.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      rel="noopener noreferrer"
                      target="_blank"
                      aria-label={item.label}
                    >
                      <SocialIcon name={item.id} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <FooterColumn title="Каталог" links={CATALOG_LINKS} />
          <FooterColumn title="Покупателям" links={BUYER_LINKS} />
          <FooterColumn title="Компания" links={COMPANY_LINKS} />

          <div className="sf-footer__contacts">
            {settings.phone ? (
              <a href={telHref!} className="sf-footer__phone">
                <PhoneIcon />
                {settings.phone}
              </a>
            ) : (
              <p className="sf-footer__col-title">Контакты</p>
            )}
            {settings.workingHours ? (
              <p className="sf-footer__hours">
                {settings.city} · {settings.workingHours}
              </p>
            ) : null}
            {settings.email ? (
              <a href={`mailto:${settings.email}`} className="sf-footer__hours">
                {settings.email}
              </a>
            ) : null}
            {telHref ? (
              <a href={telHref} className="sf-footer__call">
                Заказать звонок
              </a>
            ) : null}
          </div>
        </div>

        <div className="sf-footer__legal">
          <div className="sf-footer__legal-row sf-container-wide">
            <p>
              © {year} {settings.brandName}. Все права защищены.
            </p>
            {legalName || unp ? (
              <p>
                {legalName}
                {legalName && unp ? <span aria-hidden="true"> · </span> : null}
                {unp ? `УНП ${unp}` : null}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="sf-footer__col-title">{title}</p>
      <ul className="sf-footer__links">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
      <path d="M6.6 3.5h2.6l1.4 3.6-1.8 1.3a11.5 11.5 0 0 0 6.8 6.8l1.3-1.8 3.6 1.4V17a2 2 0 0 1-2.1 2A15.5 15.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1Z" />
    </svg>
  );
}

function SocialIcon({ name }: { name: 'instagram' | 'telegram' }) {
  if (name === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="3.8" />
        <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M20.7 4.3 2.9 11.2c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.7 5.4c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14.1c.3-1.2-.5-1.8-1.5-1.3ZM9 13.8l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.1L9 13.8Z" />
    </svg>
  );
}
