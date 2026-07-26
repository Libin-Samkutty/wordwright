import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { resetDictionaryCache } from './dictionary';
import { DICTIONARY_REGISTRY } from './dictionary/registry';
import type { WordLength } from './engine';
import { FIXTURE_LISTS } from './test/fixtures';
import { renderWithProviders } from './test/renderWithProviders';

describe('App landmarks (A11Y-12)', () => {
  beforeEach(() => {
    resetDictionaryCache();
    localStorage.clear();
    vi.spyOn(
      DICTIONARY_REGISTRY as Record<WordLength, () => Promise<unknown>>,
      5,
    ).mockResolvedValue(FIXTURE_LISTS[5]);
  });

  afterEach(() => {
    resetDictionaryCache();
    vi.restoreAllMocks();
  });

  it('exposes banner, main and contentinfo landmarks', async () => {
    renderWithProviders(<App />);

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('has exactly one level-one heading', async () => {
    renderWithProviders(<App />);

    const headings = await screen.findAllByRole('heading', { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Wordwright');
  });
});
