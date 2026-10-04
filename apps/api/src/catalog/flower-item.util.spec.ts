import {
  flowerItemDisplayName,
  flowerItemIdentityKey,
  suggestProductNameFromComposition,
} from '@bouquet-one/contracts';
import { buildFlowerItemFields } from './flower-item.util';

describe('flowerItem helpers', () => {
  it('builds stable identity keys with null parts as _', () => {
    expect(
      flowerItemIdentityKey({
        flowerTypeId: 'type-1',
        flowerVarietyId: 'var-1',
        flowerOriginId: null,
        heightCm: 70,
      }),
    ).toBe('type-1|var-1|_|70');
  });

  it('formats display names for manager UI', () => {
    expect(
      flowerItemDisplayName({
        typeName: 'Хризантема',
        varietyName: 'Бигуди',
        originName: 'Эквадор',
        heightCm: 70,
      }),
    ).toBe('Хризантема Бигуди · Эквадор · 70 см');
  });

  it('suggests mono and mixed product names', () => {
    expect(
      suggestProductNameFromComposition([
        { displayName: 'Хризантема Бигуди · Эквадор · 70 см', quantity: 9 },
      ]),
    ).toBe('Букет из 9 Хризантема Бигуди · Эквадор · 70 см');
    expect(
      suggestProductNameFromComposition([
        { displayName: 'Роза', quantity: 10 },
        { displayName: 'Эустома', quantity: 3 },
      ]),
    ).toBe('Авторский букет (2 позиции)');
  });

  it('derives slug and identity from type/variety/origin/height', () => {
    const fields = buildFlowerItemFields({
      flowerTypeId: 't1',
      flowerVarietyId: 'v1',
      flowerOriginId: 'o1',
      heightCm: 60,
      typeName: 'Роза',
      varietyName: 'Мондиаль',
      originName: 'Эквадор',
    });
    expect(fields.identityKey).toBe('t1|v1|o1|60');
    expect(fields.name).toBe('Роза Мондиаль · Эквадор · 60 см');
    expect(fields.slug.length).toBeGreaterThan(0);
  });
});
