/**
 * The demo's current data source. Uploads are kept as `File` handles only: the page never reads
 * their content, it hands them to the worker (ADR-0003).
 */
export type DataSource =
  | { readonly kind: 'none' }
  | { readonly kind: 'sample' }
  | { readonly kind: 'files'; readonly files: readonly File[] };

export const NO_SOURCE: DataSource = { kind: 'none' };

/**
 * Adds files to the current selection. A file with the same name as a selected one replaces it,
 * so a corrected export can simply be dropped again.
 */
export function addFiles(current: readonly File[], added: readonly File[]): readonly File[] {
  const addedNames = new Set(added.map((file) => file.name));
  const unique = added.filter(
    (file, index) => added.findLastIndex((f) => f.name === file.name) === index,
  );
  return [...current.filter((file) => !addedNames.has(file.name)), ...unique];
}

/** The selection without the file at `index`. */
export function removeFileAt(files: readonly File[], index: number): readonly File[] {
  return files.filter((_file, i) => i !== index);
}
