'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { Button } from '@/components/ui/button.tsx';

/** File types the parsers read (P1-10); others are rejected there with a specific message. */
export const ACCEPTED_FILE_TYPES = '.csv,.xlsx';

interface FileDropzoneProps {
  /** Called with the chosen or dropped files; never with an empty list. */
  readonly onFiles: (files: readonly File[]) => void;
}

/**
 * Drop area plus a real button that opens the file picker, so keyboard users get Enter/Space for
 * free. Only `File` handles are passed on; nothing here reads a file's content.
 */
export function FileDropzone({ onFiles }: FileDropzoneProps) {
  const t = useTranslations('demo.dataSource');
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);

  function handOver(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    handOver(event.target.files);
    // Lets the user pick the same file again after fixing it.
    event.target.value = '';
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    // Without this the browser would open the dropped file instead of handing it to the page.
    event.preventDefault();
    setDragging(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    handOver(event.dataTransfer.files);
  }

  return (
    <div
      data-dragging={dragging}
      onDragOver={onDragOver}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
      className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-input p-6 text-center transition-colors data-[dragging=true]:border-primary data-[dragging=true]:bg-muted motion-reduce:transition-none"
    >
      <Upload aria-hidden className="size-6 text-muted-foreground" />
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
      >
        {t('chooseFiles')}
      </Button>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t('dropHint')}
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        hidden
        onChange={onChange}
        data-testid="file-input"
      />
    </div>
  );
}
