import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAX_GUESSES, WORD_LENGTHS, type WordLength } from '@/engine';

import { HELP_EXAMPLES, HelpModal } from './HelpModal';

describe('HelpModal (FR-60, A11Y-13)', () => {
  it('renders nothing while closed', () => {
    render(<HelpModal isOpen={false} wordLength={5} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a labelled dialog (A11Y-11)', () => {
    render(<HelpModal isOpen wordLength={5} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /how to play/i })).toBeInTheDocument();
  });

  it('states the guess count from the engine (FR-60)', () => {
    render(<HelpModal isOpen wordLength={5} onClose={vi.fn()} />);

    expect(screen.getByText(new RegExp(`${String(MAX_GUESSES)} tries`))).toBeInTheDocument();
  });

  it.each(WORD_LENGTHS)('states the active word length for a %i-letter game (FR-60)', (length) => {
    render(<HelpModal isOpen wordLength={length} onClose={vi.fn()} />);

    expect(screen.getByText(new RegExp(`valid ${String(length)} letter word`))).toBeInTheDocument();
  });

  it('shows one worked example per tile state (AC-23)', () => {
    render(<HelpModal isOpen wordLength={5} onClose={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.getByText(/right spot/)).toBeInTheDocument();
    expect(screen.getByText(/wrong spot/)).toBeInTheDocument();
    expect(screen.getByText(/not in the word/)).toBeInTheDocument();
  });

  it('renders one example tile per letter (AC-23)', () => {
    render(<HelpModal isOpen wordLength={6} onClose={vi.fn()} />);

    for (const item of screen.getAllByRole('listitem')) {
      // The tile row is the only `aria-hidden` block inside each example.
      const tiles = item.querySelector('[aria-hidden="true"]');
      expect(tiles?.children).toHaveLength(6);
    }
  });

  it('exposes no grid semantics (A11Y-13)', () => {
    render(<HelpModal isOpen wordLength={5} onClose={vi.fn()} />);

    // Regression test for not reusing `Tile`: its `role="gridcell"` outside a
    // grid/row ancestry is a critical axe violation.
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0);
    expect(screen.queryAllByRole('grid')).toHaveLength(0);
  });

  it('shows non-colour markers in the colourblind palette (A11Y-8)', () => {
    document.documentElement.dataset.palette = 'cb';
    render(<HelpModal isOpen wordLength={5} onClose={vi.fn()} />);

    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('◐')).toBeInTheDocument();
  });

  it('closes via the close button (FR-57)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<HelpModal isOpen wordLength={5} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('every example word matches its declared length', () => {
    for (const length of WORD_LENGTHS as readonly WordLength[]) {
      for (const example of HELP_EXAMPLES[length]) {
        expect(example.word).toHaveLength(length);
        expect(example.index).toBeGreaterThanOrEqual(0);
        expect(example.index).toBeLessThan(length);
      }
    }
  });
});
