import { ConflictException } from '@nestjs/common';
import {
  claimOptionValueErpSkus,
  isErpSkuUniqueViolation,
  planErpSkuChange,
  syncProductErpSkuRegistry,
} from './erp-sku-registry';

function p2002(target: string | string[]) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    name: 'PrismaClientKnownRequestError',
    meta: { target },
  });
}

describe('planErpSkuChange', () => {
  it('treats re-saving the same SKU as noop', () => {
    expect(planErpSkuChange('BQ-1', 'BQ-1')).toEqual({
      action: 'noop',
      previous: 'BQ-1',
      next: 'BQ-1',
    });
    expect(planErpSkuChange(null, null).action).toBe('noop');
  });

  it('plans claim, release, and reassign', () => {
    expect(planErpSkuChange(null, 'BQ-1').action).toBe('claim');
    expect(planErpSkuChange('BQ-1', null).action).toBe('release');
    expect(planErpSkuChange('BQ-1', 'BQ-2')).toEqual({
      action: 'reassign',
      previous: 'BQ-1',
      next: 'BQ-2',
    });
  });
});

describe('isErpSkuUniqueViolation', () => {
  it('detects registry and denormalized erp_sku targets', () => {
    expect(isErpSkuUniqueViolation(p2002('erp_sku_registry_pkey'))).toBe(true);
    expect(isErpSkuUniqueViolation(p2002(['erp_sku']))).toBe(true);
    expect(isErpSkuUniqueViolation(p2002('products_slug_key'))).toBe(false);
    expect(isErpSkuUniqueViolation(new Error('nope'))).toBe(false);
  });
});

describe('syncProductErpSkuRegistry', () => {
  it('no-ops when SKU unchanged (repeat save)', async () => {
    const tx = {
      erpSkuRegistry: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };
    await syncProductErpSkuRegistry(tx as never, 'p1', 'BQ-1', 'BQ-1');
    expect(tx.erpSkuRegistry.deleteMany).not.toHaveBeenCalled();
    expect(tx.erpSkuRegistry.create).not.toHaveBeenCalled();
  });

  it('releases registry row when clearing SKU', async () => {
    const tx = {
      erpSkuRegistry: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    await syncProductErpSkuRegistry(tx as never, 'p1', 'BQ-1', null);
    expect(tx.erpSkuRegistry.deleteMany).toHaveBeenCalledWith({
      where: { ownerKind: 'PRODUCT', ownerId: 'p1' },
    });
    expect(tx.erpSkuRegistry.create).not.toHaveBeenCalled();
  });

  it('claims new SKU after releasing previous on reassign', async () => {
    const tx = {
      erpSkuRegistry: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    await syncProductErpSkuRegistry(tx as never, 'p1', 'BQ-1', 'BQ-2');
    expect(tx.erpSkuRegistry.deleteMany).toHaveBeenCalled();
    expect(tx.erpSkuRegistry.create).toHaveBeenCalledWith({
      data: { sku: 'BQ-2', ownerKind: 'PRODUCT', ownerId: 'p1' },
    });
  });

  it('maps concurrent claim to ConflictException', async () => {
    const tx = {
      erpSkuRegistry: {
        deleteMany: jest.fn(),
        create: jest.fn().mockRejectedValue(p2002('erp_sku_registry_pkey')),
      },
    };
    await expect(syncProductErpSkuRegistry(tx as never, 'p1', null, 'BQ-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('claimOptionValueErpSkus concurrent assignment', () => {
  it('fails the second owner when registry PK is taken', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(p2002(['sku']));
    const tx = { erpSkuRegistry: { create } };

    await claimOptionValueErpSkus(tx as never, [{ ownerId: 'ov1', sku: 'WRAP-1' }]);
    await expect(
      claimOptionValueErpSkus(tx as never, [{ ownerId: 'ov2', sku: 'WRAP-1' }]),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
