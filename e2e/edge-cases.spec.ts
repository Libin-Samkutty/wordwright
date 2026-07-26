import { expect, test, type Page } from '@playwright/test';

/**
 * Edge cases that need a real browser (T-45).
 *
 * The rest of EC-1…EC-21 are covered by unit and integration tests; these are
 * the ones jsdom cannot answer honestly — offline behaviour, real reloads,
 * genuine storage failures, and OS-level preferences.
 */

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
}

/**
 * Starts from a clean slate.
 *
 * Playwright reuses the browser context across tests in a file, so a saved
 * session from an earlier test would restore into the next one and make
 * assertions about a fresh board fail intermittently.
 */
async function freshGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
}

test.describe('offline (NFR-5, AC-18, EC-14)', () => {
  test('makes no network request after the initial load', async ({ page }) => {
    const requests: string[] = [];
    await ready(page);

    // Start recording only once the app is up and the dictionary has loaded.
    page.on('request', (request) => {
      requests.push(request.url());
    });

    await page.keyboard.type('crane');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Statistics' }).click();
    await page.keyboard.press('Escape');

    expect(requests).toEqual([]);
  });

  test('a full game is playable with the network disabled (AC-18)', async ({ page, context }) => {
    await ready(page);
    await context.setOffline(true);

    for (const word of ['slate', 'brick', 'pound']) {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1800);
    }

    // Three rows evaluated, no crash, board still interactive.
    const revealed = await page.getByRole('gridcell').filter({ hasNotText: '' }).count();
    expect(revealed).toBeGreaterThanOrEqual(15);

    await context.setOffline(false);
  });
});

test.describe('persistence across reloads (EC-9, AC-9)', () => {
  test('restores an in-progress game exactly', async ({ page }) => {
    await ready(page);

    await page.keyboard.type('slate');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const before = await page.getByRole('gridcell').first().getAttribute('aria-label');

    await page.reload();
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();

    const after = await page.getByRole('gridcell').first().getAttribute('aria-label');

    expect(after).toBe(before);
  });

  test('persists statistics across a reload', async ({ page }) => {
    await ready(page);

    // Burn all six guesses to complete a game deterministically.
    for (const word of ['slate', 'brick', 'pound', 'mighty'.slice(0, 5), 'crane', 'zesty']) {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1700);
    }

    await page.reload();
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
    await page.getByRole('button', { name: 'Statistics' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('No games yet')).toBeHidden();
  });

  test('keeps the chosen word length after a reload', async ({ page }) => {
    await ready(page);

    await page.getByRole('radio', { name: '6 letters' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByRole('row').first().getByRole('gridcell')).toHaveCount(6);

    await page.reload();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByRole('row').first().getByRole('gridcell')).toHaveCount(6);
  });
});

test.describe('corrupt and unavailable storage (EC-11, EC-12)', () => {
  test('recovers from corrupt saved data without crashing', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('wordwright:v1:session', '{ not valid json');
      localStorage.setItem('wordwright:v1:stats', '"a string, not an object"');
      localStorage.setItem('wordwright:v1:settings', '[]');
    });

    await page.reload();

    // The app starts cleanly on defaults rather than white-screening.
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter' })).toBeEnabled();
  });

  test('stays playable when localStorage throws (EC-11)', async ({ page }) => {
    await page.addInitScript(() => {
      // Simulate Safari private mode / blocked storage.
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('SecurityError');
        },
      });
    });

    await page.goto('/');
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();

    await page.keyboard.type('crane');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // The game ran to an evaluated guess with no persistence available.
    await expect(page.getByRole('gridcell').first()).toHaveAccessibleName(/letter 1: C/);
  });
});

test.describe('input handling (EC-3, EC-5, FR-7)', () => {
  test('ignores non-alphabetic keys silently', async ({ page }) => {
    await freshGame(page);

    await page.keyboard.press('Digit1');
    await page.keyboard.press('Minus');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('F5' as 'F5');

    await expect(page.getByRole('gridcell').first()).toHaveAccessibleName(/letter 1: empty/);
    await expect(page.getByText('Not enough letters')).toBeHidden();
  });

  test('caps input at the word length with no error (FR-7)', async ({ page }) => {
    await freshGame(page);

    await page.keyboard.type('cranes');

    await expect(page.getByRole('row').first().getByRole('gridcell')).toHaveCount(5);
    await expect(page.getByRole('gridcell').nth(4)).toHaveAccessibleName(/letter 5: E, entered/);
  });

  test('handles a held key repeat without breaking (EC-5)', async ({ page }) => {
    await freshGame(page);

    for (let i = 0; i < 12; i += 1) await page.keyboard.press('a');

    await expect(page.getByRole('gridcell').nth(4)).toHaveAccessibleName(/letter 5: A, entered/);
  });
});

test.describe('system preferences (EC-17, A11Y-9)', () => {
  test('follows the OS colour scheme and updates live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      false,
    );

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);
  });

  test('honours prefers-reduced-motion (A11Y-9)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);

    await page.keyboard.type('crane');
    await page.keyboard.press('Enter');

    // With motion reduced the row resolves immediately rather than over 1.5s.
    await expect(page.getByRole('gridcell').first()).toHaveAccessibleName(
      /correct position|wrong position|not in word/,
      { timeout: 1000 },
    );
  });
});

test.describe('storage warnings (SPEC §11, EC-11, EC-12)', () => {
  test('warns once when storage is unavailable (EC-11, SPEC §11)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('SecurityError');
        },
      });
    });
    await page.goto('/');
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();

    // Appears twice by design: the visible toast and the polite live region.
    await expect(page.getByRole('button', { name: /Progress can't be saved/ })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: "Progress can't be saved" }),
    ).toHaveCount(1);
    // Still fully playable.
    await page.keyboard.type('crane');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await expect(page.getByRole('gridcell').first()).toHaveAccessibleName(/letter 1: C/);
  });

  test('warns when saved data was corrupt (EC-12, SPEC §11)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('wordwright:v1:stats', '{ not json');
    });
    await page.reload();
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();

    await expect(page.getByRole('button', { name: /Saved data was reset/ })).toBeVisible();
  });

  test('no spurious warning on a healthy first load', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: /Progress can't be saved/ })).toBeHidden();
    await expect(page.getByRole('button', { name: /Saved data was reset/ })).toBeHidden();
  });
});
