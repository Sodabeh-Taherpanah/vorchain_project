import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  materialId,
  poId,
  supplierId,
  type MaterialId,
  type PoId,
  type SupplierId,
} from './ids.ts';

describe('branded identifiers', () => {
  it.each([
    ['materialId', materialId],
    ['supplierId', supplierId],
    ['poId', poId],
  ])('%s() keeps the raw string value unchanged', (_name, brand) => {
    expect(brand('M0001')).toBe('M0001');
    expect(brand('')).toBe('');
  });

  it('produces distinct nominal types that cannot be mixed up', () => {
    expectTypeOf(materialId('M1')).toEqualTypeOf<MaterialId>();
    expectTypeOf(supplierId('S1')).toEqualTypeOf<SupplierId>();
    expectTypeOf(poId('P1')).toEqualTypeOf<PoId>();
    expectTypeOf<MaterialId>().not.toEqualTypeOf<SupplierId>();
    expectTypeOf<SupplierId>().not.toEqualTypeOf<PoId>();
    // A plain string is not assignable to a branded ID.
    expectTypeOf<string>().not.toExtend<MaterialId>();
    // A branded ID is still usable wherever a string is expected.
    expectTypeOf<MaterialId>().toExtend<string>();
  });
});
