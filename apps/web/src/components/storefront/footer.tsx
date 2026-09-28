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
      <div className="sf-band-surface">
        <div className="sf-container-wide flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold text-ink">Нужен букет сегодня?</p>
            <p className="sf-small mt-1 text-muted">
              Подберём по поводу и бюджету — или откройте каталог.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/bukety" className="sf-cta">
              В каталог
            </Link>
            {telHref ? (
              <a href={telHref} className="sf-cta-ghost">
                Позвонить
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sf-footer__main">
        <div className="sf-container-wide grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo alt={settings.brandName} />
            <p className="sf-small mt-3 text-muted">
              {settings.aboutSummary ??
                `Мы обожаем цветы и чувствуем их особую роль в жизни города. В ${settings.city} собираем современные букеты для современных людей.`}
            </p>
            {(settings.phone || settings.email || settings.instagramUrl || settings.telegramUrl) && (
              <ul className="mt-5 space-y-1.5 text-sm text-foreground">
                {settings.phone ? (
                  <li>
                    <a href={telHref!} className="font-semibold text-brand hover:opacity-90">
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
                {settings.instagramUrl ? (
                  <li>
                    <a
                      href={settings.instagramUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="hover:text-brand"
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
                      className="hover:text-brand"
                    >
                      Telegram
                    </a>
                  </li>
                ) : null}
              </ul>
            )}
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
