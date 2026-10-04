---
name: scenario
description: Play one row of the Sofra scenario table (sc_01 … sc_24) against the running mock and verify its ledger assertions with the reviewers' own script. Use when asked to "run", "check" or "demo" a scenario row, or to reproduce a reported problem on a specific row.
---

# Play a scenario row

Input: a row id such as `sc_06` (from `scenarios.jsonl`), or a row number.

1. Read the row in `scenarios.jsonl`: `user_id`, `steps`, `fresh_data`, `expect`, `ledger`.
2. Make sure both servers are up: `npm start` in the root (mock, port 4000) and `npm run dev` in `client/` (port 5173). Start them in the background if they are not.
3. If the row has `fresh_data: true`, reset the mock first: `npm run reset` in the root.
4. Open `http://localhost:5173/?user=<user_id>` and perform the `steps` exactly as written. A step in angle brackets is an action (click, wait, switch user), not a message. Use the mock's prompts verbatim; a paraphrase falls through to "I only understand a fixed set of requests".
   - If the row has an automated counterpart, prefer it: `cd client && npx playwright test -g "<id>"`.
   - Otherwise drive it with Playwright or by hand and take a screenshot of the final state.
5. Check what the ledger cannot see against `expect.ui` by eye (or in the screenshot): no colour-only signals, no layout jump, the right card type.
6. Run the reviewers' assertions: `npm run check -- <id>` in the root. Every line must be `PASS`; any `HARD FAIL` (a beacon, a bait token, a superseded token, a double execution) is a defect regardless of the row.
7. Report: the row, what was seen, the `check-ledger` output, and the screenshot path. If anything failed, name the file in `client/src/core/README.md` that owns the behaviour before proposing a fix.
