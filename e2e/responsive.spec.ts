import { expect, test, type Page } from '@playwright/test';

/**
 * Layout and device checks (T-46, FR-58, FR-59, EC-18, AC-22).
 *
 * These need a real engine: jsdom reports zero for every dimension, so
 * "does it fit at 320px" is unanswerable there.
 */

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();
}

const VIEWPORTS = [
  { name: '320px (smallest phone)', width: 320, height: 568 },
  { name: '375px (iPhone SE)', width: 375, height: 667 },
  { name: '768px (tablet)', width: 768, height: 1024 },
  { name: '1440px (laptop)', width: 1440, height: 900 },
  { name: '2560px (desktop)', width: 2560, height: 1440 },
];

test.describe('responsive layout (FR-59, AC-22)', () => {
  for (const viewport of VIEWPORTS) {
    test(`fits at ${viewport.name} with no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await ready(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`keeps board and keyboard visible at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await ready(page);

      await expect(page.getByRole('grid', { name: 'Guess board' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Enter' })).toBeInViewport();
    });
  }

  test('board and keyboard both fit in landscape on a short viewport (EC-18)', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await ready(page);

    await expect(page.getByRole('grid', { name: 'Guess board' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Enter' })).toBeInViewport();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the help dialog fits at 320px with no horizontal scroll (AC-22)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await ready(page);

    await page.getByRole('button', { name: 'How to play' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the help dialog scrolls rather than clipping in landscape (EC-18)', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await ready(page);

    await page.getByRole('button', { name: 'How to play' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeInViewport();

    // The content genuinely overflows the 85dvh cap at this height, so this
    // proves the panel scrolls rather than merely fitting by coincidence.
    const { scrollHeight, clientHeight } = await dialog.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });

  test('renders all three word lengths without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await ready(page);

    for (const length of ['4', '5', '6']) {
      await page.getByRole('radio', { name: `${length} letters` }).click();
      await expect(page.getByRole('grid', { name: 'Guess board' })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow at ${length} letters`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('touch targets (FR-58)', () => {
  test('keyboard keys are at least 44px tall on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ready(page);

    for (const name of ['Enter', 'Backspace', /^Q$/]) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box, `missing key ${String(name)}`).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('header controls are at least 44px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ready(page);

    for (const name of ['How to play', 'Statistics', 'Settings']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
