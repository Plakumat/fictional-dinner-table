import { expect, test, type Page } from '@playwright/test';

// The page holds together: no horizontal overflow, the three regions of the
// frame visible and inside the viewport, native controls drawn with room for
// their own parts. The brief reviews on a desktop; two widths are checked.

const MOCK = 'http://localhost:4000';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  const width = page.viewportSize()!.width;
  expect(box, selector).not.toBeNull();
  expect(box!.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${selector} right edge`).toBeLessThanOrEqual(width + 1);
}

for (const width of [1280, 1440]) {
  test(`the frame holds together at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fetch(`${MOCK}/__admin/reset`, { method: 'POST' });
    await page.goto('/?user=u_ok');
    await expect(page.getByRole('complementary', { name: 'Account' }).getByText(/^₺/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    for (const selector of ['[aria-label="Account"]', '[aria-label="Assistant"]', '[aria-label="Your cart and orders"]']) {
      await expectInsideViewport(page, selector);
    }

    // The native select keeps room for its arrow: the text never runs under it.
    const select = page.getByLabel('User');
    const padding = await select.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    expect(padding).toBeGreaterThanOrEqual(28);

    // A streamed answer with cards does not widen the page either.
    const composer = page.getByLabel('Message to the assistant');
    await composer.fill('Is there a pizza place near me?');
    await composer.press('Enter');
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, '[aria-label="Your cart and orders"]');
  });
}
