---
name: ship-check
description: The full pre-handover check for the Sofra client — types, lint, unit tests, the Playwright scenario table, the production build with its bundle size, fresh screenshots, and the numbers in the README. Use before a commit that will be shown to someone, before a demo, or when asked "is it ready".
---

# Ship check

Run from `client/` unless noted. Stop at the first failure and report it; do
not continue to the next step with a red one behind you.

1. `npm run typecheck`
2. `npm run lint`
3. `npm test` — note the test count.
4. `npm run e2e` — starts the mock and the dev server if they are not running;
   about three minutes. Note the count. Every row that has ledger assertions
   ends in `check-ledger` exit code 0.
5. `npm run build` — note the main chunk's size (min and gzip).
6. `npm run capture` — regenerates `docs/screenshots/`. Open three of them
   (`row-04-prompt.png`, `phone-checkout.png`, `workbench.png`) and look: four
   states told apart by shape and words, no overlap, nothing clipped.
7. Update `README.md` where numbers are quoted: test counts in "Tests",
   bundle sizes in "Performance note". If the architecture changed, update the
   diagram in `docs/diagrams/` and run `npm run diagrams`.
8. In the root: `git status`. Confirm that `mock-server/`, `data/`, `schema/`,
   `scripts/`, `scenarios.jsonl` and the root `package.json` are unchanged.
9. Report the counts and sizes in one short table, and anything that changed
   since the last check.
