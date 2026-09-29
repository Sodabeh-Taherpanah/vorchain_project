/**
 * Seeded synthetic dataset at the spec's scale (spec §3.3: 20k materials, 100k demand rows), for
 * the performance guard in `analyse.perf.test.ts`. Deterministic: the same options always give
 * the same input, so timings compare like with like.
 */
import { addDays, type IsoDate } from '../dates.ts';
import { materialId, poId, supplierId, type SupplierId } from '../ids.ts';
import type {
  AnalysisInput,
  DeliveryRecord,
  DemandLine,
  Material,
  PurchaseOrder,
} from '../types.ts';

export interface SyntheticInputOptions {
  readonly seed: number;
  readonly asOf: IsoDate;
  readonly horizonDays: number;
  readonly materials: number;
  readonly demandRows: number;
  readonly purchaseOrders: number;
  readonly suppliers: number;
  readonly deliveriesPerSupplier: number;
}

/** mulberry32: a tiny, well-known seeded PRNG returning floats in `[0, 1)`. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return String(n).padStart(6, '0');
}

/** Builds a dataset with demand, POs and history spread over (and just outside) the window. */
export function syntheticInput(options: SyntheticInputOptions): AnalysisInput {
  const random = seededRandom(options.seed);
  const between = (lo: number, hi: number): number => lo + Math.floor(random() * (hi - lo + 1));
  const { asOf, horizonDays } = options;

  const supplierIds: SupplierId[] = Array.from({ length: options.suppliers }, (_, i) =>
    supplierId(`S${pad(i)}`),
  );
  const pickSupplier = (): SupplierId =>
    supplierIds[between(0, supplierIds.length - 1)] ?? supplierId('S?');
  const materialIds = Array.from({ length: options.materials }, (_, i) => materialId(`M${pad(i)}`));
  const pickMaterial = () => materialIds[between(0, materialIds.length - 1)] ?? materialId('M?');

  const materials: Material[] = materialIds.map((id) => ({
    materialId: id,
    description: '',
    mainSupplierId: pickSupplier(),
    onHand: between(0, 600),
    safetyStock: between(0, 4) === 0 ? 0 : between(10, 150),
    unit: null,
  }));
  const demand: DemandLine[] = Array.from({ length: options.demandRows }, () => ({
    materialId: pickMaterial(),
    date: addDays(asOf, between(-3, horizonDays + 3)),
    qty: between(1, 80),
  }));
  const openPurchaseOrders: PurchaseOrder[] = Array.from(
    { length: options.purchaseOrders },
    (_, i) => ({
      poId: poId(`PO${pad(i)}`),
      materialId: pickMaterial(),
      supplierId: pickSupplier(),
      qty: between(20, 400),
      promisedDate: addDays(asOf, between(-10, horizonDays + 10)),
    }),
  );
  const supplierHistory: DeliveryRecord[] = supplierIds.flatMap((id) =>
    Array.from({ length: options.deliveriesPerSupplier }, () => {
      const promisedDate = addDays(asOf, between(-400, -1));
      return {
        supplierId: id,
        promisedDate,
        actualDate: addDays(promisedDate, between(-2, 12)),
        poId: null,
      };
    }),
  );
  return { materials, openPurchaseOrders, demand, supplierHistory, suppliers: [] };
}
