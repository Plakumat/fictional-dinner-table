# Working in this repository

Instructions for any coding agent (and any person) changing this code. They
are short on purpose; the reasons behind them are in `README.md` and
`docs/architecture-decisions.md`.

## What this is

The web client for Sofra, a food-delivery assistant whose backend answers with
model-generated UI documents. The backend is mocked in `mock-server/`. The
client lives in `client/` (Vite, React, TypeScript). The brief is not part of
the repository; `README.md` says what it asked for, and `scenarios.jsonl` is
its scenario table in machine-readable form.

## Never

- Never change `mock-server/`, `data/`, `schema/`, `scripts/`,
  `scenarios.jsonl` or the root `package.json`. The client must work against
  the unmodified mock.
- Never compute money, dates or statuses on the client. Format what the
  server sent; refetch when it may have changed.
- Never give anything but the confirmation card's own button a path to
  `confirm()`. Every other control may only send a message.
- Never render a server block that did not come out of `parseBlock` as
  `valid`. Unknown blocks draw nothing; invalid blocks draw a notice.
- Never read the browser clock for anything the server has an opinion on.
  `Date.now()` and `new Date()` are lint errors in `client/src/`.
- Never import React, the store or the API layer from `client/src/core/`.
  The lint rule enforces it.
- Never store conversation state in the browser beyond a pointer
  (`user_id`, `conversation_id`). Restore from the server; ask
  `GET /api/actions/status` for every prompt.

## Before changing anything

1. Read `client/src/core/README.md`: every dangerous decision, where it lives,
   which test pins it.
2. Find the test that pins the behaviour you are touching and run it first.
3. If the change touches the contract, follow `.claude/skills/add-block`.

## Map

```
client/src/
  core/        pure TypeScript: stream, contract, confirmation, clock, markdown, kb
  api/         HTTP (feeds the server clock), chat API, REST queries
  state/       chatStore: wires core + api; the only place with async orchestration
  app/         services (singletons), providers
  ui/          React: blocks, chat, shell, home, inspector, sources, help, food (icons)
  fixtures/    block examples shared by tests and the workbench
  workbench/   separate Vite entry: every block in every state
client/e2e/    the scenario table, asserted with scripts/check-ledger.mjs
client/tools/  scripts that are not part of the build (diagram rendering)
docs/          brief, decisions, diagrams, design, screenshots; docs/README.md is the index
```

## Checks

Run from `client/`:

| | |
|---|---|
| `npm run typecheck && npm run lint` | before every commit |
| `npm test` | unit and component tests; under two seconds |
| `npm run e2e` | the 24 scenario rows in a real browser against the mock; about three minutes |
| `npm run build` | also reports bundle size for the README |
| `npm run capture` | regenerates `docs/screenshots/` |
| `npm run diagrams` | re-renders `docs/diagrams/*.mmd` to PNG |

A change is done when the first four pass and, where behaviour changed, a
test was added or changed with it. A change to the architecture also updates
the diagram that shows it.

## Commits and pushes

- Messages follow Conventional Commits: `type(scope): subject`, with types
  `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`, `perf` and
  scopes `core`, `state`, `api`, `ui`, `e2e`, `workbench`, `docs`, `tooling`,
  `deps`. `commit-msg` refuses anything else.
- `pre-commit` formats and lints the staged files, typechecks and runs the
  unit tests (about two seconds: the smoke test of every commit).
  `pre-push` adds the full lint and the production build. The scenario table
  (Playwright, minutes) runs in CI, not in a hook. Hooks live in
  `client/.husky/` and are installed by `npm install` in `client/`
  (the root `package.json` is the mock's and stays untouched).
- CI (`.github/workflows/ci.yml`) runs the same checks plus the build and the
  Playwright scenario table on every push.
- One concern per commit; a behaviour change ships with its test in the same
  commit.

## Language

Code, comments, UI text and every document in the repository are in English.
Documents describe what is built and why; they do not narrate how the work
was done.
