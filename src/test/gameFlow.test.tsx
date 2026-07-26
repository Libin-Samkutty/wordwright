import { screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { resetDictionaryCache } from '@/dictionary';
import { DICTIONARY_REGISTRY } from '@/dictionary/registry';
import type { WordLength } from '@/engine';

import { FIXTURE_LISTS } from './fixtures';
import { renderWithProviders } from './renderWithProviders';

/**
 * End-to-end flows through the real provider stack (T-44).
 *
 * Everything is driven through the DOM, using accessible queries only, so
 * these tests double as an accessibility check: if a control cannot be found
 * by role or label, a screen-reader user cannot find it either.
 */

/**
 * Runs the suite with motion reduced.
 *
 * The reveal stagger is real time — 1.5s for a 5-letter row — which would make
 * every assertion race a timer. Reduced motion collapses it to zero, exactly
 * as it does for a player who asks for it, so these tests are fast and
 * deterministic. The stagger itself is covered by `useRevealTimeline`'s own
 * unit tests with fake timers.
 */
function useReducedMotion(): void {
  localStorage.setItem(
    'wordwright:v1:settings',
    JSON.stringify({ theme: 'system', colorblind: false, motion: 'reduced', defaultWordLength: 5 }),
  );
}

/** Forces a known answer so wins are reproducible. */
function useFixtureDictionary(answer: string, length: WordLength = 5): void {
  const lists = FIXTURE_LISTS[length];
  vi.spyOn(
    DICTIONARY_REGISTRY as Record<WordLength, () => Promise<unknown>>,
    length,
  ).mockResolvedValue({ ...lists, answers: [answer] });
}

type User = ReturnType<typeof userEvent.setup>;

/** Types a word using the on-screen keyboard, as a touch player would. */
async function typeWord(user: User, word: string): Promise<void> {
  for (const letter of word) {
    await user.click(await screen.findByRole('button', { name: new RegExp(`^${letter}(,|$)`) }));
  }
}

async function pressEnter(user: User): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Enter' }));
}

/** Waits for the reveal to finish and input to unlock. */
async function settle(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Enter' })).not.toBeDisabled();
  });
}

describe('game flow', () => {
  beforeEach(() => {
    resetDictionaryCache();
    localStorage.clear();
    useReducedMotion();
  });

  afterEach(() => {
    // Order matters: drop the memoised dictionary first, then restore the spy.
    // Otherwise the cached fixture survives into the next test while the real
    // registry entry is back in place.
    resetDictionaryCache();
    vi.restoreAllMocks();
  });

  it('renders the board and keyboard once the dictionary loads', async () => {
    useFixtureDictionary('CRANE');
    renderWithProviders(<App />);

    expect(await screen.findByRole('grid', { name: 'Guess board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backspace' })).toBeInTheDocument();
  });

  it('shows a loading state before the dictionary resolves (FR-56)', () => {
    useFixtureDictionary('CRANE');
    renderWithProviders(<App />);

    expect(screen.getByText('Loading dictionary…')).toBeInTheDocument();
  });

  it('renders six rows of the chosen word length (FR-50)', async () => {
    useFixtureDictionary('CRANE');
    renderWithProviders(<App />);

    const grid = await screen.findByRole('grid', { name: 'Guess board' });
    const rows = within(grid).getAllByRole('row');

    expect(rows).toHaveLength(6);
    expect(within(rows[0] as HTMLElement).getAllByRole('gridcell')).toHaveLength(5);
  });

  it('types letters onto the board via the on-screen keyboard (FR-10)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid', { name: 'Guess board' });

    await typeWord(user, 'CRAN');

    const firstRow = within(await screen.findByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    const cells = within(firstRow).getAllByRole('gridcell');

    expect(cells[0]).toHaveAccessibleName(/letter 1: C, entered/);
    expect(cells[3]).toHaveAccessibleName(/letter 4: N, entered/);
    expect(cells[4]).toHaveAccessibleName(/letter 5: empty, empty/);
  });

  it('rejects a short guess without consuming a turn (FR-14, AC-4)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRA');
    await pressEnter(user);

    // The message appears twice by design: the visible toast and the
    // assertive live region that announces it (A11Y-4).
    expect(await screen.findByRole('button', { name: /Not enough letters/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Not enough letters');

    // The letters are still in row 1 — no turn was used.
    const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    expect(within(firstRow).getAllByRole('gridcell')[0]).toHaveAccessibleName(/C, entered/);
  });

  it('rejects a word that is not in the list (FR-15, AC-5)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    // Valid length, absent from the fixture guess list.
    await typeWord(user, 'BLAME');
    await pressEnter(user);

    expect(await screen.findByRole('button', { name: /Not in word list/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Not in word list');
  });

  it('evaluates a submitted guess and colours the tiles (AC-1)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'SLOTH');
    await pressEnter(user);
    await settle();

    const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    for (const cell of within(firstRow).getAllByRole('gridcell')) {
      expect(cell).toHaveAccessibleName(/not in word/);
    }
  });

  it('plays through to a win and shows the result panel (AC-6)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRANE');
    await pressEnter(user);

    expect(await screen.findByRole('heading', { name: 'You won!' })).toBeInTheDocument();
    expect(screen.getByText(/Solved in 1 guess/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
  });

  it('announces the win to screen readers (A11Y-5)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRANE');
    await pressEnter(user);

    await screen.findByRole('heading', { name: 'You won!' });

    // The result panel and the live region are written by separate effects,
    // so wait for the announcement rather than assuming it lands in the same
    // commit as the heading.
    expect(await screen.findByText('You won in 1 guess.')).toBeInTheDocument();
  });

  it('announces every evaluated guess, including the first (A11Y-3)', async () => {
    // Regression: two effects once fought over the "already announced"
    // counter, and the reset effect ran on every guess. That marked each
    // guess announced before the announcing effect saw it, silently dropping
    // the announcement for screen-reader users.
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'SLOTH');
    await pressEnter(user);

    expect(await screen.findByText(/^SLOTH:/)).toHaveTextContent(
      'SLOTH: S not in word, L not in word, O not in word, T not in word, H not in word. 5 guesses remaining.',
    );

    await settle();
    await typeWord(user, 'ABBEY');
    await pressEnter(user);

    expect(await screen.findByText(/^ABBEY:/)).toHaveTextContent('4 guesses remaining.');
  });

  it('reveals the answer after six wrong guesses (AC-7)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    for (let i = 0; i < 6; i += 1) {
      await typeWord(user, 'SLOTH');
      await pressEnter(user);
      if (i < 5) await settle();
    }

    expect(await screen.findByRole('heading', { name: 'Out of guesses' })).toBeInTheDocument();
    expect(screen.getByText('CRANE')).toBeInTheDocument();
  });

  it('starts a fresh game from the result panel (AC-8)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRANE');
    await pressEnter(user);

    await user.click(await screen.findByRole('button', { name: 'Play again' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'You won!' })).not.toBeInTheDocument();
    });

    const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    expect(within(firstRow).getAllByRole('gridcell')[0]).toHaveAccessibleName(/empty/);
  });

  it('ignores typing beyond the word length (FR-7, AC-3)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRANE');
    // A sixth letter must be dropped silently.
    await typeWord(user, 'S');

    expect(screen.queryByText('Not enough letters')).not.toBeInTheDocument();
    const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    expect(within(firstRow).getAllByRole('gridcell')).toHaveLength(5);
  });

  it('removes a letter with Backspace (FR-8)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CR');
    await user.click(await screen.findByRole('button', { name: 'Backspace' }));

    const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    expect(within(firstRow).getAllByRole('gridcell')[1]).toHaveAccessibleName(/empty/);
  });

  it('updates keyboard key states after a guess (FR-53)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRANE');
    await pressEnter(user);
    await screen.findByRole('heading', { name: 'You won!' });

    expect(screen.getByRole('button', { name: /^C, correct position/ })).toBeInTheDocument();
  });
});

describe('dictionary failure (EC-14)', () => {
  beforeEach(() => {
    resetDictionaryCache();
    localStorage.clear();
    useReducedMotion();
  });

  afterEach(() => {
    // Order matters: drop the memoised dictionary first, then restore the spy.
    // Otherwise the cached fixture survives into the next test while the real
    // registry entry is back in place.
    resetDictionaryCache();
    vi.restoreAllMocks();
  });

  it('shows an error with a retry that recovers', async () => {
    const spy = vi.spyOn(DICTIONARY_REGISTRY as Record<WordLength, () => Promise<unknown>>, 5);
    spy.mockRejectedValueOnce(new Error('offline'));

    const { user } = renderWithProviders(<App />);

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText(/Couldn't load the word list/)).toBeInTheDocument();

    spy.mockResolvedValue({ ...FIXTURE_LISTS[5], answers: ['CRANE'] });
    await user.click(retry);

    expect(await screen.findByRole('grid', { name: 'Guess board' })).toBeInTheDocument();
  });
});

describe('statistics integration', () => {
  beforeEach(() => {
    resetDictionaryCache();
    localStorage.clear();
    useReducedMotion();
  });

  afterEach(() => {
    // Order matters: drop the memoised dictionary first, then restore the spy.
    // Otherwise the cached fixture survives into the next test while the real
    // registry entry is back in place.
    resetDictionaryCache();
    vi.restoreAllMocks();
  });

  it('shows the empty state before any game (FR-41)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Statistics' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/No games yet/)).toBeInTheDocument();
  });

  it('records a completed win into statistics (AC-6)', async () => {
    useFixtureDictionary('CRANE');
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await typeWord(user, 'CRANE');
    await pressEnter(user);
    await screen.findByRole('heading', { name: 'You won!' });

    await user.click(screen.getByRole('button', { name: 'Statistics' }));

    const dialog = await screen.findByRole('dialog');
    const played = within(dialog).getByText('Played').closest('div');
    expect(played).toHaveTextContent('1');
    expect(within(dialog).getByText('Win %').closest('div')).toHaveTextContent('100%');
  });
});

describe('modals (A11Y-11, FR-57)', () => {
  beforeEach(() => {
    resetDictionaryCache();
    localStorage.clear();
    useReducedMotion();
    useFixtureDictionary('CRANE');
  });

  afterEach(() => {
    // Order matters: drop the memoised dictionary first, then restore the spy.
    // Otherwise the cached fixture survives into the next test while the real
    // registry entry is back in place.
    resetDictionaryCache();
    vi.restoreAllMocks();
  });

  it('opens settings as a labelled modal dialog', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Settings');
  });

  it('closes on Escape and returns focus to the trigger (AC-17)', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    const trigger = screen.getByRole('button', { name: 'Settings' });
    trigger.focus();
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('exposes theme and accessibility controls', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Colourblind mode' })).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Reduce motion' })).toBeInTheDocument();
  });

  it('applies dark theme to the document root (AC-13)', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Dark' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
  });

  it('applies the colourblind palette (AC-14)', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('switch', { name: 'Colourblind mode' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.palette).toBe('cb');
    });
  });
});
