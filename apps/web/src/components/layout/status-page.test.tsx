import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusPage } from './status-page.tsx';

describe('StatusPage', () => {
  it.each(['not-found', 'error'] as const)(
    'renders one h1 and a decorative %s illustration hidden from assistive technology',
    (illustration) => {
      const { container } = render(
        <StatusPage
          code="Code"
          title="Titel"
          description="Beschreibung"
          illustration={illustration}
          footnote="ID 1"
        >
          <button type="button">Zurück</button>
        </StatusPage>,
      );

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Zurück' })).toBeDefined();
      expect(screen.getByText('ID 1')).toBeDefined();
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    },
  );
});
