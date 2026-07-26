import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useFocusTrap } from './useFocusTrap';

function Trapped({ isOpen, empty = false }: { isOpen: boolean; empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, isOpen);

  return (
    <div ref={ref} data-testid="panel">
      {empty ? (
        <p>Nothing focusable here</p>
      ) : (
        <>
          <button type="button">First</button>
          <button type="button">Second</button>
          <button type="button">Third</button>
        </>
      )}
    </div>
  );
}

function Harness() {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      <button type="button">Outside</button>
      {isOpen ? <Trapped isOpen /> : null}
      {isOpen ? (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
        >
          Close
        </button>
      ) : null}
    </>
  );
}

describe('useFocusTrap (FR-57, A11Y-11)', () => {
  it('focuses the first focusable element on open', () => {
    render(<Trapped isOpen />);

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('does nothing while closed', () => {
    render(<Trapped isOpen={false} />);

    expect(screen.getByRole('button', { name: 'First' })).not.toHaveFocus();
  });

  it('cycles forward from the last element back to the first', async () => {
    const user = userEvent.setup();
    render(<Trapped isOpen />);

    screen.getByRole('button', { name: 'Third' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('cycles backward from the first element to the last', async () => {
    const user = userEvent.setup();
    render(<Trapped isOpen />);

    screen.getByRole('button', { name: 'First' }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
  });

  it('leaves interior tab stops to the browser', async () => {
    const user = userEvent.setup();
    render(<Trapped isOpen />);

    screen.getByRole('button', { name: 'First' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
  });

  it('restores focus to the previously focused element on close', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    await user.click(open);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(open).toHaveFocus();
  });

  it('does not throw when the container holds nothing focusable', async () => {
    const user = userEvent.setup();
    render(<Trapped isOpen empty />);

    await expect(user.tab()).resolves.not.toThrow();
  });
});
