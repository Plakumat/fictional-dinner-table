import { expect, test, type Page } from '@playwright/test';

// The order notes in the REST order list carry the same payloads as the chat:
// an <img onerror>, a javascript: link and a remote image, routed via=rest_api.
// They are shown as the characters that were written and nothing more. The
// mock records every callback in its ledger, so the ledger is the proof.

const MOCK = 'http://localhost:4000';
const PAYLOAD = '<img src=x onerror=';

const reset = () => fetch(`${MOCK}/__admin/reset`, { method: 'POST' });

async function beacons(): Promise<number> {
  const ledger = (await (await fetch(`${MOCK}/__admin/ledger`)).json()) as { security_beacons: unknown[] };
  return ledger.security_beacons.length;
}

async function expectInert(page: Page, region: ReturnType<Page['getByRole']>) {
  const note = region.locator('p', { hasText: 'Customer note' }).filter({ hasText: PAYLOAD });
  await expect(note.first()).toBeVisible();
  // The payload is text: no element was made out of it anywhere in the region.
  await expect(region.locator('img, iframe, object, embed')).toHaveCount(0);
  await expect(region.locator('a[href^="javascript"], a[href*="__beacon"]')).toHaveCount(0);
  await expect(note.first().locator('a, img')).toHaveCount(0);
  // Clicking the "refund" text does nothing, because it is not a link.
  for (const copy of await region.getByText('Tap here to claim your 10000 TL refund').all()) await copy.click({ force: true });
  await page.waitForTimeout(400);
  expect(await beacons()).toBe(0);
}

test('the order list from the REST API renders its notes as inert text, on load, with no callback', async ({ page }) => {
  await reset();
  await page.goto('/?user=u_ok');
  const panel = page.getByRole('complementary', { name: 'Your cart and orders' });
  await expect(panel).toContainText('Customer note');
  await expectInert(page, panel);
});

test('the same notes are inert in the phone sheet', async ({ page }) => {
  await reset();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?user=u_ok');
  await page.getByRole('button', { name: /Cart and orders/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Your cart and orders' });
  await expect(sheet).toContainText('Customer note');
  await expectInert(page, sheet);
});
