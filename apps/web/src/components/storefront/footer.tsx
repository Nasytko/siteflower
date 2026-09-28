import Link from 'next/link';
import type { StorefrontSettingsPublicDto } from '@bouquet-one/contracts';
import { BrandLogo } from './brand-logo';

type Props = {
  settings: StorefrontSettingsPublicDto;
};

export function StorefrontFooter({ settings }: Props) {
  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s+/g, '')}` : null;

  return (
    <footer className="mt-auto border-t border-border">
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

      <div className="bg-brand text-white">
        <div className="sf-container-wide grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo alt={settings.brandName} className="sf-brand-logo--on-brand" />
            <p className="sf-small mt-3 text-white/70">
              {settings.aboutSummary ??
                `Мы обожаем цветы и чувствуем их особую роль в жизни города. В ${settings.city} собираем современные букеты для современных людей.`}
            </p>
            <p className="mt-6 text-xs text-white/45">
              © {new Date().getFullYear()} {settings.brandName}. Все права защищены.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white/55">Клиентам</p>
            <ul className="mt-3 space-y-2 text-sm text-white/90">
              <li>
                <Link href="/dostavka" className="hover:text-white">
                  Доставка и оплата
                </Link>
              </li>
              <li>
                <Link href="/akcii" className="hover:text-white">
                  Акции
                </Link>
              </li>
              <li>
                <Link href="/favorites" className="hover:text-white">
                  Избранное
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-white">
                  Корзина
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white/55">Компания</p>
            <ul className="mt-3 space-y-2 text-sm text-white/90">
              <li>
                <Link href="/o-nas" className="hover:text-white">
                  О нас
                </Link>
              </li>
              <li>
                <Link href="/bukety" className="hover:text-white">
                  Каталог
                </Link>
              </li>
              <li>
                <Link href="/cvety" className="hover:text-white">
                  Цветы
                </Link>
              </li>
              <li>
                <Link href="/povod" className="hover:text-white">
                  Поводы
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white/55">Контакты</p>
            <ul className="mt-3 space-y-2 text-sm text-white/90">
              {settings.phone ? (
                <li>
                  <a href={telHref!} className="text-base font-semibold text-white hover:opacity-90">
                    {settings.phone}
                  </a>
                </li>
              ) : null}
              {settings.email ? (
                <li>
                  <a href={`mailto:${settings.email}`} className="hover:text-white">
                    {settings.email}
                  </a>
                </li>
              ) : null}
              {settings.address ? <li className="text-white/60">{settings.address}</li> : null}
              {settings.workingHours ? (
                <li className="text-white/60">{settings.workingHours}</li>
              ) : null}
              {settings.instagramUrl ? (
                <li>
                  <a
                    href={settings.instagramUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="hover:text-white"
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
                    className="hover:text-white"
                  >
                    Telegram
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
