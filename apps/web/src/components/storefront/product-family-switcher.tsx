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
      <div className="sf-pdp-family">
        {members.map((member) => {
          const isCurrent = member.isCurrent ?? member.slug === currentSlug;
          const label = memberLabel(member);
          const sale =
            typeof member.percentOff === 'number' && member.percentOff >= 1
              ? member.percentOff
              : null;
          const className = `sf-pdp-family__chip${isCurrent ? ' sf-pdp-family__chip--current' : ''}${
            sale ? ' sf-pdp-family__chip--sale' : ''
          }`;

          const body = (
            <>
              <span className="sf-pdp-family__label">{label}</span>
              {sale ? <span className="sf-pdp-family__sale">−{sale}%</span> : null}
            </>
          );

          if (isCurrent) {
            return (
              <span key={member.productId} className={className} aria-current="true">
                {body}
              </span>
            );
          }
          return (
            <Link key={member.productId} href={`/products/${member.slug}`} className={className}>
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
