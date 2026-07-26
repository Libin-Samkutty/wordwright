import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Real-browser accessibility audit (T-41, T-43).
 *
 * jsdom cannot report on contrast, focus visibility, or layout, so these run
 * against the production build in Chromium. They complement the unit tests
 * rather than repeat them.
 */

/** Waits for the dictionary chunk to resolve and the board to appear. */
async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
}

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}

test.describe('axe (A11Y, NFR-4)', () => {
  test('main game view has no violations', async ({ page }) => {
    await ready(page);

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('statistics dialog has no violations', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Statistics' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('settings dialog has no violations', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('dark mode has no violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await ready(page);

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('a played board has no violations', async ({ page }) => {
    await ready(page);
    await page.keyboard.type('crane');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });
});

test.describe('keyboard navigation (A11Y-1, A11Y-6, AC-17)', () => {
  test('every header control is reachable by Tab', async ({ page }) => {
    await ready(page);

    const reached = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent?.trim() ??
          '',
      );
      if (label) reached.add(label);
    }

    expect([...reached].some((l) => l.includes('Statistics'))).toBe(true);
    expect([...reached].some((l) => l.includes('Settings'))).toBe(true);
  });

  test('the focused element always has a visible indicator', async ({ page }) => {
    await ready(page);

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');

      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return { width: s.outlineWidth, style: s.outlineStyle };
      });

      if (outline) {
        expect(outline.style).not.toBe('none');
        expect(parseFloat(outline.width)).toBeGreaterThan(0);
      }
    }
  });

  test('physical typing drives the board (FR-10)', async ({ page }) => {
    await ready(page);

    await page.keyboard.type('cran');

    const firstCell = page.getByRole('gridcell').first();
    await expect(firstCell).toHaveAccessibleName(/letter 1: C, entered/);
  });

  test('Escape closes a dialog and focus returns to the trigger (AC-17)', async ({ page }) => {
    await ready(page);

    const trigger = page.getByRole('button', { name: 'Settings' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focused).toBe('Settings');
  });

  test('focus stays trapped inside an open dialog (FR-57)', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      );
      expect(inside).toBe(true);
    }
  });

  test('Enter still submits after visiting a dialog (FR-57 regression)', async ({ page }) => {
    // Closing a modal restores focus to its trigger. An earlier version of
    // usePhysicalKeyboard bailed out of Enter for any focused button, which
    // silently broke guess submission for the rest of the session.
    await ready(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.keyboard.type('slate');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('gridcell').first()).toHaveAccessibleName(
      /correct position|wrong position|not in word/,
      { timeout: 4000 },
    );
  });

  test('Enter on a header button opens its dialog rather than submitting', async ({ page }) => {
    await ready(page);

    await page.getByRole('button', { name: 'Statistics' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('the length radiogroup supports arrow, Home and End keys (A11Y-1)', async ({ page }) => {
    // Declaring role="radiogroup" promises this behaviour; an earlier version
    // borrowed the roles without implementing the keyboard pattern.
    await ready(page);

    const checked = async () =>
      (await page.getByRole('radio', { checked: true }).textContent())?.trim();

    await page.getByRole('radio', { checked: true }).focus();
    expect(await checked()).toBe('5 letters');

    await page.keyboard.press('ArrowRight');
    await expect.poll(checked).toBe('6 letters');

    // Wraps past the end.
    await page.keyboard.press('ArrowRight');
    await expect.poll(checked).toBe('4 letters');

    await page.keyboard.press('End');
    await expect.poll(checked).toBe('6 letters');

    await page.keyboard.press('Home');
    await expect.poll(checked).toBe('4 letters');
  });

  test('the length radiogroup is a single tab stop', async ({ page }) => {
    await ready(page);

    const tabIndexes = await page
      .getByRole('radio')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));

    expect(tabIndexes.filter((value) => value === 0)).toHaveLength(1);
  });

  test('browser shortcuts are not intercepted (EC-4)', async ({ page }) => {
    await ready(page);

    // Ctrl+A must not type an "A" onto the board.
    await page.keyboard.press('Control+a');

    const firstCell = page.getByRole('gridcell').first();
    await expect(firstCell).toHaveAccessibleName(/letter 1: empty/);
  });
});
