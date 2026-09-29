declare const brand: unique symbol;

/**
 * Nominal ("branded") string type. The brand exists only at compile time, so a `MaterialId`
 * cannot be passed where a `SupplierId` is expected, while the runtime value stays a plain string
 * and serialises to JSON unchanged.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Material (article) number as it appears in the ERP export, e.g. `M0001`. */
export type MaterialId = Brand<string, 'MaterialId'>;

/** Supplier number as it appears in the ERP export, e.g. `S01`. */
export type SupplierId = Brand<string, 'SupplierId'>;

/** Purchase order number as it appears in the ERP export, e.g. `PO4711`. */
export type PoId = Brand<string, 'PoId'>;

/**
 * Brands a raw material number. The engine does not validate IDs: trimming and emptiness checks
 * belong to the parsers, which are the only producers of engine input.
 */
export function materialId(raw: string): MaterialId {
  return raw as MaterialId;
}

/** Brands a raw supplier number (see {@link materialId} for the validation boundary). */
export function supplierId(raw: string): SupplierId {
  return raw as SupplierId;
}

/** Brands a raw purchase order number (see {@link materialId} for the validation boundary). */
export function poId(raw: string): PoId {
  return raw as PoId;
}
