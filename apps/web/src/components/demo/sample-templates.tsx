'use client';

import { Download } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button.tsx';

interface Template {
  readonly name: string;
  readonly url: string;
}

/**
 * The sample files as download templates. They are built here from the bundled sample data as
 * Blob URLs, so nothing is fetched; the data module itself is only loaded on the first click.
 */
export function SampleTemplates() {
  const t = useTranslations('demo.dataSource');
  const locale = useLocale();
  const listId = useId();
  const [templates, setTemplates] = useState<readonly Template[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(
    () => () => {
      for (const template of templates ?? []) URL.revokeObjectURL(template.url);
    },
    [templates],
  );

  async function toggle() {
    if (templates === null) {
      const { sampleDatasets } = await import('@vorchain/sample-data');
      setTemplates(
        sampleDatasets[locale].files.map((file) => ({
          name: file.name,
          url: URL.createObjectURL(new Blob([file.content], { type: 'text/csv;charset=utf-8' })),
        })),
      );
    }
    setOpen((wasOpen) => !wasOpen);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="link"
        className="h-auto px-0"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => void toggle()}
      >
        <Download aria-hidden />
        {t('templates')}
      </Button>
      <ul id={listId} hidden={!open} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {templates?.map((template) => (
          <li key={template.name}>
            <a
              href={template.url}
              download={template.name}
              className="text-primary underline underline-offset-4"
            >
              {template.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
