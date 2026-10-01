import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Stat, StatGroup } from './stat.tsx';

describe('Stat', () => {
  it('pairs a label (term) with a tabular value (definition) inside a group', () => {
    render(
      <StatGroup>
        <Stat label="Hidden risks" value="3" hint="ERP shows 0" tone="signal" />
        <Stat label="Materials" value="1,240" />
      </StatGroup>,
    );
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Hidden risks',
      'Materials',
    ]);
    const [value] = screen.getAllByRole('definition');
    expect(value?.textContent).toBe('3');
    expect(value?.className).toMatch(/tabular-nums.*text-signal-strong/);
    expect(screen.getByText('ERP shows 0')).toBeDefined();
  });

  it.each([
    ['critical', 'text-critical'],
    ['ok', 'text-ok'],
  ] as const)('colours the value for the %s tone', (tone, colour) => {
    render(
      <StatGroup>
        <Stat label="x" value="1" tone={tone} />
      </StatGroup>,
    );
    expect(screen.getByRole('definition').className).toContain(colour);
  });
});
