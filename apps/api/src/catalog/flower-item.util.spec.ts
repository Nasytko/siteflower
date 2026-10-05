import {
  flowerItemDisplayName,
  flowerItemIdentityKey,
  suggestProductNameFromComposition,
} from '@bouquet-one/contracts';
import { buildFlowerItemFields } from './flower-item.util';

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
    ).toBe('Хризантема Бигуди 70 см Эквадор');
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
    ).toBe('Букет из хризантем Бигуди');
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
    expect(fields.name).toBe('Роза Мондиаль 60 см Эквадор');
    expect(fields.slug.length).toBeGreaterThan(0);
  });
});
