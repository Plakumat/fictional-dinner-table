import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Produces the screenshots in docs/screenshots (rows 4–9 of the scenario table
// and a few other states). Not part of the test run:  npm run capture

test.skip(!process.env.CAPTURE, 'run with `npm run capture`');

const MOCK = 'http://localhost:4000';
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

const composer = (page: Page) => page.getByLabel('Message to the assistant');
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}${name}.png` });

async function say(page: Page, message: string) {
  await composer(page).fill(message);
  await composer(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
}

async function start(page: Page, user = 'u_ok') {
  await fetch(`${MOCK}/__admin/reset`, { method: 'POST' });
  await page.goto(`/?user=${user}`);
  await expect(page.getByRole('complementary', { name: 'Account' }).getByText(/^₺/)).toBeVisible();
}

test('row 4 and 5: prompt, then confirmed', async ({ page }) => {
  await start(page);
  await say(page, 'Order 2 cheeseburgers from Burger Stop');
  await shot(page, 'row-04-prompt');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('complementary', { name: 'Account' })).toContainText('₺410');
  await page.waitForTimeout(600);
  await shot(page, 'row-05-confirmed');
});

test('row 6: a triple click, one result', async ({ page }) => {
  await start(page);
  await say(page, 'Order 2 cheeseburgers from Burger Stop');
  await page.getByRole('button', { name: 'Place order' }).click({ clickCount: 3 });
  await expect(page.getByRole('complementary', { name: 'Account' })).toContainText('₺410');
  await page.getByRole('button', { name: 'Inspector' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'row-06-triple-click-inspector');
});

test('row 7: replaced prompt', async ({ page }) => {
  await start(page);
  await say(page, 'Order 2 cheeseburgers from Burger Stop');
  await say(page, 'make it 5 cheeseburgers');
  await page.getByText('A newer confirmation replaced this one').scrollIntoViewIfNeeded();
  await shot(page, 'row-07-replaced');
});

test('row 8: expired prompt', async ({ page }) => {
  await start(page);
  await say(page, '/chaos short_ttl Order 1 cheeseburger from Burger Stop');
  await shot(page, 'row-08-expires-soon');
  await expect(page.getByText('This confirmation ran out of time')).toBeVisible({ timeout: 25_000 });
  await shot(page, 'row-08-expired');
});

test('row 9: lost response, reconciled', async ({ page }) => {
  await start(page);
  await say(page, '/chaos drop_execute_response Leave a 20 TL tip on my last order');
  await page.getByRole('button', { name: 'Send tip' }).click();
  await expect(page.getByText('You tipped the courier 20 TL').first()).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'row-09-reconciled');
});

test('other states', async ({ page }) => {
  await start(page, 'u_lowbalance');
  await say(page, 'Order levrek from Ege Balık');
  await shot(page, 'gate');

  await start(page);
  await say(page, 'Cancel my last order');
  await shot(page, 'destructive-prompt');

  await start(page);
  await say(page, 'Show my recent orders');
  await shot(page, 'untrusted-notes');

  await start(page);
  await say(page, '/chaos drop_mid_stream What is in my cart?');
  await shot(page, 'incomplete');

  await page.goto('/help?q=delivery+fee&category=policy');
  await expect(page.getByText('Archived · no longer applies')).toBeVisible();
  await shot(page, 'help-center');

  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/workbench.html');
  await page.waitForTimeout(500);
  await shot(page, 'workbench');
});

test('on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fetch(`${MOCK}/__admin/reset`, { method: 'POST' });
  await page.goto('/?user=u_ok');
  await expect(page.getByRole('heading', { name: /Near you in/ })).toBeVisible();
  await shot(page, 'phone-home');
  await say(page, 'Order 2 cheeseburgers from Burger Stop');
  await page.getByRole('button', { name: 'Place order' }).scrollIntoViewIfNeeded();
  await shot(page, 'phone-checkout');
});
