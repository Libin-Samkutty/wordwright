import { expect, test, type Page } from '@playwright/test';

/**
 * Generates the README screenshots (T-48).
 *
 * Written as a spec so the images are always produced from the real
 * production build and can be regenerated with one command:
 *   npx playwright test --project=desktop e2e/screenshots.spec.ts
 */

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
}

/** Plays two guesses so the board shows real colour feedback. */
async function playSampleGuesses(page: Page): Promise<void> {
  for (const word of ['slate', 'briny']) {
    await page.keyboard.type(word);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1800);
  }
}

test.describe('screenshots', () => {
  test('light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 900, height: 900 });
    await ready(page);
    await playSampleGuesses(page);

    await page.screenshot({ path: 'docs/screenshots/light.png' });
  });

  test('dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 900, height: 900 });
    await ready(page);
    await playSampleGuesses(page);

    await page.screenshot({ path: 'docs/screenshots/dark.png' });
  });

  test('colourblind palette', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 900, height: 900 });
    await ready(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('switch', { name: 'Colourblind mode' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await playSampleGuesses(page);
    // Let the final flip settle so the capture shows resolved colours.
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'docs/screenshots/colourblind.png' });
  });

  test('statistics', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await ready(page);

    // Complete a game so the panel shows real numbers rather than the
    // empty state.
    for (const word of ['slate', 'briny', 'ghost', 'plumb', 'crane', 'dodge']) {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1700);
    }

    await page.getByRole('button', { name: 'Statistics' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.screenshot({ path: 'docs/screenshots/statistics.png' });
  });

  test('mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    await playSampleGuesses(page);

    await page.screenshot({ path: 'docs/screenshots/mobile.png' });
  });
});
