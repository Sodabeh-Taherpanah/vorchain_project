import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet.tsx';

function Example({ showCloseButton }: { showCloseButton?: boolean }) {
  return (
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent
        closeLabel="Close"
        {...(showCloseButton === undefined ? {} : { showCloseButton })}
      >
        <SheetHeader>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>More about it</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>Done</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('opens as a labelled dialog and closes with the translated close button', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect(dialog.dataset.side).toBe('right');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can hide the close button', async () => {
    const user = userEvent.setup();
    render(<Example showCloseButton={false} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('closes from a custom close control in the footer', async () => {
    const user = userEvent.setup();
    render(<Example showCloseButton={false} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
