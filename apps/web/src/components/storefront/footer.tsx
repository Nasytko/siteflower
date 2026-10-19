import Link from 'next/link';
import type { LegalSellerPublicDto, StorefrontSettingsPublicDto } from '@bouquet-one/contracts';
import { BrandLogo } from './brand-logo';

type Props = {
  settings: StorefrontSettingsPublicDto;
  seller?: LegalSellerPublicDto | null;
};

const BUYER_LINKS = [
  { href: '/dostavka', label: 'Доставка и оплата' },
  { href: '/oferta', label: 'Условия заказа' },
  { href: '/vozvrat', label: 'Возврат' },
  { href: '/privacy', label: 'Конфиденциальность' },
] as const;

const COMPANY_LINKS = [
  { href: '/o-nas', label: 'О нас' },
  { href: '/kontakty', label: 'Контакты' },
] as const;

const CATALOG_LINKS = [
  { href: '/bukety', label: 'Букеты' },
  { href: '/cvety', label: 'Цветы' },
  { href: '/katalog/kompozicii', label: 'Композиции' },
  { href: '/katalog/podarki', label: 'Подарки' },
  { href: '/povod', label: 'Поводы' },
  { href: '/akcii', label: 'Акции' },
] as const;

export function StorefrontFooter({ settings, seller = null }: Props) {
  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : null;
  const year = new Date().getFullYear();
  const legalName = seller?.legalName?.trim() || null;
  const unp = seller?.unp?.trim() || null;

  return (
    <footer className="sf-footer mt-auto">
      <div className="sf-footer__main">
        <div className="sf-container-wide grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="sf-footer__brand">
              <BrandLogo alt={settings.brandName} />
            </div>
            <p className="sf-small mt-3 text-white/75">
              {settings.aboutSummary ??
                `Цветочный магазин в ${settings.city}. Свежие букеты, аккуратная сборка и понятная доставка.`}
            </p>
            <ul className="mt-5 space-y-1.5 text-sm text-white/90">
              {settings.phone ? (
                <li>
                  <a href={telHref!} className="font-semibold text-white hover:opacity-90">
                    {settings.phone}
                  </a>
                </li>
              ) : null}
              {settings.workingHours ? (
                <li className="text-white/70">{settings.workingHours}</li>
              ) : null}
              {settings.email ? (
                <li>
                  <a href={`mailto:${settings.email}`} className="hover:opacity-90">
                    {settings.email}
                  </a>
                </li>
              ) : null}
              {settings.instagramUrl ? (
                <li>
                  <a
                    href={settings.instagramUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="hover:opacity-90"
                  >
                    Instagram
                  </a>
                </li>
              ) : null}
              {settings.telegramUrl ? (
                <li>
                  <a
                    href={settings.telegramUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="hover:opacity-90"
                  >
                    Telegram
                  </a>
                </li>
              ) : null}
            </ul>
            {telHref ? (
              <a href={telHref} className="sf-footer__call mt-5 inline-flex">
                Заказать звонок
              </a>
            ) : null}
          </div>

          <div>
            <p className="sf-footer__col-title">Каталог</p>
            <ul className="sf-footer__links">
              {CATALOG_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="sf-footer__col-title">Покупателям</p>
            <ul className="sf-footer__links">
              {BUYER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="sf-footer__col-title">Компания</p>
            <ul className="sf-footer__links">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sf-footer__legal">
          <div className="sf-container-wide">
            <p>
              © {year} {settings.brandName}
              {legalName ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {legalName}
                </>
              ) : null}
              {unp ? (
                <>
                  <span aria-hidden="true"> · </span>
                  УНП {unp}
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
