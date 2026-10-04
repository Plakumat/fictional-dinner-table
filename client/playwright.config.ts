import { defineConfig } from '@playwright/test';

// The scenario table from the brief, run against the unmodified mock.
// One worker: the mock holds one world state, and most rows reset it.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 860 } },
  webServer: [
    { command: 'node ../mock-server/server.mjs', url: 'http://localhost:4000', reuseExistingServer: true },
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
});
