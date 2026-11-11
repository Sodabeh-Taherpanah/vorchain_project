/**
 * Peak memory of loading a large export, whole-file versus streamed (backlog V-13a). Each run is a
 * separate process so `maxRSS` belongs to one strategy only.
 *
 *   node scripts/measure-memory.ts prepare <dir> <demandRows>   write the five CSV files
 *   node scripts/measure-memory.ts whole <dir>                  readFile -> parseFile -> loadTables
 *   node scripts/measure-memory.ts stream <dir> [chunkBytes]    file chunks -> loadSources
 *
 * Prints one JSON line. Node main thread, so it is the worst case for the demo's worker.
 */
import {
  createReadStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { analyse } from '@vorchain/engine';
import { loadSources, loadTables, parseFile, type ChunkSource } from '@vorchain/parsers';

import { generateScaleDataset } from '../src/scale.ts';

const [mode, dir, extra] = process.argv.slice(2);
if (dir === undefined) throw new Error('usage: measure-memory.ts <prepare|whole|stream> <dir> ...');

const mb = (kb: number): number => Math.round(kb / 1024);

function fileSource(path: string, chunkBytes: number): ChunkSource {
  return {
    name: path.split('/').pop() ?? path,
    size: statSync(path).size,
    async *open() {
      for await (const chunk of createReadStream(path, { highWaterMark: chunkBytes })) {
        yield chunk as Uint8Array;
      }
    },
  };
}

if (mode === 'prepare') {
  const demandRows = Number(extra);
  mkdirSync(dir, { recursive: true });
  const dataset = generateScaleDataset({
    materials: Math.round(demandRows / 5),
    demandRows,
    seed: 2026,
  });
  for (const file of dataset.files) writeFileSync(join(dir, file.name), file.content);
  writeFileSync(join(dir, 'as-of.txt'), dataset.asOf);
} else {
  const files = readdirSync(dir).filter((f) => f.endsWith('.csv'));
  const asOf = readFileSync(join(dir, 'as-of.txt'), 'utf8').trim();
  const start = performance.now();
  let loaded;
  if (mode === 'whole') {
    const tables = [];
    for (const name of files) {
      const parsed = await parseFile({
        name,
        bytes: new Uint8Array(readFileSync(join(dir, name))),
      });
      if (!parsed.ok) throw new Error(parsed.error.code);
      tables.push(parsed.value);
    }
    loaded = loadTables(tables);
  } else {
    const chunkBytes = Number(extra ?? 65_536);
    loaded = await loadSources(files.map((name) => fileSource(join(dir, name), chunkBytes)));
  }
  const loadMs = Math.round(performance.now() - start);
  if (loaded.input === null) throw new Error(JSON.stringify(loaded.errors));
  const peakAfterLoadMb = mb(process.resourceUsage().maxRSS);
  const report = analyse(loaded.input, { asOf: asOf as never, horizonDays: 28 });
  console.log(
    JSON.stringify({
      mode,
      loadMs,
      peakAfterLoadMb,
      peakAfterAnalyseMb: mb(process.resourceUsage().maxRSS),
      demandRows: loaded.input.demand.length,
      exceptions: report.exceptions.length,
    }),
  );
}
