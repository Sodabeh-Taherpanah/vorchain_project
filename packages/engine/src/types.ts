/**
 * Engine contract (architecture §7). Everything here is plain, JSON-serialisable data so the same
 * types can cross the Web Worker boundary now and an HTTP boundary in Phase 2. Field comments name
 * the prototype column or variable each field comes from.
 */
import type { IsoDate } from './dates.ts';
import type { MaterialId, PoId, SupplierId } from './ids.ts';

// ------------------------------------------------------------------ input

/** One row of the materials table. File order matters: it breaks score ties in the ranking. */
export interface Material {
  readonly materialId: MaterialId;
  /** Free text from the ERP; `''` when the column is missing (prototype default). */
  readonly description: string;
  /** Supplier to order from when no open PO exists; `null` when unknown. */
  readonly mainSupplierId: SupplierId | null;
  /** Stock on hand at `asOf`, in the material's unit. */
  readonly onHand: number;
  /** Safety stock; `0` when missing or empty (prototype: `m.get("safety_stock", 0.0) or 0.0`). */
  readonly safetyStock: number;
  /** Unit of measure for display only (e.g. `Stk`, `kg`); `null` when missing. */
  readonly unit: string | null;
}

/** One open purchase order line (`open_purchase_orders`). */
export interface PurchaseOrder {
  readonly poId: PoId;
  readonly materialId: MaterialId;
  readonly supplierId: SupplierId;
  readonly qty: number;
  /** Delivery date the supplier promised; the ERP plans with this date. */
  readonly promisedDate: IsoDate;
}

/** One demand line (`demand`). Several lines on the same day are summed. */
export interface DemandLine {
  readonly materialId: MaterialId;
  readonly date: IsoDate;
  readonly qty: number;
}

/** One past delivery (`supplier_history`), the basis of the supplier delay statistics. */
export interface DeliveryRecord {
  readonly supplierId: SupplierId;
  /** Rows where either date is `null` are skipped by the statistics, as in the prototype. */
  readonly promisedDate: IsoDate | null;
  readonly actualDate: IsoDate | null;
  readonly poId: PoId | null;
}

/** Optional supplier master data. Only the UI uses `name`; the engine output stays ID-based. */
export interface Supplier {
  readonly supplierId: SupplierId;
  readonly name: string;
}

/** Validated tables produced by `@vorchain/parsers` (or the test loader in P1-06). */
export interface AnalysisInput {
  /** File order matters: it is the tie-break of the stable ranking (ADR-0005 item 2). */
  readonly materials: readonly Material[];
  /** File order matters: explanations list POs in this order (ADR-0005 item 8). */
  readonly openPurchaseOrders: readonly PurchaseOrder[];
  readonly demand: readonly DemandLine[];
  readonly supplierHistory: readonly DeliveryRecord[];
  /** The suppliers table is optional; pass `[]` when it is missing. */
  readonly suppliers: readonly Supplier[];
}

/** Analysis parameters. `asOf` is always passed in: the engine never reads the clock. */
export interface AnalysisOptions {
  /** "Today" of the ERP export; day 0 of the projection window. */
  readonly asOf: IsoDate;
  /** Length of the projection window `[asOf, asOf + horizonDays)` in calendar days (default 28 in the UI). */
  readonly horizonDays: number;
  /** Deliveries needed before a supplier's statistics count as reliable. Default `3`. */
  readonly minReliableDeliveries?: number;
}

// ------------------------------------------------------------------ output

/** `CRITICAL`: projected stock goes below zero. `WARNING`: below safety stock, not below zero. */
export type Severity = 'CRITICAL' | 'WARNING';

/**
 * Delivery reliability of one supplier, measured in signed working days (promised to actual).
 * Maps to the prototype's `supplier_stats` entry: `mean`, `p80`, `on_time_rate`, `n`,
 * `reliable_stats`.
 */
export interface SupplierStats {
  readonly supplierId: SupplierId;
  /** Mean delay in working days, unrounded (negative means early on average). */
  readonly meanDelayDays: number;
  /** 80th-percentile delay: `max(0, pyRound(p80))` working days. Used to shift PO receipts. */
  readonly p80DelayDays: number;
  /** Share of deliveries with delay ≤ 0, from 0 to 1. */
  readonly onTimeRate: number;
  /** Number of deliveries with both dates set (prototype `n`). */
  readonly deliveries: number;
  /** `deliveries >= minReliableDeliveries`; otherwise explanations flag low confidence. */
  readonly reliable: boolean;
}

/** Why a material is at risk: a code plus parameters, rendered by the UI via i18n. */
export type Reason =
  | { readonly code: 'NO_OPEN_PO' }
  | { readonly code: 'PO_AFTER_CRITICAL'; readonly poId: PoId; readonly promisedDate: IsoDate }
  | {
      readonly code: 'PO_LATE';
      readonly poId: PoId;
      readonly promisedDate: IsoDate;
      readonly supplierId: SupplierId;
      /** The supplier's P80 delay in working days. */
      readonly delayDays: number;
      readonly onTimeRate: number;
      /** True when the supplier's statistics are not `reliable`. */
      readonly lowConfidence: boolean;
      readonly deliveries: number;
    }
  | { readonly code: 'HIDDEN_ERP_LATER'; readonly erpViewDate: IsoDate }
  | { readonly code: 'HIDDEN_ERP_NONE' };

/** What the planner should do next: a code plus parameters, rendered by the UI via i18n. */
export type Action =
  | { readonly code: 'PLACE_ORDER'; readonly supplierId: SupplierId | null }
  | {
      readonly code: 'PULL_FORWARD';
      readonly supplierId: SupplierId;
      readonly poId: PoId;
      readonly before: IsoDate;
    }
  | { readonly code: 'EXPEDITE'; readonly poId: PoId; readonly before: IsoDate }
  | { readonly code: 'REVIEW_QTY_OR_DEMAND' };

/** One material that runs short in the realistic view within the horizon. */
export interface ShortageException {
  readonly materialId: MaterialId;
  readonly description: string;
  readonly mainSupplierId: SupplierId | null;
  readonly severity: Severity;
  /** First realistic stock-out day (`CRITICAL`) or first below-safety day (`WARNING`). */
  readonly criticalDate: IsoDate;
  /** ERP-view date of the same kind as `criticalDate`; `null` if the ERP view shows no problem. */
  readonly erpViewDate: IsoDate | null;
  /** Calendar days from `asOf` to `criticalDate`. */
  readonly daysUntil: number;
  /** Lowest realistic projected stock in the window, `pyRound(x)`. */
  readonly minProjectedStock: number;
  /**
   * The material's safety stock as `pyRound(x)`, like the prototype's `safety_stock` output column.
   * Display only: the projection and the score use the unrounded `Material.safetyStock`.
   */
  readonly safetyStock: number;
  /** `erpViewDate === null || erpViewDate > criticalDate`: the ERP does not show this risk yet. */
  readonly hidden: boolean;
  /** Ranking score, `pyRound(x, 1)` (spec §5.2 step 8). */
  readonly score: number;
  readonly reasons: readonly Reason[];
  readonly actions: readonly Action[];
}

/** Result of one analysis run. */
export interface Report {
  readonly asOf: IsoDate;
  readonly horizonDays: number;
  readonly summary: {
    readonly critical: number;
    readonly warning: number;
    readonly hidden: number;
  };
  /** Sorted by `score` descending; ties keep materials-file order (stable sort). */
  readonly exceptions: readonly ShortageException[];
  /**
   * One entry per supplier with at least one complete history row, in order of the supplier's
   * first complete row (the prototype's dict order). The golden files sort by `supplierId`, so the
   * parity test sorts before comparing, and the UI sorts its own table. Suppliers without usable
   * history are absent.
   */
  readonly supplierStats: readonly SupplierStats[];
}

/** Stock of one material on one day of the projection window, after receipts and demand. */
export interface ProjectionPoint {
  readonly date: IsoDate;
  /** Demand consumed on this day. */
  readonly demand: number;
  /** Receipts on this day if every PO arrives on its promised date. */
  readonly erpReceipts: number;
  /** Receipts on this day if every PO arrives with its supplier's P80 delay. */
  readonly realisticReceipts: number;
  /** End-of-day stock in the ERP view. */
  readonly erpStock: number;
  /** End-of-day stock in the realistic view. */
  readonly realisticStock: number;
}

/** Day-by-day projection of one material in both views, for the detail chart and table. */
export interface ProjectionSeries {
  readonly materialId: MaterialId;
  readonly safetyStock: number;
  /** One point per calendar day of `[asOf, asOf + horizonDays)`. */
  readonly points: readonly ProjectionPoint[];
}
