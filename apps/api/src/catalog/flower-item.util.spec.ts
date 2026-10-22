import {
  flowerItemDisplayName,
  flowerItemIdentityKey,
  suggestProductNameFromComposition,
} from '@bouquet-one/contracts';
import { buildFlowerItemFields, toFlowerItemDto, type FlowerItemRow } from './flower-item.util';

describe('flowerItem helpers', () => {
  it('builds stable identity keys with null parts as _ (includes form)', () => {
    expect(
      flowerItemIdentityKey({
        flowerTypeId: 'type-1',
        flowerFormId: null,
        flowerVarietyId: 'var-1',
        flowerOriginId: null,
        stemLengthCm: 70,
      }),
    ).toBe('type-1|_|var-1|_|70');
  });

  it('formats display names for manager UI', () => {
    expect(
      flowerItemDisplayName({
        typeName: 'Хризантема',
        varietyName: 'Бигуди',
        originName: 'Эквадор',
        stemLengthCm: 70,
      }),
    ).toBe('Хризантема «Бигуди», 70 см');
  });

  it('suggests mono and mixed product names', () => {
    expect(
      suggestProductNameFromComposition([
        {
          displayName: 'Хризантема Бигуди 70 см Эквадор',
          quantity: 9,
          typeName: 'Хризантема',
          varietyName: 'Бигуди',
        },
      ]),
    ).toBe('Букет из хризантем «Бигуди»');
    expect(
      suggestProductNameFromComposition([
        { displayName: 'Роза', quantity: 10, typeName: 'Роза' },
        { displayName: 'Эустома', quantity: 3, typeName: 'Эустома' },
      ]),
    ).toBe('Букет из роз и эустомы');
  });

  it('derives slug and identity from type/form/variety/origin/stem', () => {
    const fields = buildFlowerItemFields({
      flowerTypeId: 't1',
      flowerFormId: 'f1',
      flowerVarietyId: 'v1',
      flowerOriginId: 'o1',
      stemLengthCm: 60,
      typeName: 'Роза',
      formName: 'Классическая',
      varietyName: 'Мондиаль',
      originName: 'Эквадор',
    });
    expect(fields.identityKey).toBe('t1|f1|v1|o1|60');
    expect(fields.name).toBe('Роза Классическая «Мондиаль», 60 см');
    expect(fields.slug.length).toBeGreaterThan(0);
  });

  it('maps dictionary color onto FlowerItemDto without inventing swatch', () => {
    const row = {
      id: 'fi1',
      flowerTypeId: 't1',
      flowerFormId: null,
      flowerVarietyId: 'v1',
      flowerOriginId: null,
      colorId: 'c1',
      stemLengthCm: 60,
      imageUrl: null,
      identityKey: 't1|_|v1|_|60',
      slug: 'roza-mondial',
      name: 'Роза Мондиаль 60 см',
      sortOrder: 0,
      visibility: 'VISIBLE' as const,
      version: 1,
      flowerType: { id: 't1', slug: 'roza', name: 'Роза' },
      flowerForm: null,
      flowerVariety: { id: 'v1', slug: 'mondial', name: 'Мондиаль' },
      flowerOrigin: null,
      color: { id: 'c1', slug: 'belyj', name: 'Белый', swatch: '#f5f5f5' },
    } satisfies FlowerItemRow;
    const dto = toFlowerItemDto(row);
    expect(dto.colorId).toBe('c1');
    expect(dto.color?.name).toBe('Белый');
    expect(dto.color?.swatch).toBe('#f5f5f5');

    const unknown = toFlowerItemDto({ ...row, colorId: null, color: null });
    expect(unknown.colorId).toBeNull();
    expect(unknown.color).toBeNull();
  });
});
