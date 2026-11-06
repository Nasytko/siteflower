import Link from 'next/link';
import { colorDiscoveryHref, type ColorRefDto } from '@bouquet-one/contracts';

type Props = {
  colors: ColorRefDto[];
  title?: string;
};

/**
 * Compact homepage color strip — swatches link to `/catalog/bouquets?color=…`.
 */
export function HomePalette({ colors, title = 'Палитра' }: Props) {
  if (colors.length === 0) return null;

  return (
    <section className="sf-home-palette" aria-label={title}>
      <div className="sf-container-wide">
        <div className="sf-home-palette__head">
          <h2 className="sf-home-palette__title">{title}</h2>
          <p className="sf-home-palette__lead">Подберите букет по оттенку</p>
        </div>
        <ul className="sf-home-palette__list">
          {colors.map((color) => (
            <li key={color.id}>
              <Link
                href={colorDiscoveryHref(color.slug)}
                className="sf-home-palette__chip"
                title={`Букеты: ${color.name}`}
              >
                <span
                  className="sf-home-palette__swatch"
                  style={color.swatch ? { background: color.swatch } : undefined}
                  data-empty={color.swatch ? undefined : 'true'}
                  aria-hidden
                />
                <span className="sf-home-palette__name">{color.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
