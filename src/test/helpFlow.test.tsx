import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { resetDictionaryCache } from '@/dictionary';
import { DICTIONARY_REGISTRY } from '@/dictionary/registry';
import type { WordLength } from '@/engine';

import { FIXTURE_LISTS } from './fixtures';
import { renderWithProviders } from './renderWithProviders';

/**
 * How to play, driven through the real provider stack (FR-60).
 *
 * The dialog is opened only by the player (ADR-020), so unlike the other
 * modals here there is no storage state to seed or reset.
 */

function useReducedMotion(): void {
  localStorage.setItem(
    'wordwright:v1:settings',
    JSON.stringify({ theme: 'system', colorblind: false, motion: 'reduced', defaultWordLength: 5 }),
  );
}

function useFixtureDictionary(answer: string, length: WordLength = 5): void {
  const lists = FIXTURE_LISTS[length];
  vi.spyOn(
    DICTIONARY_REGISTRY as Record<WordLength, () => Promise<unknown>>,
    length,
  ).mockResolvedValue({ ...lists, answers: [answer] });
}

describe('How to play (FR-60, AC-23)', () => {
  beforeEach(() => {
    resetDictionaryCache();
    localStorage.clear();
    useReducedMotion();
    useFixtureDictionary('CRANE');
  });

  afterEach(() => {
    resetDictionaryCache();
    vi.restoreAllMocks();
  });

  it('opens from the header and Escape returns focus to the trigger (AC-17)', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    const trigger = screen.getByRole('button', { name: 'How to play' });
    trigger.focus();
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('How to play');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('does not let typing while it is open reach the board (EC-7)', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'How to play' }));
    await screen.findByRole('dialog');

    await user.keyboard('CRANE');

    const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
    expect(within(firstRow).getAllByRole('gridcell')[0]).toHaveAccessibleName(/letter 1: empty/);
  });

  it('still lets Enter submit a guess after the dialog is dismissed (FR-57 regression)', async () => {
    // Closing any modal restores focus to its trigger; an earlier version of
    // usePhysicalKeyboard bailed out of Enter for any focused button, which
    // silently broke guess submission for the rest of the session.
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'How to play' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.keyboard('SLOTH{Enter}');

    await waitFor(() => {
      const firstRow = within(screen.getByRole('grid')).getAllByRole('row')[0] as HTMLElement;
      expect(within(firstRow).getAllByRole('gridcell')[0]).toHaveAccessibleName(
        /correct position|wrong position|not in word/,
      );
    });
  });

  it('follows the selected word length (FR-60)', async () => {
    useFixtureDictionary('WORD', 4);
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(within(screen.getByRole('radiogroup')).getByRole('radio', { name: /4/ }));
    await user.click(screen.getByRole('button', { name: 'How to play' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/valid 4 letter word/)).toBeInTheDocument();
  });

  it('is the only open dialog when Settings is opened afterwards (FR-57)', async () => {
    const { user } = renderWithProviders(<App />);
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'How to play' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findAllByRole('dialog')).toHaveLength(1);
  });
});
