import type { HomepagePerkDto } from '@bouquet-one/contracts';

type Props = {
  items: HomepagePerkDto[];
};

export function HomePerks({ items }: Props) {
  const visible = items
    .filter((item) => item.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  if (visible.length === 0) return null;

  return (
    <section className="sf-perks" aria-label="Преимущества">
      <div className="sf-container-wide">
        <ul className="sf-perks__list">
          {visible.map((item) => (
            <li key={item.id} className="sf-perks__item">
              <span className="sf-perks__mark" aria-hidden />
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
