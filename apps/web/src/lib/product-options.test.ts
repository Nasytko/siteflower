import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductOptionGroupDto } from '@bouquet-one/contracts';
import {
  estimateOptionsTotalMinor,
  requiredOptionsMissing,
  resolveOptionSurchargeMinor,
} from './product-options';

const groups: ProductOptionGroupDto[] = [
  {
    id: 'g1',
    productId: 'p1',
    name: 'Упаковка',
    selection: 'SINGLE',
    required: true,
    sortOrder: 0,
    values: [
      {
        id: 'wrap',
        groupId: 'g1',
        addonId: null,
        name: 'Крафт',
        erpSku: null,
        surchargeMinor: '300',
        pricingMode: 'FIXED',
        tiers: [],
        chargeMode: 'PER_LINE',
        sortOrder: 0,
        active: true,
        variantSurcharges: { v2: '500' },
      },
    ],
  },
  {
    id: 'g2',
    productId: 'p1',
    name: 'Лента',
    selection: 'SINGLE',
    required: false,
    sortOrder: 1,
    values: [
      {
        id: 'ribbon',
        groupId: 'g2',
        addonId: null,
        name: 'Атлас',
        erpSku: null,
        surchargeMinor: '50',
        pricingMode: 'FIXED',
        tiers: [],
        chargeMode: 'PER_UNIT',
        sortOrder: 0,
        active: true,
        variantSurcharges: {},
      },
    ],
  },
];

test('resolveOptionSurchargeMinor prefers variant override', () => {
  assert.equal(resolveOptionSurchargeMinor(groups[0]!.values[0]!, 'v2'), 500n);
  assert.equal(resolveOptionSurchargeMinor(groups[0]!.values[0]!, 'v1'), 300n);
});

test('resolveOptionSurchargeMinor TIERED uses flower/stem line total', () => {
  const tiered = {
    ...groups[0]!.values[0]!,
    pricingMode: 'TIERED' as const,
    surchargeMinor: '0',
    tiers: [
      { maxBaseMinor: '6000', surchargeMinor: '800', sortOrder: 0 },
      { maxBaseMinor: '11000', surchargeMinor: '1000', sortOrder: 1 },
      { maxBaseMinor: null, surchargeMinor: '1500', sortOrder: 2 },
    ],
  };
  assert.equal(resolveOptionSurchargeMinor(tiered, 'v1', 5000n), 800n);
  assert.equal(resolveOptionSurchargeMinor(tiered, 'v1', 7000n), 1000n);
  assert.equal(resolveOptionSurchargeMinor(tiered, 'v1', 20000n), 1500n);
});

test('requiredOptionsMissing blocks incomplete required groups', () => {
  assert.equal(requiredOptionsMissing(groups, {}), true);
  assert.equal(requiredOptionsMissing(groups, { g1: ['wrap'] }), false);
});

test('estimateOptionsTotalMinor PER_LINE + PER_UNIT', () => {
  const priced = estimateOptionsTotalMinor({
    groups,
    variantId: 'v1',
    selectedByGroup: { g1: ['wrap'], g2: ['ribbon'] },
    quantity: 2,
    baseUnitPriceMinor: '1000',
  });
  assert.equal(priced.optionsTotalMinor, '400');
  assert.equal(priced.lineTotalMinor, '2400');
  assert.deepEqual(priced.optionValueIds, ['wrap', 'ribbon']);
});

test('PDP estimate matches server computeLinePriceMinor for PER_LINE and PER_UNIT', async () => {
  const { computeLinePriceMinor } = await import('@bouquet-one/contracts');
  const qty = 3;
  const base = '1500';
  const estimate = estimateOptionsTotalMinor({
    groups,
    variantId: 'v1',
    selectedByGroup: { g1: ['wrap'], g2: ['ribbon'] },
    quantity: qty,
    baseUnitPriceMinor: base,
  });
  const server = computeLinePriceMinor({
    quantity: qty,
    baseUnitPriceMinor: BigInt(base),
    options: [
      {
        groupId: 'g1',
        groupName: 'Упаковка',
        valueId: 'wrap',
        valueName: 'Крафт',
        surchargeMinor: 300n,
        chargeMode: 'PER_LINE',
      },
      {
        groupId: 'g2',
        groupName: 'Лента',
        valueId: 'ribbon',
        valueName: 'Атлас',
        surchargeMinor: 50n,
        chargeMode: 'PER_UNIT',
      },
    ],
  });
  assert.equal(estimate.optionsTotalMinor, server.optionsTotalMinor.toString());
  assert.equal(estimate.lineTotalMinor, server.lineTotalMinor.toString());
  assert.equal(server.unitPriceMinor.toString(), base);
});
