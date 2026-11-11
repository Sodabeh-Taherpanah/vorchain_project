/**
 * Loads uploaded files from chunk sources straight to engine input (backlog V-13a): CSV files are
 * streamed and validated row by row, XLSX files are read whole (SheetJS cannot stream; the unpacked
 * size limit of `XLSX_LIMITS` bounds them). Result equals `parseFile` + `loadTables`.
 */
import {
  beginTable,
  combineLoaded,
  type LoadedFile,
  type LoadResult,
  type TableInProgress,
} from './assemble.ts';
import { streamCsv, type ChunkSource } from './csv-stream.ts';
import type { DataError } from './errors.ts';
import { rejectBeforeReading } from './file.ts';
import { isWorkbookContainer, readXlsx } from './xlsx.ts';

/** The first `count` bytes of a source (fewer for a short file), without reading the rest. */
async function firstBytes(source: ChunkSource, count: number): Promise<Uint8Array> {
  const head = new Uint8Array(count);
  let filled = 0;
  for await (const chunk of source.open()) {
    const part = chunk.subarray(0, count - filled);
    head.set(part, filled);
    filled += part.byteLength;
    if (filled >= count) break;
  }
  return head.subarray(0, filled);
}

async function readAll(source: ChunkSource): Promise<Uint8Array> {
  const whole = new Uint8Array(source.size);
  let at = 0;
  for await (const chunk of source.open()) {
    whole.set(chunk.subarray(0, whole.byteLength - at), at);
    at += chunk.byteLength;
  }
  return whole.subarray(0, Math.min(at, whole.byteLength));
}

type Loaded = { readonly file: LoadedFile } | { readonly error: DataError };

async function loadWorkbook(source: ChunkSource): Promise<Loaded> {
  const read = await readXlsx({ name: source.name, bytes: await readAll(source) });
  if (!read.ok) return { error: read.error };
  const begun = beginTable(read.value);
  if ('settled' in begun) return { file: begun.settled };
  for (const row of read.value.rows) begun.inProgress.push(row);
  return { file: begun.inProgress.finish() };
}

async function loadCsv(source: ChunkSource): Promise<Loaded> {
  const state: { current: LoadedFile | TableInProgress | null } = { current: null };
  const result = await streamCsv(source, {
    onHead(head) {
      const begun = beginTable(head);
      state.current = 'settled' in begun ? begun.settled : begun.inProgress;
    },
    onRows(rows) {
      const { current } = state;
      if (current === null || !('push' in current)) return;
      for (const row of rows) current.push(row);
    },
  });
  if (!result.ok) return { error: result.error };
  const { current } = state;
  // `streamCsv` succeeds only after `onHead` ran, so `current` is set.
  if (current === null) throw new Error('load-sources: no header');
  return { file: 'push' in current ? current.finish() : current };
}

async function loadSource(source: ChunkSource): Promise<Loaded> {
  const rejected = rejectBeforeReading(source.name, source.size);
  if (rejected !== null) return { error: rejected };
  const head = await firstBytes(source, 8);
  return isWorkbookContainer(head) ? loadWorkbook(source) : loadCsv(source);
}

/**
 * Loads files one after another (so only one file's rows are in flight) into engine input.
 * File-level errors (`NOT_TEXT`, `EMPTY_FILE`, quote errors, size, type) come first, then the
 * table errors; `input` is `null` if there is any, as with `parseFile` + `loadTables`.
 */
export async function loadSources(sources: readonly ChunkSource[]): Promise<LoadResult> {
  const loaded: Loaded[] = [];
  for (const source of sources) loaded.push(await loadSource(source));
  const files = loaded.flatMap((l) => ('file' in l ? [l.file] : []));
  const fileErrors = loaded.flatMap((l) => ('error' in l ? [l.error] : []));
  const result = combineLoaded(files);
  if (fileErrors.length === 0) return result;
  return { ...result, errors: [...fileErrors, ...result.errors], input: null };
}
