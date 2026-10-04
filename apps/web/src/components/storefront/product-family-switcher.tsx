import Link from 'next/link';
import type { ProductFamilyDto, ProductFamilyMemberDto } from '@bouquet-one/contracts';

type Props = {
  family: ProductFamilyDto;
  currentSlug: string;
};

function memberLabel(member: ProductFamilyMemberDto): string {
  const parts: string[] = [];
  if (member.heightCm != null) parts.push(`${member.heightCm} см`);
  if (member.flowerOrigin?.name) parts.push(member.flowerOrigin.name);
  if (parts.length > 0) return parts.join(' · ');
  return member.name;
}

export function ProductFamilySwitcher({ family, currentSlug }: Props) {
  const members = family.members.filter((m) => m.lifecycle !== 'DRAFT' && m.lifecycle !== 'ARCHIVED');
  if (members.length < 2) return null;

  return (
    <section className="mt-4" aria-label="Другие варианты">
      <p className="sf-label mb-2">Другие варианты</p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((member) => {
          const isCurrent = member.isCurrent ?? member.slug === currentSlug;
          const label = memberLabel(member);
          if (isCurrent) {
            return (
              <span
                key={member.productId}
                className="sf-filter-pill text-sm"
                data-active="true"
                aria-current="true"
              >
                {label}
              </span>
            );
          }
          return (
            <Link
              key={member.productId}
              href={`/bukety/${member.slug}`}
              className="sf-filter-pill text-sm"
              data-active="false"
            >
              {label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
