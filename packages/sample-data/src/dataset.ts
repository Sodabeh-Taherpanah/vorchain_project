import type { IsoDate } from '@vorchain/engine';

/** One CSV file as the demo would receive it from an upload: its name and its full text. */
export interface SampleFile {
  readonly name: string;
  /** Exact file text (BOM and line endings included); `TextEncoder` gives the original bytes. */
  readonly content: string;
}

/** A complete set of the five input tables plus the analysis date it was made for. */
export interface SampleDataset {
  readonly asOf: IsoDate;
  readonly files: readonly SampleFile[];
}
