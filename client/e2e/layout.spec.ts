import { expect, test, type Page } from '@playwright/test';

// The page holds together, and it holds still.
//
// Desktop: no horizontal overflow, the three regions of the frame inside the
// viewport, the select drawn with room for its chevron, and nothing that was
// already on screen moving while an answer streams in.
// Phone: one column that fills the screen exactly, the rail and the panel as
// sheets, the checkout card in one column.

const MOCK = 'http://localhost:4000';

const reset = () => fetch(`${MOCK}/__admin/reset`, { method: 'POST' });
const composer = (page: Page) => page.getByLabel('Message to the assistant');
const stop = (page: Page) => page.getByRole('button', { name: 'Stop', exact: true });

async function say(page: Page, message: string): Promise<void> {
  await composer(page).fill(message);
  await composer(page).press('Enter');
  await expect(stop(page)).toBeDisabled({ timeout: 40_000 });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

async function expectFillsTheViewportExactly(page: Page): Promise<void> {
  const extra = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(extra, 'page taller than the viewport, in px').toBeLessThanOrEqual(0);
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  const width = page.viewportSize()!.width;
  expect(box, selector).not.toBeNull();
  expect(box!.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${selector} right edge`).toBeLessThanOrEqual(width + 1);
}

/** Positions of everything that must not move while an answer streams. */
const anchors = (page: Page) =>
  page.evaluate(() => {
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null;
    };
    const turns = [...document.querySelectorAll('[aria-label="Messages"] > li')];
    return {
      composer: rect(document.getElementById('composer-input')?.closest('form') ?? null),
      rail: rect(document.querySelector('[aria-label="Account"]')),
      panel: rect(document.querySelector('[aria-label="Your cart and orders"]')),
      // Document positions (independent of scrolling) of every earlier turn.
      earlierTurns: turns.slice(0, -1).map((li) => [(li as HTMLElement).offsetTop, (li as HTMLElement).offsetHeight]),
    };
  });

test.beforeEach(async () => {
  await reset();
});

for (const width of [1280, 1440]) {
  test(`the frame holds together at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?user=u_ok');
    await expect(page.getByRole('complementary', { name: 'Account' }).getByText(/^₺/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectFillsTheViewportExactly(page);
    for (const selector of ['[aria-label="Account"]', '[aria-label="Assistant"]', '[aria-label="Your cart and orders"]']) {
      await expectInsideViewport(page, selector);
    }

    // The select draws its own chevron, inset from the edge, with room for the text.
    const select = page.getByLabel('User');
    const [paddingRight, appearance] = await select.evaluate((el) => {
      const s = getComputedStyle(el);
      return [parseFloat(s.paddingRight), s.appearance];
    });
    expect(paddingRight).toBeGreaterThanOrEqual(32);
    expect(appearance).toBe('none');

    await say(page, 'Is there a pizza place near me?');
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, '[aria-label="Your cart and orders"]');
  });
}

test('nothing already on screen moves while an answer streams in', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    // Cumulative layout shift, as the browser measures it, excluding shifts right after user input.
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/?user=u_ok');
  await expect(page.getByRole('complementary', { name: 'Account' }).getByText(/^₺/)).toBeVisible();

  // Two settled turns first, so there is something above the streaming one.
  await say(page, 'What is in my cart?');
  await say(page, 'Is there a pizza place near me?');
  const before = await anchors(page);
  const clsBefore = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);

  // The longest answer the mock has: fourteen blocks, text and cards, streamed in small chunks.
  await say(page, 'Show my recent orders');

  const after = await anchors(page);
  const clsDuring = (await page.evaluate(() => (window as unknown as { __cls: number }).__cls)) - clsBefore;

  // The frame did not move at all.
  expect(after.composer).toEqual(before.composer);
  expect(after.rail).toEqual(before.rail);
  expect(after.panel).toEqual(before.panel);
  // The turns that were already there kept their place and their size.
  expect(after.earlierTurns.slice(0, before.earlierTurns.length)).toEqual(before.earlierTurns);
  // What the browser counts as layout shift stayed within the "good" band (0.1) for the whole stream.
  expect(clsDuring).toBeLessThan(0.1);
});

test('on a phone the frame is one column with the rail and the panel as sheets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?user=u_ok');

  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Account' })).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await expectFillsTheViewportExactly(page);

  // The rail opens as a sheet with the account in it, and closes on Escape.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByLabel('User')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Account and sections' })).toContainText(/₺/);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('User')).toBeHidden();

  // The cart opens as a sheet from the other side.
  await page.getByRole('button', { name: /Cart and orders/ }).click();
  await expect(page.getByRole('dialog', { name: 'Your cart and orders' })).toContainText('Patates Kızartması');
  await page.keyboard.press('Escape');

  // A checkout card fits in one column, with its button on screen.
  await say(page, 'Order 2 cheeseburgers from Burger Stop');
  await expectNoHorizontalOverflow(page);
  await expectFillsTheViewportExactly(page);
  const confirm = page.getByRole('button', { name: 'Place order' });
  await expect(confirm).toBeEnabled();
  const box = await confirm.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(composer(page)).toBeInViewport();
});
